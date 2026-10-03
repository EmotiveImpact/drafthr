import { describe, expect, it, vi } from "vitest";
import { WorkspaceSyncEngine, SyncRequestError, type SyncOperation } from "./workspace-sync-engine";
type Kind = "employees" | "matters" | "tasks";
type Record = { id: string; text?: string };
const order: Kind[] = ["employees", "matters", "tasks"];
function engine(write = vi.fn(async (op: SyncOperation<Kind, Record>) => ({ revision: op.baseRevision + 1, deletedAt: op.snapshot ? null : 123 }))) {
  return { write, sync: new WorkspaceSyncEngine<Kind, Record>({ order, key: id => id, write }) };
}
describe("workspace record write coordinator", () => {
  it("clears a competing pending edit when the explicitly selected recovery already matches the database", async () => {
    const { sync, write } = engine();
    sync.seed("employees", [{ id: "e", revision: 3, snapshot: { id: "e", text: "Database" } }]);
    sync.enqueue("employees", "e", { id: "e", text: "Unselected edit" });
    sync.replaceRecovery({ kind: "employees", id: "e", baseRevision: 1, snapshot: { id: "e", text: "Database" } });
    expect(sync.recoveryOperations()).toEqual([]);
    expect(await sync.flush()).toBe(true); expect(write).not.toHaveBeenCalled();
  });
  it("seals only a drained queue and retains late callbacks without sending until resumed", async () => {
    const { sync, write } = engine();
    sync.enqueue("employees", "e", { id: "e", text: "Before leaving" });
    expect(sync.pauseWrites()).toBe(false);
    await sync.flush();
    expect(sync.pauseWrites()).toBe(true);
    sync.enqueue("employees", "e", { id: "e", text: "Late callback" });
    expect(await sync.flush()).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(sync.recoveryOperations()[0]).toMatchObject({ baseRevision: 1, snapshot: { text: "Late callback" } });
    sync.resumeWrites();
    expect(await sync.flush()).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("saves dependencies before children and unlinks before deleting parents", async () => {
    const { sync, write } = engine();
    sync.enqueue("tasks", "t", { id: "t" }); sync.enqueue("matters", "m", { id: "m" }); sync.enqueue("employees", "e", { id: "e" });
    expect(await sync.flush()).toBe(true);
    expect(write.mock.calls.map(([op]) => op.kind)).toEqual(order);
    write.mockClear();
    sync.enqueue("matters", "m", null); sync.enqueue("employees", "e", null); sync.enqueue("tasks", "t", null);
    expect(await sync.flush()).toBe(true);
    expect(write.mock.calls.map(([op]) => op.kind)).toEqual([...order].reverse());
  });
  it("keeps an edit made during an in-flight save and writes it with the acknowledged revision", async () => {
    let release!: (value: { revision: number; deletedAt: null }) => void;
    const write = vi.fn(async (op: SyncOperation<Kind, Record>) => op.baseRevision === 0
      ? new Promise<{ revision: number; deletedAt: null }>(resolve => { release = resolve; })
      : { revision: op.baseRevision + 1, deletedAt: null });
    const { sync } = engine(write);
    sync.enqueue("employees", "e", { id: "e", text: "First" });
    const flushing = sync.flush();
    sync.enqueue("employees", "e", { id: "e", text: "Second" });
    expect(sync.recoveryOperations()[0].snapshot?.text).toBe("Second");
    release({ revision: 1, deletedAt: null });
    expect(await flushing).toBe(true);
    expect(write.mock.calls[1][0]).toMatchObject({ baseRevision: 1, snapshot: { text: "Second" } });
  });
  it("does not recreate deleted server records or silently retry conflicts while typing", async () => {
    const { sync, write } = engine();
    sync.seed("employees", [{ id: "e", revision: 2, snapshot: null, deletedAt: 123 }]);
    sync.enqueue("employees", "e", { id: "e", text: "Old browser" });
    expect(await sync.flush()).toBe(false);
    expect(write).not.toHaveBeenCalled();
    sync.enqueue("employees", "e", { id: "e", text: "Still editing" });
    expect(await sync.retryFailures()).toBe(false);
    expect(sync.status.conflicts).toBe(1);
  });
  it("retains a failed write for explicit retry and blocks a clean flush", async () => {
    const { sync, write } = engine();
    write.mockRejectedValueOnce(new Error("offline"));
    sync.enqueue("employees", "e", { id: "e", text: "Retain me" });
    expect(await sync.flush()).toBe(false);
    expect(sync.recoveryOperations()).toHaveLength(1);
    expect(await sync.retryFailures()).toBe(true);
    expect(sync.recoveryOperations()).toHaveLength(0);
  });
  it("requires explicit resolution against the latest revision after a conflict", async () => {
    const { sync, write } = engine();
    write.mockRejectedValueOnce(new SyncRequestError("revision_conflict", "Conflict"));
    sync.seed("employees", [{ id: "e", revision: 1, snapshot: { id: "e" } }]);
    sync.enqueue("employees", "e", { id: "e", text: "Mine" });
    expect(await sync.flush()).toBe(false);
    expect(await sync.retryFailures()).toBe(false);
    sync.resolve("employees", "e", { id: "e", revision: 3, snapshot: { id: "e", text: "Theirs" } }, { id: "e", text: "Explicit merge" });
    expect(await sync.flush()).toBe(true);
    expect(write.mock.calls[1][0].baseRevision).toBe(3);
  });
  it("stops subsequent writes after an identity or workspace change", async () => {
    const { sync, write } = engine();
    sync.enqueue("employees", "e", { id: "e" });
    sync.stop();
    expect(await sync.flush()).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(() => sync.enqueue("employees", "e2", { id: "e2" })).toThrow();
  });
  it("does not issue a delete for a record discarded before it was saved", async () => {
    const { sync, write } = engine();
    sync.enqueue("employees", "e", { id: "e" }); sync.enqueue("employees", "e", null);
    expect(await sync.flush()).toBe(true); expect(write).not.toHaveBeenCalled();
  });
});
