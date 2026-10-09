/**
 * /api/store/drafts — dual-write target for the SPA's draft mutations.
 *
 * - POST: upsert the draft (insert on first sync, update on subsequent).
 *   We use the SPA's draft.id as the row PK rather than minting our own —
 *   keeps localStorage and Postgres aligned by id without a join table.
 * - DELETE: soft-delete. The row stays as a scrubbed tombstone (deleted_at)
 *   so the pull can tell other devices to drop the draft, and an upsert of
 *   a tombstoned id is refused with 410 instead of re-creating the letter
 *   (and spending another letter credit). Its collaboration data (comments,
 *   approvals, timeline) is kept for the restore window only, see
 *   purgeExpiredTombstoneExtras.
 *
 * Writes are revision-checked: every accepted write bumps drafts.revision and
 * an update must name the revision it was built on. A stale write gets 409
 * with the current row so the client can keep both versions (see
 * _draft-sync.ts for the rules).
 *
 * Every mutation appends an audit event under the active tenant. Returns
 * 503 when DRAFTHR_DUAL_WRITE !== 'true' so a misbehaving client can't
 * write past the flag.
 *
 * Tenant ownership is verified on every update/delete (defence against IDOR).
 */
import { and, eq, inArray, desc, isNull, isNotNull, lt, sql } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { rejectReadOnlyMember, rejectUnauthorisedReviewDecision, rejectEditOfApprovedDraft } from "../../_utils/workspace-role.js";
import { getDb } from "../../../src/db/index.js";
import { customTemplates, draftExtras, drafts, matters, sections, entitlementPurchases } from "../../../src/db/schema.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { assertCanCreateLetter, type ConsumeTarget } from "../../_utils/entitlements.js";
import { isValidSectionInput } from "./_section-input.js";
import { decideDraftWrite, RESTORE_WINDOW_MS } from "./_draft-sync.js";

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
  /** The client's own edit time. Only used for the stored updatedAt now. */
  clientRevision?: number | null;
  /** The server revision this write was built on (from the last GET / POST). */
  baseRevision?: number | null;
  /** Undo of a delete from the deleting device (honoured for a short window). */
  restore?: boolean;
};

type Db = ReturnType<typeof getDb>;
type DraftRow = typeof drafts.$inferSelect;
type SectionRow = typeof sections.$inferSelect;

/** One draft in the shape the client merge expects (mirrors toServerPayload). */
function serializeDraft(d: DraftRow, sectionRows: SectionRow[]) {
  return {
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
    revision: d.revision ?? 0,
    sections: sectionRows
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        sectionId: s.sectionId,
        title: s.title,
        html: s.html,
        status: s.status,
        position: s.position,
      })),
  };
}

/** The live (non-deleted) row for one draft, serialized, or null. */
async function loadCurrentDraft(db: Db, tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.tenantId, tenantId)))
    .limit(1);
  if (!row || row.deletedAt) return null;
  const sectionRows = await db
    .select()
    .from(sections)
    .where(and(eq(sections.draftId, id), eq(sections.tenantId, tenantId)));
  return serializeDraft(row, sectionRows);
}

