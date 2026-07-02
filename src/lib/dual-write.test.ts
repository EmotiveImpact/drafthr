/**
 * Client-side dual-write hook tests. The module reads VITE_DRAFTHR_DUAL_WRITE
 * at import-time so we force-enable it via vi.stubEnv before importing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "./letters/types";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

beforeEach(() => {
  vi.stubEnv("VITE_DRAFTHR_DUAL_WRITE", "true");
  vi.useFakeTimers();
  vi.resetModules();
  // The sonner mock's toast.error is a module-level vi.fn shared across
  // tests; clear its call history so per-test toast assertions don't see
  // calls leaked from earlier tests.
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeDraft(id: string, updatedAt = Date.now()): Draft {
  return {
    id,
    mode: "employer",
    letterType: "termination" as Draft["letterType"],
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "termination" as Draft["letterType"],
      effectiveDate: "",
      issueDate: "2026-01-01",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "private_and_confidential",
      counselReviewRequired: false,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    },
    employer: {
      legalName: "Acme",
      address: "",
      hasLetterhead: false,
      signatoryName: "",
      signatoryTitle: "",
    },
    employee: {
      legalName: "Jane",
      jobTitle: "Eng",
      address: "",
      startDate: "",
      serviceMonths: 0,
    },
    answers: {},
    sections: [
      { id: "sec_1", sectionId: "intro", title: "Intro", html: "<p>Hi</p>", required: true, status: "ready", versions: [] },
    ],
    createdAt: updatedAt,
    updatedAt,
  } as unknown as Draft;
}

describe("dual-write enqueueSync", () => {
  it("collapses 3 rapid calls into a single fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./dual-write");
    const draft = makeDraft("draft_1", 1_768_000_000_000);
    mod.setDualWriteSnapshotGetter(() => draft);

    mod.enqueueSync("draft_1");
    mod.enqueueSync("draft_1");
    mod.enqueueSync("draft_1");

    expect(fetchMock).not.toHaveBeenCalled();

    // Advance past the debounce window.
    await vi.advanceTimersByTimeAsync(450);
    // Allow the queued microtasks to drain.
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/store/drafts");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.id).not.toBe("draft_1");
    expect(body.clientRevision).toBe(draft.updatedAt);
    expect(body.sections).toHaveLength(1);
  });

  it("does not send local-only matter or template ids to uuid-backed references", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./dual-write");
    const draft = {
      ...makeDraft("draft_with_refs"),
      matterId: "matter_local_1",
      templateSourceId: "tpl_local_1",
    };
    mod.setDualWriteSnapshotGetter(() => draft);

    await mod.syncDraft("draft_with_refs");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.matterId).toBeNull();
    expect(body.templateSourceId).toBeNull();
  });

  it("mirrors a draft's matter BEFORE the draft, then links the matter UUID", async () => {
    const matterUuid = "11111111-1111-4111-8111-111111111111";
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init;
      if (url === "/api/store/matters") {
        return new Response(JSON.stringify({ ok: true, id: matterUuid, created: true }), { status: 201 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./dual-write");
    const draft = { ...makeDraft("draft_m"), matterId: "matter_local_1" };
    const matter = {
      id: "matter_local_1",
      name: "Acme grievance",
      mode: "employer",
      status: "active",
      color: "red",
      counselReviewed: false,
      createdAt: 1,
      updatedAt: 2,
    };
    mod.setDualWriteSnapshotGetter(() => draft);
    mod.setDualWriteMatterGetter(() => matter as never);

    await mod.syncDraft("draft_m");

    // Matter pushed first, draft second.
    const matterCall = fetchMock.mock.calls[0]!;
    const draftCall = fetchMock.mock.calls[1]!;
    expect(matterCall[0]).toBe("/api/store/matters");
    expect(draftCall[0]).toBe("/api/store/drafts");
    const matterBody = JSON.parse(matterCall[1]!.body as string);
    expect(matterBody.id).toBe("matter_local_1");
    expect(matterBody.name).toBe("Acme grievance");
    // The draft links the server matter UUID, not null.
    const draftBody = JSON.parse(draftCall[1]!.body as string);
    expect(draftBody.matterId).toBe(matterUuid);
  });

  it("falls back to matterId:null when the matter sync fails (no 409 regression)", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init;
      if (url === "/api/store/matters") return new Response("", { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const mod = await import("./dual-write");
    const draft = { ...makeDraft("draft_mf"), matterId: "matter_local_1" };
    const matter = { id: "matter_local_1", name: "X", mode: "employer", status: "active", counselReviewed: false, createdAt: 1, updatedAt: 2 };
    mod.setDualWriteSnapshotGetter(() => draft);
    mod.setDualWriteMatterGetter(() => matter as never);

    await mod.syncDraft("draft_mf");

    // Draft still synced, but unfiled — never sends a bad matterId.
    const draftBody = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    expect(draftBody.matterId).toBeNull();
  });

  it("is a no-op when the flag is off", async () => {
    vi.stubEnv("VITE_DRAFTHR_DUAL_WRITE", "false");
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./dual-write");
    mod.setDualWriteSnapshotGetter(() => makeDraft("draft_2"));
    mod.enqueueSync("draft_2");
    await vi.advanceTimersByTimeAsync(450);
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.isDualWriteEnabled()).toBe(false);
  });

  it("syncAllPending posts one request per draft with no _syncedAt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./dual-write");
    const result = await mod.syncAllPending(() => [makeDraft("a"), makeDraft("b"), makeDraft("c")]);
    expect(result).toEqual({ ok: 3, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a stale snapshot until a newer revision exists", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "stale revision" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./dual-write");
    let draft = makeDraft("stale_1", 100);
    mod.setDualWriteSnapshotGetter(() => draft);

    await mod.syncDraft("stale_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[dual-write] stale snapshot skipped", "stale_1", 409);

    mod.enqueueSync("stale_1");
    await vi.advanceTimersByTimeAsync(450);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    draft = makeDraft("stale_1", 101);
    mod.enqueueSync("stale_1");
    await vi.advanceTimersByTimeAsync(450);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows one toast after repeated server-ahead 409 conflicts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "stale revision" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    const { toast } = await import("sonner");
    const mod = await import("./dual-write");

    // Each conflict needs a strictly-newer revision so isStaleSnapshot
    // doesn't short-circuit the next sync (mirrors real sequential edits
    // racing a server copy that's always one ahead).
    let draft = makeDraft("conflict_1", 100);
    mod.setDualWriteSnapshotGetter(() => draft);

    for (let i = 1; i <= 4; i++) {
      draft = makeDraft("conflict_1", 100 + i);
      await mod.syncDraft("conflict_1");
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalled();
    // 3 conflicts tolerated silently; the 4th trips exactly one toast.
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect((toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/aren't syncing/i);
  });

  it("undeleteDraft clears the tombstone so a restored draft re-syncs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./dual-write");
    const draft = makeDraft("undel_1", 1_768_000_000_000);
    mod.setDualWriteSnapshotGetter(() => draft);

    // Delete tombstones the id — a subsequent sync is dropped by the guard.
    await mod.deleteDraftRemotely("undel_1");
    fetchMock.mockClear();
    await mod.syncDraft("undel_1");
    expect(fetchMock).not.toHaveBeenCalled();

    // Undo path: clear the tombstone and re-mirror.
    mod.undeleteDraft("undel_1");
    await Promise.resolve();
    await Promise.resolve();

    // syncDraft now fires the upsert POST for the restored draft.
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/store/drafts");
    expect(init.method).toBe("POST");

    // And a later ordinary sync is no longer dropped.
    fetchMock.mockClear();
    await mod.syncDraft("undel_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("logs failed deletes and shows one toast after consecutive failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { toast } = await import("sonner");
    const mod = await import("./dual-write");

    await mod.deleteDraftRemotely("delete_1");
    await mod.deleteDraftRemotely("delete_2");
    await mod.deleteDraftRemotely("delete_3");
    await mod.deleteDraftRemotely("delete_4");
    await mod.deleteDraftRemotely("delete_5");

    expect(warn).toHaveBeenCalledTimes(5);
    const deleteBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(deleteBody.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(deleteBody.id).not.toBe("delete_1");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
