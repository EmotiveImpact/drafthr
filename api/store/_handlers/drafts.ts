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
import { and, eq, lte } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { customTemplates, drafts, matters, sections } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";

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
    const clientRevision = parseClientRevision(body.clientRevision);
    if (!isCreate && (clientRevision === null || clientRevision < existingDraft[0].updatedAt.getTime())) {
      return staleRevisionResponse();
    }

    const referenceError = await validateTenantReferences(db, tenantId, matterId, templateSourceId);
    if (referenceError) return referenceError;

    const acceptedRevision = new Date(clientRevision ?? Date.now());

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
  const id = typeof parsed.body.id === "string" ? parsed.body.id.trim() : "";
  if (!id) return jsonError("Draft id required", 400);

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
  if (matterId) {
    if (!isUuid(matterId)) return jsonError("matterId belongs to a different workspace", 409);
    const [matter] = await db
      .select({ id: matters.id })
      .from(matters)
      .where(and(eq(matters.id, matterId), eq(matters.tenantId, tenantId)))
      .limit(1);
    if (!matter) return jsonError("matterId belongs to a different workspace", 409);
  }

  if (templateSourceId) {
    if (!isUuid(templateSourceId)) {
      return jsonError("templateSourceId belongs to a different workspace", 409);
    }
    const [template] = await db
      .select({ id: customTemplates.id })
      .from(customTemplates)
      .where(and(eq(customTemplates.id, templateSourceId), eq(customTemplates.tenantId, tenantId)))
      .limit(1);
    if (!template) return jsonError("templateSourceId belongs to a different workspace", 409);
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
