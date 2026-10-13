import { describe, expect, it } from "vitest";
import type { RuleContext, RuleId, RuleInput } from "../types";
import { runRule } from "./index";

const us = (state: string): RuleContext => ({ jurisdiction: { country: "us", state }, today: "2026-11-09" });
const IL = us("IL");
const CA = us("CA");
const TX = us("TX");
const UK: RuleContext = { jurisdiction: { country: "uk", nation: "england-wales" }, today: "2026-11-09" };

const run = (id: RuleId, input: RuleInput, ctx: RuleContext) => runRule(id, input, ctx);

describe("us.eeocCharge", () => {
  it("moves 180 and 300 days past weekends and Labor Day (disciplinary story 5)", () => {
    const r = run("us.eeocCharge", { actDate: "2026-11-09", deferralState: true, basis: "age" }, IL);
    expect(r.detail).toEqual({ day180: "2027-05-10", day300: "2027-09-07" });
    // Age gets 300 days only under a state law, which is not confirmed yet.
    expect(r.date).toBe("2027-05-10");
    expect(r.toVerify?.some((t) => t.includes("7 September 2027"))).toBe(true);
    expect(r.sources).toContain("29 USC 626(d)");
  });

  it("uses 300 days where a state agency covers the basis (grievance T5)", () => {
    const r = run("us.eeocCharge", { actDate: "2026-11-06", deferralState: true, basis: "national_origin" }, CA);
    expect(r.date).toBe("2027-09-02");
    expect(r.detail?.day180).toBe("2027-05-05");
    expect(r.sources).toContain("42 USC 2000e-5(e)(1)");
  });

  it("uses 180 days, flagged, when the state agency is not known", () => {
    const unknown = run("us.eeocCharge", { actDate: "2026-11-09" }, TX);
    expect(unknown.date).toBe("2027-05-10");
    expect(unknown.toVerify?.some((t) => t.includes("Most states"))).toBe(true);
    const none = run("us.eeocCharge", { actDate: "2026-11-09", deferralState: false }, TX);
    expect(none.date).toBe("2027-05-10");
    expect(none.toVerify?.some((t) => t.includes("Most states"))).toBe(false);
  });

  it("flags deadlines beyond the holiday table", () => {
    const r = run("us.eeocCharge", { actDate: "2027-12-01", deferralState: true }, CA);
    expect(r.toVerify?.some((t) => t.includes("2025 to 2027"))).toBe(true);
  });

  it("asks again for an invalid date or flag", () => {
    expect(run("us.eeocCharge", { actDate: "11/09/2026" }, IL).missing).toEqual(["actDate"]);
    expect(run("us.eeocCharge", { actDate: "2026-11-09", deferralState: "yes" }, IL).missing).toEqual(["deferralState"]);
  });
});

describe("us.caCivilRights", () => {
  it("gives three years from the last harm (grievance T5)", () => {
    const r = run("us.caCivilRights", { actDate: "2026-11-06" }, CA);
    expect(r.date).toBe("2029-11-06");
    expect(r.toVerify).toHaveLength(1);
    expect(run("us.caCivilRights", { actDate: "2026-11-06" }, us("California")).date).toBe("2029-11-06");
    expect(run("us.caCivilRights", { actDate: "2028-02-29" }, CA).date).toBe("2031-02-28");
  });

  it("does not apply outside California", () => {
    expect(run("us.caCivilRights", { actDate: "2026-11-06" }, TX).notApplicable).toBeTruthy();
  });
});

describe("us.warnNotice", () => {
  it("is 60 calendar days before the first separation (redundancy T5)", () => {
    const r = run("us.warnNotice", { firstSeparationDate: "2027-01-08" }, TX);
    expect(r.date).toBe("2026-11-09");
    expect(r.sources).toContain("20 CFR 639.5(a)");
  });
});

describe("us.owbpa", () => {
  it("gives 21 days, or 45 for a group programme, and 7 to revoke", () => {
    expect(run("us.owbpa", { agreementGivenDate: "2026-11-02" }, TX)).toMatchObject({
      date: "2026-11-23",
      detail: { considerationDays: 21 },
    });
    const group = run("us.owbpa", { agreementGivenDate: "2026-11-02", groupProgramme: true, signedDate: "2026-11-20" }, TX);
    expect(group.date).toBe("2026-12-17");
    expect(group.detail).toEqual({ considerationDays: 45, revocationEnd: "2026-11-27" });
    expect(group.toVerify).toBeUndefined();
  });

  it("refuses a signing date before the agreement was given", () => {
    expect(run("us.owbpa", { agreementGivenDate: "2026-11-02", signedDate: "2026-11-01" }, TX).missing).toEqual([
      "signedDate",
    ]);
  });
});

describe("US rules on a UK case", () => {
  it("are not applicable", () => {
    const r = run("us.warnNotice", { firstSeparationDate: "2027-01-08" }, UK);
    expect(r).toMatchObject({ date: null, notApplicable: "This is a US rule and the case is in the UK." });
  });
});
