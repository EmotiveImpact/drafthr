import { describe, expect, it } from "vitest";
import type { RuleContext, RuleId, RuleInput } from "../types.js";
import { runRule } from "./index.js";

const us = (state: string): RuleContext => ({ jurisdiction: { country: "us", state }, today: "2026-11-09" });
const IL = us("IL");
const CA = us("CA");
const TX = us("TX");
const NY = us("NY");
const FL = us("FL");
const OH = us("OH");
const UK: RuleContext = { jurisdiction: { country: "uk", nation: "england-wales" }, today: "2026-11-09" };

const run = (id: RuleId, input: RuleInput, ctx: RuleContext) => runRule(id, input, ctx);

describe("us.eeocCharge", () => {
  it("moves 180 and 300 days past weekends and Labor Day, and gives Illinois 300 days for age (disciplinary story 5)", () => {
    const r = run("us.eeocCharge", { actDate: "2026-11-09", deferralState: true, basis: "age" }, IL);
    expect(r.detail).toEqual({ day180: "2027-05-10", day300: "2027-09-07", noRoute: false });
    expect(r.date).toBe("2027-09-07");
    expect(r.sources).toEqual(["EEOC, Time limits for filing a charge", "29 USC 626(d)(1)", "29 USC 630(b)", "29 CFR 1601.74"]);
  });

  it("keeps age at 180 days, flagged, where the state's own law is not known", () => {
    const r = run("us.eeocCharge", { actDate: "2026-11-09", deferralState: true, basis: "age" }, OH);
    // Age gets 300 days only under a state law, which is not confirmed for Ohio.
    expect(r.date).toBe("2027-05-10");
    expect(r.toVerify?.some((t) => t.includes("7 September 2027"))).toBe(true);
  });

  it("uses 300 days where a state agency covers the basis (grievance T5)", () => {
    const r = run("us.eeocCharge", { actDate: "2026-11-06", deferralState: true, basis: "national_origin" }, CA);
    expect(r.date).toBe("2027-09-02");
    expect(r.detail?.day180).toBe("2027-05-05");
    expect(r.sources).toContain("42 USC 2000e-5(e)(1)");
  });

  it("uses 180 days, flagged, when the state agency is not known", () => {
    const unknown = run("us.eeocCharge", { actDate: "2026-11-09" }, OH);
    expect(unknown.date).toBe("2027-05-10");
    expect(unknown.toVerify?.some((t) => t.includes("Most states"))).toBe(true);
    const none = run("us.eeocCharge", { actDate: "2026-11-09", deferralState: false }, TX);
    expect(none.date).toBe("2027-05-10");
    expect(none.toVerify?.some((t) => t.includes("Most states"))).toBe(false);
  });

  it("gives the five target states 300 days from the state input or the case", () => {
    expect(run("us.eeocCharge", { actDate: "2026-11-09" }, TX).date).toBe("2027-09-07");
    expect(run("us.eeocCharge", { actDate: "2026-11-09", basis: "age" }, FL).date).toBe("2027-09-07");
    const named = run("us.eeocCharge", { actDate: "2026-11-09", state: "Illinois" }, OH);
    expect(named.date).toBe("2027-09-07");
    expect(named.basis).toContain("Illinois");
    expect(named.sources).toContain("29 CFR 1601.74");
    expect(run("us.eeocCharge", { actDate: "2026-11-09", state: ["NY", "IL"] }, OH).date).toBe("2027-09-07");
    expect(run("us.eeocCharge", { actDate: "2026-11-09", state: ["TX", "OH"] }, TX).date).toBe("2027-05-10");
  });

  it("has no EEOC route below 15 employees, or 20 for age", () => {
    const small = run("us.eeocCharge", { actDate: "2026-11-09", employerHeadcount: 14 }, CA);
    expect(small).toMatchObject({ date: null, detail: { noRoute: true } });
    expect(small.basis).toContain("15 or more");
    expect(run("us.eeocCharge", { actDate: "2026-11-09", basis: "age", employerHeadcount: "15 to 19" }, IL).detail?.noRoute).toBe(true);
    expect(run("us.eeocCharge", { actDate: "2026-11-09", employerHeadcount: "15 to 19" }, IL).date).toBe("2027-09-07");
    expect(run("us.eeocCharge", { actDate: "2026-11-09", employerHeadcount: "lots" }, IL).missing).toEqual(["employerHeadcount"]);
    const unknown = run("us.eeocCharge", { actDate: "2026-11-09" }, IL);
    expect(unknown.toVerify?.some((t) => t.includes("size was not given"))).toBe(true);
  });

  it("ends 30 days after notice that state proceedings ended, where that is earlier", () => {
    const early = run("us.eeocCharge", { actDate: "2026-11-09", stateAgencyEndDate: "2027-01-04" }, IL);
    expect(early.date).toBe("2027-02-03");
    expect(early.detail?.thirtyDaysAfterStateEnd).toBe("2027-02-03");
    const late = run("us.eeocCharge", { actDate: "2026-11-09", stateAgencyEndDate: "2027-09-01" }, IL);
    expect(late.date).toBe("2027-09-07");
    expect(run("us.eeocCharge", { actDate: "2026-11-09", stateAgencyEndDate: "2026-11-01" }, IL).missing).toEqual([
      "stateAgencyEndDate",
    ]);
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
    expect(r.toVerify).toHaveLength(2);
    expect(r.sources).toContain("Cal. Gov. Code 12960(e)(5)");
    expect(run("us.caCivilRights", { actDate: "2026-11-06" }, us("California")).date).toBe("2029-11-06");
    expect(run("us.caCivilRights", { actDate: "2028-02-29" }, CA).date).toBe("2031-02-28");
  });

  it("does not apply outside California", () => {
    expect(run("us.caCivilRights", { actDate: "2026-11-06" }, TX).notApplicable).toBeTruthy();
  });
});

