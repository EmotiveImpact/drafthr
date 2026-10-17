import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/letters/types";
import {
  buildLocalBackup,
  confirmLocalDataLoss,
  isSummaryEmpty,
  setLocalDataLossPresenter,
  summariseLocalOnlyData,
} from "./localDataGuard";

const d = (id: string, extra: Partial<Draft> = {}) => ({ id, ...extra }) as Draft;
const empty = { drafts: {}, matters: {}, employees: {}, tasks: {}, events: {}, customTemplates: {} };

describe("summariseLocalOnlyData", () => {
  it("counts every draft and matter as local-only when sync is off, plus the never-synced stores", () => {
    const s = summariseLocalOnlyData(
      {
        ...empty,
        drafts: { a: d("a", { evidence: [{ id: "e1" }, { id: "e2" }] as never }), b: d("b") },
        matters: { m: {} },
        employees: { e: {} },
        tasks: { t: {}, u: {} },
        events: { v: {} },
        customTemplates: { c: {} },
      },
      { dualWrite: false, unsynced: () => false },
    );
    expect(s.items.map((i) => i.label)).toEqual([
      "2 letters",
      "1 matter",
      "1 employee",
      "2 tasks",
      "1 calendar event",
      "1 saved template",
      "2 evidence files",
    ]);
  });

  it("with sync on, only counts unsynced drafts and local-only copies", () => {
    const s = summariseLocalOnlyData(
      { ...empty, drafts: { a: d("a"), b: d("b"), c: d("c", { localOnly: true }) }, matters: { m: {} } },
      { dualWrite: true, unsynced: (x) => x.id === "b" },
    );
    expect(s.items.map((i) => i.label)).toEqual(["2 letters with unsynced changes"]);
  });

  it("is empty when everything is synced", () => {
    const s = summariseLocalOnlyData({ ...empty, drafts: { a: d("a") } }, { dualWrite: true, unsynced: () => false });
    expect(isSummaryEmpty(s)).toBe(true);
  });
});

describe("confirmLocalDataLoss", () => {
  afterEach(() => setLocalDataLossPresenter(null));

  it("goes ahead without asking when nothing would be lost", async () => {
    const presenter = vi.fn();
    setLocalDataLossPresenter(presenter);
    expect(await confirmLocalDataLoss("sign-out", { items: [], otherWorkspaces: 0 })).toBe(true);
    expect(presenter).not.toHaveBeenCalled();
  });

  it("asks the mounted dialog and honours a cancel", async () => {
    const presenter = vi.fn(async () => false);
    setLocalDataLossPresenter(presenter);
    const summary = { items: [{ label: "3 employees", count: 3 }], otherWorkspaces: 0 };
    expect(await confirmLocalDataLoss("sign-out", summary)).toBe(false);
    expect(presenter).toHaveBeenCalledWith(summary, "sign-out");
  });

  it("falls back to the browser confirm without a dialog", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(await confirmLocalDataLoss("sign-out", { items: [{ label: "1 task", count: 1 }], otherWorkspaces: 2 })).toBe(true);
    expect(confirm.mock.calls[0][0]).toMatch(/1 task[\s\S]*2 other workspaces/);
  });
});

describe("buildLocalBackup", () => {
  afterEach(() => localStorage.clear());

  it("includes the workspace data and stashed workspaces, not unrelated preferences", () => {
    localStorage.setItem("scribehr-store-v1", JSON.stringify({ state: { drafts: { a: 1 } } }));
    localStorage.setItem("drafthr.stash.v1:u1:t2:scribehr-store-v1", JSON.stringify({ state: { drafts: {} } }));
    localStorage.setItem("scribehr-theme-v1", "dark");
    const backup = JSON.parse(buildLocalBackup(new Date("2026-01-01T00:00:00Z")));
    expect(backup.kind).toBe("local-backup");
    expect(backup.keys["scribehr-store-v1"].state.drafts.a).toBe(1);
    expect(backup.keys["drafthr.stash.v1:u1:t2:scribehr-store-v1"]).toBeDefined();
    expect(backup.keys["scribehr-theme-v1"]).toBeUndefined();
  });

  it("backs up the in-memory letters, not the stale disk copy, while storage writes are failing", async () => {
    const { useDraftStore } = await import("@/lib/store");
    localStorage.setItem(
      "scribehr-store-v1",
      JSON.stringify({ state: { drafts: { a: { id: "a", title: "Saved earlier" } } }, version: 0 }),
    );
    const original = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === "scribehr-store-v1") throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    });
    try {
      useDraftStore.setState({ drafts: { a: { ...d("a"), title: "Typed after storage filled up" } } });
      const backup = JSON.parse(buildLocalBackup());
      expect(backup.keys["scribehr-store-v1"].state.drafts.a.title).toBe("Typed after storage filled up");
      expect(backup.keys["scribehr-store-v1"].version).toBe(0);
    } finally {
      setItem.mockRestore();
    }
  });
});
