/**
 * Dual-write revisions, conflicts, remote deletes, retries and failure
 * messages. Like dual-write.test.ts, the flag is read at import time so it is
 * stubbed before each dynamic import.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "./letters/types";
import type { RemoteDraft } from "./remote-pull";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }),
}));

beforeEach(() => {
  vi.stubEnv("VITE_DRAFTHR_DUAL_WRITE", "true");
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeDraft(id: string, html = "<p>Hi</p>", extra: Partial<Draft> = {}): Draft {
  return {
    id,
    mode: "employer",
    letterType: "termination",
    context: { jurisdiction: "UK" },
    employer: { legalName: "Acme" },
    employee: { legalName: "Jane" },
    answers: {},
    sections: [{ id: "sec_1", sectionId: "intro", title: "Intro", html, required: true, status: "ready", versions: [] }],
    reviewStatus: "draft",
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  } as unknown as Draft;
}

function remoteOf(d: Draft, revision: number, over: Partial<RemoteDraft> = {}): RemoteDraft {
  return {
    id: "server-id",
    letterType: d.letterType,
    mode: d.mode,
    title: d.title ?? null,
    jurisdiction: "UK",
    matterId: null,
    reviewStatus: d.reviewStatus ?? "draft",
    isTemplateSource: false,
    templateSourceId: null,
    context: d.context as unknown as Record<string, unknown>,
    employer: d.employer as unknown as Record<string, unknown>,
    employee: d.employee as unknown as Record<string, unknown>,
    answers: d.answers as unknown as Record<string, unknown>,
    createdAt: 1,
    updatedAt: 2,
    revision,
    sections: d.sections.map((s, i) => ({ sectionId: s.sectionId, title: s.title, html: s.html, status: s.status, position: i })),
    ...over,
  };
}

/** A tiny in-memory stand-in for the store, wired through the bridge. */
async function setup(initial: Draft[]) {
  const mod = await import("./dual-write");
  const { toast } = await import("sonner");
  const { applyRemoteDraft, mergeExtrasIntoDraft } = await import("./remote-pull");
  const drafts: Record<string, Draft> = Object.fromEntries(initial.map((d) => [d.id, d]));
  mod.setDualWriteSnapshotGetter((id) => drafts[id] ?? null);
  mod._setSleepForTests(async () => {});
  mod.setDualWriteStoreBridge({
    applyServerDraft: (id, remote) => (drafts[id] = applyRemoteDraft(drafts[id], remote)),
    setReviewStatus: (id, status) => {
      drafts[id] = { ...drafts[id], reviewStatus: status };
    },
    withdrawApproval: (id, since) => {
      drafts[id] = {
        ...drafts[id],
        approvals: (drafts[id].approvals ?? []).filter((a) => !(a.decision === "approved" && a.createdAt >= since)),
      };
    },
    addConflictCopy: (d) => {
      const id = `${d.id}_copy`;
      drafts[id] = { ...d, id, localOnly: true, reviewStatus: "draft", title: "(conflicted copy)" };
      return id;
    },
    keepLocalOnly: (id) => {
      drafts[id] = { ...drafts[id], localOnly: true };
    },
    removeLocally: (id) => {
      delete drafts[id];
    },
    applyExtras: (id, extras) => {
      drafts[id] = mergeExtrasIntoDraft(drafts[id], extras);
    },
  });
  return { mod, drafts, toast: toast as unknown as ReturnType<typeof vi.fn> & { error: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> } };
}

const ok = (rev: number, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, revision: rev, ...extra }), { status: 200 });

