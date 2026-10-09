/**
 * POST /api/store/sections — bulk-upsert sections for a draft. Idempotent:
 * we delete-then-insert under one transaction, keyed by draft_id. Used by the
 * dual-write client when a draft mutation only touched sections (avoids
 * resending the full draft payload).
 *
 * Per-section audit events are noisy — we chain a single `section.updated`
 * event with a section_id summary instead of one per section.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { rejectEditOfApprovedDraft, rejectReadOnlyMember } from "../../_utils/workspace-role.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";
import { getDb } from "../../../src/db/index.js";
import { drafts, sections } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { isValidSectionInput } from "./_section-input.js";

export const config = { runtime: "nodejs" };

type SectionInput = {
  sectionId: string;
  title: string;
  html: string;
  status: "empty" | "streaming" | "ready" | "edited";
  position: number;
};

type Body = {
  draftId?: string;
  sections?: SectionInput[];
};

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  if (process.env.DRAFTHR_DUAL_WRITE !== "true") return jsonError("Dual-write disabled", 503);
  const limited = rateLimit(req, { name: "store-sections", max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req, 8_000_000);
  if (!parsed.ok) return parsed.response;
  const rawDraftId = typeof parsed.body.draftId === "string" ? parsed.body.draftId.trim() : "";
  // A non-uuid id would raise Postgres 22P02 and surface as a 500.
  const draftId = rawDraftId ? serverUuidOrNull(rawDraftId) : "";
  if (draftId === null) return jsonError("Invalid draftId", 400);
  const sectionList = Array.isArray(parsed.body.sections) ? parsed.body.sections : null;
  if (!draftId) return jsonError("draftId required", 400);
  if (!sectionList) return jsonError("sections array required", 400);
  if (!sectionList.every(isValidSectionInput)) {
    return jsonError("Invalid section in sections array", 400);
  }

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const readOnly = rejectReadOnlyMember(auth);
  if (readOnly) return readOnly;

  try {
    const db = getDb();
    const [draft] = await db
      .select({
        id: drafts.id,
        tenantId: drafts.tenantId,
        reviewStatus: drafts.reviewStatus,
        deletedAt: drafts.deletedAt,
        revision: drafts.revision,
      })
      .from(drafts)
      .where(eq(drafts.id, draftId))
      .limit(1);
    if (!draft) return jsonError("Draft not found", 404);
    if (draft.tenantId !== auth.activeTenant.id) {
      return jsonError("Draft belongs to a different workspace", 403);
    }
    // Deleted on another device: refuse rather than write into the tombstone.
    if (draft.deletedAt) return jsonError("Draft was deleted", 410);

    const tenantId = auth.activeTenant.id;
    if (draft.reviewStatus === "approved") {
      const stored = await db
        .select({ sectionId: sections.sectionId, title: sections.title, html: sections.html })
        .from(sections)
        .where(and(eq(sections.draftId, draftId), eq(sections.tenantId, tenantId)));
      const locked = rejectEditOfApprovedDraft("approved", "approved", stored, sectionList);
      if (locked) return locked;
    }
    const outcome = await db.transaction(async (tx) => {
      // Any accepted write moves the draft's revision on, so a device holding
      // the previous revision gets a 409 from the drafts upsert instead of
      // silently overwriting these sections. Compare-and-swap on the revision
      // read above: an approval or delete landing since then would otherwise
      // be written past (the approved-letter check ran on the older state).
      const bumped = await tx
        .update(drafts)
        .set({ revision: sql`${drafts.revision} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(drafts.id, draftId),
            eq(drafts.tenantId, tenantId),
            eq(drafts.revision, draft.revision),
            isNull(drafts.deletedAt),
          ),
        )
        .returning({ id: drafts.id });
      if (bumped.length === 0) return "stale" as const;
      // Scope the delete by tenant too (belt-and-braces — draftId is already
      // tenant-verified above, but this keeps the mutation itself tenant-bounded).
      await tx.delete(sections).where(and(eq(sections.draftId, draftId), eq(sections.tenantId, tenantId)));
      for (const s of sectionList) {
        await tx.insert(sections).values({
          draftId,
          tenantId,
          sectionId: s.sectionId,
          title: s.title,
          html: s.html,
          status: s.status,
          position: s.position,
        });
      }
      return "ok" as const;
    });
    if (outcome === "stale") return jsonError("stale revision", 409);

    await safelyAppendAudit({
      tenantId: auth.activeTenant.id,
      kind: "section.updated",
      subjectType: "draft",
      subjectId: draftId,
      actorUserId: auth.userRow.id,
      payload: {
        sectionCount: sectionList.length,
        sectionSummaries: sectionList.map((s) => ({
          sectionId: s.sectionId,
          status: s.status,
          length: s.html.length,
        })),
      },
    });

    return new Response(JSON.stringify({ ok: true, count: sectionList.length }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/sections POST] failed", err);
    return jsonError("Section sync failed", 500);
  }
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
