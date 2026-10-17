/**
 * Mount-time sync order: pull first, then push. Pushing before the pull meant
 * the first load after the revision upgrade (no sync metadata yet) sent every
 * draft with no base revision, and anything changed elsewhere came back as a
 * conflicted copy.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const order: string[] = [];

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  useAuth: () => ({
    isLoaded: true,
    user: { id: "user_1", email: "a@b.com", firstName: null, lastName: null, profilePictureUrl: null },
    activeTenant: { id: "t1", name: "T", role: "owner" },
    hasAnyTenant: true,
    isConsultant: false,
    signIn: async () => {},
    signOut: async () => {},
    refresh: async () => {},
  }),
}));
vi.mock("@/components/Layout", () => ({ Layout: ({ children }: { children: unknown }) => children }));
vi.mock("@/lib/storage/migrate", () => ({ migrateEmployerImages: async () => null }));
vi.mock("@/lib/dual-write", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dual-write")>()),
  isDualWriteEnabled: () => true,
  reissuePendingDeletes: async () => {
    order.push("deletes");
  },
  syncAllPending: async () => {
    order.push("push");
    return { ok: 0, failed: 0 };
  },
}));
vi.mock("@/lib/remote-pull", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/remote-pull")>()),
  pullRemoteDrafts: async () => {
    await new Promise((r) => setTimeout(r, 20));
    order.push("pull");
    return { ok: true, count: 0 };
  },
  pullRemoteExtras: async () => {
    order.push("extras");
    return { ok: true, count: 0 };
  },
}));

describe("App mount sync", () => {
  it("pushes local drafts only after the pull has recorded server revisions", async () => {
    const { useDraftStore } = await import("@/lib/store");
    useDraftStore.setState({ drafts: { d1: { id: "d1" } as never } });
    const { App } = await import("./App");
    render(
      <MemoryRouter initialEntries={["/no-such-page"]}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(order).toContain("push"), { timeout: 10_000 });
    expect(order).toEqual(["deletes", "pull", "extras", "push"]);
  }, 20_000);

  it("never syncs another workspace's data that there was no room to stash", async () => {
    vi.resetModules();
    order.length = 0;
    localStorage.clear();
    // Data left by the user's other workspace, and no room to move it aside.
    localStorage.setItem("drafthr.local-owner.v1", "user_1:t-other");
    localStorage.setItem("scribehr-store-v1", JSON.stringify({ state: { drafts: { x: { id: "x" } } }, version: 0 }));
    const original = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key.startsWith("drafthr.stash.")) throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    });
    try {
      const { App } = await import("./App");
      render(
        <MemoryRouter initialEntries={["/no-such-page"]}>
          <App />
        </MemoryRouter>,
      );
      // The user is asked about deleting it instead.
      const prompt = await screen.findAllByText("Not enough space to keep this workspace's data", {}, { timeout: 10_000 });
      expect(prompt.length).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 50));
      expect(order).toEqual([]);
      const { enqueueSync } = await import("@/lib/dual-write");
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      enqueueSync("x");
      await new Promise((r) => setTimeout(r, 500));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  }, 20_000);
});