function postBodies(fetchMock: ReturnType<typeof vi.fn>, url = "/api/store/drafts") {
  return fetchMock.mock.calls
    .filter(([u, init]) => u === url && (init as RequestInit).method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe("revisions", () => {
  it("sends the revision it last saw and only re-sends when content changes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(2));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts } = await setup([makeDraft("d1")]);

    await mod.syncDraft("d1");
    expect(postBodies(fetchMock)[0].baseRevision).toBeNull();

    // Identity changed, content didn't (e.g. a cross-tab rehydrate): no POST.
    drafts.d1 = { ...drafts.d1 };
    await mod.syncDraft("d1");
    expect(postBodies(fetchMock)).toHaveLength(1);

    drafts.d1 = makeDraft("d1", "<p>Edited</p>");
    await mod.syncDraft("d1");
    expect(postBodies(fetchMock)[1].baseRevision).toBe(1);
  });

  it("adopts the server copy on a 409 when the content matches, taking the newer approval", async () => {
    const local = makeDraft("d1", "<p>Same</p>", { reviewStatus: "in_review" });
    const current = remoteOf(local, 7, { reviewStatus: "approved" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ current }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts } = await setup([local]);

    await mod.syncDraft("d1");
    expect(drafts.d1.reviewStatus).toBe("approved");
    expect(Object.keys(drafts)).toEqual(["d1"]);
    const { getSyncMeta } = await import("./sync-meta");
    expect(getSyncMeta("d1")?.rev).toBe(7);
  });

  it("recognises its own letter when the server returns jsonb objects with their keys reordered", async () => {
    const local = makeDraft("d1", "<p>Same</p>", {
      context: { jurisdiction: "UK", tone: "formal", protectedDeadline: { iso: "2026-01-01", basis: "b" } },
      employee: { legalName: "Jane", jobTitle: "Engineer" },
    } as unknown as Partial<Draft>);
    // Postgres jsonb hands objects back in its own key order.
    const current = remoteOf(local, 3, {
      context: { tone: "formal", jurisdiction: "UK", protectedDeadline: { basis: "b", iso: "2026-01-01" } },
      employee: { jobTitle: "Engineer", legalName: "Jane" },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ current }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts, toast } = await setup([local]);

    await mod.syncDraft("d1");
    expect(Object.keys(drafts)).toEqual(["d1"]);
    expect(toast.warning).not.toHaveBeenCalled();
    const { getSyncMeta } = await import("./sync-meta");
    expect(getSyncMeta("d1")?.rev).toBe(3);
  });

  it("re-applies its edits on top when only the review status moved elsewhere, never reverting it", async () => {
    const base = makeDraft("d1", "<p>Base</p>");
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(1));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts } = await setup([base]);
    await mod.syncDraft("d1");

    // Another device approved revision 1 (now 2); we edited the letter.
    drafts.d1 = makeDraft("d1", "<p>My edit</p>");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ current: remoteOf(base, 2, { reviewStatus: "changes_requested" }) }), { status: 409 }),
      )
      .mockResolvedValueOnce(ok(3));
    await mod.syncDraft("d1");
    expect(drafts.d1.reviewStatus).toBe("changes_requested");
    expect(drafts.d1.sections[0].html).toBe("<p>My edit</p>");

    await vi.advanceTimersByTimeAsync(450);
    const resent = postBodies(fetchMock)[2];
    expect(resent.baseRevision).toBe(2);
    expect(resent.reviewStatus).toBe("changes_requested");
    expect(resent.sections[0].html).toBe("<p>My edit</p>");
  });

  it("never carries an approval over to text that changed on another device first", async () => {
    const base = makeDraft("d1", "<p>Base</p>", { reviewStatus: "in_review" });
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(1));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts, toast } = await setup([base]);
    await mod.syncDraft("d1");

    // The reviewer approves what this device shows, while the drafter's edit
    // has already landed on the server (revision 2, still in review).
    vi.advanceTimersByTime(1_000);
    drafts.d1 = {
      ...drafts.d1,
      reviewStatus: "approved",
      approvals: [{ id: "apr1", reviewerName: "Rev", decision: "approved", createdAt: Date.now() }],
    };
    const theirs = makeDraft("x", "<p>Drafter edit</p>", { reviewStatus: "in_review" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ current: remoteOf(theirs, 2) }), { status: 409 }));
    await mod.syncDraft("d1");

    expect(drafts.d1.sections[0].html).toBe("<p>Drafter edit</p>");
    expect(drafts.d1.reviewStatus).toBe("in_review");
    expect(drafts.d1.approvals).toEqual([]);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(postBodies(fetchMock).some((b, i) => i > 1 && b.reviewStatus === "approved")).toBe(false);
  });

  it("keeps both versions when both devices changed the letter", async () => {
    const base = makeDraft("d1", "<p>Base</p>");
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(1));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts, toast } = await setup([base]);
    await mod.syncDraft("d1");

    drafts.d1 = makeDraft("d1", "<p>Mine</p>");
    const theirs = makeDraft("x", "<p>Theirs</p>", { reviewStatus: "approved" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ current: remoteOf(theirs, 4) }), { status: 409 }));
    await mod.syncDraft("d1");

    expect(drafts.d1.sections[0].html).toBe("<p>Theirs</p>");
    expect(drafts.d1.reviewStatus).toBe("approved");
    expect(drafts.d1_copy.sections[0].html).toBe("<p>Mine</p>");
    expect(drafts.d1_copy.localOnly).toBe(true);
    expect(toast.warning).toHaveBeenCalledTimes(1);

    // The conflicted copy is never synced (it would be a create, and could
    // spend a letter credit).
    fetchMock.mockClear();
    await mod.syncDraft("d1_copy");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("remote deletes", () => {
  it("removes the local copy when the server says the draft was deleted", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(1));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts } = await setup([makeDraft("d1")]);
    await mod.syncDraft("d1");

    // Pretend the content was synced and only the extras changed; the extras
    // endpoint answers 410 because another device deleted the draft.
    drafts.d1 = { ...drafts.d1, timeline: [{ id: "e1", kind: "created", title: "x", createdAt: 1 }] };
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 410 }));
    await mod.syncDraft("d1");
    expect(drafts.d1).toBeUndefined();
  });

  it("keeps unsynced edits on this device only instead of discarding them", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(1));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts, toast } = await setup([makeDraft("d1")]);
    await mod.syncDraft("d1");

    drafts.d1 = makeDraft("d1", "<p>Unsynced</p>");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 410 }));
    await mod.syncDraft("d1");
    expect(drafts.d1.localOnly).toBe(true);
    expect(toast.warning).toHaveBeenCalled();
  });
});

