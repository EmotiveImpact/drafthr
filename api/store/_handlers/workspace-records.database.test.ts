// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../../../src/db/index";
import { tenants, users, employees, matters, matterParticipants, matterTasks, drafts, auditEvents } from "../../../src/db/schema";
import * as audit from "../../../src/db/audit";
import { toServerUuid } from "../../../src/lib/remote-ids";
import type { WorkspaceDocument, WorkspaceRecord, WorkspaceRecordKind } from "../../../src/lib/workspace-records";
import { GET, POST, DELETE } from "./workspace-records";
import { GET as readDrafts, POST as saveDraft, DELETE as deleteDraft } from "./drafts";
import { applyRecoveryLinks, missingRecoveryLinks } from "../../../src/lib/workspace-recovery-links";
import { workspaceRecoveryCopy } from "../../../src/lib/workspace-recovery-copy";
import type { Task } from "../../../src/lib/letters/types";

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", role: "owner" }));
vi.mock("../../_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({ ok: true, activeTenant: { id: auth.tenantId }, userRow: { id: auth.userId }, activeMember: { role: auth.role } }),
}));

describe.skipIf(!process.env.DRAFTHR_LOCAL_DATABASE_URL)("workspace records against disposable local Postgres", () => {
  const tenantA = crypto.randomUUID(), tenantB = crypto.randomUUID(), userId = crypto.randomUUID();
  const origin = "http://localhost:5273";
  const ids = () => crypto.randomUUID();
  function req(method: string, body?: unknown, query = "", tenantId = auth.tenantId) {
    return new Request(`${origin}/api/store/workspace-records${query}`, { method,
      headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenantId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const employee = (id = ids()) => ({ id, legalName: "Test employee", address: "Private address", status: "active" as const, createdAt: 1, updatedAt: 2 });
  const matter = (id = ids()) => ({ id, name: "Test matter", mode: "employer" as const, status: "active" as const, color: "slate" as const, createdAt: 1, updatedAt: 2 });
  const draftSnapshot = (id = ids()) => ({ id, mode: "employer", letterType: "offer", context: { mode: "employer", jurisdiction: "UK" },
    employer: { legalName: "Test", address: "", hasLetterhead: false, signatoryName: "", signatoryTitle: "" },
    employee: { legalName: "Test employee", jobTitle: "", address: "", startDate: "", serviceMonths: 0 },
    answers: {}, sections: [], evidence: [], createdAt: 1, updatedAt: 2 });
  async function save(kind: WorkspaceRecordKind, snapshot: WorkspaceRecord, baseRevision = 0, legacyUpdatedAt?: number) {
    return POST(req("POST", { kind, id: toServerUuid(snapshot.id), snapshot, baseRevision, legacyUpdatedAt }));
  }
  async function list(kind: WorkspaceRecordKind) {
    const result = await GET(req("GET", undefined, `?kind=${kind}`));
    expect(result.status).toBe(200);
    return (await result.json() as { documents: WorkspaceDocument[]; nextCursor: string | null });
  }
  const remove = (kind: WorkspaceRecordKind, id: string, baseRevision: number) => DELETE(req("DELETE", { kind, id, baseRevision }));

  beforeAll(async () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1");
    vi.stubEnv("DRAFTHR_DATABASE_WORKSPACE", "true");
    vi.stubEnv("DRAFTHR_DATABASE_DRAFTS", "true");
    vi.stubEnv("DRAFTHR_ENFORCE_PAYWALL", "false");
    vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "false");
    await getDb().insert(tenants).values([{ id: tenantA, name: "Record fixture A" }, { id: tenantB, name: "Record fixture B" }]);
    await getDb().insert(users).values({ id: userId, externalId: `workspace-test-${userId}`, tenantId: tenantA });
  });
  beforeEach(() => { auth.tenantId = tenantA; auth.userId = userId; auth.role = "owner"; });
  afterAll(async () => {
    await getDb().delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    await getDb().delete(users).where(eq(users.id, userId));
    await closeDb(); vi.unstubAllEnvs();
  });

  it("round-trips all five record types, full participants and indexed projections", async () => {
    const e = employee(`emp_${ids()}`), m = { ...matter(`matter_${ids()}`), participants: [{ employeeId: e.id, name: e.legalName, role: "subject" as const }] };
    const records: Array<[WorkspaceRecordKind, WorkspaceRecord]> = [
      ["employees", e], ["matters", m],
      ["tasks", { id: ids(), matterId: m.id, label: "Check the evidence", status: "open", dueISO: "2026-10-01", createdAt: 1, updatedAt: 2 }],
      ["events", { id: ids(), matterId: m.id, label: "Review meeting", kind: "review", whenISO: "2026-10-02T10:30", detail: "Private detail", createdAt: 1 }],
      ["templates", { id: ids(), name: "Reusable letter", baseLetterType: "offer", mode: "employer", sectionHtml: { opening: "<p>Dear {{name}}</p>" }, answers: { salary: "45000" }, createdAt: 1, updatedAt: 2 }],
    ];
    for (const [kind, snapshot] of records) {
      expect((await save(kind, snapshot)).status).toBe(201);
      expect((await list(kind)).documents.find(d => d.id === toServerUuid(snapshot.id))).toMatchObject({ revision: 1, snapshot });
    }
    const [participant] = await getDb().select().from(matterParticipants).where(eq(matterParticipants.matterId, toServerUuid(m.id)));
    expect(participant.employeeId).toBe(toServerUuid(e.id));
    const [stored] = await getDb().select().from(employees).where(eq(employees.id, toServerUuid(e.id)));
    expect(stored.address).toBe(e.address);
    const events = await getDb().select().from(auditEvents).where(and(eq(auditEvents.tenantId, tenantA), eq(auditEvents.subjectId, toServerUuid(e.id))));
    expect(events).toHaveLength(1);
    expect(events[0].actorUserId).toBe(userId);
  });

  it("allows exactly one of two concurrent stale writers", async () => {
    const e = employee(); await save("employees", e);
    const results = await Promise.all([save("employees", { ...e, legalName: "Writer A" }, 1), save("employees", { ...e, legalName: "Writer B" }, 1)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const [stored] = await getDb().select().from(employees).where(eq(employees.id, e.id));
    expect(stored.revision).toBe(2);
  });

  it("prevents writes into a workspace switched by another tab", async () => {
    const e = employee();
    const result = await POST(req("POST", { kind: "employees", id: e.id, snapshot: e, baseRevision: 0 }, "", tenantB));
    expect(result.status).toBe(409);
    expect((await result.json() as { code: string }).code).toBe("workspace_changed");
    expect(await getDb().select().from(employees).where(eq(employees.id, e.id))).toHaveLength(0);
  });

  it("enforces read-only roles and restricts deletion to administrators", async () => {
    const e = employee(); await save("employees", e);
    auth.role = "viewer";
    expect((await save("employees", { ...e, legalName: "Denied" }, 1)).status).toBe(403);
    expect((await GET(req("GET", undefined, "?kind=employees"))).status).toBe(200);
    auth.role = "drafter";
    expect((await remove("employees", e.id, 1)).status).toBe(403);
  });

  it("never reads or overwrites another tenant's record, including ID collisions", async () => {
    const e = employee(); await save("employees", e);
    auth.tenantId = tenantB;
    expect((await list("employees")).documents.some(d => d.id === e.id)).toBe(false);
    expect((await save("employees", { ...e, legalName: "Wrong tenant" })).status).toBe(409);
    expect((await remove("employees", e.id, 1)).status).toBe(404);
  });

  it("rejects cross-tenant participants and parent matter references", async () => {
    const e = employee(), m = matter(); await save("employees", e); await save("matters", m);
    auth.tenantId = tenantB;
    expect((await save("matters", { ...matter(), participants: [{ employeeId: e.id, name: "Wrong workspace", role: "subject" }] })).status).toBe(422);
    expect((await save("tasks", { id: ids(), matterId: m.id, label: "Wrong workspace", status: "open", createdAt: 1, updatedAt: 2 })).status).toBe(422);
  });
  it("recovers a cascade-deleted task only onto an explicitly chosen surviving matter", async () => {
    const old = matter(), replacement = matter();
    await save("matters", old); await save("matters", replacement);
    const task: Task = { id: ids(), matterId: old.id, label: "Original task text", status: "open", createdAt: 1, updatedAt: 2 };
    expect((await save("tasks", task)).status).toBe(201);
    expect((await remove("matters", old.id, 1)).status).toBe(200);
    const parents = { matters: (await list("matters")).documents };
    const issues = missingRecoveryLinks("tasks", task, parents);
    expect(issues).toHaveLength(1);
    const copy = workspaceRecoveryCopy(`${userId}:${tenantA}`, "tasks", applyRecoveryLinks("tasks", task, parents,
      { issues, choices: { [issues[0].key]: replacement.id } })) as Task;
    expect((await save("tasks", copy)).status).toBe(201);
    const tasks = (await list("tasks")).documents;
    expect(tasks.find(row => row.id === task.id)?.deletedAt).toBeTruthy();
    expect(tasks.find(row => row.id === copy.id)?.snapshot).toEqual({ ...task, id: copy.id, matterId: replacement.id });
    // If a chosen parent disappears after the client's check, the API still refuses it.
    expect((await remove("matters", replacement.id, 1)).status).toBe(200);
    expect((await save("tasks", { ...copy, id: ids() })).status).toBe(422);
  });

  it("validates inputs rather than truncating records or accepting impossible dates", async () => {
    const e = employee();
    expect((await save("employees", { ...e, startDate: "2026-02-30" })).status).toBe(400);
    expect((await POST(req("POST", { kind: "employees", id: e.id, baseRevision: 0, snapshot: { ...e, status: 42 } }))).status).toBe(400);
    expect((await POST(req("POST", { kind: "employees", id: e.id, baseRevision: -1, snapshot: e }))).status).toBe(400);
  });

  it("safely promotes a legacy row only against its known database timestamp", async () => {
    const id = ids();
    await getDb().insert(matters).values({ id, tenantId: tenantA, name: "Legacy matter", mode: "employer", type: "investigation" });
    const doc = (await list("matters")).documents.find(d => d.id === id)!;
    expect(doc.revision).toBe(0);
    expect(doc.snapshot).toMatchObject({ id, name: "Legacy matter" });
    expect((await save("matters", doc.snapshot!, 0)).status).toBe(409);
    expect((await save("matters", doc.snapshot!, 0, doc.updatedAt)).status).toBe(200);
  });

  it("retains a deletion marker and rejects resurrection by an old browser", async () => {
    const e = employee(); await save("employees", e);
    expect((await remove("employees", e.id, 1)).status).toBe(200);
    expect((await remove("employees", e.id, 1)).status).toBe(200);
    const doc = (await list("employees")).documents.find(d => d.id === e.id)!;
    expect(doc).toMatchObject({ revision: 2, snapshot: null });
    expect(doc.deletedAt).toBeTypeOf("number");
    const stale = await save("employees", e, 0);
    expect(stale.status).toBe(409); expect((await stale.json() as { code: string }).code).toBe("record_deleted");
  });

  it("rejects a stale delete rather than losing a newer edit", async () => {
    const e = employee(); await save("employees", e); await save("employees", { ...e, notes: "New work" }, 1);
    expect((await remove("employees", e.id, 1)).status).toBe(409);
    const [row] = await getDb().select().from(employees).where(eq(employees.id, e.id));
    expect(row.deletedAt).toBeNull(); expect(row.notes).toBe("New work");
  });

  it("requires explicit unlinking before deleting an employee referenced by a matter", async () => {
    const e = employee(), m = { ...matter(), participants: [{ employeeId: e.id, name: e.legalName, role: "subject" as const }] };
    await save("employees", e); await save("matters", m);
    expect((await remove("employees", e.id, 1)).status).toBe(422);
    expect((await save("matters", { ...m, participants: [] }, 1)).status).toBe(200);
    expect((await remove("employees", e.id, 1)).status).toBe(200);
  });

  it("protects employee links in legacy draft snapshots without an indexed employee ID", async () => {
    const e = employee(`emp_legacy_${ids()}`); await save("employees", e);
    const letterId = ids();
    await getDb().insert(drafts).values({ id: letterId, tenantId: tenantA, authorUserId: userId,
      letterType: "offer", mode: "employer", contextJson: {}, snapshotJson: { employeeId: e.id }, employeeId: null });
    expect((await remove("employees", toServerUuid(e.id), 1)).status).toBe(422);
    const [row] = await getDb().select().from(employees).where(eq(employees.id, toServerUuid(e.id)));
    expect(row.deletedAt).toBeNull();
    await getDb().update(drafts).set({ deletedAt: new Date() }).where(eq(drafts.id, letterId));
    expect((await remove("employees", toServerUuid(e.id), 1)).status).toBe(200);
  });

  it("does not treat another workspace's legacy snapshot as a local employee link", async () => {
    const e = employee(); await save("employees", e);
    await getDb().insert(drafts).values({ id: ids(), tenantId: tenantB, authorUserId: userId,
      letterType: "offer", mode: "employer", contextJson: {}, snapshotJson: { employeeId: e.id }, employeeId: null });
    expect((await remove("employees", e.id, 1)).status).toBe(200);
  });

  it("atomically removes a matter's children and unfiles drafts without destroying their content", async () => {
    const m = matter(); await save("matters", m);
    const task = { id: ids(), matterId: m.id, label: "Child task", status: "open" as const, createdAt: 1, updatedAt: 2 };
    await save("tasks", task);
    const draftId = ids();
    await getDb().insert(drafts).values({ id: draftId, tenantId: tenantA, authorUserId: userId, matterId: m.id, letterType: "offer", mode: "employer", contextJson: {}, snapshotJson: { id: draftId, matterId: m.id, title: "Keep this letter" }, revision: 1 });
    expect((await remove("matters", m.id, 1)).status).toBe(200);
    const [child] = await getDb().select().from(matterTasks).where(eq(matterTasks.id, task.id));
    expect(child.deletedAt).not.toBeNull(); expect(child.revision).toBe(2);
    const [letter] = await getDb().select().from(drafts).where(eq(drafts.id, draftId));
    expect(letter.matterId).toBeNull(); expect(letter.snapshotJson).toEqual({ id: draftId, title: "Keep this letter" }); expect(letter.revision).toBe(2);
    expect((await save("tasks", task, 1)).status).toBe(409);
    expect((await save("tasks", { ...task, id: ids() })).status).toBe(422);
    const snapshot = { ...draftSnapshot(), matterId: m.id };
    const draftReq = req("POST", { id: snapshot.id, snapshot, matterId: m.id, baseRevision: 0 });
    expect((await saveDraft(draftReq)).status).toBe(422);
  });

  it("accepts explicit unlinking of a live draft after matter deletion only at the reviewed revision", async () => {
    const parent = matter(); expect((await save("matters", parent)).status).toBe(201);
    const original = { ...draftSnapshot(), matterId: parent.id };
    const created = await saveDraft(req("POST", { id: original.id, snapshot: original, matterId: parent.id, baseRevision: 0 }));
    expect(created.status, JSON.stringify(await created.json())).toBe(201);
    expect((await remove("matters", parent.id, 1)).status).toBe(200);
    const parents = { matters: (await list("matters")).documents };
    const pending = { ...original, title: "Pending title" };
    const issues = missingRecoveryLinks("drafts", pending as unknown as import("../../../src/lib/letters/types").Draft, parents);
    const chosen = applyRecoveryLinks("drafts", pending as unknown as import("../../../src/lib/letters/types").Draft, parents,
      { issues, choices: { [issues[0].key]: null } });
    expect((await saveDraft(req("POST", { id: original.id, snapshot: chosen, baseRevision: 1 }))).status).toBe(409);
    expect((await saveDraft(req("POST", { id: original.id, snapshot: chosen, baseRevision: 2 }))).status).toBe(200);
    const [stored] = await getDb().select().from(drafts).where(eq(drafts.id, original.id));
    expect(stored.revision).toBe(3); expect(stored.deletedAt).toBeNull(); expect(stored.matterId).toBeNull();
    expect(stored.snapshotJson).toEqual(chosen);
  });
  it("protects draft deletions from stale writers and resurrection", async () => {
    const snapshot = draftSnapshot();
    expect((await saveDraft(req("POST", { id: snapshot.id, snapshot, baseRevision: 0 }))).status).toBe(201);
    expect((await deleteDraft(req("DELETE", { id: snapshot.id, baseRevision: 0 }))).status).toBe(409);
    const deleted = await deleteDraft(req("DELETE", { id: snapshot.id, baseRevision: 1 }));
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ revision: 2 });
    expect(await (await deleteDraft(req("DELETE", { id: snapshot.id, baseRevision: 1 }))).json()).toMatchObject({ revision: 2 });
    const stale = await saveDraft(req("POST", { id: snapshot.id, snapshot, baseRevision: 2 }));
    expect(await stale.json()).toMatchObject({ code: "record_deleted" });
    const read = await readDrafts(req("GET", undefined, "?format=documents"));
    const data = await read.json() as { documents: Array<{ id: string; snapshot: unknown; deletedAt: number }> };
    expect(data.documents.find(d => d.id === snapshot.id)).toMatchObject({ snapshot: null, deletedAt: expect.any(Number) });
  });

  it("applies workspace and role checks to drafts and protects linked employees", async () => {
    const e = employee(); await save("employees", e);
    const snapshot = { ...draftSnapshot(), employeeId: e.id };
    expect((await saveDraft(req("POST", { id: snapshot.id, snapshot, baseRevision: 0 }, "", tenantB))).status).toBe(409);
    auth.role = "viewer";
    expect((await saveDraft(req("POST", { id: snapshot.id, snapshot, baseRevision: 0 }))).status).toBe(403);
    auth.role = "owner";
    expect((await saveDraft(req("POST", { id: snapshot.id, snapshot, baseRevision: 0 }))).status).toBe(201);
    expect((await remove("employees", e.id, 1)).status).toBe(422);
    const foreign = employee(); auth.tenantId = tenantB; await save("employees", foreign); auth.tenantId = tenantA;
    expect((await saveDraft(req("POST", { id: snapshot.id, snapshot: { ...snapshot, employeeId: foreign.id }, baseRevision: 1 }))).status).toBe(422);
    expect((await deleteDraft(req("DELETE", { id: snapshot.id, baseRevision: 1 }))).status).toBe(200);
    expect((await remove("employees", e.id, 1)).status).toBe(200);
  });

  it("rolls back the business write if the authoritative audit cannot commit", async () => {
    const e = employee();
    const spy = vi.spyOn(audit, "appendAuditEvent").mockRejectedValueOnce(new Error("Test audit failure"));
    try {
      expect((await save("employees", e)).status).toBe(503);
      expect(await getDb().select().from(employees).where(eq(employees.id, e.id))).toHaveLength(0);
    } finally { spy.mockRestore(); }
  });

  it("paginates beyond 200 records without truncation", async () => {
    const imported = Array.from({ length: 202 }, () => ({ id: ids(), tenantId: tenantA, legalName: "Pagination fixture" }));
    await getDb().insert(employees).values(imported);
    let cursor: string | null = null; const found = new Set<string>();
    do {
      const r = await GET(req("GET", undefined, `?kind=employees${cursor ? `&cursor=${cursor}` : ""}`));
      expect(r.status).toBe(200);
      const page = await r.json() as { documents: WorkspaceDocument[]; nextCursor: string | null };
      for (const doc of page.documents) { expect(found.has(doc.id)).toBe(false); found.add(doc.id); }
      cursor = page.nextCursor;
    } while (cursor);
    expect(imported.every(e => found.has(e.id))).toBe(true);
  });
});
