import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../../../src/db/index.js";
import { employees, matters, matterParticipants, matterTasks, matterEvents, customTemplates, drafts } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { logAuthFailure } from "../../_utils/auth-diagnostics.js";
import { toServerUuid, serverUuidOrNull } from "../../../src/lib/remote-ids.js";
import { isWorkspaceRecordKind, workspaceRecordSchemas, type WorkspaceRecordKind, type WorkspaceRecord, type WorkspaceDocument } from "../../../src/lib/workspace-records.js";
import type { Employee, Matter, Task, MatterEvent, CustomTemplate } from "../../../src/lib/letters/types.js";

const tables = { employees, matters, tasks: matterTasks, events: matterEvents, templates: customTemplates };
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Row = typeof employees.$inferSelect | typeof matters.$inferSelect | typeof matterTasks.$inferSelect | typeof matterEvents.$inferSelect | typeof customTemplates.$inferSelect;
const WRITE_ROLES = new Set(["owner", "admin", "drafter", "reviewer"]);
const DELETE_ROLES = new Set(["owner", "admin"]);

class RecordError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) { super(message); this.status = status; this.code = code; }
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function conflict(code = "revision_conflict"): never {
  throw new RecordError("This record changed on another device. Reload or recover your changes before saving.", 409, code);
}
function handleError(error: unknown) {
  if (error instanceof RecordError) return response({ error: error.message, code: error.code }, error.status);
  logAuthFailure("workspace-records", error);
  return jsonError("Workspace records are temporarily unavailable. Your unsaved changes have not been discarded.", 503);
}
async function guard(req: Request, write: boolean) {
  if (write) {
    const rejected = enforceSameOrigin(req);
    if (rejected) return { ok: false as const, response: rejected };
  }
  if (process.env.DRAFTHR_DATABASE_WORKSPACE !== "true") return { ok: false as const, response: jsonError("Database workspace storage is not enabled", 503) };
  const limited = rateLimit(req, { name: "workspace-records", max: 240, windowMs: 60_000 });
  if (limited) return { ok: false as const, response: limited };
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth;
  if (!auth.activeTenant || !auth.activeMember) return { ok: false as const, response: jsonError("No active workspace", 403) };
  // Active workspace is account-wide. A second tab can change it between a
  // debounce and its request; never write that old tab's data into the new one.
  if (serverUuidOrNull(req.headers.get("X-Workspace-ID")) !== auth.activeTenant.id) {
    return { ok: false as const, response: response({ error: "The active workspace changed. Reload before continuing.", code: "workspace_changed" }, 409) };
  }
  if (write && !WRITE_ROLES.has(auth.activeMember.role)) return { ok: false as const, response: jsonError("This workspace role is read-only", 403) };
  if (req.method === "DELETE" && !DELETE_ROLES.has(auth.activeMember.role)) return { ok: false as const, response: jsonError("An owner or admin must delete workspace records", 403) };
  return { ok: true as const, auth, tenantId: auth.activeTenant.id };
}

export async function GET(req: Request): Promise<Response> {
  const access = await guard(req, false);
  if (!access.ok) return access.response;
  const query = new URL(req.url).searchParams;
  const kind = query.get("kind");
  if (!isWorkspaceRecordKind(kind)) return jsonError("Unknown workspace record kind", 400);
  const cursor = query.get("cursor");
  if (cursor && !serverUuidOrNull(cursor)) return jsonError("Invalid cursor", 400);
  try {
    const table = tables[kind];
    const rows = await getDb().select().from(table).where(and(eq(table.tenantId, access.tenantId), cursor ? gt(table.id, cursor) : undefined))
      .orderBy(asc(table.id)).limit(201);
    const page = rows.slice(0, 200);
    const documents = await Promise.all(page.map(async (row): Promise<WorkspaceDocument> => ({
      id: row.id, revision: row.revision, deletedAt: row.deletedAt?.getTime() ?? null, updatedAt: row.updatedAt.getTime(),
      snapshot: row.deletedAt ? null : row.snapshotJson as WorkspaceRecord | null ?? await legacySnapshot(kind, row),
    })));
    return response({ documents, nextCursor: rows.length > 200 ? page[page.length - 1].id : null });
  } catch (error) { return handleError(error); }
}

export async function POST(req: Request): Promise<Response> { return mutate(req, false); }
export async function DELETE(req: Request): Promise<Response> { return mutate(req, true); }

