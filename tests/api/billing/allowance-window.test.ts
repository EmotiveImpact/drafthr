import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../../src/db/index.js", () => ({ getDb: () => ({}) }));
const { addMonthsUtc, allowanceWindow, isAnnualSubscription, planOf } = await import(
  "../../../api/_utils/entitlements.js"
);

const at = (iso: string) => new Date(iso);

describe("addMonthsUtc", () => {
  it("clamps to the last day of a shorter month", () => {
    expect(addMonthsUtc(at("2026-01-31T09:00:00Z"), 1).toISOString()).toBe("2026-02-28T09:00:00.000Z");
    expect(addMonthsUtc(at("2026-01-31T09:00:00Z"), 2).toISOString()).toBe("2026-03-31T09:00:00.000Z");
    expect(addMonthsUtc(at("2026-11-15T00:00:00Z"), 3).toISOString()).toBe("2027-02-15T00:00:00.000Z");
  });
});

describe("allowanceWindow — monthly allowances on annual plans", () => {
  const start = at("2026-01-31T09:00:00Z");
  const end = at("2027-01-31T09:00:00Z");

  it("is the whole billing period on a monthly plan", () => {
    const s = at("2026-03-05T00:00:00Z");
    const e = at("2026-04-05T00:00:00Z");
    expect(allowanceWindow(s, e, false, at("2026-03-20T00:00:00Z").getTime())).toEqual({ start: s, end: e });
  });

  it("is the first month at the start of an annual period", () => {
    const w = allowanceWindow(start, end, true, at("2026-02-10T00:00:00Z").getTime());
    expect(w.start).toEqual(start);
    expect(w.end.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  });

  it("moves on each monthly anniversary of the period start", () => {
    const w = allowanceWindow(start, end, true, at("2026-03-15T00:00:00Z").getTime());
    expect(w.start.toISOString()).toBe("2026-02-28T09:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-03-31T09:00:00.000Z");
  });

  it("ends the last month at the period end", () => {
    const w = allowanceWindow(start, end, true, at("2027-01-20T00:00:00Z").getTime());
    expect(w.start.toISOString()).toBe("2026-12-31T09:00:00.000Z");
    expect(w.end).toEqual(end);
  });
});

describe("isAnnualSubscription", () => {
  afterEach(() => {
    delete process.env.STRIPE_PRICE_SUB_PRO_ANNUAL;
    delete process.env.STRIPE_PRICE_SUB_PRO_MONTHLY;
  });
  const month = { currentPeriodStart: at("2026-01-01"), currentPeriodEnd: at("2026-02-01") };
  const year = { currentPeriodStart: at("2026-01-01"), currentPeriodEnd: at("2027-01-01") };

  it("reads the interval from the catalogue's annual prices", () => {
    process.env.STRIPE_PRICE_SUB_PRO_ANNUAL = "price_pro_annual";
    process.env.STRIPE_PRICE_SUB_PRO_MONTHLY = "price_pro_monthly";
    expect(isAnnualSubscription({ stripePriceId: "price_pro_annual", ...month })).toBe(true);
    expect(isAnnualSubscription({ stripePriceId: "price_pro_monthly", ...year })).toBe(false);
  });

  it("falls back to the period length for a price it doesn't know", () => {
    expect(isAnnualSubscription({ stripePriceId: "price_other", ...year })).toBe(true);
    expect(isAnnualSubscription({ stripePriceId: "price_other", ...month })).toBe(false);
  });
});

describe("planOf — the live price decides the plan", () => {
  afterEach(() => {
    delete process.env.STRIPE_PRICE_SUB_BUSINESS_MONTHLY;
  });
  it("prefers the price mapping over the stored (checkout) plan", () => {
    process.env.STRIPE_PRICE_SUB_BUSINESS_MONTHLY = "price_biz";
    expect(planOf({ stripePriceId: "price_biz", plan: "starter" })).toBe("business");
  });
  it("keeps the stored plan for a price this environment doesn't know", () => {
    expect(planOf({ stripePriceId: "price_unknown", plan: "pro" })).toBe("pro");
  });
});
