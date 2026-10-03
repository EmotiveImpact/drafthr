import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftStore } from "./store";
import { confirmSavedWorkspaceTemplate, flushDatabaseWorkspace, importBrowserWorkspace, initializeDatabaseWorkspace, loadWorkspaceConflicts, pendingWorkspaceChanges, recoverClosedWorkspaceTabs, recoverWorkspaceConflictAsCopy, retryDatabaseWorkspace, reviewClosedWorkspaceTabs, stopDatabaseWorkspace, suspendDatabaseWorkspaceForTransition, useDatabaseWorkspaceStatus, workspaceFileContext } from "./database-workspace";
import { beginSessionTransition } from "./session/transition";
import { claimWorkspaceTab } from "./workspace-tab-lease";
import type { WorkspaceKind } from "./workspace-documents";
import { WORKSPACE_SAVE_ORDER, emptyWorkspaceBundle, planWorkspaceImport } from "./workspace-documents";
import { toServerUuid } from "./remote-ids";
import { defaultWorkspacePreferences } from "./workspace-preferences";
import * as legacyFiles from "./storage/legacy-file-import";
import * as legacyAssets from "./storage/legacy-asset-import";
import { createHash, randomUUID } from "node:crypto";
import { reviewWorkspaceRecoveryLinks, resolveWorkspaceConflict } from "./database-workspace";
import type { Task, Draft } from "./letters/types";

vi.mock("./store", async () => {
  const { create } = await import("zustand");
  return { useDraftStore: create(() => ({ employees: {}, customTemplates: {}, matters: {}, tasks: {}, events: {}, drafts: {} })) };
});
vi.mock("./profile", async () => {
  const { create } = await import("zustand");
  return { useProfileStore: create(() => ({ profile: { setupComplete: false, role: null, personal: {}, employer: {}, defaults: { jurisdiction: "UK", workerClass: "employee" }, autoFill: true, credits: 0, workspaceRole: "owner" } })) };
});
type Row = { id: string; revision: number; snapshot: Record<string, unknown> | null; deletedAt?: number | null };
let database: Record<WorkspaceKind, Map<string, Row>>;
let offline = false;
let writes: Array<{ kind: string; body: Record<string, unknown>; tenant: string }>;
const employee = { id: toServerUuid("emp_alex"), legalName: "Alex", status: "active" as const, createdAt: 1, updatedAt: 2 };