async function mutate(req: Request, deleting: boolean): Promise<Response> {
  const access = await guard(req, true);
  if (!access.ok) return access.response;
  const parsed = await readJsonRequest<{ kind?: unknown; id?: unknown; baseRevision?: unknown; legacyUpdatedAt?: unknown; snapshot?: unknown }>(req, 2_000_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body || !isWorkspaceRecordKind(body.kind)) return jsonError("Unknown workspace record kind", 400);
  const kind = body.kind;
  if (typeof body.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.id)) return jsonError("Invalid record id", 400);
  if (typeof body.baseRevision !== "number" || !Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0) return jsonError("A non-negative baseRevision is required", 400);
  const baseRevision = body.baseRevision;
  const id = toServerUuid(body.id);
  let snapshot: WorkspaceRecord | null = null;
  if (!deleting) {
    const record = workspaceRecordSchemas[kind].safeParse(body.snapshot);
    if (!record.success || toServerUuid(record.data.id) !== id) return jsonError("Invalid workspace record", 400);
    snapshot = record.data as WorkspaceRecord;
  }
  try {
    const result = await getDb().transaction(async (tx) => {
      // Serialize reference changes and parent deletions within a workspace.
      // Revisions still reject stale clients; the lock is never a substitute.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-records:${access.tenantId}`}, 0))`);
      const table = tables[kind];
      const [existing] = await tx.select().from(table).where(and(eq(table.id, id), eq(table.tenantId, access.tenantId))).limit(1);
      if (existing?.deletedAt) {
        if (deleting) return { id, revision: existing.revision, deletedAt: existing.deletedAt.getTime(), created: false };
        conflict("record_deleted");
      }
      if (deleting && !existing) throw new RecordError("Record not found", 404, "not_found");
      if ((existing?.revision ?? 0) !== baseRevision) conflict();
      if (existing && !existing.snapshotJson && body.legacyUpdatedAt !== existing.updatedAt.getTime()) conflict();
      const now = new Date();
      const revision = baseRevision + 1;
      if (deleting) {
        await deleteReferences(tx, kind, id, access.tenantId, now);
        await tx.update(table).set({ deletedAt: now, revision, updatedAt: now }).where(and(eq(table.id, id), eq(table.tenantId, access.tenantId)));
      } else {
        await validateReferences(tx, kind, snapshot!, access.tenantId);
        await projectRecord(tx, kind, snapshot!, id, access.tenantId, access.auth.userRow.id, Boolean(existing));
        await tx.update(table).set({ snapshotJson: snapshot as unknown as Record<string, unknown>, revision, updatedAt: now })
          .where(and(eq(table.id, id), eq(table.tenantId, access.tenantId)));
      }
      await appendAuditEvent({ tenantId: access.tenantId, actorUserId: access.auth.userRow.id,
        kind: `${kind}.${deleting ? "deleted" : existing ? "updated" : "created"}`, subjectType: kind, subjectId: id,
        payload: { revision },
      }, tx);
      return { id, revision, created: !existing, deletedAt: deleting ? now.getTime() : null };
    });
    return response({ ok: true, ...result }, result.created ? 201 : 200);
  } catch (error) {
    // Global UUID collision with another tenant must not reveal its record or
    // overwrite it. A concurrent create is also a revision conflict.
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause?.code === "23505" || cause?.cause?.code === "23505") return response({ error: "Record id is already in use. Recover as a new record.", code: "revision_conflict" }, 409);
    return handleError(error);
  }
}

async function validateReferences(tx: Tx, kind: WorkspaceRecordKind, record: WorkspaceRecord, tenantId: string) {
  if (kind === "tasks" || kind === "events") {
    const [parent] = await tx.select({ id: matters.id }).from(matters).where(and(eq(matters.id, toServerUuid((record as Task | MatterEvent).matterId)), eq(matters.tenantId, tenantId), isNull(matters.deletedAt))).limit(1);
    if (!parent) throw new RecordError("Save this record's matter in the current workspace first.", 422, "invalid_reference");
  }
  if (kind === "matters") {
    const ids = [...new Set(((record as Matter).participants ?? []).flatMap((p) => p.employeeId ? [toServerUuid(p.employeeId)] : []))];
    if (ids.length) {
      const found = await tx.select({ id: employees.id }).from(employees).where(and(inArray(employees.id, ids), eq(employees.tenantId, tenantId), isNull(employees.deletedAt)));
      if (found.length !== ids.length) throw new RecordError("Save all participant employees in the current workspace first.", 422, "invalid_reference");
    }
  }
}

