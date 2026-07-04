import { describe, it, expect } from "vitest";
import { creditsPerCycleForPlan } from "../../../src/lib/billing/catalog.js";
import { dripPlanCredits } from "../../../api/marketplace/_handlers/billing-webhook.js";

describe("creditsPerCycleForPlan — plan → per-cycle drip", () => {
  it("returns the plan's included per-cycle credits", () => {
    expect(creditsPerCycleForPlan("pro")).toBe(20);
    expect(creditsPerCycleForPlan("business")).toBe(20);
    expect(creditsPerCycleForPlan("employee_plus")).toBe(10);
  });

  it("returns 0 for plans with no drip and unknown plans", () => {
    expect(creditsPerCycleForPlan("starter")).toBe(0);
    expect(creditsPerCycleForPlan("nonsense")).toBe(0);
    expect(creditsPerCycleForPlan("")).toBe(0);
  });
});

describe("dripPlanCredits — grants only for a dripping plan in a usable status", () => {
  it("grants the per-cycle amount when active or trialing", () => {
    expect(dripPlanCredits("pro", "active")).toBe(20);
    expect(dripPlanCredits("business", "trialing")).toBe(20);
    expect(dripPlanCredits("employee_plus", "active")).toBe(10);
  });

  it("grants nothing for a non-usable status even on a dripping plan", () => {
    expect(dripPlanCredits("pro", "past_due")).toBe(0);
    expect(dripPlanCredits("pro", "incomplete")).toBe(0);
    expect(dripPlanCredits("pro", "canceled")).toBe(0);
  });

  it("grants nothing for a plan with no drip, even when active", () => {
    expect(dripPlanCredits("starter", "active")).toBe(0);
    expect(dripPlanCredits("unknown", "active")).toBe(0);
  });
});
