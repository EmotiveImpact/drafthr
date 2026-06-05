import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  stripPersistedImages,
  createQuotaSafeStorage,
  _resetQuotaToast,
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
