import { describe, expect, it } from "vitest";
import { claimWorkspaceTab, withClosedWorkspaceTabs } from "./workspace-tab-lease";

function storage(id: string | null = null) {
  return { getItem: () => id, setItem: (_key: string, value: string) => { id = value; } };
}
function locks() {
  const held = new Set<string>();
  return { request: async (name: string, _options: unknown, callback: (lock: object | null) => unknown) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } } as Pick<LockManager, "request">;
}
describe("exclusive pending-edit recovery files", () => {
  it("refuses recovery while any source tab is alive and releases earlier source locks", async () => {
    const manager = locks();
    const alive = await claimWorkspaceTab(storage("z-live"), manager);
    let transferred = false;
    await expect(withClosedWorkspaceTabs(["a-closed", "z-live"], manager, async () => { transferred = true; })).rejects.toThrow("still open");
    expect(transferred).toBe(false);
    const released = await claimWorkspaceTab(storage("a-closed"), manager);
    expect(released.id).toBe("a-closed");
    await released.release(); await alive.release();
  });
  it("holds ownership through transfer, rejects competing recovery and releases after failure", async () => {
    const manager = locks();
    await expect(withClosedWorkspaceTabs(["closed", "closed"], manager, async () => {
      await expect(withClosedWorkspaceTabs(["closed"], manager, async () => {})).rejects.toThrow("still open");
      throw new Error("destination storage failed");
    })).rejects.toThrow("destination storage failed");
    await expect(withClosedWorkspaceTabs(["closed"], manager, async () => "transferred")).resolves.toBe("transferred");
  });
  it("never takes over recovery without a lock manager", async () => {
    await expect(withClosedWorkspaceTabs(["closed"], undefined, async () => {})).rejects.toThrow("Web Locks");
  });
  it("gives duplicated tabs separate files despite copied sessionStorage", async () => {
    const manager = locks();
    const first = await claimWorkspaceTab(storage("copied-tab-id"), manager);
    const duplicate = await claimWorkspaceTab(storage("copied-tab-id"), manager);
    expect(first.id).toBe("copied-tab-id"); expect(duplicate.id).not.toBe(first.id);
    await first.release(); await duplicate.release();
  });
  it("lets a reload reclaim its original file after the old page releases", async () => {
    const manager = locks(), session = storage("reload-id");
    const first = await claimWorkspaceTab(session, manager); await first.release();
    const reloaded = await claimWorkspaceTab(session, manager);
    expect(reloaded.id).toBe(first.id); await reloaded.release();
  });
  it("does not assume exclusive ownership in browsers without Web Locks", async () => {
    const first = await claimWorkspaceTab(storage("copied-id"));
    const other = await claimWorkspaceTab(storage("copied-id"));
    expect(first.id).not.toBe("copied-id"); expect(other.id).not.toBe(first.id);
  });
});