/**
 * GET — read back every live draft for the caller's active tenant, with
 * sections nested, plus the tombstones of deleted drafts so other devices can
 * drop their local copies. Tenant-scoped; gated by the same dual-write flag as
 * writes so read+write are consistent.
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
      .where(and(eq(drafts.tenantId, tenantId), isNull(drafts.deletedAt)))
      .orderBy(desc(drafts.updatedAt))
      .limit(MAX_DRAFTS);

    // Tombstones are tiny (id + time); the most recent ones are enough for any
    // device that has been offline for a while to converge.
    const tombstoneRows = await db
      .select({ id: drafts.id, deletedAt: drafts.deletedAt })
      .from(drafts)
      .where(and(eq(drafts.tenantId, tenantId), isNotNull(drafts.deletedAt)))
      .orderBy(desc(drafts.deletedAt))
      .limit(MAX_DRAFTS);

    await purgeExpiredTombstoneExtras(db, tenantId);

    const ids = draftRows.map((d) => d.id);
    const sectionRows = ids.length
      ? await db
          .select()
          .from(sections)
          // ids are already tenant-scoped (drafts filtered by tenantId above);
          // the explicit tenant filter makes this read correct by construction.
          .where(and(inArray(sections.draftId, ids), eq(sections.tenantId, tenantId)))
      : [];

    const sectionsByDraft = new Map<string, SectionRow[]>();
    for (const s of sectionRows) {
      const list = sectionsByDraft.get(s.draftId) ?? [];
      list.push(s);
      sectionsByDraft.set(s.draftId, list);
    }

    const out = draftRows.map((d) => serializeDraft(d, sectionsByDraft.get(d.id) ?? []));
    const deleted = tombstoneRows.map((t) => ({
      id: t.id,
      deletedAt: t.deletedAt ? t.deletedAt.getTime() : 0,
    }));

    return new Response(JSON.stringify({ drafts: out, deleted }), {
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

/** Thrown inside the create transaction when a one-off entitlement was consumed
 *  by a concurrent create — rolls the transaction back so a single-letter
 *  purchase can never yield two letters. */