beforeEach(() => {
  stopDatabaseWorkspace(); localStorage.clear(); sessionStorage.clear();
  vi.stubEnv("VITE_DRAFTHR_DATABASE_WORKSPACE", "true");
  const held = new Set<string>();
  vi.stubGlobal("navigator", { locks: { request: async (name: string, _options: unknown, callback: (lock: object | null) => unknown) => {
    if (held.has(name)) return callback(null);
    held.add(name); try { return await callback({ name }); } finally { held.delete(name); }
  } } });
  useDraftStore.setState({ employees: {}, customTemplates: {}, matters: {}, tasks: {}, events: {}, drafts: {} });
  database = Object.fromEntries(WORKSPACE_SAVE_ORDER.map(k => [k, new Map()])) as typeof database;
  const preferences = defaultWorkspacePreferences(toServerUuid("test-preferences"));
  database.preferences.set(preferences.id, { id: preferences.id, revision: 0, snapshot: preferences });
  offline = false; writes = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const parsed = new URL(url, "http://localhost");
    const body = init.body ? JSON.parse(init.body as string) : null;
    const kind = (parsed.pathname.endsWith("/drafts") ? "drafts" : parsed.pathname.endsWith("/preferences") ? "preferences" : body?.kind ?? parsed.searchParams.get("kind")) as WorkspaceKind;
    if (!body) return Response.json({ documents: [...database[kind].values()], nextCursor: null });
    writes.push({ kind, body, tenant: (init.headers as Record<string, string>)["X-Workspace-ID"] });
    if (offline) throw new Error("Offline");
    const old = database[kind].get(body.id);
    if ((old?.revision ?? 0) !== body.baseRevision) return Response.json({ code: "revision_conflict", error: "Conflict" }, { status: 409 });
    const row = { id: body.id, revision: body.baseRevision + 1, snapshot: body.snapshot ?? null, deletedAt: body.snapshot ? null : 123 };
    database[kind].set(row.id, row);
    return Response.json({ revision: row.revision, deletedAt: row.deletedAt });
  }));
});
afterEach(() => { stopDatabaseWorkspace(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("database workspace lifecycle", () => {
  it("recovers the explicitly chosen closed-tab version and retains it durably after an offline save", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    const first = "drafthr.workspace-pending.v1:userA:tenantA:older-a", second = "drafthr.workspace-pending.v1:userA:tenantA:older-b";
    const op = { kind: "employees", id: employee.id, baseRevision: 0, snapshot: employee };
    localStorage.setItem(first, JSON.stringify([op]));
    localStorage.setItem(second, JSON.stringify([{ ...op, snapshot: { ...employee, legalName: "Chosen edit" } }]));
    const review = reviewClosedWorkspaceTabs();
    await expect(recoverClosedWorkspaceTabs()).rejects.toThrow("Choose a version");
    expect(localStorage.getItem(first)).not.toBeNull(); expect(localStorage.getItem(second)).not.toBeNull();
    offline = true;
    await recoverClosedWorkspaceTabs({ review, choices: { [review.groups[0].key]: second } });
    expect(localStorage.getItem(first)).toBeNull(); expect(localStorage.getItem(second)).toBeNull();
    expect(pendingWorkspaceChanges()[0].snapshot).toMatchObject({ legalName: "Chosen edit" });
    expect(Object.keys(localStorage).some(key => key.startsWith("drafthr.workspace-pending.v1:") && localStorage.getItem(key)?.includes("Chosen edit"))).toBe(true);
    offline = false; await retryDatabaseWorkspace();
    expect(database.employees.get(employee.id)?.snapshot?.legalName).toBe("Chosen edit");
  });
  it("rejects a reviewed choice when a source or this tab's pending edit changes", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    const key = "drafthr.workspace-pending.v1:userA:tenantA:older";
    const op = { kind: "employees", id: employee.id, baseRevision: 0, snapshot: employee };
    localStorage.setItem(key, JSON.stringify([op]));
    const review = reviewClosedWorkspaceTabs();
    localStorage.setItem(key, JSON.stringify([{ ...op, snapshot: { ...employee, legalName: "Newer source" } }]));
    await expect(recoverClosedWorkspaceTabs({ review, choices: {} })).rejects.toThrow("sources changed");
    const next = reviewClosedWorkspaceTabs();
    useDraftStore.setState({ employees: { [employee.id]: { ...employee, legalName: "Newer this tab" } } });
    await expect(recoverClosedWorkspaceTabs({ review: next, choices: {} })).rejects.toThrow("versions changed");
    expect(localStorage.getItem(key)).toContain("Newer source"); expect(writes).toHaveLength(0);
  });
  it("does not send this tab's unselected version when the chosen version already matches the database", async () => {
    database.employees.set(employee.id, { id: employee.id, revision: 1, snapshot: employee });
    await initializeDatabaseWorkspace("tenantA", "userA");
    useDraftStore.setState({ employees: { [employee.id]: { ...employee, legalName: "Do not save" } } });
    const key = "drafthr.workspace-pending.v1:userA:tenantA:older";
    localStorage.setItem(key, JSON.stringify([{ kind: "employees", id: employee.id, baseRevision: 0, snapshot: employee }]));
    const review = reviewClosedWorkspaceTabs();
    await recoverClosedWorkspaceTabs({ review, choices: { [review.groups[0].key]: key } });
    expect(writes).toEqual([]); expect(pendingWorkspaceChanges()).toEqual([]);
    expect(useDraftStore.getState().employees[employee.id]).toEqual(employee);
    expect(localStorage.getItem(key)).toBeNull();
  });
  it("keeps all versions when the chosen recovery buffer cannot be persisted", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    useDraftStore.setState({ employees: { [employee.id]: employee } });
    const key = "drafthr.workspace-pending.v1:userA:tenantA:older";
    const raw = JSON.stringify([{ kind: "employees", id: employee.id, baseRevision: 0, snapshot: { ...employee, legalName: "Other" } }]);
    localStorage.setItem(key, raw);
    const review = reviewClosedWorkspaceTabs();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await expect(recoverClosedWorkspaceTabs({ review, choices: { [review.groups[0].key]: key } })).rejects.toThrow("Could not verify storage");
    expect(localStorage.getItem(key)).toBe(raw); expect(writes).toEqual([]);
    expect(pendingWorkspaceChanges()[0].snapshot).toEqual(employee);
  });
  async function deletedEmployeeConflict() {
    database.employees.set(employee.id, { id: employee.id, revision: 2, snapshot: null, deletedAt: 100 });
    await initializeDatabaseWorkspace("tenantA", "userA");
    useDraftStore.setState({ employees: { [employee.id]: employee } });
    expect(await flushDatabaseWorkspace()).toBe(false);
    return (await loadWorkspaceConflicts())[0];
  }
  it("recovers a deleted record as a verified new ID without resurrecting it", async () => {
    const conflict = await deletedEmployeeConflict();
    const id = await recoverWorkspaceConflictAsCopy(conflict);
    expect(id).not.toBe(employee.id);
    expect(database.employees.get(employee.id)).toMatchObject({ revision: 2, deletedAt: 100, snapshot: null });
    expect(database.employees.get(id)?.snapshot).toEqual({ ...employee, id });
    expect(useDraftStore.getState().employees).toEqual({ [id]: { ...employee, id } });
    expect(pendingWorkspaceChanges()).toEqual([]);
    expect(writes).toHaveLength(1); expect(writes[0].body.baseRevision).toBe(0);
  });
  async function deletedTaskConflict() {
    const task = { id: toServerUuid("deleted-task"), matterId: toServerUuid("deleted-matter"), label: "Pending task", status: "open", createdAt: 1, updatedAt: 2 } as Task;
    database.tasks.set(task.id, { id: task.id, revision: 2, snapshot: null, deletedAt: 100 });
    const parent = { id: toServerUuid("recovered-matter"), name: "Recovered matter" };
    database.matters.set(parent.id, { id: parent.id, revision: 1, snapshot: parent });
    await initializeDatabaseWorkspace("tenantA", "userA");
    useDraftStore.setState({ tasks: { [task.id]: task } });
    await flushDatabaseWorkspace();
    const conflict = (await loadWorkspaceConflicts())[0];
    const review = await reviewWorkspaceRecoveryLinks(conflict);
    return { task, parent, conflict, review, choices: { [review.issues[0].key]: parent.id } };
  }
  async function liveDraftConflict() {
    const draft = { id: toServerUuid("live-draft"), letterType: "offer", title: "Original title", matterId: toServerUuid("removed-parent"),
      sections: [{ html: "Original recipient and text" }], reviewStatus: "approved", approvals: [{ id: "old-approval" }],
      submittedForReviewAt: 1, reviewDecidedAt: 2, exports: [{ id: "historical-export" }], timeline: [{ id: "history" }],
    } as unknown as Draft;
    database.drafts.set(draft.id, { id: draft.id, revision: 1, snapshot: draft });
    await initializeDatabaseWorkspace("tenantA", "userA");
    const pending = { ...draft, title: "My unsaved title" };
    useDraftStore.setState({ drafts: { [draft.id]: pending } });
    database.drafts.set(draft.id, { id: draft.id, revision: 2, snapshot: { ...draft, matterId: undefined } });
    await flushDatabaseWorkspace(); writes = [];
    const conflict = (await loadWorkspaceConflicts())[0];
    const review = await reviewWorkspaceRecoveryLinks(conflict);
    return { pending, conflict, review, choices: { [review.issues[0].key]: null } };
  }
  it("resolves a live draft's missing link explicitly and invalidates approval, retaining historical exports", async () => {
    const { pending, conflict, review, choices } = await liveDraftConflict();
    await expect(resolveWorkspaceConflict(conflict, "mine")).rejects.toThrow("linked record is unavailable");
    expect(writes).toHaveLength(0); expect(pendingWorkspaceChanges()[0].snapshot).toEqual(pending);
    await resolveWorkspaceConflict(conflict, "mine", { review, choices });
    const saved = database.drafts.get(pending.id)!;
    expect(saved.revision).toBe(3); expect(saved.snapshot?.matterId).toBeUndefined();
    expect(saved.snapshot).toMatchObject({ title: pending.title, reviewStatus: "draft", approvals: [], sections: pending.sections, exports: pending.exports, timeline: pending.timeline });
    expect(saved.snapshot?.reviewDecidedAt).toBeUndefined(); expect(saved.snapshot?.submittedForReviewAt).toBeUndefined();
    expect(useDraftStore.getState().drafts[pending.id]).toEqual(saved.snapshot); expect(pendingWorkspaceChanges()).toEqual([]);
  });
  it("preserves a live conflict through failed saves and retries a lost acknowledgement without rewriting", async () => {
    const { pending, conflict, review, choices } = await liveDraftConflict();
    offline = true;
    await expect(resolveWorkspaceConflict(conflict, "mine", { review, choices })).rejects.toThrow("Offline");
    expect(pendingWorkspaceChanges()[0].snapshot).toEqual(pending); expect(useDraftStore.getState().drafts[pending.id]).toEqual(pending);
    offline = false; writes = [];
    const request = vi.mocked(fetch), implementation = request.getMockImplementation()!;
    let lost = false;
    request.mockImplementation(async (...args) => {
      const result = await implementation(...args);
      if (args[1]?.body && !lost) { lost = true; throw new Error("response lost"); }
      return result;
    });
    await expect(resolveWorkspaceConflict(conflict, "mine", { review, choices })).rejects.toThrow("response lost");
    expect(pendingWorkspaceChanges()[0].snapshot).toEqual(pending);
    await resolveWorkspaceConflict(conflict, "mine", { review, choices });
    expect(writes).toHaveLength(1); expect(pendingWorkspaceChanges()).toEqual([]);
    expect(database.drafts.get(pending.id)?.revision).toBe(3);
  });
  it("rejects live resolution against an unseen server version and preserves newer local edits during save", async () => {
    const { pending, conflict, review, choices } = await liveDraftConflict();
    const previous = database.drafts.get(pending.id)!;
    database.drafts.set(pending.id, { ...previous, revision: 3, snapshot: { ...previous.snapshot!, title: "Newer server title" } });
    await expect(resolveWorkspaceConflict(conflict, "mine", { review, choices })).rejects.toThrow("database version changed");
    expect(writes).toHaveLength(0);
    database.drafts.set(pending.id, previous);
    const request = vi.mocked(fetch), implementation = request.getMockImplementation()!;
    request.mockImplementation(async (...args) => {
      const result = await implementation(...args);
      if (args[1]?.body) useDraftStore.setState({ drafts: { [pending.id]: { ...pending, title: "Newer local title" } } });
      return result;
    });
    await expect(resolveWorkspaceConflict(conflict, "mine", { review, choices })).rejects.toThrow("pending edit changed");
    expect(pendingWorkspaceChanges()[0].snapshot).toMatchObject({ title: "Newer local title", matterId: pending.matterId });
  });
  it("rejects a mismatched live link review and cancelled-session epoch", async () => {
    const { conflict, review, choices } = await liveDraftConflict();
    await expect(resolveWorkspaceConflict(conflict, "mine", { review: { ...review, conflict: { ...conflict, message: "different" } }, choices })).rejects.toThrow("comparison changed");
    const request = vi.mocked(fetch), implementation = request.getMockImplementation()!;
    request.mockImplementationOnce(async (...args) => { const result = await implementation(...args); const transition = beginSessionTransition("Switching…")!; transition.release(); return result; });
    await expect(resolveWorkspaceConflict(conflict, "mine", { review, choices })).rejects.toThrow("Workspace changed");
    expect(writes).toHaveLength(0); expect(pendingWorkspaceChanges()).toHaveLength(1);
  });
  it("retains the original when a live write is acknowledged but its readback differs", async () => {
    const { pending, conflict, review, choices } = await liveDraftConflict();
    const request = vi.mocked(fetch), implementation = request.getMockImplementation()!;
    request.mockImplementation(async (...args) => {
      const result = await implementation(...args);
      if (args[1]?.body) {
        const stored = database.drafts.get(pending.id)!;
        database.drafts.set(pending.id, { ...stored, revision: stored.revision + 1, snapshot: { ...stored.snapshot!, title: "Another writer" } });
      }
      return result;
    });
    await expect(resolveWorkspaceConflict(conflict, "mine", { review, choices })).rejects.toThrow("verification failed");
    expect(pendingWorkspaceChanges()[0].snapshot).toEqual(pending);
    expect(useDraftStore.getState().drafts[pending.id]).toEqual(pending);
  });
  it("verifies an ordinary employee conflict without requiring relationship choices", async () => {
    database.employees.set(employee.id, { id: employee.id, revision: 1, snapshot: employee });
    await initializeDatabaseWorkspace("tenantA", "userA");
    const mine = { ...employee, legalName: "My explicit version" };
    useDraftStore.setState({ employees: { [employee.id]: mine } });
    database.employees.set(employee.id, { id: employee.id, revision: 2, snapshot: { ...employee, legalName: "Other version" } });
    await flushDatabaseWorkspace();
    const conflict = (await loadWorkspaceConflicts())[0];
    expect((await reviewWorkspaceRecoveryLinks(conflict)).issues).toEqual([]);
    await resolveWorkspaceConflict(conflict, "mine");
    expect(database.employees.get(employee.id)).toMatchObject({ revision: 3, snapshot: mine });
    expect(pendingWorkspaceChanges()).toEqual([]);
  });
  it("guides a deleted child onto an explicitly chosen database parent and verifies the copy", async () => {
    const { task, parent, conflict, review, choices } = await deletedTaskConflict();
    await expect(recoverWorkspaceConflictAsCopy(conflict)).rejects.toThrow("linked record is unavailable");
    expect(writes).toHaveLength(0); expect(pendingWorkspaceChanges()).toHaveLength(1);
    const id = await recoverWorkspaceConflictAsCopy(conflict, { review, choices });
    expect(database.tasks.get(id)?.snapshot).toEqual({ ...task, id, matterId: parent.id });
    expect(database.tasks.get(task.id)?.deletedAt).toBe(100);
    expect(pendingWorkspaceChanges()).toEqual([]);
  });
  it("keeps the original if the chosen recovery parent changes, or the comparison is stale", async () => {
    const { task, parent, conflict, review, choices } = await deletedTaskConflict();
    database.matters.set(parent.id, { id: parent.id, revision: 2, snapshot: null, deletedAt: 200 });
    await expect(recoverWorkspaceConflictAsCopy(conflict, { review, choices })).rejects.toThrow("changed or is unavailable");
    expect(writes).toHaveLength(0); expect(pendingWorkspaceChanges()[0].snapshot).toEqual(task);
    await expect(recoverWorkspaceConflictAsCopy(conflict, { review: { ...review, conflict: { ...conflict, message: "different" } }, choices })).rejects.toThrow("comparison changed");
  });
  it("reuses the same relinked copy after a lost acknowledgement without dropping the original early", async () => {
    const { conflict, review, choices } = await deletedTaskConflict();
    const request = vi.mocked(fetch), implementation = request.getMockImplementation()!;
    let lost = false;
    request.mockImplementation(async (...args) => {
      const result = await implementation(...args);
      if (args[1]?.body && !lost) { lost = true; throw new Error("response lost"); }
      return result;
    });
    await expect(recoverWorkspaceConflictAsCopy(conflict, { review, choices })).rejects.toThrow("response lost");
    expect(pendingWorkspaceChanges()).toHaveLength(1);
    await recoverWorkspaceConflictAsCopy(conflict, { review, choices });
    expect(database.tasks.size).toBe(2); expect(writes).toHaveLength(1); expect(pendingWorkspaceChanges()).toEqual([]);
  });
  it("invalidates a link review when a session transition begins and is cancelled during the read", async () => {
    const { conflict } = await deletedTaskConflict();
    const request = vi.mocked(fetch), implementation = request.getMockImplementation()!;
    request.mockImplementationOnce(async (...args) => {
      const result = await implementation(...args);
      const transition = beginSessionTransition("Switching…")!; transition.release();
      return result;
    });
    await expect(reviewWorkspaceRecoveryLinks(conflict)).rejects.toThrow("workspace or pending edit changed");
    expect(pendingWorkspaceChanges()).toHaveLength(1); expect(writes).toHaveLength(0);
  });
  it("retains the original on a lost recovery acknowledgement and reuses the exact copy on retry", async () => {
    const conflict = await deletedEmployeeConflict();
    const request = globalThis.fetch;
    // Transport captures fetch at initialization, so inject at the captured mock.
    const originalImplementation = vi.mocked(request).getMockImplementation()!;
    vi.mocked(request).mockImplementationOnce(async (...args) => originalImplementation(...args));
    vi.mocked(request).mockImplementationOnce(async (...args) => { await originalImplementation(...args); throw new Error("response lost"); });
    await expect(recoverWorkspaceConflictAsCopy(conflict)).rejects.toThrow("response lost");
    expect(pendingWorkspaceChanges()).toHaveLength(1);
    expect(useDraftStore.getState().employees[employee.id]).toEqual(employee);
    await recoverWorkspaceConflictAsCopy(conflict);
    expect(database.employees.size).toBe(2); expect(writes).toHaveLength(1);
    expect(pendingWorkspaceChanges()).toEqual([]);
  });
  it("keeps newer local edits when the original changes while the copy is being saved", async () => {
    const conflict = await deletedEmployeeConflict();
    const request = vi.mocked(fetch), implementation = request.getMockImplementation()!;
    request.mockImplementationOnce(async (...args) => implementation(...args));
    request.mockImplementationOnce(async (...args) => {
      const response = await implementation(...args);
      useDraftStore.setState({ employees: { [employee.id]: { ...employee, legalName: "Newer edit" } } });
      return response;
    });
    await expect(recoverWorkspaceConflictAsCopy(conflict)).rejects.toThrow("pending edit changed");
    expect(useDraftStore.getState().employees[employee.id].legalName).toBe("Newer edit");
    expect(pendingWorkspaceChanges()[0].snapshot).toMatchObject({ legalName: "Newer edit" });
  });
  it("seals writes before a session change, retains late edits for the original tenant and invalidates old file scopes", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    const scope = workspaceFileContext();
    const transition = beginSessionTransition("Switching…")!;
    try {
      expect(scope.isCurrent()).toBe(false);
      expect(() => workspaceFileContext()).toThrow("switching");
      useDraftStore.setState({ employees: { [employee.id]: employee } });
      const resume = await suspendDatabaseWorkspaceForTransition();
      useDraftStore.setState({ employees: { [employee.id]: { ...employee, legalName: "Late edit" } } });
      expect(await flushDatabaseWorkspace()).toBe(false);
      expect(writes).toHaveLength(1);
      expect(pendingWorkspaceChanges()[0].snapshot).toMatchObject({ legalName: "Late edit" });
      expect(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith("drafthr.workspace-pending.v1:userA:tenantA:"))!)).toContain("Late edit");
      resume(); await flushDatabaseWorkspace();
      expect(writes).toHaveLength(2);
      expect(writes.every(write => write.tenant === "tenantA")).toBe(true);
    } finally { transition.release(); }
    expect(scope.isCurrent()).toBe(false); // Cancel does not revive an old upload.
    expect(workspaceFileContext().isCurrent()).toBe(true);
  });
  it("does not suspend an unsaved workspace or resume a replacement coordinator", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    offline = true;
    useDraftStore.setState({ employees: { [employee.id]: employee } });
    await expect(suspendDatabaseWorkspaceForTransition()).rejects.toThrow("unsaved");
    offline = false; await retryDatabaseWorkspace();
    const resume = await suspendDatabaseWorkspaceForTransition();
    await initializeDatabaseWorkspace("tenantB", "userA");
    const resumeB = await suspendDatabaseWorkspaceForTransition();
    useDraftStore.setState({ employees: { [employee.id]: { ...employee, legalName: "Workspace B edit" } } });
    resume();
    expect(await flushDatabaseWorkspace()).toBe(false);
    resumeB(); expect(await flushDatabaseWorkspace()).toBe(true);
  });
  it("confirms only the exact acknowledged template snapshot, not a failed or later edit", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    const template = { id: toServerUuid("template-confirm"), name: "Fictional", baseLetterType: "offer" as const, mode: "employer" as const, sectionHtml: { opening: "<p>Saved wording</p>" }, createdAt: 1, updatedAt: 2 };
    offline = true; useDraftStore.setState({ customTemplates: { [template.id]: template } });
    await expect(confirmSavedWorkspaceTemplate(template)).rejects.toThrow("not confirmed");
    expect(database.templates.size).toBe(0);
    offline = false; await retryDatabaseWorkspace(); await confirmSavedWorkspaceTemplate(template);
    expect(database.templates.get(template.id)?.snapshot).toEqual(template);
    useDraftStore.setState({ customTemplates: { [template.id]: { ...template, name: "Later edit" } } });
    await expect(confirmSavedWorkspaceTemplate(template)).rejects.toThrow("not confirmed");
  });
  it("retains branding and template originals on asset failure, then verifies rewritten records before removal", async () => {
    const tenantId = "6342f430-7f39-4bf3-b59f-80ee1c65bd03";
    const image = "data:image/png;base64,iVBORw0KGgo=";
    const url = `/api/upload/image?path=letterheads%2F${tenantId}%2F${"a".repeat(64)}.png`;
    const template = { id: "tpl_legacy", name: "Fictional", baseLetterType: "offer", mode: "employer", sectionHtml: { opening: `<p>Keep<img src="${image}"></p>` }, createdAt: 1, updatedAt: 2 };
    const raw = JSON.stringify({ state: { customTemplates: { [template.id]: template } } });
    const { id: _id, ...profile } = defaultWorkspacePreferences(toServerUuid("browser-profile"));
    const profileRaw = JSON.stringify({ state: { profile: { ...profile, employer: { letterheadDataUrl: image }, credits: 0, workspaceRole: "owner" } } });
    localStorage.setItem("scribehr-store-v1", raw); localStorage.setItem("scribehr-profile-v1", profileRaw);
    let fail = true;
    vi.spyOn(legacyAssets, "legacyAssetUploader").mockReturnValue(async () => {
      expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
      expect(localStorage.getItem("scribehr-profile-v1")).toBe(profileRaw);
      if (fail) throw new Error("Asset unavailable"); return url;
    });
    await initializeDatabaseWorkspace(tenantId, "userA"); await importBrowserWorkspace();
    expect(writes).toHaveLength(0); expect(localStorage.getItem("scribehr-profile-v1")).toBe(profileRaw);
    fail = false; await importBrowserWorkspace();
    expect(useDatabaseWorkspaceStatus.getState().phase).toBe("ready");
    expect(localStorage.getItem("scribehr-profile-v1")).toBeNull(); expect(localStorage.getItem("scribehr-store-v1")).toBeNull();
    expect(JSON.stringify([...database.templates.values()])).toContain(url);
    expect(JSON.stringify([...database.preferences.values()])).toContain(url);
    expect(JSON.stringify(writes)).not.toContain("data:image");
  });
  it("hydrates from the database, saves edits, and leaves no full browser cache", async () => {
    database.employees.set(employee.id, { id: employee.id, revision: 2, snapshot: employee });
    await initializeDatabaseWorkspace("tenantA", "userA");
    expect(useDraftStore.getState().employees[employee.id]).toEqual(employee);
    useDraftStore.setState({ employees: { [employee.id]: { ...employee, legalName: "Alex edited" } } });
    expect(pendingWorkspaceChanges()).toHaveLength(1);
    expect(localStorage.getItem("scribehr-store-v1")).toBeNull();
    expect(await flushDatabaseWorkspace()).toBe(true);
    expect(writes[0]).toMatchObject({ tenant: "tenantA", body: { baseRevision: 2 } });
    expect(database.employees.get(employee.id)?.snapshot?.legalName).toBe("Alex edited");
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i)).filter(k => k?.startsWith("drafthr.workspace-pending"))).toEqual([]);
  });
  it("preserves a failed edit across reload and never silently overwrites another device", async () => {
    database.employees.set(employee.id, { id: employee.id, revision: 1, snapshot: employee });
    await initializeDatabaseWorkspace("tenantA", "userA");
    offline = true;
    useDraftStore.setState({ employees: { [employee.id]: { ...employee, legalName: "My pending edit" } } });
    expect(await flushDatabaseWorkspace()).toBe(false);
    stopDatabaseWorkspace();
    database.employees.set(employee.id, { id: employee.id, revision: 2, snapshot: { ...employee, legalName: "Another device" } });
    offline = false;
    await initializeDatabaseWorkspace("tenantA", "userA");
    expect(useDatabaseWorkspaceStatus.getState().conflicts).toBe(1);
    expect(database.employees.get(employee.id)?.snapshot?.legalName).toBe("Another device");
    expect(useDraftStore.getState().employees[employee.id].legalName).toBe("My pending edit");
    expect(writes.at(-1)?.body.baseRevision).toBe(1);
  });
  it("requires explicit import and verifies all linked records before removing the browser source", async () => {
    const legacyEmployee = { ...employee, id: "emp_old" };
    const legacyMatter = { id: "matter_old", name: "Case", participants: [{ employeeId: legacyEmployee.id, name: "Alex", role: "subject" }], createdAt: 1, updatedAt: 2 };
    const raw = JSON.stringify({ state: { employees: { [legacyEmployee.id]: legacyEmployee }, matters: { [legacyMatter.id]: legacyMatter } } });
    localStorage.setItem("scribehr-store-v1", raw);
    await initializeDatabaseWorkspace("tenantA", "userA");
    expect(useDatabaseWorkspaceStatus.getState().phase).toBe("needs-import");
    expect(writes).toHaveLength(0);
    expect(await flushDatabaseWorkspace()).toBe(false);
    await importBrowserWorkspace();
    expect(useDatabaseWorkspaceStatus.getState().phase).toBe("ready");
    expect(localStorage.getItem("scribehr-store-v1")).toBeNull();
    const [saved] = [...database.employees.values()];
    expect(saved.id).not.toBe(toServerUuid(legacyEmployee.id));
    expect([...database.matters.values()][0].snapshot?.participants).toEqual([{ employeeId: saved.id, name: "Alex", role: "subject" }]);
  });
  it("retains the complete browser source when import is interrupted", async () => {
    const raw = JSON.stringify({ state: { employees: { [employee.id]: employee } } });
    localStorage.setItem("scribehr-store-v1", raw);
    await initializeDatabaseWorkspace("tenantA", "userA"); offline = true;
    await importBrowserWorkspace();
    expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
    expect(useDatabaseWorkspaceStatus.getState().phase).toBe("needs-import");
    offline = false; await importBrowserWorkspace();
    expect(useDatabaseWorkspaceStatus.getState().phase).toBe("ready");
    expect(database.employees.size).toBe(1);
  });
  it("keeps legacy bytes until staged files and the rewritten database draft are verified", async () => {
    vi.stubGlobal("crypto", { randomUUID, subtle: { digest: async (_algorithm: string, bytes: Uint8Array) => Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer } });
    const draft = { id: "draft_legacy", mode: "employer", letterType: "offer", employer: {}, employee: {}, context: { jurisdiction: "UK" }, answers: {},
      sections: [], createdAt: 1, updatedAt: 2, evidence: [{ id: "legacy_evidence", kind: "document", content: "Keep", filename: "legacy.txt", fileDataUrl: "data:text/plain;base64,aGVsbG8=" }] };
    const raw = JSON.stringify({ state: { drafts: { [draft.id]: draft } } });
    localStorage.setItem("scribehr-store-v1", raw);
    let failUpload = true;
    const stage = vi.fn(async (file: legacyFiles.ImportFile) => {
      expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
      if (failUpload) throw new Error("Upload interrupted");
      return { ...file, purpose: "evidence" as const, format: null, draftRevision: 0, createdAt: 1, completedAt: 2 };
    });
    vi.spyOn(legacyFiles, "stagedFileUploader").mockReturnValue(stage);
    await initializeDatabaseWorkspace("tenantA", "userA");
    await importBrowserWorkspace();
    expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
    expect(writes).toHaveLength(0); expect(database.drafts.size).toBe(0);
    failUpload = false; await importBrowserWorkspace();
    expect(localStorage.getItem("scribehr-store-v1")).toBeNull();
    expect(database.drafts.size).toBe(1);
    expect(JSON.stringify([...database.drafts.values()][0].snapshot)).not.toContain("data:text/plain");
    expect(JSON.stringify([...database.drafts.values()][0].snapshot)).toContain("fileId");
    expect(stage.mock.calls[0][0].id).toBe(stage.mock.calls[1][0].id);
    expect(useDatabaseWorkspaceStatus.getState().phase).toBe("ready");
  });
  it("reconciles a committed write whose acknowledgement was lost without writing it twice", async () => {
    const raw = JSON.stringify({ state: { employees: { [employee.id]: employee } } });
    localStorage.setItem("scribehr-store-v1", raw);
    const request = globalThis.fetch;
    let loseAck = true;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const response = await request(url, init);
      if (init?.method === "POST" && loseAck) { loseAck = false; throw new Error("Connection closed after commit"); }
      return response;
    }));
    await initializeDatabaseWorkspace("tenantA", "userA");
    await importBrowserWorkspace();
    expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
    expect(database.employees.size).toBe(1);
    expect(pendingWorkspaceChanges()).toHaveLength(0);
    await importBrowserWorkspace();
    expect(localStorage.getItem("scribehr-store-v1")).toBeNull();
    expect(writes).toHaveLength(1);
  });
  it("does not replay a failed settings import after choosing to keep database settings", async () => {
    const { id: _id, ...profile } = defaultWorkspacePreferences(toServerUuid("browser-profile"));
    const raw = JSON.stringify({ state: { profile: { ...profile, personal: { legalName: "Browser only" }, credits: 0, workspaceRole: "owner" } } });
    localStorage.setItem("scribehr-profile-v1", raw);
    await initializeDatabaseWorkspace("tenantA", "userA");
    offline = true; await importBrowserWorkspace();
    expect(localStorage.getItem("scribehr-profile-v1")).toBe(raw);
    const count = writes.length;
    offline = false; await importBrowserWorkspace({ keepDatabaseSettings: true });
    expect(writes).toHaveLength(count);
    expect([...database.preferences.values()][0].snapshot?.personal).toEqual({});
    expect(localStorage.getItem("scribehr-profile-v1")).toBeNull();
    expect(pendingWorkspaceChanges()).toHaveLength(0);
  });
  it("retires a previous-version import queue only when it exactly matches the discarded browser settings", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    const tabId = sessionStorage.getItem("drafthr.workspace-tab.v1");
    stopDatabaseWorkspace();
    const preferences = { ...defaultWorkspacePreferences(toServerUuid("test-preferences")), personal: { legalName: "Old queued import" } };
    const { id, ...profile } = preferences;
    localStorage.setItem("scribehr-profile-v1", JSON.stringify({ state: { profile: { ...profile, credits: 0, workspaceRole: "owner" } } }));
    localStorage.setItem(`drafthr.workspace-pending.v1:userA:tenantA:${tabId}`, JSON.stringify([{ kind: "preferences", id, snapshot: preferences, baseRevision: 0 }]));
    await initializeDatabaseWorkspace("tenantA", "userA");
    expect(pendingWorkspaceChanges()).toHaveLength(1);
    await importBrowserWorkspace({ keepDatabaseSettings: true });
    expect(writes).toHaveLength(0);
    expect(pendingWorkspaceChanges()).toHaveLength(0);
    expect([...database.preferences.values()][0].snapshot?.personal).toEqual({});
    expect(useDatabaseWorkspaceStatus.getState().phase).toBe("ready");
  });
  it("uses fresh settings revisions instead of overwriting settings changed since page load", async () => {
    const { id: _id, ...profile } = defaultWorkspacePreferences(toServerUuid("browser-profile"));
    const raw = JSON.stringify({ state: { profile: { ...profile, personal: { legalName: "Browser" }, credits: 0, workspaceRole: "owner" } } });
    localStorage.setItem("scribehr-profile-v1", raw);
    await initializeDatabaseWorkspace("tenantA", "userA");
    const saved = [...database.preferences.values()][0];
    database.preferences.set(saved.id, { ...saved, revision: 1, snapshot: { ...saved.snapshot, personal: { legalName: "Newer database settings" } } });
    await importBrowserWorkspace();
    expect(writes).toHaveLength(0);
    expect(localStorage.getItem("scribehr-profile-v1")).toBe(raw);
    expect(useDatabaseWorkspaceStatus.getState().message).toContain("database settings differ");
  });
  it("preflights later graph conflicts before creating any earlier records", async () => {
    const bundle = emptyWorkspaceBundle(); bundle.employees[employee.id] = employee;
    bundle.matters.matter = { id: "matter", name: "Browser case", mode: "employer", status: "active", color: "blue", participants: [], createdAt: 1, updatedAt: 2 };
    const raw = JSON.stringify({ state: bundle });
    localStorage.setItem("scribehr-store-v1", raw);
    localStorage.setItem("drafthr.workspace-import.v1:userA:tenantA", "stable-token");
    await initializeDatabaseWorkspace("tenantA", "userA");
    // Another device changed an earlier import after this tab hydrated.
    const imported = planWorkspaceImport(bundle, "tenantA", "stable-token");
    const matter = Object.values(imported.matters)[0];
    database.matters.set(matter.id, { id: matter.id, revision: 2, snapshot: { ...matter, name: "Database edit" } });
    await importBrowserWorkspace();
    expect(writes).toHaveLength(0);
    expect(database.employees.size).toBe(0);
    expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
    expect(useDatabaseWorkspaceStatus.getState().message).toContain("edited or deleted");
  });
  it("refuses an obsolete browser source before starting any write", async () => {
    const raw = JSON.stringify({ state: { employees: { [employee.id]: employee } } });
    localStorage.setItem("scribehr-store-v1", raw);
    await initializeDatabaseWorkspace("tenantA", "userA");
    const newer = JSON.stringify({ state: { employees: { [employee.id]: { ...employee, legalName: "New browser edit" } } } });
    localStorage.setItem("scribehr-store-v1", newer);
    await importBrowserWorkspace();
    expect(writes).toHaveLength(0); expect(localStorage.getItem("scribehr-store-v1")).toBe(newer);
  });
  it("serializes competing import attempts without replaying or deleting their source", async () => {
    const raw = JSON.stringify({ state: { employees: { [employee.id]: employee } } });
    localStorage.setItem("scribehr-store-v1", raw);
    const request = globalThis.fetch;
    let unblock!: () => void;
    let importing = false;
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url, init) => { if (importing) await gate; return request(url, init); }));
    await initializeDatabaseWorkspace("tenantA", "userA");
    importing = true;
    const first = importBrowserWorkspace();
    await importBrowserWorkspace();
    expect(useDatabaseWorkspaceStatus.getState().message).toContain("Another tab is importing");
    expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
    unblock(); await first;
    expect(writes).toHaveLength(1); expect(database.employees.size).toBe(1);
  });
  it("stops subsequent writes when the browser source changes during an import", async () => {
    const second = { ...employee, id: toServerUuid("emp_second"), legalName: "Second" };
    const raw = JSON.stringify({ state: { employees: { [employee.id]: employee, [second.id]: second } } });
    localStorage.setItem("scribehr-store-v1", raw);
    const request = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const response = await request(url, init);
      if (init?.method === "POST") localStorage.setItem("scribehr-store-v1", raw + " ");
      return response;
    }));
    await initializeDatabaseWorkspace("tenantA", "userA");
    await importBrowserWorkspace();
    expect(writes).toHaveLength(1); expect(localStorage.getItem("scribehr-store-v1")).toBe(raw + " ");
    expect(useDatabaseWorkspaceStatus.getState().phase).toBe("needs-import");
  });
  it("retains the original when verification sees a newer database edit", async () => {
    const raw = JSON.stringify({ state: { employees: { [employee.id]: employee } } });
    localStorage.setItem("scribehr-store-v1", raw);
    const request = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const response = await request(url, init);
      if (init?.method === "POST") {
        const saved = [...database.employees.values()][0];
        database.employees.set(saved.id, { ...saved, revision: saved.revision + 1, snapshot: { ...saved.snapshot, legalName: "Other device edit" } });
      }
      return response;
    }));
    await initializeDatabaseWorkspace("tenantA", "userA");
    await importBrowserWorkspace();
    expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
    expect(useDatabaseWorkspaceStatus.getState().message).toContain("verification did not match");
    expect([...database.employees.values()][0].snapshot?.legalName).toBe("Other device edit");
  });
  it("does not begin an import without a cross-tab lock", async () => {
    const raw = JSON.stringify({ state: { employees: { [employee.id]: employee } } });
    localStorage.setItem("scribehr-store-v1", raw);
    await initializeDatabaseWorkspace("tenantA", "userA");
    vi.stubGlobal("navigator", {});
    await importBrowserWorkspace();
    expect(writes).toHaveLength(0); expect(localStorage.getItem("scribehr-store-v1")).toBe(raw);
    expect(useDatabaseWorkspaceStatus.getState().message).toContain("Web Locks");
  });
  it("never replays one user's pending edits in a different workspace", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA"); offline = true;
    useDraftStore.setState({ employees: { [employee.id]: employee } }); await flushDatabaseWorkspace();
    const count = writes.length;
    await initializeDatabaseWorkspace("tenantB", "userA");
    expect(pendingWorkspaceChanges()).toHaveLength(0);
    expect(writes).toHaveLength(count);
    expect(useDraftStore.getState().employees).toEqual({});
  });
  it("requires explicit recovery for an older closed tab before sign-out is safe", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA"); offline = true;
    useDraftStore.setState({ employees: { [employee.id]: employee } }); await flushDatabaseWorkspace();
    stopDatabaseWorkspace(); sessionStorage.clear(); offline = false;
    await initializeDatabaseWorkspace("tenantA", "userA");
    expect(useDatabaseWorkspaceStatus.getState().otherRecoveryCount).toBe(1);
    expect(await flushDatabaseWorkspace()).toBe(false);
    await recoverClosedWorkspaceTabs();
    expect(database.employees.get(employee.id)?.snapshot?.legalName).toBe("Alex");
    expect(useDatabaseWorkspaceStatus.getState().otherRecoveryCount).toBe(0);
    expect(await flushDatabaseWorkspace()).toBe(true);
  });
  it("does not take pending work from a still-open tab even when the user clicks closed-tab recovery", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    const lease = await claimWorkspaceTab({ getItem: () => "older-open-tab", setItem: () => {} }, navigator.locks);
    const key = "drafthr.workspace-pending.v1:userA:tenantA:older-open-tab";
    const raw = JSON.stringify([{ kind: "employees", id: employee.id, snapshot: employee, baseRevision: 0 }]);
    localStorage.setItem(key, raw);
    try {
      await expect(recoverClosedWorkspaceTabs()).rejects.toThrow("still open");
      expect(localStorage.getItem(key)).toBe(raw); expect(writes).toHaveLength(0);
      expect(useDraftStore.getState().employees).toEqual({});
    } finally { await lease.release(); }
    await recoverClosedWorkspaceTabs();
    expect(database.employees.get(employee.id)?.snapshot).toEqual(employee);
    expect(localStorage.getItem(key)).toBeNull();
  });
  it("preserves closed-tab sources when cross-tab locks are unavailable", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    const key = "drafthr.workspace-pending.v1:userA:tenantA:closed-tab";
    const raw = JSON.stringify([{ kind: "employees", id: employee.id, snapshot: employee, baseRevision: 0 }]);
    localStorage.setItem(key, raw); vi.stubGlobal("navigator", {});
    await expect(recoverClosedWorkspaceTabs()).rejects.toThrow("Web Locks");
    expect(localStorage.getItem(key)).toBe(raw); expect(writes).toHaveLength(0);
  });
  it("rejects a deleted-settings recovery before changing stores or subscriptions", async () => {
    await initializeDatabaseWorkspace("tenantA", "userA");
    const key = "drafthr.workspace-pending.v1:userA:tenantA:closed-tab";
    const raw = JSON.stringify([{ kind: "preferences", id: toServerUuid("test-preferences"), snapshot: null, baseRevision: 0 }]);
    localStorage.setItem(key, raw);
    await expect(recoverClosedWorkspaceTabs()).rejects.toThrow("deleted settings");
    expect(localStorage.getItem(key)).toBe(raw); expect(pendingWorkspaceChanges()).toEqual([]);
    useDraftStore.setState({ employees: { [employee.id]: employee } });
    expect(pendingWorkspaceChanges()[0].snapshot).toEqual(employee);
  });
});