async function projectRecord(tx: Tx, kind: WorkspaceRecordKind, record: WorkspaceRecord, id: string, tenantId: string, authorUserId: string, exists: boolean) {
  if (kind === "employees") {
    const r = record as Employee;
    const values = { legalName: r.legalName, address: r.address ?? null, preferredName: r.preferredName ?? null,
      jobTitle: r.jobTitle ?? null, department: r.department ?? null, managerName: r.managerName ?? null,
      managerEmail: r.managerEmail ?? null, email: r.email ?? null, startDate: r.startDate || null, endDate: r.endDate || null,
      workerClass: r.workerClass ?? null, status: r.status, notes: r.notes ?? null };
    if (exists) await tx.update(employees).set(values).where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)));
    else await tx.insert(employees).values({ id, tenantId, ...values });
  } else if (kind === "matters") {
    const r = record as Matter;
    const values = { name: r.name, mode: r.mode, type: r.type ?? "investigation", status: r.status, color: r.color,
      riskBand: r.riskBand ?? null, description: r.description ?? null, primaryName: r.parties?.primaryName ?? null,
      primaryContext: r.parties?.primaryContext ?? null, deadlineIso: r.deadlineISO || null, deadlineLabel: r.deadlineLabel ?? null,
      counselReviewed: r.counselReviewed ?? false, nextAction: r.nextAction ?? null,
      exposureGbp: r.exposureGBP === undefined ? null : Math.round(r.exposureGBP), archivedAt: r.archivedAt ? new Date(r.archivedAt) : null };
    if (exists) await tx.update(matters).set(values).where(and(eq(matters.id, id), eq(matters.tenantId, tenantId)));
    else await tx.insert(matters).values({ id, tenantId, ...values });
    await tx.delete(matterParticipants).where(eq(matterParticipants.matterId, id));
    if (r.participants?.length) await tx.insert(matterParticipants).values(r.participants.map(p => ({ matterId: id, employeeId: p.employeeId ? toServerUuid(p.employeeId) : null, name: p.name, role: p.role })));
  } else if (kind === "tasks") {
    const r = record as Task;
    const values = { matterId: toServerUuid(r.matterId), label: r.label, dueIso: r.dueISO || null, status: r.status, assignee: r.assignee ?? null, doneAt: r.doneAt ? new Date(r.doneAt) : null };
    if (exists) await tx.update(matterTasks).set(values).where(and(eq(matterTasks.id, id), eq(matterTasks.tenantId, tenantId)));
    else await tx.insert(matterTasks).values({ id, tenantId, ...values });
  } else if (kind === "events") {
    const r = record as MatterEvent;
    const values = { matterId: toServerUuid(r.matterId), kind: r.kind, label: r.label, whenIso: r.whenISO, detail: r.detail ?? null };
    if (exists) await tx.update(matterEvents).set(values).where(and(eq(matterEvents.id, id), eq(matterEvents.tenantId, tenantId)));
    else await tx.insert(matterEvents).values({ id, tenantId, ...values });
  } else {
    const r = record as CustomTemplate;
    const values = { name: r.name, description: r.description ?? null, baseLetterType: r.baseLetterType, mode: r.mode,
      jurisdiction: r.jurisdiction ?? null, sectionHtmlJson: r.sectionHtml as Record<string, string>, answersJson: r.answers ?? null, emoji: r.emoji ?? null };
    if (exists) await tx.update(customTemplates).set(values).where(and(eq(customTemplates.id, id), eq(customTemplates.tenantId, tenantId)));
    else await tx.insert(customTemplates).values({ id, tenantId, authorUserId, ...values });
  }
}

