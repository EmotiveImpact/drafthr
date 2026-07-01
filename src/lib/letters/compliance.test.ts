import { describe, it, expect } from "vitest";
import { rulesFor, ruleMatches } from "./compliance";

describe("compliance rules", () => {
  it("returns at-will rule for US offers but not UK offers", () => {
    const us = rulesFor("offer", "US");
    const uk = rulesFor("offer", "UK");
    expect(us.find((r) => r.id === "us_offer_at_will")).toBeDefined();
    expect(uk.find((r) => r.id === "us_offer_at_will")).toBeUndefined();
  });

  it("scopes pay-transparency rule to listed states only", () => {
    const ca = rulesFor("offer", "US", "CA");
    const tx = rulesFor("offer", "US", "TX");
    expect(ca.find((r) => r.id === "us_ca_pay_range")).toBeDefined();
    expect(tx.find((r) => r.id === "us_ca_pay_range")).toBeUndefined();
  });

  it("matches the at-will rule against text containing 'at-will'", () => {
    const r = rulesFor("offer", "US").find((x) => x.id === "us_offer_at_will")!;
    expect(ruleMatches(r, "Your employment will be at-will.")).toBe(true);
    expect(ruleMatches(r, "Your employment is permanent.")).toBe(false);
  });

  it("ACAS appeal rule fires on UK termination", () => {
    const rs = rulesFor("termination", "UK");
    const appeal = rs.find((r) => r.id === "uk_termination_appeal");
    expect(appeal).toBeDefined();
    expect(ruleMatches(appeal!, "You have the right of appeal against this dismissal.")).toBe(true);
  });

  it("COBRA rule matches case-insensitively (not just uppercase)", () => {
    const cobra = rulesFor("termination", "US").find((r) => r.id === "us_termination_cobra")!;
    expect(cobra).toBeDefined();
    expect(ruleMatches(cobra, "You may elect COBRA continuation coverage.")).toBe(true);
    // The bug: a lowercase / mixed-case reference must still satisfy the rule.
    expect(ruleMatches(cobra, "You may elect Cobra continuation coverage.")).toBe(true);
    expect(ruleMatches(cobra, "continuation coverage under cobra is available.")).toBe(true);
  });
});
