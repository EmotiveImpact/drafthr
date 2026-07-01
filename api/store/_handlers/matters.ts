/**
 * /api/store/matters — dual-write target for the SPA's matter mutations.
 *
 * Mirrors /api/store/drafts: same-origin + dual-write-flag + rate-limit +
 * session/tenant guard, tenant ownership verified on every update/delete
 * (IDOR defence), audit event per mutation.
 *
 * Why this exists: drafts carry a `matterId`, but until now there was no
 * endpoint to mirror the matter row itself — so the draft dual-write wrote
 * `matterId: null` (the local `matter_…` id isn't a UUID, and drafts.ts
 * rejects a matterId whose row doesn't exist in the tenant). A draft filed
 * under a matter therefore appeared unfiled in the Postgres mirror. Push the
 * matter here first; the draft sync then maps `draft.matterId` through the
 * same `toServerUuid` bridge so the FK resolves.
 *
 * The SPA's local matter id (`matter_…`) is mapped to a deterministic UUID
 * via toServerUuid — same scheme drafts use for their own ids — so the row
 * PK stays stable across syncs without a join table.
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { toServerUuid } from "../../../src/lib/remote-ids.js";
import { getDb } from "../../../src/db/index.js";
import { matters } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";

export const config = { runtime: "nodejs" };

type MatterInput = {
  id: string;
  name: string;
  mode: string;
  type?: string | null;
  status?: string | null;
  color?: string | null;
  riskBand?: string | null;
  description?: string | null;
  primaryName?: string | null;
  primaryContext?: string | null;
  deadlineISO?: string | null;
  deadlineLabel?: string | null;
  counselReviewed?: boolean;
  ownerUserId?: string | null;
  nextAction?: string | null;
  exposureGBP?: number | null;
  archivedAt?: number | null;
};

export async function POST(req: Request): Promise<Response> {
  const guard = await guardWrite(req);
  if (!guard.ok) return guard.response;

  const parsed = await readJsonRequest<MatterInput>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body || typeof body.id !== "string" || !body.id) {
    return jsonError("Matter id required", 400);
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("Matter name required", 400);
  }
  if (body.mode !== "employer" && body.mode !== "employee") {
    return jsonError("Matter mode must be 'employer' or 'employee'", 400);
  }

  const auth = guard.auth;
  const tenantId = auth.activeTenant!.id;
  const rowId = toServerUuid(body.id);

  try {
    const db = getDb();
    const [existing] = await db
      .select({ id: matters.id, tenantId: matters.tenantId })
      .from(matters)
      .where(eq(matters.id, rowId))
      .limit(1);

    // IDOR: a matter with this id already belongs to another tenant.
    if (existing && existing.tenantId !== tenantId) {
      return jsonError("Matter belongs to a different workspace", 403);
    }

    const values = {
      tenantId,
      name: body.name.trim().slice(0, 300),
      mode: body.mode,
      type: (body.type ?? "investigation").slice(0, 80),
      status: (body.status ?? "active").slice(0, 40),
      color: body.color?.slice(0, 40) ?? null,
      riskBand: body.riskBand?.slice(0, 40) ?? null,
      description: body.description?.slice(0, 4000) ?? null,
      primaryName: body.primaryName?.slice(0, 300) ?? null,
      primaryContext: body.primaryContext?.slice(0, 300) ?? null,
      deadlineIso: normalizeDateOnly(body.deadlineISO),
      deadlineLabel: body.deadlineLabel?.slice(0, 200) ?? null,
      counselReviewed: Boolean(body.counselReviewed),
      nextAction: body.nextAction?.slice(0, 300) ?? null,
      exposureGbp:
        typeof body.exposureGBP === "number" && Number.isFinite(body.exposureGBP)
          ? Math.max(0, Math.round(body.exposureGBP))
          : null,
      archivedAt: typeof body.archivedAt === "number" ? new Date(body.archivedAt) : null,
      updatedAt: new Date(),
    };

    if (existing) {
      // Check the row count: a concurrent DELETE between the SELECT above and
      // this UPDATE would touch 0 rows, and returning 200 + a spurious
      // "matter.updated" audit for a row that no longer exists is wrong.
      // (Mirrors the returning-checked pattern in drafts.ts.)
      const updated = await db
        .update(matters)
        .set(values)
        .where(and(eq(matters.id, rowId), eq(matters.tenantId, tenantId)))
        .returning({ id: matters.id });
      if (updated.length === 0) return jsonError("Matter not found", 404);
    } else {
      await db.insert(matters).values({ id: rowId, ...values });
    }

    await safelyAppendAudit({
      tenantId,
      kind: existing ? "matter.updated" : "matter.created",
      subjectType: "matter",
      subjectId: rowId,
      actorUserId: auth.userRow.id,
      payload: { name: values.name, mode: values.mode, status: values.status },
    });

    return new Response(JSON.stringify({ ok: true, id: rowId, created: !existing }), {
      status: existing ? 200 : 201,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/matters POST] failed", err);
    return jsonError("Matter sync failed", 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const guard = await guardWrite(req);
  if (!guard.ok) return guard.response;

  const parsed = await readJsonRequest<{ id?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const rawId = typeof parsed.body.id === "string" ? parsed.body.id.trim() : "";
  if (!rawId) return jsonError("Matter id required", 400);
  const rowId = toServerUuid(rawId);

  const auth = guard.auth;
  const tenantId = auth.activeTenant!.id;

  try {
    const db = getDb();
    const [existing] = await db
      .select({ id: matters.id, tenantId: matters.tenantId, name: matters.name })
      .from(matters)
      .where(eq(matters.id, rowId))
      .limit(1);
    if (!existing) return new Response(JSON.stringify({ ok: true, idempotent: true }), { status: 200 });
    if (existing.tenantId !== tenantId) {
      return jsonError("Matter belongs to a different workspace", 403);
    }

    // drafts.matterId is ON DELETE SET NULL, so deleting a matter unfiles its
    // drafts server-side — matches the local deleteMatter (clears matterId).
    await db.delete(matters).where(and(eq(matters.id, rowId), eq(matters.tenantId, tenantId)));

    await safelyAppendAudit({
      tenantId,
      kind: "matter.deleted",
      subjectType: "matter",
      subjectId: rowId,
      actorUserId: auth.userRow.id,
      payload: { name: existing.name },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/matters DELETE] failed", err);
    return jsonError("Matter delete failed", 500);
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
  const limited = rateLimit(req, { name: "store-matters", max: 120, windowMs: 60_000 });
  if (limited) return { ok: false, response: limited };

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!auth.activeTenant) return { ok: false, response: jsonError("No active workspace", 400) };
  return { ok: true, auth };
}

/** Accept an ISO date (YYYY-MM-DD or a full ISO string we trim to the date). */
function normalizeDateOnly(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const m = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
