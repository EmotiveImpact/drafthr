/**
 * /api/store/drafts — dual-write target for the SPA's draft mutations.
 *
 * - POST: upsert the draft (insert on first sync, update on subsequent).
 *   We use the SPA's draft.id as the row PK rather than minting our own —
 *   keeps localStorage and Postgres aligned by id without a join table.
 * - DELETE: retain a workspace tombstone, or hard-delete in the legacy rollout;
 *   both revoke consultant sharing in the same transaction.
 *
 * Every mutation appends an audit event under the active tenant. Returns
 * 503 when DRAFTHR_DUAL_WRITE !== 'true' so a misbehaving client can't
 * write past the flag.
 *
 * Tenant ownership is verified on every update/delete (defence against IDOR).
 */
import { and, eq, gt, lte, inArray, desc, asc, isNull, sql } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { customTemplates, drafts, employees, matters, sections, entitlementPurchases, workspaceFiles, consultantBookings } from "../../../src/db/schema.js";
import { serverUuidOrNull, toServerUuid } from "../../../src/lib/remote-ids.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { assertCanCreateLetter, type ConsumeTarget } from "../../_utils/entitlements.js";
import { isValidSectionInput } from "./_section-input.js";
import { isDraftSnapshot, snapshotSections } from "./_draft-snapshot.js";

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
  employeeId?: string | null;
  reviewStatus?: string;
  isTemplateSource?: boolean;
  templateSourceId?: string | null;
  context: Record<string, unknown>;
  employer?: Record<string, unknown> | null;
  employee?: Record<string, unknown> | null;
  answers?: Record<string, unknown> | null;
  sections?: SectionInput[];
  clientRevision?: number | null;
  /** Database-first write. The server derives projections from this object. */
  snapshot?: unknown;
  /** 0 for create, otherwise the revision returned by the last server read/write. */
  baseRevision?: number;
  /** Required when promoting a pre-snapshot row whose revision is still 0. */
  legacyUpdatedAt?: number;
};

/**
 * GET — read back every draft for the caller's active tenant, with sections
 * nested, in the SAME shape toServerPayload writes (so the client merge is
 * symmetric). Tenant-scoped; gated by the same dual-write flag as writes so
 * read+write are consistent. This is the pull half of cross-device sync.
 */
