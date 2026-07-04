/**
 * /api/store/drafts — dual-write target for the SPA's draft mutations.
 *
 * - POST: upsert the draft (insert on first sync, update on subsequent).
 *   We use the SPA's draft.id as the row PK rather than minting our own —
 *   keeps localStorage and Postgres aligned by id without a join table.
 * - DELETE: hard-delete to match the in-store deleteDraft semantics.
 *
 * Every mutation appends an audit event under the active tenant. Returns
 * 503 when DRAFTHR_DUAL_WRITE !== 'true' so a misbehaving client can't
 * write past the flag.
 *
 * Tenant ownership is verified on every update/delete (defence against IDOR).
 */
import { and, eq, lte, inArray, desc } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { customTemplates, drafts, matters, sections } from "../../../src/db/schema.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { assertCanCreateLetter } from "../../_utils/entitlements.js";
import { isValidSectionInput } from "./_section-input.js";

export const config = { runtime: "nodejs" };

type SectionInput = {
  id?: string;
  sectionId: string;
  title: string;
  html: string;
  status: "empty" | "streaming" | "ready" | "edited";
  position: number;
};

type DraftInput = {
  id: string;
  letterType: string;
  mode: string;
  title?: string | null;
  jurisdiction?: string | null;
  matterId?: string | null;
  reviewStatus?: string;
  isTemplateSource?: boolean;
  templateSourceId?: string | null;
  context: Record<string, unknown>;
  employer?: Record<string, unknown> | null;
  employee?: Record<string, unknown> | null;
  answers?: Record<string, unknown> | null;
  sections?: SectionInput[];
  clientRevision?: number | null;
};

/**
 * GET — read back every draft for the caller's active tenant, with sections
 * nested, in the SAME shape toServerPayload writes (so the client merge is
 * symmetric). Tenant-scoped; gated by the same dual-write flag as writes so
 * read+write are consistent. This is the pull half of cross-device sync.
 */