describe("retries and failure messages", () => {
  it("retries a 429, honouring Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "7" } }))
      .mockResolvedValueOnce(ok(1));
    vi.stubGlobal("fetch", fetchMock);
    const { mod } = await setup([makeDraft("d1")]);
    const sleeps: number[] = [];
    mod._setSleepForTests(async (ms) => {
      sleeps.push(ms);
    });

    await mod.syncDraft("d1");
    expect(sleeps).toEqual([7000]);
    expect(postBodies(fetchMock)).toHaveLength(2);
    expect(mod._hasSynced("d1")).toBe(true);
  });

  it("computes backoff from an HTTP date or falls back to exponential", async () => {
    const { retryDelayMs } = await import("./dual-write");
    const h = (v?: string) => ({ headers: new Headers(v ? { "Retry-After": v } : {}) });
    expect(retryDelayMs(h(), 0)).toBe(1000);
    expect(retryDelayMs(h(), 3)).toBe(8000);
    expect(retryDelayMs(h("120"), 0)).toBe(60_000);
    expect(retryDelayMs(h(new Date(Date.now() + 5000).toUTCString()), 0)).toBeGreaterThan(3000);
  });

  it("tells the user once when the server refuses with 403", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, toast } = await setup([makeDraft("d1"), makeDraft("d2")]);
    await mod.syncDraft("d1");
    await mod.syncDraft("d2");
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/can't be saved/i);
  });

  it("surfaces persistent failures and keeps retrying on its own", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { mod, toast } = await setup([makeDraft("d1")]);

    await mod.syncDraft("d1");
    expect(postBodies(fetchMock)).toHaveLength(1);
    // The automatic retry fires without any further edit.
    await vi.advanceTimersByTimeAsync(30_000 + 450);
    await vi.advanceTimersByTimeAsync(60_000 + 450);
    expect(postBodies(fetchMock)).toHaveLength(3);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/aren't syncing/i);
  });
});

describe("collaboration extras", () => {
  it("pushes extras only when they change and adopts the server's merged result", async () => {
    const comment = { id: "c1", sectionId: "sec_1", authorId: "me", authorName: "Me", body: "Hi", createdAt: 5, updatedAt: 5 };
    const teammate = { id: "c2", sectionId: "sec_1", authorId: "me", authorUserId: "u2", authorName: "Sam", body: "Yo", createdAt: 6, updatedAt: 6 };
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/store/draft-extras"
        ? new Response(JSON.stringify({ ok: true, extras: { comments: [comment, teammate] } }), { status: 200 })
        : ok(1),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { mod, drafts } = await setup([makeDraft("d1", "<p>Hi</p>", { comments: [comment] } as Partial<Draft>)]);

    await mod.syncDraft("d1");
    expect(postBodies(fetchMock as never, "/api/store/draft-extras")).toHaveLength(1);
    expect(drafts.d1.comments?.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(drafts.d1.comments?.[1].authorName).toBe("Sam");

    // Nothing changed since: no second extras push.
    fetchMock.mockClear();
    drafts.d1 = { ...drafts.d1 };
    await mod.syncDraft("d1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
