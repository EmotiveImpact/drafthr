/**
 * Store ↔ dual-write wiring: remote deletes only from explicit actions, and
 * syncs only for drafts whose synced content changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "./letters/types";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() }),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("VITE_DRAFTHR_DUAL_WRITE", "true");
  vi.useFakeTimers();
  vi.resetModules();
  localStorage.clear();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, revision: 1 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function draft(id: string, html = "<p>Hi</p>"): Draft {
  return {
    id,
    mode: "employer",
    letterType: "termination",
    context: { jurisdiction: "UK" },
    employer: { legalName: "Acme" },
    employee: { legalName: "Jane" },
    answers: {},
    sections: [{ id: "sec_1", sectionId: "intro", title: "Intro", html, required: true, status: "ready", versions: [] }],
    createdAt: 1,
    updatedAt: 1,
  } as unknown as Draft;
}

const calls = (method: string) =>
  fetchMock.mock.calls.filter(([url, init]) => url === "/api/store/drafts" && (init as RequestInit).method === method);

describe("store sync wiring", () => {
  it("never issues a remote delete when drafts vanish from state (rehydrate / storage-full)", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { a: draft("a"), b: draft("b") } });
    await vi.advanceTimersByTimeAsync(500);
    // Another tab's (smaller) persisted state replaces ours.
    useDraftStore.setState({ drafts: { a: { ...useDraftStore.getState().drafts.a } } });
    await vi.advanceTimersByTimeAsync(500);
    expect(calls("DELETE")).toHaveLength(0);
  });

  it("issues the remote delete from deleteDraft", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { a: draft("a") } });
    useDraftStore.getState().deleteDraft("a");
    await vi.advanceTimersByTimeAsync(10);
    expect(calls("DELETE")).toHaveLength(1);
  });

  it("re-sends only drafts whose content changed after a rehydrate", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { a: draft("a"), b: draft("b") } });
    await vi.advanceTimersByTimeAsync(500);
    expect(calls("POST")).toHaveLength(2);

    fetchMock.mockClear();
    // Rehydrate-style replacement: every object new, one with new content.
    useDraftStore.setState({ drafts: { a: { ...draft("a") }, b: draft("b", "<p>Changed</p>") } });
    await vi.advanceTimersByTimeAsync(500);
    expect(calls("POST")).toHaveLength(1);
  });

  it("does not sync on AI chat streaming tokens", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { a: draft("a") } });
    await vi.advanceTimersByTimeAsync(500);
    fetchMock.mockClear();
    const s = useDraftStore.getState();
    const msgId = s.appendAIMessage("a", { role: "assistant", body: "", streaming: true } as never);
    for (let i = 0; i < 20; i++) useDraftStore.getState().appendAIMessageBody("a", msgId, "tok ");
    await vi.advanceTimersByTimeAsync(500);
    expect(calls("POST")).toHaveLength(0);
  });

  it("deleteComment leaves tombstones for the comment and its replies; resolve bumps updatedAt", async () => {
    const { useDraftStore } = await import("./store");
    useDraftStore.setState({ drafts: { a: draft("a") } });
    const s = useDraftStore.getState();
    const root = s.addComment("a", { sectionId: "sec_1", authorId: "me", authorName: "Me", body: "root" });
    s.addComment("a", { sectionId: "sec_1", parentId: root, authorId: "me", authorName: "Me", body: "reply" });
    vi.setSystemTime(Date.now() + 1000);
    useDraftStore.getState().resolveComment("a", root, true);
    const resolved = useDraftStore.getState().drafts.a.comments!.find((c) => c.id === root)!;
    expect(resolved.updatedAt).toBeGreaterThan(resolved.createdAt);
    useDraftStore.getState().deleteComment("a", root);
    const d = useDraftStore.getState().drafts.a;
    expect(d.comments).toEqual([]);
    expect(d.commentTombstones).toHaveLength(2);
  });

  it("a rehydrate keeps this tab's unpersisted drafts while its storage writes are failing", async () => {
    const { mergePersistedDrafts } = await import("./store");
    const current = { drafts: { mine: { ...draft("mine"), updatedAt: 9 }, both: { ...draft("both"), updatedAt: 9 } } };
    const persisted = { drafts: { both: { ...draft("both"), updatedAt: 3 }, theirs: draft("theirs") } };
    const ahead = mergePersistedDrafts(persisted, current, true);
    expect(Object.keys(ahead.drafts).sort()).toEqual(["both", "mine", "theirs"]);
    expect(ahead.drafts.both.updatedAt).toBe(9);
    // Healthy storage: disk is authoritative, as before.
    const normal = mergePersistedDrafts(persisted, current, false);
    expect(Object.keys(normal.drafts).sort()).toEqual(["both", "theirs"]);
  });

  it("builds a local-only conflicted copy that drops the approval", async () => {
    const { conflictCopyOf } = await import("./store");
    const copy = conflictCopyOf({ ...draft("a"), reviewStatus: "approved", approvals: [{ id: "x" }] } as never);
    expect(copy.id).not.toBe("a");
    expect(copy.localOnly).toBe(true);
    expect(copy.reviewStatus).toBe("draft");
    expect(copy.approvals).toEqual([]);
    expect(copy.title).toMatch(/conflicted copy/);
  });
});
