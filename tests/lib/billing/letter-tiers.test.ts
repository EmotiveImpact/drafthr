import { describe, it, expect } from "vitest";
import { LETTER_CATALOG } from "../../../src/lib/letters/catalog";
import {
  LETTER_TIER_BY_TYPE,
  letterPurchaseCovers,
  letterTierFor,
  pickLetterPurchase,
} from "../../../src/lib/billing/letter-tiers";
import { CATALOG } from "../../../src/lib/billing/catalog";

describe("letter tiers", () => {
  it("gives every letter type in the catalogue a tier", () => {
    const missing = LETTER_CATALOG.map((l) => l.id).filter((id) => !(id in LETTER_TIER_BY_TYPE));
    expect(missing).toEqual([]);
  });

  it("has a single-letter SKU for every tier", () => {
    const kinds = Object.values(CATALOG)
      .filter((e) => e.kind === "letter")
      .map((e) => e.purchaseKind);
    for (const tier of new Set(Object.values(LETTER_TIER_BY_TYPE))) {
      expect(kinds).toContain(`letter_${tier}`);
    }
  });

  it("treats an unknown letter type as the top tier", () => {
    expect(letterTierFor("not_a_letter")).toBe("tribunal");
    expect(letterTierFor(null)).toBe("tribunal");
    expect(letterTierFor("constructor")).toBe("tribunal");
  });

  it("a routine purchase can't unlock a tribunal-bound letter", () => {
    expect(letterPurchaseCovers("letter_routine", "tribunal_cover")).toBe(false);
    expect(letterPurchaseCovers("letter_routine", "grievance")).toBe(false);
    expect(letterPurchaseCovers("letter_routine", "resignation_clean")).toBe(true);
  });

  it("a higher tier covers a cheaper letter", () => {
    expect(letterPurchaseCovers("letter_tribunal", "resignation_clean")).toBe(true);
    expect(letterPurchaseCovers("letter_high", "settlement_counter_offer")).toBe(true);
    expect(letterPurchaseCovers("letter_high", "tribunal_cover")).toBe(false);
  });

  it("ignores packs and unknown kinds", () => {
    expect(letterPurchaseCovers("pack_grievance", "grievance")).toBe(false);
    expect(letterPurchaseCovers("letter_bogus", "resignation_clean")).toBe(false);
  });

  it("spends the cheapest purchase that covers the letter", () => {
    const owned = [
      { id: "t", kind: "letter_tribunal" },
      { id: "r", kind: "letter_routine" },
      { id: "s", kind: "letter_standard" },
    ];
    expect(pickLetterPurchase(owned, "resignation_clean")?.id).toBe("r");
    expect(pickLetterPurchase(owned, "grievance")?.id).toBe("s");
    expect(pickLetterPurchase(owned, "tribunal_cover")?.id).toBe("t");
    expect(pickLetterPurchase([{ id: "r", kind: "letter_routine" }], "tribunal_cover")).toBeUndefined();
  });

  it("counts any letter purchase when no letter type is given (status preview)", () => {
    expect(pickLetterPurchase([{ id: "r", kind: "letter_routine" }])?.id).toBe("r");
  });
});
