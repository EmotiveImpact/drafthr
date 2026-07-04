import { describe, it, expect } from "vitest";
import { CATALOG, catalogFor, isPriceKey, stripePriceId } from "../../../src/lib/billing/catalog.js";

describe("billing catalog", () => {
  it("covers all 18 SKUs with correct modes and amounts", () => {
    expect(Object.keys(CATALOG).length).toBe(18);
    expect(catalogFor("sub_pro_monthly").mode).toBe("subscription");
    expect(catalogFor("sub_pro_monthly").plan).toBe("pro");
    expect(catalogFor("sub_pro_monthly").includedCreditsPerCycle).toBe(20);
    expect(catalogFor("letter_tribunal").mode).toBe("payment");
    expect(catalogFor("letter_tribunal").amountMinor).toBe(9900);
    expect(catalogFor("letter_tribunal").includedCredits).toBe(2);
    expect(catalogFor("credits_best").includedCredits).toBe(25);
  });

  it("every entry has a stripePriceIdEnv and a valid kind", () => {
    for (const [key, e] of Object.entries(CATALOG)) {
      expect(e.stripePriceIdEnv, key).toMatch(/^STRIPE_PRICE_/);
      expect(["plan", "letter", "pack", "credits"], key).toContain(e.kind);
      if (e.mode === "subscription") expect(e.plan, key).toBeTruthy();
      if (e.kind === "letter" || e.kind === "pack") expect(e.purchaseKind, key).toBeTruthy();
    }
  });

  it("isPriceKey guards unknown keys; stripePriceId reads env", () => {
    expect(isPriceKey("sub_pro_monthly")).toBe(true);
    expect(isPriceKey("nope")).toBe(false);
    const prev = process.env.STRIPE_PRICE_SUB_PRO_MONTHLY;
    process.env.STRIPE_PRICE_SUB_PRO_MONTHLY = "price_test_123";
    expect(stripePriceId("sub_pro_monthly")).toBe("price_test_123");
    if (prev === undefined) delete process.env.STRIPE_PRICE_SUB_PRO_MONTHLY;
    else process.env.STRIPE_PRICE_SUB_PRO_MONTHLY = prev;
  });
});