describe("us.warnNotice", () => {
  const warn = (input: RuleInput) => run("us.warnNotice", { firstSeparationDate: "2027-01-08", ...input }, TX);

  it("is 60 calendar days before the first separation (redundancy T5)", () => {
    const r = warn({});
    expect(r.date).toBe("2026-11-09");
    expect(r.sources).toContain("20 CFR 639.5(a)");
    expect(r.detail).toMatchObject({ covered: null, triggered: null, applies: null });
    expect(r.toVerify?.some((t) => t.includes("could not be settled"))).toBe(true);
  });

  it("gives each later group its own 60 days (redundancy T5, R18)", () => {
    const r = warn({ separationDates: ["2027-02-26", "2027-02-01"] });
    expect(r.date).toBe("2026-11-09");
    expect(r.detail?.noticeDates).toEqual(["2026-11-09", "2026-12-03", "2026-12-28"]);
    expect(warn({ separationDates: "2026-12-20" }).date).toBe("2026-10-21");
    expect(warn({ separationDates: ["2027-02-30"] }).missing).toEqual(["separationDates"]);
  });

  it("finds a mass layoff by 90-day aggregation when remote staff count at the site (redundancy T5, R13)", () => {
    const r = warn({ employerFullTime: 195, siteFullTimeHeadcount: 195, siteLosses30: 55, siteLosses90: 67, closure: false });
    expect(r.detail).toMatchObject({ covered: true, triggered: true, aggregated: true, applies: true });
    expect(r.toVerify?.some((t) => t.includes("separate and distinct"))).toBe(true);
    expect(r.toVerify?.some((t) => t.includes("remote"))).toBe(true);
    const alone = warn({ employerFullTime: 195, siteFullTimeHeadcount: 166, siteLosses30: 55, siteLosses90: 67, closure: false });
    expect(alone.detail).toMatchObject({ triggered: true, aggregated: false, applies: true });
  });

  it("does not apply below the federal thresholds", () => {
    const small = warn({ employerFullTime: 80, employer4000Hours: false, siteLosses30: 60, siteLosses90: 60, closure: true });
    expect(small).toMatchObject({ date: null, detail: { covered: false, applies: false } });
    expect(warn({ employerFullTime: 80, employer4000Hours: true, siteLosses30: 50, siteLosses90: 50, closure: true }).detail?.applies).toBe(true);
    const few = warn({ employerFullTime: 300, siteFullTimeHeadcount: 400, siteLosses30: 40, siteLosses90: 45, closure: false });
    expect(few).toMatchObject({ date: null, detail: { covered: true, triggered: false, applies: false } });
    expect(warn({ employerFullTime: 300, siteLosses30: 500, siteLosses90: 500 }).detail?.triggered).toBe(true);
    // A site of unknown size: 50 to 499 losses may or may not be 33%.
    expect(warn({ employerFullTime: 300, siteLosses30: 60, siteLosses90: 60, closure: false }).detail?.triggered).toBeNull();
  });
});

