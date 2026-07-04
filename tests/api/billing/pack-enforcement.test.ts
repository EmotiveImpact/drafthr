import { describe, it, expect } from "vitest";
import { packLetterAllowance, pickUsablePack } from "../../../src/lib/billing/catalog.js";

describe("packLetterAllowance — pack kind → letter allowance", () => {
  it("returns the advertised allowance per pack", () => {
    expect(packLetterAllowance("pack_grievance")).toBe(4);
    expect(packLetterAllowance("pack_settlement")).toBe(6);
    expect(packLetterAllowance("pack_tribunal")).toBe(8);
  });

  it("returns 0 for non-pack and unknown kinds", () => {
    expect(packLetterAllowance("letter_routine")).toBe(0);
    expect(packLetterAllowance("credits_small")).toBe(0);
    expect(packLetterAllowance("nonsense")).toBe(0);
    expect(packLetterAllowance("")).toBe(0);
  });
});

describe("pickUsablePack — first pack with letters remaining", () => {
  it("returns a pack with remaining letters (total > used)", () => {
    const p = { lettersTotal: 4, lettersUsed: 1 };
    expect(pickUsablePack([p])).toBe(p);
  });

  it("skips an exhausted pack (total === used)", () => {
    expect(pickUsablePack([{ lettersTotal: 4, lettersUsed: 4 }])).toBeUndefined();
  });

  it("treats a legacy null-allowance pack as unusable", () => {
    expect(pickUsablePack([{ lettersTotal: null, lettersUsed: 0 }])).toBeUndefined();
  });

  it("picks the first pack that still has room when several exist", () => {
    const spent = { lettersTotal: 4, lettersUsed: 4 };
    const fresh = { lettersTotal: 8, lettersUsed: 2 };
    expect(pickUsablePack([spent, fresh])).toBe(fresh);
  });

  it("returns undefined when there are no packs at all", () => {
    expect(pickUsablePack([])).toBeUndefined();
  });
});
