import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stripPersistedImages,
  createQuotaSafeStorage,
  _resetQuotaToast,
  ASSUMED_QUOTA_BYTES,
  cancelPendingWrites,
  flushPendingWrites,
  getStorageHealth,
  hasUnpersistedWrites,
  subscribeStorageHealth,
} from "./quota-safe-storage";

function envelope(drafts: Record<string, unknown>): string {
  return JSON.stringify({ state: { drafts }, version: 0 });
}

describe("stripPersistedImages", () => {
  it("removes data: image URLs from answers, leaving employer copy intact", () => {
    const json = envelope({
      d1: {
        answers: {
          letterheadDataUrl: "data:image/png;base64,AAAA",
          signatureDataUrl: "data:image/png;base64,BBBB",
          employerLegalName: "Acme",
        },
        employer: { letterheadDataUrl: "data:image/png;base64,AAAA" },
      },
    });
    const out = JSON.parse(stripPersistedImages(json));
    expect(out.state.drafts.d1.answers.letterheadDataUrl).toBeUndefined();
    expect(out.state.drafts.d1.answers.signatureDataUrl).toBeUndefined();
    // Non-image answer fields survive.
    expect(out.state.drafts.d1.answers.employerLegalName).toBe("Acme");
    // The employer render-source copy is NOT touched.
    expect(out.state.drafts.d1.employer.letterheadDataUrl).toBe("data:image/png;base64,AAAA");
  });

  it("leaves non-data URLs (already migrated to CDN) in place", () => {
    const json = envelope({
      d1: { answers: { letterheadDataUrl: "https://cdn.example.com/lh.png" } },
    });
    const out = JSON.parse(stripPersistedImages(json));
    expect(out.state.drafts.d1.answers.letterheadDataUrl).toBe("https://cdn.example.com/lh.png");
  });

  it("returns the input unchanged when there's nothing to strip", () => {
    const json = envelope({ d1: { answers: { employerLegalName: "Acme" } } });
    expect(stripPersistedImages(json)).toBe(json);
  });

  it("fail-safe: returns input unchanged on malformed JSON or unexpected shape", () => {
    expect(stripPersistedImages("not json")).toBe("not json");
    expect(stripPersistedImages(JSON.stringify({ nope: true }))).toBe(
      JSON.stringify({ nope: true }),
    );
  });
});

describe("createQuotaSafeStorage", () => {
  beforeEach(() => _resetQuotaToast());

  it("strips images before writing to the backing store", () => {
    const setItem = vi.fn();
    const backing = { getItem: vi.fn(), setItem, removeItem: vi.fn() };
    const storage = createQuotaSafeStorage(backing, vi.fn());

    storage.setItem(
      "k",
      envelope({ d1: { answers: { letterheadDataUrl: "data:image/png;base64,AAAA" } } }),
    );

    const written = JSON.parse(setItem.mock.calls[0][1]);
    expect(written.state.drafts.d1.answers.letterheadDataUrl).toBeUndefined();
  });

  it("fires the quota callback exactly once on QuotaExceededError, never rethrows", () => {
    const onQuota = vi.fn();
    const setItem = vi.fn(() => {
      throw new DOMException("nope", "QuotaExceededError");
    });
    const backing = { getItem: vi.fn(), setItem, removeItem: vi.fn() };
    const storage = createQuotaSafeStorage(backing, onQuota);

    expect(() => storage.setItem("k", envelope({}))).not.toThrow();
    expect(() => storage.setItem("k", envelope({}))).not.toThrow();
    expect(onQuota).toHaveBeenCalledTimes(1); // de-duped
  });

  it("rethrows non-quota errors", () => {
    const setItem = vi.fn(() => {
      throw new Error("disk on fire");
    });
    const backing = { getItem: vi.fn(), setItem, removeItem: vi.fn() };
    const storage = createQuotaSafeStorage(backing, vi.fn());
    expect(() => storage.setItem("k", envelope({}))).toThrow("disk on fire");
  });
});

describe("createQuotaSafeStorage — throttled writes", () => {
  beforeEach(() => {
    _resetQuotaToast();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cancelPendingWrites();
    vi.useRealTimers();
  });

  it("writes the first change at once and coalesces a burst (streaming tokens) into one trailing write", () => {
    const setItem = vi.fn();
    const storage = createQuotaSafeStorage({ getItem: vi.fn(), setItem, removeItem: vi.fn() }, vi.fn(), {
      throttleMs: 500,
    });
    storage.setItem("k", envelope({ n: 0 }));
    expect(setItem).toHaveBeenCalledTimes(1);
    for (let i = 1; i <= 50; i++) storage.setItem("k", envelope({ n: i }));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(hasUnpersistedWrites()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(setItem.mock.calls[1][1]).state.drafts.n).toBe(50);
    expect(hasUnpersistedWrites()).toBe(false);
  });

  it("flushPendingWrites writes now; cancelPendingWrites drops the value (so a wipe stays wiped)", () => {
    const setItem = vi.fn();
    const storage = createQuotaSafeStorage({ getItem: vi.fn(), setItem, removeItem: vi.fn() }, vi.fn(), {
      throttleMs: 500,
    });
    storage.setItem("k", envelope({}));
    storage.setItem("k", envelope({ a: 1 }));
    flushPendingWrites();
    expect(setItem).toHaveBeenCalledTimes(2);
    storage.setItem("k", envelope({ b: 1 }));
    cancelPendingWrites();
    vi.advanceTimersByTime(1000);
    expect(setItem).toHaveBeenCalledTimes(2);
  });
});

describe("storage health (persistent quota banner)", () => {
  beforeEach(() => _resetQuotaToast());

  it("reports near-quota after a write and stays reported, not just once", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStorageHealth(listener);
    const storage = createQuotaSafeStorage({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }, vi.fn(), {
      estimateUsage: () => ASSUMED_QUOTA_BYTES * 0.9,
    });
    storage.setItem("k", envelope({}));
    storage.setItem("k", envelope({ x: 1 }));
    expect(getStorageHealth()).toMatchObject({ nearQuota: true, full: false });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("marks storage full on a quota error and clears it after a successful write", () => {
    let fail = true;
    const setItem = vi.fn(() => {
      if (fail) throw new DOMException("nope", "QuotaExceededError");
    });
    const storage = createQuotaSafeStorage({ getItem: vi.fn(), setItem, removeItem: vi.fn() }, vi.fn(), {
      estimateUsage: () => 1000,
    });
    storage.setItem("k", envelope({}));
    expect(getStorageHealth().full).toBe(true);
    expect(hasUnpersistedWrites()).toBe(true);
    fail = false;
    storage.setItem("k", envelope({}));
    expect(getStorageHealth()).toMatchObject({ full: false, nearQuota: false });
  });
});