describe("us.eeocSuitDeadline", () => {
  it("is 90 days from the notice", () => {
    const r = run("us.eeocSuitDeadline", { noticeDate: "2027-03-01" }, CA);
    expect(r.date).toBe("2027-05-30");
    expect(r.sources).toEqual(["42 USC 2000e-5(f)(1)"]);
    expect(r.toVerify).toHaveLength(2);
  });
});

describe("us.stateAgencyDeadline", () => {
  const agency = (input: RuleInput, ctx: RuleContext) => run("us.stateAgencyDeadline", { actDate: "2026-11-06", ...input }, ctx);

  it("gives California 3 years, from 5 employees or any size for harassment (grievance T5)", () => {
    const r = agency({}, CA);
    expect(r.date).toBe("2029-11-06");
    expect(r.sources).toContain("Cal. Gov. Code 12960(e)(5)");
    expect((r.detail?.traps as string[])[0]).toContain("right-to-sue");
    expect(agency({ employerHeadcount: 4 }, CA)).toMatchObject({ date: null, detail: { covered: false } });
    expect(agency({ employerHeadcount: 4, basis: "harassment" }, CA).date).toBe("2029-11-06");
  });

  it("gives New York 3 years for acts from 15 February 2024, any size", () => {
    expect(agency({ employerHeadcount: 2 }, NY).date).toBe("2029-11-06");
    const old = agency({ actDate: "2024-01-10" }, NY);
    expect(old.date).toBeNull();
    expect(old.toVerify?.some((t) => t.includes("before 15 February 2024"))).toBe(true);
  });

  it("gives Texas 180 days, or 300 for sexual harassment from 1 employee", () => {
    expect(agency({}, TX).date).toBe("2027-05-05");
    expect(agency({ basis: "sexual_harassment", employerHeadcount: 3 }, TX).date).toBe("2027-09-02");
    expect(agency({ employerHeadcount: "1 to 14" }, TX)).toMatchObject({ date: null, detail: { covered: false } });
  });

  it("gives Florida 365 days from 15 employees", () => {
    const r = agency({ employerHeadcount: 20 }, FL);
    expect(r.date).toBe("2027-11-06");
    expect((r.detail?.traps as string[]).some((t) => t.includes("35 days"))).toBe(true);
    expect(agency({ employerHeadcount: 14 }, FL).date).toBeNull();
  });

  it("gives Illinois 2 years from 1 January 2025, with the EEOC charge rule", () => {
    const r = agency({ actDate: "2026-11-09", eeocFiledDate: "2027-01-04" }, IL);
    expect(r.date).toBe("2028-11-09");
    expect(r.detail?.eeocChargeCounts).toBe(true);
    expect(r.basis).toContain("counts as filed");
    expect(agency({ actDate: "2026-11-09", eeocFiledDate: "2027-09-10" }, IL).detail?.eeocChargeCounts).toBe(false);
    const old = agency({ actDate: "2024-12-01" }, IL);
    expect(old.date).toBe("2025-09-27");
    expect(old.toVerify?.some((t) => t.includes("1 December 2026"))).toBe(true);
  });

  it("takes the state from the input, and refuses two target states", () => {
    expect(agency({ state: "texas" }, OH).date).toBe("2027-05-05");
    expect(agency({ state: ["TX", "OH"] }, OH).date).toBe("2027-05-05");
    expect(agency({ state: ["TX", "NY"] }, OH).missing).toEqual(["state"]);
    expect(agency({}, OH).notApplicable).toBeTruthy();
  });
});

