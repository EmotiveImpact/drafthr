/**
 * Client-side dual-write hook tests. The module reads VITE_DRAFTHR_DUAL_WRITE
 * at import-time so we force-enable it via vi.stubEnv before importing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "./letters/types";

beforeEach(() => {
  vi.stubEnv("VITE_DRAFTHR_DUAL_WRITE", "true");
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeDraft(id: string): Draft {
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as Draft;
}

describe("dual-write enqueueSync", () => {
  it("collapses 3 rapid calls into a single fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("./dual-write");
    mod.setDualWriteSnapshotGetter(() => makeDraft("draft_1"));

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
    expect(body.id).toBe("draft_1");
    expect(body.sections).toHaveLength(1);
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
});