export async function GET(req: Request): Promise<Response> {
  const documents = new URL(req.url).searchParams.get("format") === "documents";
  if (documents ? process.env.DRAFTHR_DATABASE_DRAFTS !== "true" : process.env.DRAFTHR_DUAL_WRITE !== "true") {
    return jsonError("Draft storage disabled", 503);
  }
  const limited = await rateLimit(req, { name: documents ? "store-draft-documents-get" : "store-drafts-get", max: documents ? 600 : 120, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const workspaceError = checkWorkspace(req, auth);
  if (workspaceError) return workspaceError;
  const tenantId = auth.activeTenant.id;

  try {
    const db = getDb();
    if (documents) {
      // Stable ID pagination: the old 1,000-row capped GET could silently
      // omit a customer's older letters. Full snapshots are larger, so return
      // bounded pages and require the client to follow nextCursor.
      const cursor = new URL(req.url).searchParams.get("cursor");
      if (cursor && !serverUuidOrNull(cursor)) return jsonError("Invalid cursor", 400);
      const page = await db
        .select()
        .from(drafts)
        .where(and(eq(drafts.tenantId, tenantId), cursor ? gt(drafts.id, cursor) : undefined))
        .orderBy(asc(drafts.id))
        .limit(21);
      const hasMore = page.length > 20;
      const rows = page.slice(0, 20);
      const legacyIds = rows.filter((row) => !row.snapshotJson && !row.deletedAt).map((row) => row.id);
      const legacySections = legacyIds.length
        ? await db.select().from(sections).where(and(inArray(sections.draftId, legacyIds), eq(sections.tenantId, tenantId)))
        : [];
      return new Response(JSON.stringify({
        documents: rows.map((row) => ({
          id: row.id,
          revision: row.revision,
          snapshot: row.deletedAt ? null : row.snapshotJson,
          deletedAt: row.deletedAt?.getTime() ?? null,
          // A pre-migration row has only the old projections. Do not pretend
          // it is a complete snapshot; the importer can merge local-only data.
          legacy: row.snapshotJson || row.deletedAt ? undefined : {
            id: row.id,
            letterType: row.letterType,
            mode: row.mode,
            title: row.title,
            jurisdiction: row.jurisdiction,
            matterId: row.matterId,
            employeeId: row.employeeId,
            reviewStatus: row.reviewStatus,
            isTemplateSource: row.isTemplateSource,
            templateSourceId: row.templateSourceId,
            context: row.contextJson ?? {},
            employer: row.employerJson,
            employee: row.employeeJson,
            answers: row.answersJson,
            createdAt: row.createdAt.getTime(),
            updatedAt: row.updatedAt.getTime(),
            sections: legacySections
              .filter((section) => section.draftId === row.id)
              .sort((a, b) => a.position - b.position)
              .map((section) => ({
                sectionId: section.sectionId,
                title: section.title,
                html: section.html,
                status: section.status,
                position: section.position,
              })),
          },
        })),
        nextCursor: hasMore ? rows.at(-1)?.id : null,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
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

    const ids = draftRows.map((d) => d.id);
    const sectionRows = ids.length
      ? await db
          .select()
          .from(sections)
          // ids are already tenant-scoped (drafts filtered by tenantId above);
          // the explicit tenant filter makes this read correct by construction.
          .where(and(inArray(sections.draftId, ids), eq(sections.tenantId, tenantId)))
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

/** Thrown inside the create transaction when a one-off entitlement was consumed
 *  by a concurrent create — rolls the transaction back so a single-letter
 *  purchase can never yield two letters. */
class PaywallRaceError extends Error {}
class DraftReferenceError extends Error {
  response: Response;
  constructor(response: Response) { super("Invalid draft reference"); this.response = response; }
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
  let snapshot: import("../../../src/lib/letters/types.js").Draft | null = null;
  if (body.snapshot !== undefined) {
    if (process.env.DRAFTHR_DATABASE_DRAFTS !== "true") return jsonError("Database draft storage disabled", 503);
    if (!isDraftSnapshot(body.snapshot, draftId)) return jsonError("Invalid draft snapshot", 400);
    if (!Number.isSafeInteger(body.baseRevision) || (body.baseRevision ?? -1) < 0) {
      return jsonError("A non-negative baseRevision is required", 400);
    }
    snapshot = body.snapshot;
    // Never trust a client-supplied indexed projection that disagrees with the
    // complete document. Generate every projection from the same snapshot.
    body.letterType = snapshot.letterType;
    body.mode = snapshot.mode;
    body.title = snapshot.title ?? null;
    body.jurisdiction = snapshot.context.jurisdiction;
    body.reviewStatus = snapshot.reviewStatus ?? "draft";
    body.isTemplateSource = Boolean(snapshot.isTemplateSource);
    body.context = snapshot.context as unknown as Record<string, unknown>;
    body.employer = snapshot.employer as unknown as Record<string, unknown>;
    body.employee = snapshot.employee as unknown as Record<string, unknown>;
    body.answers = snapshot.answers as Record<string, unknown>;
    body.sections = snapshotSections(snapshot);
    body.employeeId = snapshot.employeeId ? toServerUuid(snapshot.employeeId) : null;
    if (snapshot.matterId && body.matterId !== toServerUuid(snapshot.matterId)) {
      return jsonError("The draft's matter must be saved first", 422);
    }
    if (snapshot.templateSourceId && body.templateSourceId !== toServerUuid(snapshot.templateSourceId)) {
      return jsonError("The draft's template must be saved first", 422);
    }
  }
  if (!snapshot && process.env.DRAFTHR_DATABASE_WORKSPACE === "true") {
    return jsonError("Reload to save a complete draft document", 409);
  }
  if (!snapshot && process.env.DRAFTHR_DUAL_WRITE !== "true") {
    return jsonError("Legacy draft sync disabled", 503);
  }
  if (Array.isArray(body.sections) && !body.sections.every(isValidSectionInput)) {
    return jsonError("Invalid section in sections array", 400);
  }

  const auth = guard.auth;
  const tenantId = auth.activeTenant!.id;

  try {
    const db = getDb();
    const titleSummary = summariseTitle(body);
    const matterId = normalizeOptionalId(body.matterId);
    const employeeId = normalizeOptionalId(body.employeeId);
    const templateSourceId = normalizeOptionalId(body.templateSourceId);
    const existingDraft = await db
      .select({ id: drafts.id, tenantId: drafts.tenantId, updatedAt: drafts.updatedAt, revision: drafts.revision, snapshotJson: drafts.snapshotJson, deletedAt: drafts.deletedAt })
      .from(drafts)
      .where(eq(drafts.id, body.id))
      .limit(1);

    if (existingDraft.length && existingDraft[0].tenantId !== tenantId) {
      // Draft exists in a different tenant — refuse to overwrite (IDOR defence).
      return jsonError("Draft belongs to a different workspace", 403);
    }
    const isCreate = existingDraft.length === 0;
    if (existingDraft[0]?.deletedAt) return deletedDraftResponse();
    let consume: ConsumeTarget | undefined;
    if (isCreate) {
      // Hard-paywall gate (env-gated by DRAFTHR_ENFORCE_PAYWALL). Only new
      // letters are gated; edits to existing drafts always go through.
      const gate = await assertCanCreateLetter(tenantId, auth.userRow.id);
      if (!gate.ok) return jsonError(gate.reason, gate.code);
      consume = gate.consume;
    }
    const clientRevision = parseClientRevision(body.clientRevision);
    if (snapshot && (isCreate ? body.baseRevision !== 0 : body.baseRevision !== existingDraft[0].revision)) {
      return staleRevisionResponse();
    }
    if (snapshot && !isCreate && !existingDraft[0].snapshotJson &&
        body.legacyUpdatedAt !== existingDraft[0].updatedAt.getTime()) {
      return staleRevisionResponse();
    }
    // A legacy partial writer must not erase a complete document. During
    // rollout the two clients may coexist; reject the old one explicitly.
    if (!snapshot && !isCreate && existingDraft[0].snapshotJson) {
      return staleRevisionResponse();
    }
    if (!snapshot && !isCreate && (clientRevision === null || clientRevision < existingDraft[0].updatedAt.getTime())) {
      return staleRevisionResponse();
    }

    if (process.env.DRAFTHR_DATABASE_WORKSPACE !== "true") {
      const referenceError = await validateTenantReferences(db, tenantId, matterId, templateSourceId, employeeId);
      if (referenceError) return referenceError;
    }

    // updatedAt must be server-authoritative. The client's revision is trusted
    // only for the stale COMPARISON above; persisting it verbatim let a caller
    // send a far-future epoch that poisons drafts.updatedAt and permanently
    // 409s every subsequent legitimate write (bug #13). Clamp to now (+ a small
    // clock-skew window) so a future value can never lock the draft.
    const MAX_SKEW_MS = 60_000;
    const nowMs = Date.now();
    const acceptedRevision = snapshot
      ? new Date(nowMs)
      : new Date(Math.min(clientRevision ?? nowMs, nowMs + MAX_SKEW_MS));

    const writeResult = await db.transaction(async (tx) => {
      let stagedFileIds: string[] = [];
      if (process.env.DRAFTHR_DATABASE_WORKSPACE === "true") {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-records:${tenantId}`}, 0))`);
        const referenceError = await validateTenantReferences(tx, tenantId, matterId, templateSourceId, employeeId);
        if (referenceError) throw new DraftReferenceError(referenceError);
        // A caller cannot attach another workspace's file, or a pending upload,
        // merely by embedding its UUID in an otherwise valid draft snapshot.
        const fileIds = [...new Set((snapshot?.evidence ?? []).flatMap(item => item.fileId ? [item.fileId] : []))];
        if (fileIds.some(id => !serverUuidOrNull(id))) throw new DraftReferenceError(jsonError("Invalid evidence file reference", 422));
        if (fileIds.length) {
          const linked = await tx.select({ id: workspaceFiles.id, draftId: workspaceFiles.draftId,
            importDraftId: workspaceFiles.importDraftId, createdBy: workspaceFiles.createdBy }).from(workspaceFiles).where(and(
            inArray(workspaceFiles.id, fileIds), eq(workspaceFiles.tenantId, tenantId),
            eq(workspaceFiles.purpose, "evidence"), eq(workspaceFiles.status, "ready"),
          ));
          if (linked.length !== fileIds.length) throw new DraftReferenceError(jsonError("Evidence must be a confirmed upload in this workspace before it can be attached", 422));
          const staged = linked.filter(file => !file.draftId);
          if (staged.some(file => file.importDraftId !== body.id || file.createdBy !== auth.userRow.id)) {
            throw new DraftReferenceError(jsonError("Staged evidence belongs to another draft or importer", 422));
          }
          stagedFileIds = staged.map(file => file.id);
        }
      }
      if (isCreate) {
        await tx.insert(drafts).values({
          id: body.id,
          tenantId,
          authorUserId: auth.userRow.id,
          matterId,
          employeeId,
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
          snapshotJson: snapshot as unknown as Record<string, unknown> | null,
          revision: snapshot ? 1 : 0,
          submittedForReviewAt: snapshot?.submittedForReviewAt ? new Date(snapshot.submittedForReviewAt) : null,
          reviewDecidedAt: snapshot?.reviewDecidedAt ? new Date(snapshot.reviewDecidedAt) : null,
          updatedAt: acceptedRevision,
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
                    ),
                  )
                  .returning({ id: entitlementPurchases.id });
          if (consumed.length === 0) throw new PaywallRaceError();
        }
      } else {
        const updated = await tx
          .update(drafts)
          .set({
            matterId,
            employeeId,
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
            snapshotJson: snapshot as unknown as Record<string, unknown> | null,
            revision: snapshot ? existingDraft[0].revision + 1 : 0,
            submittedForReviewAt: snapshot?.submittedForReviewAt ? new Date(snapshot.submittedForReviewAt) : null,
            reviewDecidedAt: snapshot?.reviewDecidedAt ? new Date(snapshot.reviewDecidedAt) : null,
            updatedAt: acceptedRevision,
          })
          .where(and(
            eq(drafts.id, body.id),
            eq(drafts.tenantId, tenantId),
            isNull(drafts.deletedAt),
            snapshot
              ? and(
                  eq(drafts.revision, body.baseRevision!),
                  existingDraft[0].snapshotJson
                    ? sql`${drafts.snapshotJson} is not null`
                    : and(isNull(drafts.snapshotJson), eq(drafts.updatedAt, new Date(body.legacyUpdatedAt!))),
                )
              : and(isNull(drafts.snapshotJson), lte(drafts.updatedAt, acceptedRevision)),
          ))
          .returning({ id: drafts.id });
        if (updated.length === 0) return { stale: true as const };
      }

      if (stagedFileIds.length) {
        await tx.update(workspaceFiles).set({ draftId: body.id }).where(inArray(workspaceFiles.id, stagedFileIds));
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
      if (process.env.DRAFTHR_DATABASE_WORKSPACE === "true") {
        await appendAuditEvent({ tenantId, kind: isCreate ? "draft.created" : "draft.updated", subjectType: "draft",
          subjectId: body.id, actorUserId: auth.userRow.id, payload: { title: titleSummary, revision: (existingDraft[0]?.revision ?? 0) + 1 } }, tx);
      }
      return { stale: false as const };
    });
    if (writeResult.stale) return staleRevisionResponse();

    if (process.env.DRAFTHR_DATABASE_WORKSPACE !== "true") await safelyAppendAudit({
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

    return new Response(JSON.stringify({ ok: true, id: body.id, created: isCreate, revision: snapshot ? (existingDraft[0]?.revision ?? 0) + 1 : undefined }), {
      status: isCreate ? 201 : 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof DraftReferenceError) return err.response;
    if (err instanceof PaywallRaceError) {
      return jsonError("That letter credit was just used — please refresh and choose a plan or letter.", 402);
    }
    if (snapshot && typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
      // Two devices created the same ID concurrently. Treat the unique-key
      // loser as a conflict, never a mysterious 500 or an overwrite.
      return staleRevisionResponse();
    }
    console.error(`[store/drafts ${method}] failed`, err);
    return jsonError("Draft sync failed", 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const guard = await guardWrite(req);
  if (!guard.ok) return guard.response;

  const parsed = await readJsonRequest<{ id?: string; baseRevision?: number; legacyUpdatedAt?: number }>(req);
  if (!parsed.ok) return parsed.response;
  const rawId = typeof parsed.body.id === "string" ? parsed.body.id.trim() : "";
  if (!rawId) return jsonError("Draft id required", 400);
  // Same guard as writeDraft above: a non-uuid id would raise Postgres 22P02
  // on the eq(drafts.id, …) query and surface as a 500.
  const id = serverUuidOrNull(rawId);
  if (!id) return jsonError("Invalid draft id", 400);

  const auth = guard.auth;
  const tenantId = auth.activeTenant!.id;

  if (process.env.DRAFTHR_DATABASE_WORKSPACE === "true") {
    if (!Number.isSafeInteger(parsed.body.baseRevision) || (parsed.body.baseRevision ?? -1) < 0) return jsonError("A non-negative baseRevision is required", 400);
    try {
      return await getDb().transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-records:${tenantId}`}, 0))`);
        const [row] = await tx.select().from(drafts).where(and(eq(drafts.id, id), eq(drafts.tenantId, tenantId))).limit(1).for("update");
        if (!row) return jsonError("Draft not found", 404);
        if (!row.deletedAt && (row.revision !== parsed.body.baseRevision || (!row.snapshotJson && parsed.body.legacyUpdatedAt !== row.updatedAt.getTime()))) return staleRevisionResponse();
        // Lock draft before bookings, matching create/accept. Also repair old
        // tombstones on an idempotent retry so previously issued tokens expire.
        await tx.update(consultantBookings).set({ shareToken: null, shareTokenExpiresAt: null })
          .where(and(eq(consultantBookings.draftId, id), eq(consultantBookings.tenantId, tenantId)));
        if (row.deletedAt) return Response.json({ ok: true, id, revision: row.revision, deletedAt: row.deletedAt.getTime() }, { headers: { "Cache-Control": "no-store" } });
        const now = new Date();
        await tx.update(drafts).set({ deletedAt: now, updatedAt: now, revision: row.revision + 1 })
          .where(and(eq(drafts.id, id), eq(drafts.tenantId, tenantId)));
        await appendAuditEvent({ tenantId, kind: "draft.deleted", subjectType: "draft", subjectId: id,
          actorUserId: auth.userRow.id, payload: { revision: row.revision + 1 } }, tx);
        return Response.json({ ok: true, id, revision: row.revision + 1, deletedAt: now.getTime() }, { headers: { "Cache-Control": "no-store" } });
      });
    } catch { return jsonError("Draft delete failed", 503); }
  }

  try {
    let auditDraft: { letterType: string; title: string | null } | undefined;
    const result = await getDb().transaction(async db => {
      const [existing] = await db
        .select({ id: drafts.id, tenantId: drafts.tenantId, letterType: drafts.letterType, title: drafts.title })
        .from(drafts)
        .where(eq(drafts.id, id))
        .limit(1).for("update");
      if (!existing) return new Response(JSON.stringify({ ok: true, idempotent: true }), { status: 200 });
      if (existing.tenantId !== tenantId) {
        return jsonError("Draft belongs to a different workspace", 403);
      }

      await db.update(consultantBookings).set({ shareToken: null, shareTokenExpiresAt: null })
        .where(and(eq(consultantBookings.draftId, id), eq(consultantBookings.tenantId, tenantId)));
      await db.delete(drafts).where(and(eq(drafts.id, id), eq(drafts.tenantId, tenantId)));
      auditDraft = existing;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    });

    if (auditDraft) await safelyAppendAudit({
      tenantId,
      kind: "draft.deleted",
      subjectType: "draft",
      subjectId: id,
      actorUserId: auth.userRow.id,
      payload: { letterType: auditDraft.letterType, title: auditDraft.title ?? null },
    });

    return result;
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
  if (process.env.DRAFTHR_DUAL_WRITE !== "true" && process.env.DRAFTHR_DATABASE_DRAFTS !== "true") {
    return { ok: false, response: jsonError("Draft storage disabled", 503) };
  }
  const limited = await rateLimit(req, { name: "store-drafts", max: 120, windowMs: 60_000 });
  if (limited) return { ok: false, response: limited };

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!auth.activeTenant) return { ok: false, response: jsonError("No active workspace", 400) };
  const workspaceError = checkWorkspace(req, auth);
  if (workspaceError) return { ok: false, response: workspaceError };
  return { ok: true, auth };
}

function checkWorkspace(req: Request, auth: Extract<Awaited<ReturnType<typeof requireSessionAndTenant>>, { ok: true }>): Response | null {
  if (process.env.DRAFTHR_DATABASE_WORKSPACE !== "true") return null;
  if (req.headers.get("X-Workspace-ID") !== auth.activeTenant?.id) return Response.json({ error: "Your active workspace changed. Reload before saving.", code: "workspace_changed" }, { status: 409 });
  if (!auth.activeMember) return jsonError("Workspace membership required", 403);
  if (req.method !== "GET" && !["owner", "admin", "drafter", "reviewer"].includes(auth.activeMember.role)) return jsonError("You cannot change workspace drafts", 403);
  if (req.method === "DELETE" && !["owner", "admin"].includes(auth.activeMember.role)) return jsonError("An owner or admin must delete drafts", 403);
  return null;
}

function summariseTitle(body: DraftInput): string {
  if (body.title && body.title.trim()) return body.title.trim();
  return body.letterType;
}

async function validateTenantReferences(
  db: Pick<ReturnType<typeof getDb>, "select">,
  tenantId: string,
  matterId: string | null,
  templateSourceId: string | null,
  employeeId: string | null,
): Promise<Response | null> {
  if (employeeId) {
    if (!isUuid(employeeId)) return jsonError("Invalid employee reference", 422);
    const [employee] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId), isNull(employees.deletedAt))).limit(1);
    if (!employee) return jsonError("Employee must exist in this workspace", 422);
  }
  // 422, NOT 409: the dual-write client treats every 409 as "stale revision"
  // and permanently marks the draft's snapshot stale (stops syncing it). A bad
  // reference is a semantic error with the payload, not a revision conflict —
  // 409 is reserved for staleRevisionResponse().
  if (matterId) {
    if (!isUuid(matterId)) return jsonError("matterId belongs to a different workspace", 422);
    const [matter] = await db
      .select({ id: matters.id })
      .from(matters)
      .where(and(eq(matters.id, matterId), eq(matters.tenantId, tenantId), isNull(matters.deletedAt)))
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
      .where(and(eq(customTemplates.id, templateSourceId), eq(customTemplates.tenantId, tenantId), isNull(customTemplates.deletedAt)))
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
  return new Response(JSON.stringify({ ok: false, error: "stale revision", code: "revision_conflict" }), {
    status: 409,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function deletedDraftResponse(): Response {
  return Response.json({ error: "This draft was deleted. Recover your changes as a new draft.", code: "record_deleted" }, { status: 409 });
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