describe("us.finalPay", () => {
  const pay = (separationType: string, ctx: RuleContext, nextPayday?: string) =>
    run("us.finalPay", { separationDate: "2027-01-08", separationType, nextPayday }, ctx);

  it("follows table T3 for each state", () => {
    expect(pay("discharge", CA).date).toBe("2027-01-08");
    const layoff = pay("layoff", CA);
    expect(layoff.date).toBe("2027-01-08");
    expect(layoff.toVerify).toHaveLength(1);
    expect(pay("quit_with_notice", CA).date).toBe("2027-01-08");
    expect(pay("quit_without_notice", CA).date).toBe("2027-01-11");
    expect(pay("layoff", NY, "2027-01-15").date).toBe("2027-01-15");
    expect(pay("layoff", TX).date).toBe("2027-01-14");
    expect(pay("quit_with_notice", TX, "2027-01-15").date).toBe("2027-01-15");
    expect(pay("discharge", IL, "2027-01-22").date).toBe("2027-01-22");
    expect(pay("layoff", FL)).toMatchObject({ date: null, sources: ["US DOL, Last paycheck"] });
  });

  it("asks for the next payday where the state uses it", () => {
    const r = pay("layoff", NY);
    expect(r.missing).toEqual(["nextPayday"]);
    expect(r.basis).toMatch(/^Needs nextPayday/);
    expect(pay("layoff", NY, "2027-01-01").missing).toEqual(["nextPayday"]);
    expect(pay("fired", CA).missing).toEqual(["separationType"]);
  });

  it("does not apply outside the five states", () => {
    expect(pay("layoff", OH).notApplicable).toBeTruthy();
  });
});

describe("us.separationNotice", () => {
  const notice = (ctx: RuleContext, separationType?: string) =>
    run("us.separationNotice", { separationDate: "2027-01-08", separationType }, ctx);

  it("follows table T4 for each state", () => {
    const ny = notice(NY);
    expect(ny.date).toBe("2027-01-08");
    expect(ny.detail?.writtenNoticeBy).toBe("2027-01-15");
    expect(ny.sources).toContain("NY Labor Law 195(6)");
    expect(notice(IL).date).toBe("2027-01-13");
    expect(notice(TX).date).toBe("2027-01-08");
    expect(notice(CA, "layoff").date).toBe("2027-01-08");
    expect(notice(CA, "quit_without_notice").date).toBeNull();
    const fl = notice(FL);
    expect(fl.date).toBeNull();
    expect(fl.toVerify).toHaveLength(1);
    expect(notice(OH).notApplicable).toBeTruthy();
  });
});

