import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * deleteMatter cleanup: removing a matter must also unfile its drafts AND
 * drop its tasks/events — otherwise those records leak in the store forever
 * (invisible, and would re-surface if a new matter reused the id).
 */
describe("deleteMatter orphan cleanup", () => {
  beforeEach(() => installMemoryLocalStorage());
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("removes the matter, unfiles its drafts, and drops its tasks/events", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();

    const matterId = store.createMatter({ name: "Acme grievance", mode: "employer", color: "red" });
    const otherMatterId = store.createMatter({ name: "Other", mode: "employer", color: "blue" });

    // A task + event on the matter being deleted, and one on another matter.
    const taskId = store.createTask({ matterId, label: "Investigate", status: "open" });
    const keepTaskId = store.createTask({ matterId: otherMatterId, label: "Keep", status: "open" });
    const eventId = store.createEvent({
      matterId,
      kind: "meeting",
      label: "Hearing",
      whenISO: "2026-06-01",
    });
    const keepEventId = store.createEvent({
      matterId: otherMatterId,
      kind: "meeting",
      label: "Keep",
      whenISO: "2026-06-02",
    });

    // A draft filed under the matter.
    useDraftStore.setState((s) => ({
      drafts: {
        ...s.drafts,
        draft_x: { id: "draft_x", matterId, sections: [] } as never,
      },
    }));

    useDraftStore.getState().deleteMatter(matterId);
    const next = useDraftStore.getState();

    // Matter gone; other matter intact.
    expect(next.matters[matterId]).toBeUndefined();
    expect(next.matters[otherMatterId]).toBeDefined();
    // Draft unfiled, not deleted.
    expect(next.drafts.draft_x).toBeDefined();
    expect(next.drafts.draft_x.matterId).toBeUndefined();
    // Task/event for the deleted matter gone; the other matter's kept.
    expect(next.tasks[taskId]).toBeUndefined();
    expect(next.tasks[keepTaskId]).toBeDefined();
    expect(next.events[eventId]).toBeUndefined();
    expect(next.events[keepEventId]).toBeDefined();
  });
});

function installMemoryLocalStorage() {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return [...entries.keys()][index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}