class PaywallRaceError extends Error {}

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
    const [existingDraft] = await db
      .select({
        id: drafts.id,
        tenantId: drafts.tenantId,
        reviewStatus: drafts.reviewStatus,
        revision: drafts.revision,
        deletedAt: drafts.deletedAt,
        updatedAt: drafts.updatedAt,
        isTemplateSource: drafts.isTemplateSource,
      })
      .from(drafts)
      .where(eq(drafts.id, body.id))
      .limit(1);

    // Decide BEFORE any paywall check: a tombstoned id is never a create, so a
    // stale device re-sending a deleted draft can't spend a letter credit.
    const decision = decideDraftWrite(
      existingDraft
        ? {
            tenantId: existingDraft.tenantId,
            revision: existingDraft.revision ?? 0,
            deletedAt: existingDraft.deletedAt ?? null,
            updatedAt: existingDraft.updatedAt ?? null,
            reviewStatus: existingDraft.reviewStatus,
          }
        : null,
      tenantId,
      {
        baseRevision: body.baseRevision,
        restore: body.restore,
        clientRevision: body.clientRevision,
        reviewStatus: body.reviewStatus,
      },
      Date.now(),
    );
    if (decision.kind === "forbidden") {
      // Draft exists in a different tenant — refuse to overwrite (IDOR defence).
      return jsonError("Draft belongs to a different workspace", 403);
    }
    if (decision.kind === "gone") return goneResponse(decision.deletedAt);
    if (decision.kind === "stale") return staleResponse(db, tenantId, body.id);
    const isCreate = decision.kind === "create";
    const restoring = decision.kind === "update" && decision.restore;
    const decisionError = rejectUnauthorisedReviewDecision(
      auth,
      isCreate ? null : existingDraft.reviewStatus,
      body.reviewStatus,
    );
    if (decisionError) return decisionError;
    if (!isCreate && !restoring && existingDraft.reviewStatus === "approved" && Array.isArray(body.sections)) {
      const stored = await db
        .select({ sectionId: sections.sectionId, title: sections.title, html: sections.html })
        .from(sections)
        .where(and(eq(sections.draftId, body.id), eq(sections.tenantId, tenantId)));
      const locked = rejectEditOfApprovedDraft("approved", body.reviewStatus, stored, body.sections);
      if (locked) {
        return conflictResponse(
          await loadCurrentDraft(db, tenantId, body.id),
          "This letter is approved and locked. Re-open it for review before editing.",
          true,
        );
      }
    }
    let consume: ConsumeTarget | undefined;
    if (isCreate && !body.isTemplateSource) {
      // Hard-paywall gate (env-gated by DRAFTHR_ENFORCE_PAYWALL). Only new
      // letters are gated; edits to existing drafts always go through.
      // Template sources aren't letters (the allowance doesn't count them),
      // so saving one never spends a letter purchase or pack slot.
      // The letter type decides which one-off letter tier can authorise it.
      const gate = await assertCanCreateLetter(tenantId, auth.userRow.id, body.letterType ?? null);
      if (!gate.ok) return jsonError(gate.reason, gate.code);
      consume = gate.consume;
    }

    const referenceError = await validateTenantReferences(db, tenantId, matterId, templateSourceId);
    if (referenceError) return referenceError;

    // updatedAt is display metadata now (the revision does the conflict
    // check). Clamp the client's edit time to now (+ a small clock-skew
    // window) so a far-future value can't poison the stored timestamp.
    const MAX_SKEW_MS = 60_000;
    const nowMs = Date.now();
    const clientRevision = parseClientRevision(body.clientRevision);
    const acceptedUpdatedAt = new Date(Math.min(clientRevision ?? nowMs, nowMs + MAX_SKEW_MS));
    const nextRevision = isCreate ? 1 : decision.expectedRevision + 1;

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
          updatedAt: acceptedUpdatedAt,
          revision: nextRevision,
        });
        // Consume the entitlement that authorised this create, atomically with
        // the insert. Each guarded UPDATE flips at most one unit and returns 0
        // rows if a concurrent create already claimed it — in which case we abort
        // so the draft insert rolls back (never a free extra letter):
        //  - a single-letter one-off is consumed once (consumed_at IS NULL guard);
        //  - a case pack decrements letters_used while it's below its allowance.
        if (consume) {
          const consumed =
            consume.kind === "letter"
              ? await tx
                  .update(entitlementPurchases)
                  .set({ consumedAt: new Date() })
                  .where(
                    and(
                      eq(entitlementPurchases.id, consume.entitlementId),
                      isNull(entitlementPurchases.consumedAt),
                      isNull(entitlementPurchases.refundedAt),
                    ),
                  )
                  .returning({ id: entitlementPurchases.id })
              : await tx
                  .update(entitlementPurchases)
                  .set({ lettersUsed: sql`${entitlementPurchases.lettersUsed} + 1` })
                  .where(
                    and(
                      eq(entitlementPurchases.id, consume.entitlementId),
                      sql`${entitlementPurchases.lettersUsed} < ${entitlementPurchases.lettersTotal}`,
                      isNull(entitlementPurchases.refundedAt),
                    ),
                  )
                  .returning({ id: entitlementPurchases.id });
          if (consumed.length === 0) throw new PaywallRaceError();
        }
      } else {
        // Compare-and-swap on the revision: a concurrent write that landed
        // between our read and this update makes it match zero rows.
        const updated = await tx
          .update(drafts)
          .set({
            matterId,
            letterType: body.letterType,
            mode: body.mode,
            title: body.title ?? null,
            jurisdiction: body.jurisdiction ?? null,
            reviewStatus: body.reviewStatus ?? "draft",
            // Fixed at create: flipping it would let an ungated template
            // save become a letter, or take a letter out of the allowance.
            isTemplateSource: Boolean(existingDraft.isTemplateSource),
            templateSourceId,
            contextJson: body.context,
            employerJson: body.employer ?? null,
            employeeJson: body.employee ?? null,
            answersJson: body.answers ?? null,
            updatedAt: acceptedUpdatedAt,
            revision: nextRevision,
            ...(restoring ? { deletedAt: null } : {}),
          })
          .where(
            and(
              eq(drafts.id, body.id),
              eq(drafts.tenantId, tenantId),
              eq(drafts.revision, decision.expectedRevision),
              restoring ? isNotNull(drafts.deletedAt) : isNull(drafts.deletedAt),
            ),
          )
          .returning({ id: drafts.id });
        if (updated.length === 0) return { stale: true as const };
      }

      if (Array.isArray(body.sections)) {
        // Replace strategy — sections roll over the draft id. Cheaper to
        // delete-then-insert than to diff individual rows; section_versions
        // FK is set null on cascade-from-sections so this is safe.
        await tx.delete(sections).where(and(eq(sections.draftId, body.id), eq(sections.tenantId, tenantId)));
        for (const s of body.sections) {
          await tx.insert(sections).values({
            draftId: body.id,
            tenantId,
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
    if (writeResult.stale) return staleResponse(db, tenantId, body.id);

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
            ...(restoring ? { restored: true } : {}),
          },
    });

    return new Response(
      JSON.stringify({ ok: true, id: body.id, created: isCreate, revision: nextRevision }),
      {
        status: isCreate ? 201 : 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    if (err instanceof PaywallRaceError) {
      return jsonError("That letter credit was just used — please refresh and choose a plan or letter.", 402);
    }
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
      .select({
        id: drafts.id,
        tenantId: drafts.tenantId,
        letterType: drafts.letterType,
        title: drafts.title,
        deletedAt: drafts.deletedAt,
      })
      .from(drafts)
      .where(eq(drafts.id, id))
      .limit(1);
    if (!existing) return new Response(JSON.stringify({ ok: true, idempotent: true }), { status: 200 });
    if (existing.tenantId !== tenantId) {
      return jsonError("Draft belongs to a different workspace", 403);
    }
    if (existing.deletedAt) {
      return new Response(JSON.stringify({ ok: true, idempotent: true }), { status: 200 });
    }

    // Soft delete: keep the row as a tombstone but scrub the letter content,
    // so the PII the user deleted is gone while other devices can still learn
    // the draft was deleted. The extras row stays until the restore window
    // has passed (purgeExpiredTombstoneExtras) so an Undo keeps its authors.
    await db.transaction(async (tx) => {
      await tx
        .update(drafts)
        .set({
          deletedAt: new Date(),
          revision: sql`${drafts.revision} + 1`,
          title: null,
          contextJson: {},
          employerJson: null,
          employeeJson: null,
          answersJson: null,
          updatedAt: new Date(),
        })
        .where(and(eq(drafts.id, id), eq(drafts.tenantId, tenantId)));
      await tx.delete(sections).where(and(eq(sections.draftId, id), eq(sections.tenantId, tenantId)));
    });
    await purgeExpiredTombstoneExtras(db, tenantId);

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

/**
 * Delete the collaboration data (comments, approvals, timeline) of this
 * tenant's drafts deleted longer ago than the restore window. Until then it
 * is kept so the Undo restores it as it was: re-sent from the client instead,
 * every teammate's comment would be stamped as the restoring user's, and a
 * drafter's copy of reviewers' approvals would be refused. There is no
 * scheduled job, so this runs from the tenant's own pulls and deletes.
 * Best effort: a failure here must not fail the request.
 */
async function purgeExpiredTombstoneExtras(db: Db, tenantId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RESTORE_WINDOW_MS);
  try {
    await db.delete(draftExtras).where(
      and(
        eq(draftExtras.tenantId, tenantId),
        inArray(
          draftExtras.draftId,
          db
            .select({ id: drafts.id })
            .from(drafts)
            .where(and(eq(drafts.tenantId, tenantId), lt(drafts.deletedAt, cutoff))),
        ),
      ),
    );
  } catch (err) {
    console.warn("[store/drafts] purging deleted drafts' extras failed", err);
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
  const readOnly = rejectReadOnlyMember(auth);
  if (readOnly) return { ok: false, response: readOnly };
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
  // 409 is reserved for conflictResponse().
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

/**
 * 409 for a write built on an old revision (or one that would edit an approved
 * letter). Carries the current row so the client can keep both versions
 * instead of silently dropping one.
 */
function conflictResponse(
  current: Awaited<ReturnType<typeof loadCurrentDraft>>,
  error: string,
  locked = false,
): Response {
  return new Response(
    JSON.stringify({ ok: false, error, locked, revision: current?.revision ?? null, current }),
    {
      status: 409,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/** 409 with the current row, or 410 when a concurrent delete removed it (the
 *  client drops or keeps its copy on 410; a 409 with no row has nothing to
 *  merge against). */
async function staleResponse(db: Db, tenantId: string, id: string): Promise<Response> {
  const current = await loadCurrentDraft(db, tenantId, id);
  return current ? conflictResponse(current, "stale revision") : goneResponse(new Date());
}

/** 410 for an upsert of a draft that was deleted (on this or another device). */
function goneResponse(deletedAt: Date): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Draft was deleted", deleted: true, deletedAt: deletedAt.getTime() }),
    {
      status: 410,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
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