describe("us.stateWarnNotice", () => {
  const warn = (input: RuleInput, ctx: RuleContext) =>
    run("us.stateWarnNotice", { firstSeparationDate: "2027-01-08", ...input }, ctx);

  it("needs 90 days in New York from 50 full-time employees and 25 losses", () => {
    const r = warn({ stateHeadcount: 60, siteLosses30: 25, closure: true }, NY);
    expect(r.date).toBe("2026-10-10");
    expect(r.detail).toMatchObject({ covered: true, triggered: true, applies: true, noticeDays: 90 });
    expect(r.sources).toContain("NY Labor Law 860-b");
    expect(warn({ stateHeadcount: 40, siteLosses30: 25, closure: true }, NY)).toMatchObject({ date: null, detail: { covered: false, applies: false } });
  });

  it("adds up New York losses over 90 days, and cannot rule it out without them", () => {
    const r = warn({ stateHeadcount: 60, siteLosses30: 20, siteLosses90: 30, siteFullTimeHeadcount: 80, closure: false }, NY);
    expect(r.detail).toMatchObject({ triggered: true, aggregated: true, applies: true });
    const unknown = warn({ stateHeadcount: 60, siteLosses30: 20, closure: false }, NY);
    expect(unknown.date).toBe("2026-10-10");
    expect(unknown.detail?.applies).toBeNull();
    expect(warn({ stateHeadcount: 60, siteLosses30: 20, siteLosses90: 22, closure: false }, NY).date).toBeNull();
    expect(warn({ stateHeadcount: 60, siteLosses30: 5, siteLosses90: 5, closure: false, relocationMiles: 60 }, NY).detail?.triggered).toBe(true);
  });

  it("covers any California closure, and 50 laid off without a percentage", () => {
    expect(warn({ stateHeadcount: 80, siteLosses30: 50, closure: false }, CA)).toMatchObject({
      date: "2026-11-09",
      detail: { applies: true, noticeDays: 60 },
    });
    expect(warn({ stateHeadcount: 80, siteLosses30: 3, closure: true }, CA).detail?.triggered).toBe(true);
    expect(warn({ stateHeadcount: 80, siteLosses30: 3 }, CA).detail?.triggered).toBeNull();
    expect(warn({ stateHeadcount: 80, siteLosses30: 10, closure: false }, CA).date).toBeNull();
    expect(warn({ stateHeadcount: 80, siteLosses30: 10, closure: false, relocationMiles: 120 }, CA).detail?.triggered).toBe(true);
    const later = warn({ stateHeadcount: 80, siteLosses30: 30, siteLosses90: 60, closure: false }, CA);
    expect(later.detail?.triggered).toBeNull();
    expect(later.toVerify?.some((t) => t.includes("90 days was not checked"))).toBe(true);
  });

  it("uses 25 and 33%, or 250, in Illinois, with relocation open", () => {
    expect(warn({ stateHeadcount: 100, siteLosses30: 30, siteFullTimeHeadcount: 80, closure: false }, IL).detail?.applies).toBe(true);
    expect(warn({ stateHeadcount: 100, siteLosses30: 30, siteFullTimeHeadcount: 200, closure: false }, IL).date).toBeNull();
    const moved = warn({ stateHeadcount: 100, siteLosses30: 5, closure: false, relocationMiles: 80 }, IL);
    expect(moved.detail?.triggered).toBeNull();
    expect(moved.toVerify?.some((t) => t.includes("relocation"))).toBe(true);
  });

  it("does not apply in Texas or Florida, and refuses two of the three states", () => {
    expect(warn({ stateHeadcount: 300, siteLosses30: 60 }, TX).notApplicable).toBeTruthy();
    expect(warn({ stateHeadcount: 300, siteLosses30: 60 }, FL).toVerify).toHaveLength(1);
    expect(warn({ stateHeadcount: 300, siteLosses30: 60, state: ["CA", "NY"] }, TX).missing).toEqual(["state"]);
    expect(warn({ stateHeadcount: 300, siteLosses30: 60, state: ["TX", "NY"], closure: true }, TX).detail?.state).toBe("NY");
    expect(warn({ stateHeadcount: 300, siteLosses30: 60, siteLosses90: 50 }, NY).missing).toEqual(["siteLosses90"]);
  });
});

describe("us.nlrbChargeLimit", () => {
  it("is the same date six months on", () => {
    const r = run("us.nlrbChargeLimit", { actDate: "2026-11-06" }, CA);
    expect(r.date).toBe("2027-05-06");
    expect(r.sources).toEqual(["29 USC 160(b)"]);
    expect(run("us.nlrbChargeLimit", { actDate: "2026-08-31" }, CA).date).toBe("2027-02-28");
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
    expect(group.sources).toContain("29 CFR 1625.22(e)");
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
