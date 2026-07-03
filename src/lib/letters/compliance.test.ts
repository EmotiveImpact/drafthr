import { describe, it, expect } from "vitest";
import { rulesFor, ruleMatches, ruleSatisfied } from "./compliance";

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

  it("ruleSatisfied inverts warn rules: a present non-compete is NOT satisfied", () => {
    const noncompete = rulesFor("offer", "US", "CA").find((r) => r.id === "us_ca_no_noncompete")!;
    expect(noncompete.severity).toBe("warn");
    // Letter contains a void non-compete -> matched, but that's the PROBLEM,
    // so the rule is not satisfied (must be flagged, not ticked off).
    const withClause = "You agree to a non-compete for 12 months after termination.";
    expect(ruleMatches(noncompete, withClause)).toBe(true);
    expect(ruleSatisfied(noncompete, withClause)).toBe(false);
    // Compliant letter (no non-compete) -> satisfied.
    const clean = "Confidentiality and non-solicitation obligations apply.";
    expect(ruleMatches(noncompete, clean)).toBe(false);
    expect(ruleSatisfied(noncompete, clean)).toBe(true);
  });

  it("ruleSatisfied leaves normal rules unchanged (satisfied === matched)", () => {
    const rtw = rulesFor("offer", "UK").find((r) => r.id === "uk_offer_rtw")!;
    expect(rtw.severity).not.toBe("warn");
    expect(ruleSatisfied(rtw, "This offer is conditional on your right to work in the UK.")).toBe(true);
    expect(ruleSatisfied(rtw, "Welcome to the team.")).toBe(false);
  });
});