async function deleteReferences(tx: Tx, kind: WorkspaceRecordKind, id: string, tenantId: string, now: Date) {
  if (kind === "employees") {
    // Removing linked employees would otherwise silently rewrite concurrent
    // matter edits. Require explicit unlinking/archiving instead.
    const linked = await tx.select({ id: matterParticipants.id }).from(matterParticipants).innerJoin(matters, eq(matters.id, matterParticipants.matterId))
      .where(and(eq(matterParticipants.employeeId, id), eq(matters.tenantId, tenantId), isNull(matters.deletedAt))).limit(1);
    if (linked.length) throw new RecordError("Unlink this employee from their matters first, or archive them to keep their history.", 422, "record_in_use");
    const letters = await tx.select({ id: drafts.id }).from(drafts)
      .where(and(eq(drafts.employeeId, id), eq(drafts.tenantId, tenantId), isNull(drafts.deletedAt))).limit(1);
    if (letters.length) throw new RecordError("This employee has linked letters. Archive them to preserve their history.", 422, "record_in_use");
    // Older complete snapshots predate employee_id and may use readable IDs.
    // Check those links without pulling entire letter aggregates into memory.
    // This runs under the same tenant lock as draft writes and deletion.
    let cursor: string | undefined;
    while (true) {
      const legacyLinks = await tx.select({ id: drafts.id, employeeId: sql<string>`${drafts.snapshotJson}->>'employeeId'` }).from(drafts)
        .where(and(eq(drafts.tenantId, tenantId), isNull(drafts.employeeId), isNull(drafts.deletedAt),
          sql`jsonb_typeof(${drafts.snapshotJson}->'employeeId') = 'string'`, cursor ? gt(drafts.id, cursor) : undefined))
        .orderBy(asc(drafts.id)).limit(200);
      if (legacyLinks.some(letter => toServerUuid(letter.employeeId) === id)) throw new RecordError("This employee has linked letters. Archive them to preserve their history.", 422, "record_in_use");
      if (legacyLinks.length < 200) break;
      cursor = legacyLinks[legacyLinks.length - 1].id;
    }
  }
  if (kind === "matters") {
    for (const child of [matterTasks, matterEvents]) {
      await tx.update(child).set({ deletedAt: now, updatedAt: now, revision: sql`${child.revision} + 1` })
        .where(and(eq(child.tenantId, tenantId), eq(child.matterId, id), isNull(child.deletedAt)));
    }
    await tx.delete(matterParticipants).where(eq(matterParticipants.matterId, id));
    await tx.update(drafts).set({ matterId: null, snapshotJson: sql`${drafts.snapshotJson} - 'matterId'`, revision: sql`${drafts.revision} + 1`, updatedAt: now })
      .where(and(eq(drafts.tenantId, tenantId), eq(drafts.matterId, id)));
  }
  if (kind === "templates") {
    await tx.update(drafts).set({ templateSourceId: null, snapshotJson: sql`${drafts.snapshotJson} - 'templateSourceId'`, revision: sql`${drafts.revision} + 1`, updatedAt: now })
      .where(and(eq(drafts.tenantId, tenantId), eq(drafts.templateSourceId, id)));
  }
}

async function legacySnapshot(kind: WorkspaceRecordKind, row: Row): Promise<WorkspaceRecord> {
  const base = { id: row.id, createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime() };
  let snapshot: Record<string, unknown>;
  if (kind === "employees") {
    const r = row as typeof employees.$inferSelect;
    snapshot = { ...base, legalName: r.legalName, address: r.address, preferredName: r.preferredName, jobTitle: r.jobTitle,
      department: r.department, managerName: r.managerName, managerEmail: r.managerEmail, email: r.email, startDate: r.startDate,
      endDate: r.endDate, workerClass: r.workerClass, status: r.status, notes: r.notes };
  } else if (kind === "matters") {
    const r = row as typeof matters.$inferSelect;
    const participants = await getDb().select({ employeeId: matterParticipants.employeeId, name: matterParticipants.name, role: matterParticipants.role })
      .from(matterParticipants).where(eq(matterParticipants.matterId, r.id));
    snapshot = { ...base, name: r.name, mode: r.mode, type: r.type, status: r.status, color: r.color ?? "slate", riskBand: r.riskBand,
      description: r.description, parties: { primaryName: r.primaryName ?? undefined, primaryContext: r.primaryContext ?? undefined },
      deadlineISO: r.deadlineIso, deadlineLabel: r.deadlineLabel, counselReviewed: r.counselReviewed, ownerUserId: r.ownerUserId,
      nextAction: r.nextAction, exposureGBP: r.exposureGbp, archivedAt: r.archivedAt?.getTime(), participants };
  } else if (kind === "templates") {
    const r = row as typeof customTemplates.$inferSelect;
    snapshot = { ...base, name: r.name, description: r.description, baseLetterType: r.baseLetterType, mode: r.mode,
      jurisdiction: r.jurisdiction, sectionHtml: r.sectionHtmlJson, answers: r.answersJson, emoji: r.emoji };
  } else {
    // Newly introduced task/event tables always receive an aggregate in the
    // same transaction as their indexed fields. Never silently drop a bad row.
    throw new Error("Workspace record snapshot is missing");
  }
  const cleaned = Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== null && value !== undefined));
  return workspaceRecordSchemas[kind].parse(cleaned) as WorkspaceRecord;
}