export async function GET(req: Request): Promise<Response> {
  if (process.env.DRAFTHR_DUAL_WRITE !== "true") {
    return jsonError("Dual-write disabled", 503);
  }
  const limited = rateLimit(req, { name: "store-drafts-get", max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const tenantId = auth.activeTenant.id;

  try {
    const db = getDb();
    // Bound the response: return the most-recently-updated drafts up to a cap
    // so one large tenant can't produce a multi-hundred-MB payload that OOMs /
    // times out the function. A delta pull (updatedAt > since) is the future
    // optimization; this cap is the safety net.
    const MAX_DRAFTS = 1000;
    const draftRows = await db
      .select()
      .from(drafts)
      .where(eq(drafts.tenantId, tenantId))
      .orderBy(desc(drafts.updatedAt))
      .limit(MAX_DRAFTS);

    const ids = draftRows.map((d) => d.id);
    const sectionRows = ids.length
      ? await db.select().from(sections).where(inArray(sections.draftId, ids))
      : [];

    const sectionsByDraft = new Map<string, typeof sectionRows>();
    for (const s of sectionRows) {
      const list = sectionsByDraft.get(s.draftId) ?? [];
      list.push(s);
      sectionsByDraft.set(s.draftId, list);
    }

    const out = draftRows.map((d) => ({
      id: d.id,
      letterType: d.letterType,
      mode: d.mode,
      title: d.title,
      jurisdiction: d.jurisdiction,
      matterId: d.matterId,
      reviewStatus: d.reviewStatus,
      isTemplateSource: d.isTemplateSource,
      templateSourceId: d.templateSourceId,
      context: d.contextJson ?? {},
      employer: d.employerJson ?? null,
      employee: d.employeeJson ?? null,
      answers: d.answersJson ?? null,
      createdAt: d.createdAt.getTime(),
      updatedAt: d.updatedAt.getTime(),
      sections: (sectionsByDraft.get(d.id) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          sectionId: s.sectionId,
          title: s.title,
          html: s.html,
          status: s.status,
          position: s.position,
        })),
    }));

    return new Response(JSON.stringify({ drafts: out }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/drafts GET] failed", err);
    return jsonError("Draft fetch failed", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  return writeDraft(req, "POST");
}

export async function PATCH(req: Request): Promise<Response> {
  return writeDraft(req, "PATCH");
}

async function writeDraft(req: Request, method: "POST" | "PATCH"): Promise<Response> {
  const guard = await guardWrite(req);
  if (!guard.ok) return guard.response;

  const parsed = await readJsonRequest<DraftInput>(req, 8_000_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body || typeof body.id !== "string" || !body.id) {
    return jsonError("Draft id required", 400);
  }
  // Guard the uuid PK/columns: a non-uuid client id would throw a Postgres
  // 22P02 and surface as a 500. Normalize to the canonical uuid (or 400).
  const draftId = serverUuidOrNull(body.id);
  if (!draftId) return jsonError("Invalid draft id", 400);
  body.id = draftId;
  if (Array.isArray(body.sections) && !body.sections.every(isValidSectionInput)) {
    return jsonError("Invalid section in sections array", 400);
  }

  const auth = guard.auth;
  const tenantId = auth.activeTenant!.id;

  try {
    const db = getDb();
    const titleSummary = summariseTitle(body);
    const matterId = normalizeOptionalId(body.matterId);
    const templateSourceId = normalizeOptionalId(body.templateSourceId);
    const existingDraft = await db
      .select({ id: drafts.id, tenantId: drafts.tenantId, updatedAt: drafts.updatedAt })
      .from(drafts)
      .where(eq(drafts.id, body.id))
      .limit(1);

    if (existingDraft.length && existingDraft[0].tenantId !== tenantId) {
      // Draft exists in a different tenant — refuse to overwrite (IDOR defence).
      return jsonError("Draft belongs to a different workspace", 403);
    }
    const isCreate = existingDraft.length === 0;
    if (isCreate) {
      // Hard-paywall gate (env-gated by DRAFTHR_ENFORCE_PAYWALL). Only new
      // letters are gated; edits to existing drafts always go through.
      const gate = await assertCanCreateLetter(tenantId, auth.userRow.id);
      if (!gate.ok) return jsonError(gate.reason, gate.code);
    }
    const clientRevision = parseClientRevision(body.clientRevision);
    if (!isCreate && (clientRevision === null || clientRevision < existingDraft[0].updatedAt.getTime())) {
      return staleRevisionResponse();
    }

    const referenceError = await validateTenantReferences(db, tenantId, matterId, templateSourceId);
    if (referenceError) return referenceError;

    // updatedAt must be server-authoritative. The client's revision is trusted
    // only for the stale COMPARISON above; persisting it verbatim let a caller
    // send a far-future epoch that poisons drafts.updatedAt and permanently
    // 409s every subsequent legitimate write (bug #13). Clamp to now (+ a small
    // clock-skew window) so a future value can never lock the draft.
    const MAX_SKEW_MS = 60_000;
    const nowMs = Date.now();
    const acceptedRevision = new Date(
      Math.min(clientRevision ?? nowMs, nowMs + MAX_SKEW_MS),
    );

    const writeResult = await db.transaction(async (tx) => {
      if (isCreate) {
        await tx.insert(drafts).values({
          id: body.id,
          tenantId,
          authorUserId: auth.userRow.id,
          matterId,
          letterType: body.letterType,
          mode: body.mode,
          title: body.title ?? null,
          jurisdiction: body.jurisdiction ?? null,
          reviewStatus: body.reviewStatus ?? "draft",
          isTemplateSource: Boolean(body.isTemplateSource),
          templateSourceId,
          contextJson: body.context,
          employerJson: body.employer ?? null,
          employeeJson: body.employee ?? null,
          answersJson: body.answers ?? null,
          updatedAt: acceptedRevision,
        });
      } else {
        const updated = await tx
          .update(drafts)
          .set({
            matterId,
            letterType: body.letterType,
            mode: body.mode,
            title: body.title ?? null,
            jurisdiction: body.jurisdiction ?? null,
            reviewStatus: body.reviewStatus ?? "draft",
            isTemplateSource: Boolean(body.isTemplateSource),
            templateSourceId,
            contextJson: body.context,
            employerJson: body.employer ?? null,
            employeeJson: body.employee ?? null,
            answersJson: body.answers ?? null,
            updatedAt: acceptedRevision,
          })
          .where(and(eq(drafts.id, body.id), eq(drafts.tenantId, tenantId), lte(drafts.updatedAt, acceptedRevision)))
          .returning({ id: drafts.id });
        if (updated.length === 0) return { stale: true as const };
      }

      if (Array.isArray(body.sections)) {
        // Replace strategy — sections roll over the draft id. Cheaper to
        // delete-then-insert than to diff individual rows; section_versions
        // FK is set null on cascade-from-sections so this is safe.
        await tx.delete(sections).where(eq(sections.draftId, body.id));
        for (const s of body.sections) {
          await tx.insert(sections).values({
            draftId: body.id,
            sectionId: s.sectionId,
            title: s.title,
            html: s.html,
            status: s.status,
            position: s.position,
          });
        }
      }
      return { stale: false as const };
    });
    if (writeResult.stale) return staleRevisionResponse();

    await safelyAppendAudit({
      tenantId,
      kind: isCreate ? "draft.created" : "draft.updated",
      subjectType: "draft",
      subjectId: body.id,
      actorUserId: auth.userRow.id,
      payload: isCreate
        ? {
            letterType: body.letterType,
            title: titleSummary,
            sectionCount: Array.isArray(body.sections) ? body.sections.length : 0,
            mode: body.mode,
          }
        : {
            title: titleSummary,
            reviewStatus: body.reviewStatus ?? "draft",
            sectionCount: Array.isArray(body.sections) ? body.sections.length : 0,
          },
    });

    return new Response(JSON.stringify({ ok: true, id: body.id, created: isCreate }), {
      status: isCreate ? 201 : 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(`[store/drafts ${method}] failed`, err);
    return jsonError("Draft sync failed", 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const guard = await guardWrite(req);
  if (!guard.ok) return guard.response;

  const parsed = await readJsonRequest<{ id?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const rawId = typeof parsed.body.id === "string" ? parsed.body.id.trim() : "";
  if (!rawId) return jsonError("Draft id required", 400);
  // Same guard as writeDraft above: a non-uuid id would raise Postgres 22P02
  // on the eq(drafts.id, …) query and surface as a 500.
  const id = serverUuidOrNull(rawId);
  if (!id) return jsonError("Invalid draft id", 400);

  const auth = guard.auth;
  const tenantId = auth.activeTenant!.id;

  try {
    const db = getDb();
    const [existing] = await db
      .select({ id: drafts.id, tenantId: drafts.tenantId, letterType: drafts.letterType, title: drafts.title })
      .from(drafts)
      .where(eq(drafts.id, id))
      .limit(1);
    if (!existing) return new Response(JSON.stringify({ ok: true, idempotent: true }), { status: 200 });
    if (existing.tenantId !== tenantId) {
      return jsonError("Draft belongs to a different workspace", 403);
    }

    await db.delete(drafts).where(and(eq(drafts.id, id), eq(drafts.tenantId, tenantId)));

    await safelyAppendAudit({
      tenantId,
      kind: "draft.deleted",
      subjectType: "draft",
      subjectId: id,
      actorUserId: auth.userRow.id,
      payload: { letterType: existing.letterType, title: existing.title ?? null },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/drafts DELETE] failed", err);
    return jsonError("Draft delete failed", 500);
  }
}

type GuardResult =
  | { ok: true; auth: NonNullable<Awaited<ReturnType<typeof requireSessionAndTenant>>> & { ok: true } }
  | { ok: false; response: Response };

async function guardWrite(req: Request): Promise<GuardResult> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return { ok: false, response: sameOrigin };
  if (process.env.DRAFTHR_DUAL_WRITE !== "true") {
    return { ok: false, response: jsonError("Dual-write disabled", 503) };
  }
  const limited = rateLimit(req, { name: "store-drafts", max: 120, windowMs: 60_000 });
  if (limited) return { ok: false, response: limited };

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!auth.activeTenant) return { ok: false, response: jsonError("No active workspace", 400) };
  return { ok: true, auth };
}

function summariseTitle(body: DraftInput): string {
  if (body.title && body.title.trim()) return body.title.trim();
  return body.letterType;
}

async function validateTenantReferences(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  matterId: string | null,
  templateSourceId: string | null,
): Promise<Response | null> {
  // 422, NOT 409: the dual-write client treats every 409 as "stale revision"
  // and permanently marks the draft's snapshot stale (stops syncing it). A bad
  // reference is a semantic error with the payload, not a revision conflict —
  // 409 is reserved for staleRevisionResponse().
  if (matterId) {
    if (!isUuid(matterId)) return jsonError("matterId belongs to a different workspace", 422);
    const [matter] = await db
      .select({ id: matters.id })
      .from(matters)
      .where(and(eq(matters.id, matterId), eq(matters.tenantId, tenantId)))
      .limit(1);
    if (!matter) return jsonError("matterId belongs to a different workspace", 422);
  }

  if (templateSourceId) {
    if (!isUuid(templateSourceId)) {
      return jsonError("templateSourceId belongs to a different workspace", 422);
    }
    const [template] = await db
      .select({ id: customTemplates.id })
      .from(customTemplates)
      .where(and(eq(customTemplates.id, templateSourceId), eq(customTemplates.tenantId, tenantId)))
      .limit(1);
    if (!template) return jsonError("templateSourceId belongs to a different workspace", 422);
  }

  return null;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseClientRevision(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function staleRevisionResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: "stale revision" }), {
    status: 409,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
