import { describe, expect, it } from "vitest";
import type { RuleContext, RuleId, RuleInput, UkNation } from "../types";
import { lastDayOfMonthsBeginningWith } from "./calendar";
import { runRule } from "./index";
import { GB_SIX_MONTH_LIMIT_FROM } from "./uk";

const uk = (nation: UkNation): RuleContext => ({ jurisdiction: { country: "uk", nation }, today: "2026-10-13" });
const EW = uk("england-wales");
const SC = uk("scotland");
const NI = uk("northern-ireland");
const US: RuleContext = { jurisdiction: { country: "us", state: "CA" }, today: "2026-10-13" };

const run = (id: RuleId, input: RuleInput, ctx: RuleContext = EW) => runRule(id, input, ctx);
const limit = (claimType: string, relevantDate: string, ctx: RuleContext = EW) =>
  run("uk.tribunalTimeLimit", { claimType, relevantDate }, ctx);

describe("uk.tribunalTimeLimit", () => {
  // Ported from tribunal-limitation.test.ts: unfair dismissal and
  // discrimination must give exactly the dates the existing code gives.
  const refMonths = (act: string, nation: UkNation) =>
    nation === "northern-ireland" ? 3 : act >= GB_SIX_MONTH_LIMIT_FROM ? 6 : 3;

  it("switches Great Britain to six months for relevant dates on or after 1 October 2026", () => {
    expect(GB_SIX_MONTH_LIMIT_FROM).toBe("2026-10-01");
    expect(limit("unfair_dismissal", "2026-09-30", EW).detail?.months).toBe(3);
    expect(limit("unfair_dismissal", "2026-10-01", EW).detail?.months).toBe(6);
    expect(limit("unfair_dismissal", "2026-09-30", SC).detail?.months).toBe(3);
    expect(limit("unfair_dismissal", "2026-10-01", SC).detail?.months).toBe(6);
  });

  it("keeps Northern Ireland at three months either side of the change", () => {
    expect(limit("unfair_dismissal", "2026-09-30", NI).detail?.months).toBe(3);
    expect(limit("unfair_dismissal", "2026-10-01", NI).detail?.months).toBe(3);
    expect(limit("unfair_dismissal", "2028-01-01", NI).detail?.months).toBe(3);
  });

  it("gives the existing code's dates for unfair dismissal and discrimination", () => {
    const acts = ["2026-01-10", "2026-02-01", "2026-08-31", "2026-09-30", "2026-10-01", "2026-10-15", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-15", "2027-03-01", "2027-03-31", "2027-08-31", "2027-09-01", "2027-11-29"];
    for (const nation of ["england-wales", "scotland", "northern-ireland"] as const) {
      for (const act of acts) {
        const expected = lastDayOfMonthsBeginningWith(act, refMonths(act, nation));
        expect(limit("unfair_dismissal", act, uk(nation)).date).toBe(expected);
        expect(limit("discrimination", act, uk(nation)).date).toBe(expected);
      }
    }
  });

  it("gives 3 months less one day for the last day before the change", () => {
    const r = limit("unfair_dismissal", "2026-09-30", EW);
    expect(r.date).toBe("2026-12-29");
    expect(r.basis).toContain("3 months less one day");
    expect(r.basis).toContain("before 1 October 2026");
    expect(r.sources).toContain("SI 2026/954 reg 4");
  });

  it("gives 6 months less one day from 1 October 2026 in Great Britain", () => {
    const r = limit("unfair_dismissal", "2026-10-01", SC);
    expect(r.date).toBe("2027-03-31");
    expect(r.basis).toContain("6 months less one day");
    expect(r.basis).toContain("Employment Rights Act 2025");
    expect(r.basis).toContain("Acas early conciliation");
    expect(r.basis).not.toContain("Northern Ireland");
    expect(r.sources).toEqual(["ERA 1996 s111(2)", "ERA 2025 s152 and Sch 12", "SI 2026/954 reg 3, reg 4"]);
  });

  it("gives 3 months less one day in Northern Ireland after the change", () => {
    const r = limit("unfair_dismissal", "2026-10-01", NI);
    expect(r.date).toBe("2026-12-31");
    expect(r.basis).toContain("Northern Ireland");
    expect(r.basis).toContain("Labour Relations Agency");
    expect(r.basis).not.toContain("Acas");
    expect(r.sources).toEqual(["ERO 1996 Art 145(2)"]);
  });

  it("ignores a time suffix on the relevant date", () => {
    expect(limit("unfair_dismissal", "2026-10-01T09:30:00Z").date).toBe("2027-03-31");
  });

  it("asks again for an invalid date or claim type", () => {
    expect(limit("unfair_dismissal", "2026-02-31")).toMatchObject({ date: null, missing: ["relevantDate"] });
    expect(limit("unfair_dismissal", "")).toMatchObject({ date: null, missing: ["relevantDate"] });
    expect(limit("wrongful_thing", "2026-10-01")).toMatchObject({ date: null, missing: ["claimType"] });
  });

  it("never moves a weekend deadline, and says so", () => {
    // 6 months less one day from 2026-10-04 is Saturday 3 April 2027.
    const r = limit("unfair_dismissal", "2026-10-04");
    expect(r.date).toBe("2027-04-03");
    expect(r.toVerify?.some((t) => t.includes("weekend"))).toBe(true);
  });

  it("returns the drafts' story dates", () => {
    // Disciplinary story 1 (Scotland): discrimination and notice pay.
    expect(limit("discrimination", "2026-11-02", SC).date).toBe("2027-05-01");
    expect(limit("breach_of_contract", "2026-11-02", SC).date).toBe("2027-02-01");
    // Disciplinary stories 2, 3 and 4.
    expect(limit("discrimination", "2026-10-19", EW).date).toBe("2027-04-18");
    expect(limit("discrimination", "2026-11-27", NI).date).toBe("2027-02-26");
    expect(limit("discrimination", "2026-12-04", EW).date).toBe("2027-06-03");
    // Grievance T1 to T4.
    expect(limit("discrimination", "2026-09-22", EW).date).toBe("2026-12-21");
    expect(limit("discrimination", "2026-11-05", SC).date).toBe("2027-05-04");
    expect(limit("discrimination", "2026-10-14", NI).date).toBe("2027-01-13");
    expect(limit("deduction", "2026-09-25", EW).date).toBe("2026-12-24");
    expect(limit("deduction", "2026-10-23", EW).date).toBe("2027-04-22");
    // Redundancy T1 to T4.
    expect(limit("unfair_dismissal", "2027-01-29", EW).date).toBe("2027-07-28");
    expect(limit("redundancy_pay", "2027-01-29", EW).date).toBe("2027-07-28");
    expect(limit("protective_award", "2026-12-18", SC).date).toBe("2027-06-17");
    expect(limit("unfair_dismissal", "2026-12-18", SC).date).toBe("2027-06-17");
    expect(limit("unfair_dismissal", "2026-12-11", NI).date).toBe("2027-03-10");
    expect(limit("redundancy_pay", "2026-12-18", EW).date).toBe("2027-06-17");
  });

  it("moves breach of contract in Scotland only from 9 November 2026, flagged while the order is a draft", () => {
    expect(limit("breach_of_contract", "2026-11-08", SC).detail?.months).toBe(3);
    const scottish = limit("breach_of_contract", "2026-11-09", SC);
    expect(scottish.date).toBe("2027-05-08");
    expect(scottish.detail).toEqual({ months: 6, ifScottishOrderNotMade: "2027-02-08" });
    expect(scottish.toVerify?.some((t) => t.includes("still a draft") && t.includes("8 February 2027"))).toBe(true);
    expect(scottish.sources).toContain("ETEJ (Amendment) (Scotland) Order 2026 art 3 (draft)");
    expect(limit("breach_of_contract", "2026-11-02", SC).basis).toContain("9 November 2026");
  });

  it("keys England and Wales breach of contract to 1 October 2026 (SI 2026/759)", () => {
    expect(limit("breach_of_contract", "2026-09-30", EW).detail?.months).toBe(3);
    const r = limit("breach_of_contract", "2026-11-02", EW);
    expect(r.date).toBe("2027-05-01");
    expect(r.sources).toEqual([
      "ETEJ (England and Wales) Order 1994 art 7",
      "SI 2026/759 art 3",
      "ETEJ (England and Wales) Order 1994 arts 3(c), 10",
      "Limitation Act 1980 s5",
    ]);
    expect(r.basis).toContain("only once employment has ended");
    expect(r.basis).toContain("£25,000");
    expect(r.toVerify?.some((t) => t.includes("draft"))).toBe(false);
  });

  it("gives the companion claim six months from 1 October 2026 in Great Britain, and detriment too", () => {
    const companion = limit("companion", "2026-10-05");
    expect(companion.date).toBe("2027-04-04");
    expect(companion.sources).toEqual(["ERA 1999 s11(2)", "ERA 2025 s152 and Sch 12", "SI 2026/954 reg 3, reg 4", "SI 2026/954 Schedule"]);
    expect(limit("companion", "2026-09-05").date).toBe("2026-12-04");
    expect(limit("detriment", "2026-10-05").date).toBe("2027-04-04");
    const ni = limit("companion", "2026-10-05", NI);
    expect(ni.date).toBe("2027-01-04");
    expect(ni.sources).toEqual(["ER(NI)O 1999 Art 13(2)"]);
  });

  it("notes the two-year limit on deduction claims in Great Britain only", () => {
    const gb = limit("deduction", "2026-10-23");
    expect(gb.basis).toContain("two years");
    expect(gb.sources).toContain("ERA 1996 s23(4A)");
    const ni = limit("deduction", "2026-10-23", NI);
    expect(ni.sources).toEqual(["ERO 1996 Art 55(2), (3)"]);
    expect(ni.basis).toContain("no two-year limit");
    expect(ni.toVerify?.some((t) => t.includes("not opened"))).toBe(false);
  });

  it("gives six months for redundancy pay before the change and in Northern Ireland", () => {
    expect(limit("redundancy_pay", "2026-09-15").date).toBe("2027-03-14");
    const ni = limit("redundancy_pay", "2026-12-11", NI);
    expect(ni.date).toBe("2027-06-10");
    expect(ni.sources).toEqual(["ERO 1996 Art 199"]);
  });

  it("cites the confirmed Northern Ireland provisions and flags the rest", () => {
    expect(limit("unfair_dismissal", "2026-10-05", NI).sources).toEqual(["ERO 1996 Art 145(2)"]);
    expect(limit("protective_award", "2026-12-11", NI)).toMatchObject({ date: "2027-03-10", sources: ["ERO 1996 Art 217(5)"] });
    expect(limit("detriment", "2026-10-05", NI).toVerify?.some((t) => t.includes("not opened"))).toBe(true);
    expect(limit("breach_of_contract", "2026-10-05", NI).toVerify?.some((t) => t.includes("not opened"))).toBe(true);
  });

  describe("Northern Ireland discrimination by ground", () => {
    const ni = (relevantDate: string, ground?: string | string[], knowledgeDate?: string) =>
      run("uk.tribunalTimeLimit", { claimType: "discrimination", relevantDate, ground, knowledgeDate }, NI);

    it("cites every ground's law when none is given, noting the Fair Employment Tribunal", () => {
      const r = ni("2026-10-14");
      expect(r.date).toBe("2027-01-13");
      expect(r.sources).toEqual(["SDO 1976 Art 76", "RRO 1997 Art 65", "DDA 1995 Sch 3 para 3", "SR 2006/261 reg 48", "SR 2003/497 reg 41", "FETO 1998 Art 46"]);
      expect(r.basis).toContain("Fair Employment Tribunal");
    });

    it("cites the ground's own law (grievance T3)", () => {
      expect(ni("2026-10-14", "sex").sources).toEqual(["SDO 1976 Art 76"]);
      expect(ni("2026-10-14", ["race", "national_origin", "unknown"]).sources).toEqual(["RRO 1997 Art 65"]);
      expect(ni("2026-10-14", "disability").basis).not.toContain("Fair Employment");
    });

    it("gives a fair employment claim the earlier of 3 months from knowledge and 6 from the act", () => {
      const fromAct = ni("2026-10-14", "religion_belief");
      expect(fromAct.date).toBe("2027-01-13");
      expect(fromAct.sources).toEqual(["FETO 1998 Art 46(1)"]);
      expect(fromAct.toVerify?.some((t) => t.includes("13 April 2027"))).toBe(true);
      expect(ni("2026-10-14", "political_opinion", "2026-12-01")).toMatchObject({ date: "2027-02-28", detail: { months: 3 } });
      expect(ni("2026-10-14", "religion_political", "2027-03-20")).toMatchObject({ date: "2027-04-13", detail: { months: 6 } });
    });

    it("refuses a knowledge date before the act", () => {
      expect(ni("2026-10-14", "religion_belief", "2026-10-01").missing).toEqual(["knowledgeDate"]);
    });

    it("ignores the ground in Great Britain", () => {
      expect(run("uk.tribunalTimeLimit", { claimType: "discrimination", relevantDate: "2026-10-14", ground: "religion_belief" }).date).toBe("2027-04-13");
    });
  });
});

describe("uk.earlyConciliation", () => {
  const ec = (limitDate: string, dayA: string, dayB: string, ctx = EW) =>
    run("uk.earlyConciliation", { limitDate, dayA, dayB }, ctx);

  it("gives at least one month after the certificate", () => {
    // 19 stopped days take 31 March to 19 April; one month after Day B is 20 April.
    const r = ec("2027-03-31", "2027-03-01", "2027-03-20");
    expect(r.date).toBe("2027-04-20");
    expect(r.detail).toEqual({ stoppedDays: 19, oneMonthAfterDayB: "2027-04-20" });
  });

  it("adds the stopped days when that ends later", () => {
    const r = ec("2027-03-31", "2027-01-10", "2027-02-10");
    expect(r.date).toBe("2027-05-01");
    expect(r.basis).toContain("31 days");
  });

  it("does not extend a limit that had already passed", () => {
    const r = ec("2026-12-29", "2027-01-05", "2027-01-20");
    expect(r.date).toBe("2026-12-29");
    expect(r.basis).toContain("after the time limit had passed");
  });

  it("uses the month's last day when there is no matching date, and flags it", () => {
    const r = ec("2027-01-31", "2027-01-20", "2027-01-31");
    expect(r.date).toBe("2027-02-28");
    expect(r.toVerify?.some((t) => t.includes("last day"))).toBe(true);
  });

  it("refuses a certificate date before the notification date", () => {
    expect(ec("2027-03-31", "2027-03-01", "2027-02-20")).toMatchObject({ date: null, missing: ["dayB"] });
  });

  it("uses the Labour Relations Agency rule in Northern Ireland", () => {
    const r = ec("2027-02-26", "2027-02-01", "2027-02-20", NI);
    expect(r.date).toBe("2027-03-20");
    expect(r.basis).toContain("Labour Relations Agency");
    expect(r.sources).toContain("ERO 1996 Art 249B");
    expect(r.toVerify?.some((t) => t.includes("Article 249B"))).toBe(true);
  });

  it("cites the 12-week period in Great Britain", () => {
    expect(ec("2027-03-31", "2027-03-01", "2027-03-20").sources).toContain("SI 2025/1153 reg 2");
  });

  it("applies Article 249B to a sex claim in Northern Ireland without the scope note", () => {
    const r = run("uk.earlyConciliation", { limitDate: "2027-02-26", dayA: "2027-02-01", dayB: "2027-02-20", ground: "sex" }, NI);
    expect(r.date).toBe("2027-03-20");
    expect(r.toVerify?.some((t) => t.includes("Article 249B is applied"))).toBe(false);
  });

  it("does not extend age, sexual orientation or fair employment claims in Northern Ireland, flagged", () => {
    const r = run("uk.earlyConciliation", { limitDate: "2027-02-26", dayA: "2027-02-01", dayB: "2027-02-20", ground: ["age", "sex"] }, NI);
    expect(r.date).toBe("2027-02-26");
    expect(r.detail).toEqual({ stoppedDays: 19, oneMonthAfterDayB: "2027-03-20", extendedDate: "2027-03-20" });
    expect(r.sources).toContain("SR 2006/261 reg 48A");
    expect(r.toVerify?.[0]).toContain("20 March 2027");
    const fet = run("uk.earlyConciliation", { limitDate: "2027-02-26", dayA: "2027-02-01", dayB: "2027-02-20", ground: "religion_political" }, NI);
    expect(fet.date).toBe("2027-02-26");
    expect(fet.sources).toContain("FETO 1998 Art 46B");
    // In Great Britain the ground changes nothing.
    expect(run("uk.earlyConciliation", { limitDate: "2027-02-26", dayA: "2027-02-01", dayB: "2027-02-20", ground: "age" }).date).toBe("2027-03-20");
  });
});

describe("uk.companionPostponement", () => {
  const window = (proposedDate: string, ctx: RuleContext) => run("uk.companionPostponement", { proposedDate }, ctx);

  it("skips St Andrew's Day in Scotland (disciplinary story 1)", () => {
    const scotland = window("2026-11-26", SC);
    expect(scotland.date).toBe("2026-12-04");
    expect(scotland.toVerify?.[0]).toContain("30 November 2026");
    const england = window("2026-11-26", EW);
    expect(england.date).toBe("2026-12-03");
    expect(england.toVerify).toBeUndefined();
  });

  it("gives the following Thursday with no holidays (disciplinary story 2)", () => {
    expect(window("2026-11-19", EW).date).toBe("2026-11-26");
  });

  it("skips Christmas, Boxing Day and New Year", () => {
    expect(window("2026-12-23", EW).date).toBe("2027-01-04");
  });

  it("uses the Northern Ireland holidays there", () => {
    // Friday 10 July 2026; Monday 13 July is the Boyne holiday in Northern Ireland only.
    expect(window("2026-07-10", NI).date).toBe("2026-07-20");
    expect(window("2026-07-10", EW).date).toBe("2026-07-17");
    expect(window("2026-07-10", NI).sources).toContain("ER(NI)O 1999 Art 15(6)");
  });

  it("starts from the first working day after a weekend date", () => {
    expect(window("2026-11-21", EW).date).toBe("2026-11-27");
  });

  it("flags dates beyond the holiday table", () => {
    expect(window("2028-03-01", EW).toVerify?.some((t) => t.includes("2025 to 2027"))).toBe(true);
  });
});

describe("uk.qualifyingService", () => {
  const qs = (startDate: string, terminationDate: string, ctx = EW, automaticReason?: boolean) =>
    run("uk.qualifyingService", { startDate, terminationDate, automaticReason }, ctx);

  it("needs two years for terminations before 2027 (disciplinary story 4)", () => {
    const r = qs("2025-05-01", "2026-12-15");
    expect(r.date).toBe("2027-04-30");
    expect(r.detail).toMatchObject({ qualifies: false, months: 24 });
  });

  it("needs six months where the effective date of termination is on or after 1 January 2027", () => {
    const r = qs("2025-05-01", "2027-01-15");
    expect(r.date).toBe("2025-10-31");
    expect(r.detail).toMatchObject({ qualifies: true, months: 6 });
    expect(r.sources).toEqual(["ERA 1996 s108(1)", "ERA 1996 s97(2)", "ERA 2025 s25(2)", "SI 2026/559 regs 3, 4"]);
    expect(r.basis).toContain("even if notice was given earlier");
    expect(r.toVerify).toBeUndefined();
  });

  it("flags a summary dismissal that s97(2) would carry into 2027", () => {
    const r = qs("2025-05-01", "2026-12-28");
    expect(r.detail).toMatchObject({ qualifies: false, months: 24, s97Date: "2027-01-04" });
    expect(r.toVerify?.some((t) => t.includes("SI 2026/559 reg 4") && t.includes("in 2027"))).toBe(true);
  });

  it("adds statutory notice when told employment ended without it", () => {
    const short = (withoutNotice: boolean, resignation?: boolean, ctx = EW) =>
      run("uk.qualifyingService", { startDate: "2024-10-01", terminationDate: "2026-09-29", withoutNotice, resignation }, ctx);
    const added = short(true);
    expect(added.detail).toMatchObject({ qualifies: true, s97Date: "2026-10-06" });
    expect(added.basis).toContain("6 October 2026");
    expect(added.toVerify?.some((t) => t.includes("s86(6)"))).toBe(true);
    const full = short(false);
    expect(full.detail).toEqual({ qualifies: false, months: 24 });
    expect(full.toVerify).toBeUndefined();
    const resigned = short(true, true);
    expect(resigned.sources).toContain("ERA 1996 s97(4)");
    expect(resigned.toVerify).toBeUndefined();
  });

  it("keeps the 2-year period when added notice only reaches 2027, flagged", () => {
    const r = run("uk.qualifyingService", { startDate: "2025-05-01", terminationDate: "2026-12-28", withoutNotice: true });
    expect(r.detail).toMatchObject({ qualifies: false, months: 24, s97Date: "2027-01-04" });
    expect(r.toVerify?.some((t) => t.includes("SI 2026/559 reg 4"))).toBe(true);
  });

  it("counts the start day and flags the s97(2) boundary", () => {
    expect(qs("2024-10-01", "2026-09-30").detail?.qualifies).toBe(true);
    const short = qs("2024-10-01", "2026-09-29");
    expect(short.detail?.qualifies).toBe(false);
    expect(short.toVerify?.some((t) => t.includes("s97(2)"))).toBe(true);
  });

  it("is not met for the Glasgow picker (disciplinary story 1)", () => {
    const r = qs("2025-09-01", "2026-11-02", SC);
    expect(r.detail).toMatchObject({ qualifies: false, s97Date: "2026-11-09" });
    expect(r.toVerify ?? []).toHaveLength(0);
  });

  it("uses one year in Northern Ireland (disciplinary story 3)", () => {
    const r = qs("2026-01-05", "2026-12-10", NI);
    expect(r.date).toBe("2027-01-04");
    expect(r.detail).toMatchObject({ qualifies: false, months: 12 });
    expect(r.sources).toEqual(["ERO 1996 Art 140(1)", "ERO 1996 Art 129(2)"]);
  });

  it("adds statutory notice in Northern Ireland under Article 129(2)", () => {
    const r = run("uk.qualifyingService", { startDate: "2026-01-05", terminationDate: "2026-12-28", withoutNotice: true }, NI);
    expect(r.detail).toMatchObject({ qualifies: true, months: 12, s97Date: "2027-01-04" });
    expect(r.basis).toContain("ERO 1996 Art 129(2)");
    const resigned = run("uk.qualifyingService", { startDate: "2026-01-05", terminationDate: "2026-12-28", withoutNotice: true, resignation: true }, NI);
    expect(resigned.toVerify?.some((t) => t.includes("resignation"))).toBe(true);
  });

  it("qualifies for an automatically unfair reason whatever the service", () => {
    const r = qs("2026-06-01", "2026-11-02", EW, true);
    expect(r.detail?.qualifies).toBe(true);
    expect(r.sources).toContain("ERA 1996 s108(3)");
  });

  it("refuses a termination before the start", () => {
    expect(qs("2026-06-01", "2026-05-01")).toMatchObject({ date: null, missing: ["terminationDate"] });
  });
});

describe("uk.writtenReasons", () => {
  const reasons = (input: RuleInput, ctx = EW) => run("uk.writtenReasons", { requestDate: "2026-11-10", ...input }, ctx);

  it("is due 14 days after the request", () => {
    const r = reasons({});
    expect(r.date).toBe("2026-11-24");
    expect(r.detail).toEqual({ automatic: false });
    expect(r.sources).toEqual(["ERA 1996 s92(2), (3)"]);
    expect(r.basis).toContain("6 months where the effective date of termination is on or after 1 January 2027");
  });

  it("is automatic while pregnant or on leave", () => {
    const r = reasons({ pregnantOrOnLeave: true });
    expect(r.detail).toEqual({ automatic: true });
    expect(r.basis).toContain("without asking");
    expect(r.sources).toContain("ERA 1996 s92(4), (4A)");
  });

  it("says whether the service is met, with six months from 1 January 2027", () => {
    expect(reasons({ startDate: "2025-05-01", terminationDate: "2026-11-06" }).detail).toEqual({
      automatic: false,
      qualifies: false,
      monthsNeeded: 24,
    });
    const r = reasons({ startDate: "2026-05-01", terminationDate: "2027-01-08" });
    expect(r.detail).toEqual({ automatic: false, qualifies: true, monthsNeeded: 6 });
    expect(r.sources).toEqual(["ERA 1996 s92(2), (3)", "ERA 2025 Sch 3 para 1(2)", "SI 2026/559 reg 4"]);
    expect(reasons({ startDate: "2026-09-01", terminationDate: "2026-11-06", pregnantOrOnLeave: true }).detail?.qualifies).toBe(true);
  });

  it("uses Article 124 in Northern Ireland, with one year's service", () => {
    expect(reasons({}, NI).sources).toEqual(["ERO 1996 Art 124(2), (3)"]);
    expect(reasons({ startDate: "2025-12-01", terminationDate: "2026-11-30" }, NI).detail).toEqual({
      automatic: false,
      qualifies: true,
      monthsNeeded: 12,
    });
    const automatic = reasons({ pregnantOrOnLeave: true }, NI);
    expect(automatic.sources).toEqual(["ERO 1996 Art 124(2), (3)", "ERO 1996 Art 124(4), (4A)"]);
    expect(automatic.toVerify).toBeUndefined();
  });
});

describe("uk.statutoryNotice", () => {
  const notice = (startDate: string, noticeDate: string, ctx = EW) =>
    run("uk.statutoryNotice", { startDate, noticeDate }, ctx);

  it("gives 12 weeks after 12 years (redundancy T2)", () => {
    const r = notice("2010-03-01", "2026-11-19", SC);
    expect(r.date).toBe("2027-02-11");
    expect(r.detail).toEqual({ weeks: 12, completeYears: 16 });
  });

  it("gives one week under two years (disciplinary story 1)", () => {
    const r = notice("2025-09-01", "2026-11-02", SC);
    expect(r.date).toBe("2026-11-09");
    expect(r.basis).toContain("1 week's notice");
  });

  it("gives a week per complete year from two years", () => {
    expect(notice("2022-11-20", "2026-11-19").detail).toEqual({ weeks: 4, completeYears: 4 });
    expect(notice("2022-11-20", "2026-11-18").detail).toEqual({ weeks: 3, completeYears: 3 });
  });

  it("gives none under one month", () => {
    const r = notice("2026-11-01", "2026-11-20");
    expect(r.date).toBe("2026-11-20");
    expect(r.detail?.weeks).toBe(0);
    expect(notice("2026-10-20", "2026-11-19").detail?.weeks).toBe(1);
  });

  it("uses Article 118 in Northern Ireland", () => {
    expect(notice("2020-01-06", "2026-12-01", NI).sources).toEqual(["ERO 1996 Art 118(1), (6)"]);
    expect(notice("2020-01-06", "2026-12-01").sources).toEqual(["ERA 1996 s86(1), (6)"]);
  });
});

describe("uk.suspensionReview", () => {
  it("is 14 days from the start or the last review, as a proposal", () => {
    const r = run("uk.suspensionReview", { suspensionStart: "2026-10-19" });
    expect(r.date).toBe("2026-11-02");
    expect(r.basis).toContain("Proposal, not law");
    expect(r.detail?.proposal).toBe(true);
    expect(run("uk.suspensionReview", { suspensionStart: "2026-10-19", lastReview: "2026-11-02" }).date).toBe("2026-11-16");
  });

  it("refuses a review before the suspension", () => {
    expect(run("uk.suspensionReview", { suspensionStart: "2026-10-19", lastReview: "2026-10-01" }).missing).toEqual([
      "lastReview",
    ]);
  });
});

describe("uk.collectiveConsultation and uk.hr1Deadline", () => {
  it("counts 30 clear days for 20 to 99 (redundancy T2)", () => {
    const r = run("uk.collectiveConsultation", { proposedCount: 25, firstDismissalDate: "2026-12-18" }, SC);
    expect(r.date).toBe("2026-11-17");
    expect(r.detail).toEqual({ applies: true, days: 30 });
    expect(r.toVerify?.[0]).toContain("18 November 2026");
    expect(r.toVerify?.some((t) => t.includes("s195A"))).toBe(true);
  });

  it("counts 45 days in Great Britain and 90 in Northern Ireland for 100 or more", () => {
    expect(run("uk.collectiveConsultation", { proposedCount: 120, firstDismissalDate: "2027-03-01" }).date).toBe("2027-01-14");
    const ni = run("uk.collectiveConsultation", { proposedCount: 120, firstDismissalDate: "2027-03-01" }, NI);
    expect(ni.date).toBe("2026-11-30");
    expect(ni.detail?.days).toBe(90);
    expect(ni.sources).toEqual(["ERO 1996 Art 216"]);
  });

  it("does not apply below 20", () => {
    const r = run("uk.collectiveConsultation", { proposedCount: 3, firstDismissalDate: "2027-01-29" });
    expect(r.date).toBeNull();
    expect(r.detail).toEqual({ applies: false, days: 0 });
    expect(r.toVerify?.[0]).toContain("employer-wide");
  });

  it("accepts a count written as text", () => {
    expect(run("uk.collectiveConsultation", { proposedCount: "25", firstDismissalDate: "2026-12-18" }).date).toBe("2026-11-17");
    expect(run("uk.collectiveConsultation", { proposedCount: "lots", firstDismissalDate: "2026-12-18" }).missing).toEqual([
      "proposedCount",
    ]);
  });

  it("needs the HR1 before the first notice (redundancy T2)", () => {
    const period = run("uk.hr1Deadline", { proposedCount: 25, firstDismissalDate: "2026-12-18" }, SC);
    expect(period.date).toBe("2026-11-17");
    expect(period.detail).toEqual({ applies: true, days: 30, limitedBy: "period" });

    const notice = run("uk.hr1Deadline", { proposedCount: 25, firstDismissalDate: "2026-12-18", firstNoticeDate: "2026-10-19" }, SC);
    expect(notice.date).toBe("2026-10-18");
    expect(notice.detail?.limitedBy).toBe("notice");

    const late = run("uk.hr1Deadline", { proposedCount: 25, firstDismissalDate: "2026-12-18", firstNoticeDate: "2026-11-30" }, SC);
    expect(late.date).toBe("2026-11-17");
  });

  it("sends the Northern Ireland HR1 to the Department for the Economy", () => {
    const r = run("uk.hr1Deadline", { proposedCount: 150, firstDismissalDate: "2027-03-01" }, NI);
    expect(r.date).toBe("2026-11-30");
    expect(r.basis).toContain("Department for the Economy");
    expect(r.sources).toEqual(["ERO 1996 Art 221", "ERO 1996 Art 222"]);
    expect(r.basis).toContain("NISRA");
    expect(run("uk.hr1Deadline", { proposedCount: 19, firstDismissalDate: "2027-03-01" }).detail?.applies).toBe(false);
  });
});

describe("uk.protectiveAwardMax", () => {
  it("is 180 days from 6 April 2026 in Great Britain and 90 in Northern Ireland", () => {
    expect(run("uk.protectiveAwardMax", { dismissalDate: "2026-12-18" }, SC)).toMatchObject({ date: null, detail: { maxDays: 180 } });
    expect(run("uk.protectiveAwardMax", { dismissalDate: "2026-04-06" }).detail?.maxDays).toBe(180);
    expect(run("uk.protectiveAwardMax", { dismissalDate: "2026-04-05" }).detail?.maxDays).toBe(90);
    expect(run("uk.protectiveAwardMax", { dismissalDate: "2026-12-11" }, NI).detail?.maxDays).toBe(90);
    expect(run("uk.protectiveAwardMax", { dismissalDate: "2026-12-18" }).basis).toContain("Each dismissal's own date decides");
  });
});

describe("uk.statutoryRedundancyPay", () => {
  const pay = (startDate: string, terminationDate: string, dateOfBirth: string, weeklyPay: number | string, ctx = EW) =>
    run("uk.statutoryRedundancyPay", { startDate, terminationDate, dateOfBirth, weeklyPay }, ctx);

  it("uses the age on the first day of each year and the 2026 cap", () => {
    // 16 complete years; the last 5 began when he was 41 or over.
    const r = pay("2010-03-01", "2026-12-18", "1980-06-15", 900);
    expect(r.date).toBeNull();
    expect(r.detail).toEqual({ qualifies: true, completeYears: 16, weeks: 18.5, weeklyCap: 751, amount: 13893.5 });
  });

  it("gives half a week for years under 22", () => {
    const r = pay("2021-01-04", "2026-12-18", "2003-01-10", 400);
    expect(r.detail).toMatchObject({ completeYears: 5, weeks: 3, amount: 1200 });
  });

  it("counts only the last 20 years, up to the gov.uk maximum", () => {
    expect(pay("1990-01-01", "2026-12-18", "1960-01-01", 1000).detail?.amount).toBe(22530);
    expect(pay("1990-01-01", "2026-12-18", "1960-01-01", 1000, NI).detail).toMatchObject({ weeklyCap: 783, amount: 23490 });
  });

  it("cites the provisions that set the cap by the relevant date", () => {
    expect(pay("2010-03-01", "2026-12-18", "1980-06-15", 900).sources).toEqual([
      "ERA 1996 s155",
      "ERA 1996 s162",
      "ERA 1996 s227(1)",
      "SI 2026/310 art 4(2)(o)",
      "SI 2026/310 Schedule",
    ]);
    expect(pay("2010-03-01", "2026-12-18", "1980-06-15", 900, NI).sources).toEqual([
      "ERO 1996 Art 190",
      "ERO 1996 Art 197",
      "ERO 1996 Art 23(1)",
      "SR 2026/57 art 4(2)(l)",
      "SR 2026/57 Schedule",
    ]);
  });

  it("uses the cap for the date of the redundancy", () => {
    expect(pay("2015-01-05", "2025-10-01", "1970-01-01", 1000).detail?.weeklyCap).toBe(719);
    expect(pay("2015-01-05", "2025-10-01", "1970-01-01", 1000, NI).detail?.weeklyCap).toBe(749);
    const old = pay("2015-01-05", "2025-03-01", "1970-01-01", 1000);
    expect(old.detail).toMatchObject({ weeklyCap: null, amount: null });
    expect(old.toVerify?.some((t) => t.includes("before 6 April 2025"))).toBe(true);
  });

  it("pays nothing under two years", () => {
    const r = pay("2025-05-01", "2026-12-18", "1990-01-01", 500);
    expect(r.detail).toMatchObject({ qualifies: false, completeYears: 1, amount: 0 });
    expect(r.basis).toContain("2 years");
  });

  it("asks again for an unusable week's pay or date of birth", () => {
    expect(pay("2015-01-05", "2026-12-18", "1970-01-01", "abc").missing).toEqual(["weeklyPay"]);
    expect(pay("2015-01-05", "2026-12-18", "2027-01-01", 500).missing).toEqual(["dateOfBirth"]);
  });
});

describe("uk.familyLeaveProtectedPeriod", () => {
  const leave = (input: RuleInput, ctx = EW) => run("uk.familyLeaveProtectedPeriod", input, ctx);

  it("ends the day before the 18-month anniversary of the birth (redundancy T1)", () => {
    const r = leave({ leaveType: "maternity", birthDate: "2026-06-09", notifiedPregnancyDate: "2025-11-03" });
    expect(r.date).toBe("2027-12-08");
    expect(r.detail).toMatchObject({ runsFrom: "birth", from: "2025-11-03", extended: true });
    expect(r.sources).toEqual(["MPL Regs 1999 reg 10(1) to (1E)", "MPL Regs 1999 reg 20(1)(b)", "SI 2024/264 reg 3"]);
    expect(r.basis).toContain("automatically unfair");
    // Only the notification point is left to verify.
    expect(r.toVerify).toHaveLength(1);
    expect(r.toVerify?.[0]).toContain("reg 10(1D)");
    expect(leave({ leaveType: "maternity", birthDate: "2026-06-09", birthNotified: true }).toVerify).toBeUndefined();
  });

  it("runs from the expected week when the birth date was not given or not notified", () => {
    const r = leave({ leaveType: "maternity", expectedWeekStart: "2026-06-07" });
    expect(r.date).toBe("2027-12-06");
    expect(r.detail?.runsFrom).toBe("expected_week");
    const both = leave({ leaveType: "maternity", birthDate: "2026-06-09", expectedWeekStart: "2026-06-07" });
    expect(both.detail?.endIfBirthNotNotified).toBe("2027-12-06");
    const notTold = leave({ leaveType: "maternity", birthDate: "2026-06-09", expectedWeekStart: "2026-06-07", birthNotified: false });
    expect(notTold.date).toBe("2027-12-06");
    expect(leave({ leaveType: "maternity", birthDate: "2026-06-09", birthNotified: false }).missing).toEqual(["expectedWeekStart"]);
  });

  it("needs a birth date or expected week for maternity", () => {
    expect(leave({ leaveType: "maternity" })).toMatchObject({ date: null, missing: ["birthDate", "expectedWeekStart"] });
  });

  it("ends with leave that ended before 6 April 2024", () => {
    const r = leave({ leaveType: "maternity", birthDate: "2023-05-01", leaveEndDate: "2024-04-05" });
    expect(r.date).toBe("2024-04-05");
    expect(r.detail?.extended).toBe(false);
    expect(leave({ leaveType: "maternity", birthDate: "2023-05-01", leaveEndDate: "2024-04-06" }).date).toBe("2024-10-31");
  });

  it("runs 18 months from the placement for adoption", () => {
    const r = leave({ leaveType: "adoption", placementDate: "2026-03-02" });
    expect(r.date).toBe("2027-09-01");
    expect(r.sources).toEqual(["PAL Regs 2002 reg 23", "SI 2024/264"]);
    expect(leave({ leaveType: "adoption", leaveEndDate: "2026-12-01" }).missing).toEqual(["placementDate"]);
  });

  it("extends shared parental, neonatal and bereaved partner's leave only after six consecutive weeks", () => {
    const six = leave({ leaveType: "shared_parental", birthDate: "2026-06-09", sixConsecutiveWeeks: true });
    expect(six.date).toBe("2027-12-08");
    expect(six.sources).toEqual(["SPL Regs 2014 reg 39", "SI 2024/264"]);
    const adopted = leave({ leaveType: "shared_parental", birthDate: "2026-01-01", placementDate: "2026-06-09", sixConsecutiveWeeks: true });
    expect(adopted).toMatchObject({ date: "2027-12-08", detail: { runsFrom: "placement" } });
    const short = leave({ leaveType: "neonatal", birthDate: "2026-06-09", sixConsecutiveWeeks: false, leaveEndDate: "2026-07-10" });
    expect(short).toMatchObject({ date: "2026-07-10", sources: ["SI 2025/375 reg 14"], detail: { extended: false } });
    expect(leave({ leaveType: "bereaved_partner", birthDate: "2026-06-09", sixConsecutiveWeeks: true }).sources).toEqual(["SI 2026/237 reg 14"]);
    expect(leave({ leaveType: "neonatal", birthDate: "2026-06-09" }).missing).toEqual(["sixConsecutiveWeeks"]);
    expect(leave({ leaveType: "neonatal", birthDate: "2026-06-09", sixConsecutiveWeeks: false }).missing).toEqual(["leaveEndDate"]);
    expect(leave({ leaveType: "shared_parental", sixConsecutiveWeeks: true }).missing).toEqual(["birthDate", "placementDate"]);
  });

  it("gives no priority for ordinary paternity leave", () => {
    const r = leave({ leaveType: "paternity", birthDate: "2026-06-09" });
    expect(r).toMatchObject({ date: null, detail: { covered: false } });
    expect(r.basis).toContain("no redundancy priority");
  });

  it("ends with the leave in Northern Ireland, for maternity, adoption and shared parental leave", () => {
    const r = leave({ leaveType: "maternity", birthDate: "2026-02-10", leaveEndDate: "2027-02-08" }, NI);
    expect(r.date).toBe("2027-02-08");
    expect(r.sources).toEqual(["MPL Regs (NI) 1999 reg 10"]);
    expect(r.toVerify).toBeUndefined();
    expect(leave({ leaveType: "adoption", leaveEndDate: "2027-02-08" }, NI).sources).toEqual(["PAL Regs (NI) 2002 reg 23"]);
    expect(leave({ leaveType: "shared_parental", leaveEndDate: "2027-02-08" }, NI).sources).toEqual(["SPL Regs (NI) 2015 reg 39"]);
    expect(leave({ leaveType: "maternity", birthDate: "2026-02-10" }, NI).missing).toEqual(["leaveEndDate"]);
  });

  it("does not cover other leave in Northern Ireland, flagged", () => {
    const r = leave({ leaveType: "neonatal", leaveEndDate: "2027-02-08" }, NI);
    expect(r).toMatchObject({ date: null, detail: { covered: false } });
    expect(r.toVerify?.[0]).toContain("not checked");
  });
});

describe("uk.trialPeriodEnd", () => {
  it("ends four calendar weeks after the start, counting the start day", () => {
    const r = run("uk.trialPeriodEnd", { newRoleStartDate: "2027-02-01" });
    expect(r.date).toBe("2027-02-28");
    expect(r.toVerify).toBeUndefined();
  });

  it("uses an agreed retraining end date, flagged", () => {
    const r = run("uk.trialPeriodEnd", { newRoleStartDate: "2027-02-01", retrainingEndDate: "2027-04-30" });
    expect(r.date).toBe("2027-04-30");
    expect(r.detail?.fourWeekEnd).toBe("2027-02-28");
    expect(r.toVerify).toHaveLength(1);
    const early = run("uk.trialPeriodEnd", { newRoleStartDate: "2027-02-01", retrainingEndDate: "2027-02-10" });
    expect(early.date).toBe("2027-02-10");
    expect(early.toVerify).toHaveLength(2);
  });

  it("uses Article 173 in Northern Ireland", () => {
    expect(run("uk.trialPeriodEnd", { newRoleStartDate: "2027-02-01" }, NI).sources).toEqual(["ERO 1996 Art 173(3), (6)"]);
  });
});

describe("uk.sexualHarassmentDuty", () => {
  const duty = (conductDate: string, ctx = EW) => run("uk.sexualHarassmentDuty", { conductDate }, ctx);

  it("follows the 2024 and 2026 commencement dates", () => {
    expect(duty("2024-10-25").detail).toEqual({ standard: "none", thirdParty: false });
    expect(duty("2024-10-26").detail).toEqual({ standard: "reasonable_steps", thirdParty: false });
    expect(duty("2026-10-29").detail).toEqual({ standard: "reasonable_steps", thirdParty: false });
    const after = duty("2026-10-30");
    expect(after.detail).toEqual({ standard: "all_reasonable_steps", thirdParty: true });
    expect(after.sources).toContain("SI 2026/1065 reg 3");
    expect(after.toVerify?.some((t) => t.includes("s40(1A)") && t.includes("without limit"))).toBe(true);
  });

  it("applies the stronger duty to the client dinner (grievance T2)", () => {
    expect(duty("2026-11-05", SC)).toMatchObject({ date: null, detail: { standard: "all_reasonable_steps", thirdParty: true } });
  });

  it("does not apply in Northern Ireland, which keeps its own liability rules", () => {
    const r = duty("2026-11-05", NI);
    expect(r.notApplicable).toBeTruthy();
    expect(r.basis).toContain("s5(1)");
    expect(r.basis).toContain("Art 42(3)");
    expect(r.basis).toContain("Art 8(2B) to (2D)");
    expect(r.toVerify).toBeUndefined();
  });
});

describe("uk.compensationCap", () => {
  const cap = (terminationDate: string, weeklyPay?: number, ctx = EW) =>
    run("uk.compensationCap", { terminationDate, weeklyPay }, ctx);

  it("removes the cap in Great Britain from 1 January 2027", () => {
    const r = cap("2027-01-04", 900);
    expect(r.date).toBeNull();
    expect(r.detail).toEqual({ capRemoved: true, fixedCap: null, weeksPayCap: null, cap: null });
    expect(r.sources).toEqual(["ERA 2025 s25(3)", "SI 2026/559 reg 4"]);
  });

  it("caps at the lower of the fixed cap and 52 weeks' pay before then", () => {
    expect(cap("2026-11-06", 900).detail).toEqual({ capRemoved: false, fixedCap: 123543, weeksPayCap: 46800, cap: 46800 });
    expect(cap("2026-12-31", 3000, SC).detail).toMatchObject({ fixedCap: 123543, weeksPayCap: 156000, cap: 123543 });
    expect(cap("2025-10-01", 900).detail?.fixedCap).toBe(118223);
    const unknownPay = cap("2026-11-06");
    expect(unknownPay.detail).toMatchObject({ weeksPayCap: null, cap: 123543 });
    expect(unknownPay.toVerify?.some((t) => t.includes("weeklyPay was not given"))).toBe(true);
    const old = cap("2025-03-01", 900);
    expect(old.detail).toMatchObject({ fixedCap: null, cap: 46800 });
    expect(old.toVerify?.some((t) => t.includes("before 6 April 2025"))).toBe(true);
  });

  it("keeps a fixed cap in Northern Ireland", () => {
    const r = cap("2027-02-01", 900, NI);
    expect(r.detail).toEqual({ capRemoved: false, fixedCap: 123785, weeksPayCap: null, cap: 123785 });
    expect(r.sources).toEqual(["ERO 1996 Art 158(1)", "SR 2026/57 art 4(2)(j)", "SR 2026/57 Schedule"]);
    expect(r.basis).toContain("£123,785");
    expect(cap("2025-10-01", undefined, NI).detail?.fixedCap).toBe(118455);
  });
});

describe("uk.weeklyPayCap", () => {
  const weekly = (appropriateDate: string, ctx = EW) => run("uk.weeklyPayCap", { appropriateDate }, ctx);

  it("gives £751 in Great Britain and £783 in Northern Ireland from 6 April 2026", () => {
    const gb = weekly("2026-11-05");
    expect(gb.detail).toEqual({ weeklyCap: 751 });
    expect(gb.sources).toEqual(["ERA 1996 s227(1)", "SI 2026/310 Schedule", "SI 2026/310 art 4(2)(r)"]);
    expect(weekly("2026-11-05", NI)).toMatchObject({ detail: { weeklyCap: 783 }, sources: ["ERO 1996 Art 23(1)", "SR 2026/57 Schedule"] });
    expect(weekly("2026-04-05").detail?.weeklyCap).toBe(719);
    expect(weekly("2025-10-01", NI).detail?.weeklyCap).toBe(749);
  });

  it("holds no limit before 6 April 2025, flagged", () => {
    const r = weekly("2025-01-10");
    expect(r.detail).toEqual({ weeklyCap: null });
    expect(r.toVerify).toHaveLength(1);
  });
});

describe("UK rules on a US case", () => {
  it("are not applicable", () => {
    const r = run("uk.statutoryNotice", { startDate: "2020-01-01", noticeDate: "2026-11-02" }, US);
    expect(r).toMatchObject({ date: null, notApplicable: "This is a UK rule and the case is in the United States." });
  });
});
