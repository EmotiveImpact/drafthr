/**
 * Mount-time sync order: pull first, then push. Pushing before the pull meant
 * the first load after the revision upgrade (no sync metadata yet) sent every
 * draft with no base revision, and anything changed elsewhere came back as a
 * conflicted copy.
 */
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Theme } from "@radix-ui/themes";

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
      <Theme>
        <MemoryRouter initialEntries={["/no-such-page"]}>
          <App />
        </MemoryRouter>
      </Theme>,
    );
    await waitFor(() => expect(order).toContain("push"));
    expect(order).toEqual(["deletes", "pull", "extras", "push"]);
  });
});
