import type { FactValue, IsoDate, RuleFn, RuleResult, UkNation } from "../types";
import {
  addDays,
  addMonths,
  addYears,
  ageOn,
  completeMonths,
  daysBetween,
  earlierOf,
  formatLongDate,
  holidaysKnownFor,
  isChristmasOrGoodFriday,
  isUkBankHoliday,
  isWeekend,
  isWorkingDay,
  laterOf,
  lastDayOfMonthsBeginningWith,
} from "./calendar";
import { needsResult, notApplicable, readInputs, result, type InputReader } from "./inputs";

/**
 * UK rules. Great Britain (England and Wales, Scotland) and Northern Ireland
 * have separate employment law: each rule says which provision it follows for
 * the case's nation, and returns the earlier date wherever the law is not yet
 * settled, listing the point in `toVerify`.
 */

/** First relevant date to which the Great Britain six-month tribunal limit applies (SI 2026/954 reg 4). */
export const GB_SIX_MONTH_LIMIT_FROM = "2026-10-01";
/** Breach of contract claims in Scotland move to six months only from this date (Acas). */
export const SCOTLAND_BREACH_OF_CONTRACT_FROM = "2026-11-09";
/** Dismissals from this date need six months' service in Great Britain (ERA 2025 s25; SI 2026/559 reg 3). */
export const GB_SIX_MONTH_QUALIFYING_FROM = "2027-01-01";
/** Dismissals taking effect from this date can get a 180-day protective award (SI 2026/323). */
export const GB_180_DAY_PROTECTIVE_AWARD_FROM = "2026-04-06";
/** Equality Act 2010 s40A in force (Worker Protection (Amendment of Equality Act 2010) Act 2023). */
export const HARASSMENT_DUTY_FROM = "2024-10-26";
/** ERA 2025 ss20 and 21 in force (SI 2026/1065 reg 3). */
export const ALL_REASONABLE_STEPS_FROM = "2026-10-30";

const NATION_NAME: Record<UkNation, string> = {
  "england-wales": "England and Wales",
  scotland: "Scotland",
  "northern-ireland": "Northern Ireland",
};

const NO_WEEKEND_ROLL =
  "A last day that falls on a weekend or bank holiday is not moved to the next working day; whether a tribunal would accept a claim then is to verify.";

/** Wraps a UK rule so that a US case gets `notApplicable`. */
function ukRule(fn: (read: InputReader, nation: UkNation) => RuleResult): RuleFn {
  return (input, ctx) => {
    if (ctx.jurisdiction.country !== "uk") {
      return notApplicable("This is a UK rule and the case is in the United States.");
    }
    return fn(readInputs(input), ctx.jurisdiction.nation);
  };
}

const isNi = (nation: UkNation) => nation === "northern-ireland";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// Tribunal time limits
// ---------------------------------------------------------------------------

export const CLAIM_TYPES = [
  "unfair_dismissal",
  "discrimination",
  "deduction",
  "detriment",
  "breach_of_contract",
  "companion",
  "protective_award",
  "redundancy_pay",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

/** The Great Britain provision that sets each claim's time limit. */
const GB_LIMIT_SOURCE: Record<ClaimType, string> = {
  unfair_dismissal: "ERA 1996 s111(2)",
  discrimination: "Equality Act 2010 s123",
  deduction: "ERA 1996 s23",
  detriment: "ERA 1996 s48(3)",
  breach_of_contract: "ETEJ (England and Wales) Order 1994 art 7",
  companion: "ERA 1999 s11(2)",
  protective_award: "TULRCA 1992 s189(5)",
  redundancy_pay: "ERA 1996 s164",
};

/** Northern Ireland provisions opened while drafting; the others are to verify. */
const NI_LIMIT_SOURCE: Partial<Record<ClaimType, string>> = {
  unfair_dismissal: "ERO 1996 Art 145(2)",
  discrimination: "SDO 1976 Art 76",
  protective_award: "ERO 1996 Art 217",
  redundancy_pay: "ERO 1996 Art 199",
};

/**
 * Last day to present a tribunal claim, before any early conciliation
 * extension.
 *
 * Great Britain: section 152 of and Schedule 12 to the Employment Rights Act
 * 2025, in force on 1 October 2026 (SI 2026/954 reg 3), changed the primary
 * limit for unfair dismissal, discrimination, deductions, detriment and
 * protective award claims (among others) from three months to six. Regulation
 * 4 applies the longer limit only where the "relevant date" is on or after
 * 1 October 2026: the act complained of (the last act in a series), or for
 * unfair dismissal the effective date of termination. Earlier acts keep three
 * months. Breach of contract claims sit in the Extension of Jurisdiction
 * Orders, which Schedule 12 does not amend; Acas says they move with the rest,
 * except in Scotland where the change starts on 9 November 2026.
 * Statutory redundancy pay (ERA 1996 s164) was already six months.
 *
 * Northern Ireland: employment law is devolved and the 2025 Act's change does
 * not reach industrial tribunal claims there, so they stay at three months
 * (for example Article 145 of the Employment Rights (NI) Order 1996). The
 * redundancy pay claim is six months there too (Article 199).
 *
 * Every period "begins with" the relevant date, so it ends the day before the
 * corresponding date N months later (see lastDayOfMonthsBeginningWith).
 */
export const tribunalTimeLimit: RuleFn = ukRule((read, nation) => {
  const claimType = read.choice("claimType", CLAIM_TYPES);
  const relevantDate = read.date("relevantDate");
  if (!read.ok() || !claimType || !relevantDate) return read.needs();

  const toVerify: string[] = [];
  let months: 3 | 6;
  let basis: string;
  let sources: string[];

  if (isNi(nation)) {
    const source = NI_LIMIT_SOURCE[claimType];
    sources = [source ?? "Employment Rights (NI) Order 1996"];
    if (claimType === "redundancy_pay") {
      months = 6;
      basis =
        "Northern Ireland: a statutory redundancy payment must be claimed in writing, agreed or referred to a tribunal within 6 months less one day of the relevant date (ERO 1996 Art 199). A tribunal may allow up to six months more if just and equitable.";
    } else {
      months = 3;
      basis =
        "Northern Ireland: the claim must be presented within 3 months less one day of the relevant date, subject to the Labour Relations Agency early conciliation extension. The Employment Rights Act 2025 six-month limit does not apply in Northern Ireland.";
      if (!source) {
        toVerify.push(
          "The Northern Ireland provision for this claim type was not opened; 3 months less one day is the usual industrial tribunal limit there."
        );
      }
      if (claimType === "discrimination") {
        toVerify.push(
          "Northern Ireland discrimination limits depend on the ground: the Sex Discrimination (NI) Order 1976 gives 3 months from the act, and the Fair Employment and Treatment (NI) Order 1998 can give longer. 3 months from the act is the earliest."
        );
      }
    }
  } else if (claimType === "redundancy_pay") {
    months = 6;
    basis =
      "A statutory redundancy payment must be claimed in writing, agreed or referred to a tribunal within 6 months less one day of the relevant date (ERA 1996 s164). A tribunal may allow up to six months more if just and equitable.";
    sources = [GB_LIMIT_SOURCE.redundancy_pay];
  } else if (claimType === "companion") {
    // ERA 2025 Sch 12 para 8 amends s11(2) and SI 2026/954 lists s11, but the
    // consolidated text still says three months. Until a lawyer confirms, the
    // earlier date is the safe one.
    months = 3;
    basis =
      "A complaint about the right to be accompanied must be presented within 3 months less one day of the failure (ERA 1999 s11(2)), subject to the Acas early conciliation extension.";
    sources = [GB_LIMIT_SOURCE.companion];
    if (relevantDate >= GB_SIX_MONTH_LIMIT_FROM) {
      toVerify.push(
        "ERA 2025 Sch 12 para 8 changes ERA 1999 s11(2) to six months and SI 2026/954 lists s11, but legislation.gov.uk still shows three months. The earlier date is used until a lawyer confirms."
      );
    }
  } else {
    const contract = claimType === "breach_of_contract";
    const scottishContract = contract && nation === "scotland";
    const switchDate = scottishContract ? SCOTLAND_BREACH_OF_CONTRACT_FROM : GB_SIX_MONTH_LIMIT_FROM;
    months = relevantDate >= switchDate ? 6 : 3;
    const switchText = formatLongDate(switchDate);
    basis =
      months === 6
        ? `The relevant date is on or after ${switchText}, so ${contract ? "" : "under the Employment Rights Act 2025 "}the claim must be presented within 6 months less one day of it, subject to the Acas early conciliation extension.`
        : `The relevant date is before ${switchText}, so the claim must be presented within 3 months less one day of it, subject to the Acas early conciliation extension. The 6-month limit${contract ? "" : " under the Employment Rights Act 2025"} applies only from that date${scottishContract ? " for breach of contract claims in Scotland" : ""}.`;
    sources = [scottishContract ? "ETEJ (Scotland) Order 1994 art 7" : GB_LIMIT_SOURCE[claimType]];
    if (contract) {
      sources.push("Acas, Employment tribunal time limits");
      toVerify.push(
        "The instruments moving breach of contract claims to six months, and the 9 November 2026 date for Scotland, were not opened; the dates follow Acas."
      );
    } else if (months === 6) {
      sources.push("ERA 2025 s152 and Sch 12", "SI 2026/954 reg 3, reg 4");
    } else {
      sources.push("SI 2026/954 reg 4");
    }
  }

  toVerify.push(NO_WEEKEND_ROLL);
  return result({
    date: lastDayOfMonthsBeginningWith(relevantDate, months),
    basis,
    sources,
    toVerify,
    detail: { months },
  });
});

/**
 * The time limit once early conciliation is added (ERA 1996 s207B; ERO 1996
 * Art 249B in Northern Ireland, which has the same wording).
 *
 * Subsection (3): the days from the day after Day A up to and including Day B
 * are not counted, so they are added to the limit. Subsection (4): if the
 * limit so extended would expire between Day A and one month after Day B, it
 * expires at the end of that period instead. "One month after Day B" is the
 * corresponding date in the next month, or that month's last day where there
 * is none. Conciliation started after the limit has passed extends nothing
 * (Acas: notifying only helps if it is done within the time limit).
 */
export const earlyConciliation: RuleFn = ukRule((read, nation) => {
  const limitDate = read.date("limitDate");
  const dayA = read.date("dayA");
  const dayB = read.date("dayB");
  if (dayA && dayB && dayB < dayA) read.reject("dayB", "is before dayA");
  if (!read.ok() || !limitDate || !dayA || !dayB) return read.needs();

  const ni = isNi(nation);
  const body = ni ? "the Labour Relations Agency" : "Acas";
  const sources = ni
    ? ["ERO 1996 Art 249B", "Industrial Tribunals (NI) Order 1996 Art 20A"]
    : ["ERA 1996 s207B", "Equality Act 2010 s140B", "ETA 1996 s18A"];
  const toVerify: string[] = [];
  if (ni) {
    toVerify.push(
      "Article 249B covers claims under the Employment Rights (NI) Order 1996; whether other Northern Ireland laws (for example the Sex Discrimination (NI) Order 1976) apply the same rule is to verify."
    );
  }

  if (dayA > limitDate) {
    return result({
      date: limitDate,
      basis: `${ni ? "The Labour Relations Agency" : "Acas"} was notified after the time limit had passed, so early conciliation does not extend it.`,
      sources,
      toVerify,
      detail: { stoppedDays: 0 },
    });
  }

  const stoppedDays = daysBetween(dayA, dayB);
  const extended = addDays(limitDate, stoppedDays);
  const oneMonthAfterDayB = addMonths(dayB, 1);
  if (Number(dayB.slice(8)) > Number(oneMonthAfterDayB.slice(8))) {
    toVerify.push(
      "The month after the certificate has no matching date, so one month after Day B is taken as that month's last day."
    );
  }
  toVerify.push(NO_WEEKEND_ROLL);
  return result({
    date: laterOf(extended, oneMonthAfterDayB),
    basis: `The ${plural(stoppedDays, "day")} from the day after ${body} was notified up to the day the certificate arrived are not counted, and the limit cannot end sooner than one month after the certificate.`,
    sources,
    toVerify,
    detail: { stoppedDays, oneMonthAfterDayB },
  });
});

// ---------------------------------------------------------------------------
// Disciplinary and dismissal
// ---------------------------------------------------------------------------

/**
 * Latest date for the worker's alternative hearing time when their companion
 * cannot make the employer's date (ERA 1999 s10(4), (5); ER(NI)O 1999 Art
 * 12(4), (5)). The alternative must fall before the end of the five working
 * days beginning with the first working day after the employer's proposed
 * day, so it may fall on the fifth working day. Working days exclude weekends,
 * Christmas Day, Good Friday and bank holidays in that part of the UK (s13(6);
 * Art 15(6)).
 */
export const companionPostponement: RuleFn = ukRule((read, nation) => {
  const proposedDate = read.date("proposedDate");
  if (!read.ok() || !proposedDate) return read.needs();

  const workingDays: IsoDate[] = [];
  const holidaysSkipped: IsoDate[] = [];
  let unknownYear = false;
  for (let day = addDays(proposedDate, 1); workingDays.length < 5; day = addDays(day, 1)) {
    if (!holidaysKnownFor(day)) unknownYear = true;
    if (isWorkingDay(day, nation)) workingDays.push(day);
    else if (!isWeekend(day) && !isChristmasOrGoodFriday(day) && isUkBankHoliday(day, nation)) {
      holidaysSkipped.push(day);
    }
  }

  const toVerify: string[] = [];
  if (holidaysSkipped.length) {
    toVerify.push(
      `Counts ${holidaysSkipped.map(formatLongDate).join(" and ")} as ${holidaysSkipped.length === 1 ? "a bank holiday" : "bank holidays"} under the Banking and Financial Dealings Act 1971 because gov.uk lists ${holidaysSkipped.length === 1 ? "it" : "them"} for ${NATION_NAME[nation]}.`
    );
  }
  if (unknownYear) {
    toVerify.push(
      "Bank holidays are only held for 2025 to 2027, so any bank holiday outside those years was counted as a working day."
    );
  }
  return result({
    date: workingDays[4],
    basis: `The worker's alternative time must be reasonable and fall before the end of the five working days beginning with the first working day after the employer's proposed day. Weekends, Christmas Day, Good Friday and bank holidays in ${NATION_NAME[nation]} do not count.`,
    sources: isNi(nation)
      ? ["ER(NI)O 1999 Art 12(4), (5)", "ER(NI)O 1999 Art 15(6)"]
      : ["ERA 1999 s10(4), (5)", "ERA 1999 s13(6)"],
    toVerify,
    detail: { firstWorkingDay: workingDays[0] },
  });
});

/**
 * Statutory minimum notice from the employer, in weeks, for an employee whose
 * continuous employment began on `startDate`, counted on `noticeDate` (ERA
 * 1996 s86(1); ERO 1996 Art 118(1)).
 */
export function statutoryNoticeWeeks(startDate: IsoDate, noticeDate: IsoDate): number {
  const months = completeMonths(startDate, noticeDate);
  if (months < 1) return 0;
  const years = Math.floor(months / 12);
  return years < 2 ? 1 : Math.min(years, 12);
}

/**
 * Whether the qualifying period for ordinary unfair dismissal is met. The
 * period is "not less than" two years (Great Britain, six months for
 * dismissals from 1 January 2027) or one year (Northern Ireland) "ending with
 * the effective date of termination", counting the start day: someone who
 * started on 1 May 2025 has two years on 30 April 2027.
 *
 * Where the employer gave less than the statutory minimum notice, s97(2) adds
 * that notice to the termination date for this test. We do not know what
 * notice was given, so we say when that would change the answer.
 */
export const qualifyingService: RuleFn = ukRule((read, nation) => {
  const startDate = read.date("startDate");
  const terminationDate = read.date("terminationDate");
  const automatic = read.optionalFlag("automaticReason") === true;
  if (startDate && terminationDate && terminationDate < startDate) {
    read.reject("terminationDate", "is before startDate");
  }
  if (!read.ok() || !startDate || !terminationDate) return read.needs();

  const ni = isNi(nation);
  const monthsFor = (date: IsoDate) => (ni ? 12 : date >= GB_SIX_MONTH_QUALIFYING_FROM ? 6 : 24);
  const months = monthsFor(terminationDate);
  const metOn = lastDayOfMonthsBeginningWith(startDate, months);
  const qualifies = automatic || terminationDate >= metOn;
  const period = months === 24 ? "2 years'" : months === 12 ? "1 year's" : "6 months'";

  const toVerify: string[] = [];
  const sources = ni ? ["ERO 1996 Art 140(1)"] : ["ERA 1996 s108(1)", "ERA 1996 s97(2)"];
  if (months === 6) {
    sources.push("ERA 2025 s25", "SI 2026/559 reg 3");
    toVerify.push(
      "The 6-month period for dismissals from 1 January 2027 is not yet in the legislation.gov.uk text of s108, and the transitional rules (SI 2026/559 reg 4) were not read."
    );
  }
  if (automatic) sources.push(ni ? "ERO 1996 Art 140(3)" : "ERA 1996 s108(3)");

  const detail: Record<string, FactValue> = { qualifies, months };
  const s97Date = addDays(terminationDate, 7 * statutoryNoticeWeeks(startDate, terminationDate));
  if (!automatic && s97Date !== terminationDate) {
    detail.s97Date = s97Date;
    const s97Qualifies = s97Date >= lastDayOfMonthsBeginningWith(startDate, monthsFor(s97Date));
    if (s97Qualifies !== qualifies) {
      toVerify.push(
        `If the employer gave less than the statutory minimum notice, ${ni ? "the Northern Ireland equivalent of " : ""}ERA 1996 s97(2) treats employment as ending on ${formatLongDate(s97Date)} for this test, and the answer would change.`
      );
    }
    if (!ni && terminationDate < GB_SIX_MONTH_QUALIFYING_FROM && s97Date >= GB_SIX_MONTH_QUALIFYING_FROM) {
      toVerify.push(
        "With statutory notice added under s97(2) the termination falls in 2027; whether the 2-year or the 6-month period then applies is to verify."
      );
    }
  }

  const law = ni ? "ERO 1996 Art 140(1)" : "ERA 1996 s108(1)";
  const basis = automatic
    ? `No qualifying period applies to a dismissal for an automatically unfair reason (${ni ? "ERO 1996 Art 140(3)" : "ERA 1996 s108(3)"}). The date shown is when the usual ${period} continuous employment would be met.`
    : `Ordinary unfair dismissal needs ${period} continuous employment ending with the effective date of termination (${law}${months === 6 ? " as amended by ERA 2025 s25" : ""}).${months === 24 ? " The 6-month period applies only to terminations on or after 1 January 2027." : ""}`;
  return result({ date: metOn, basis, sources, toVerify, detail });
});

/** Written reasons for dismissal (ERA 1996 s92; ERO 1996 Art 124 in Northern Ireland). */
export const writtenReasons: RuleFn = ukRule((read, nation) => {
  const requestDate = read.date("requestDate");
  const automatic = read.optionalFlag("pregnantOrOnLeave") === true;
  if (!read.ok() || !requestDate) return read.needs();

  const ni = isNi(nation);
  // "Within fourteen days of" the request: the request day itself is not counted.
  const date = addDays(requestDate, 14);
  const toVerify: string[] = [];
  if (ni && automatic) {
    toVerify.push("In Northern Ireland Art 124(4) covers pregnancy and maternity leave; adoption leave is to verify.");
  }
  const basis = automatic
    ? `Someone dismissed while pregnant or on maternity or adoption leave is entitled to written reasons without asking and whatever their length of service (${ni ? "ERO 1996 Art 124(4)" : "ERA 1996 s92(4), (4A)"}). Any request must still be answered within 14 days.`
    : `An employer must give written reasons for dismissal within 14 days of the employee's request (${ni ? "ERO 1996 Art 124(2)" : "ERA 1996 s92(2)"}). The employee needs the qualifying period of employment for this right.`;
  return result({
    date,
    basis,
    sources: ni ? ["ERO 1996 Art 124"] : ["ERA 1996 s92"],
    toVerify,
    detail: { automatic },
  });
});

/**
 * Earliest end of the employer's statutory minimum notice. Notice runs from
 * the day after it is given (Wang v University of Keele [2011] ICR 1251), so
 * N weeks' notice given on a Thursday ends on a Thursday N weeks later.
 */
export const statutoryNotice: RuleFn = ukRule((read, nation) => {
  const startDate = read.date("startDate");
  const noticeDate = read.date("noticeDate");
  if (startDate && noticeDate && noticeDate < startDate) read.reject("noticeDate", "is before startDate");
  if (!read.ok() || !startDate || !noticeDate) return read.needs();

  const weeks = statutoryNoticeWeeks(startDate, noticeDate);
  const completeYears = Math.floor(completeMonths(startDate, noticeDate) / 12);
  const law = isNi(nation) ? "ERO 1996 Art 118(1)" : "ERA 1996 s86(1)";
  const service =
    completeYears < 2 ? "at least one month but under two years" : plural(completeYears, "complete year");
  const notice = weeks === 1 ? "1 week's" : `${weeks} weeks'`;
  const basis =
    weeks === 0
      ? `An employee with less than one month's continuous employment has no statutory minimum notice (${law}).`
      : `With ${service} of continuous employment the employer must give at least ${notice} notice (${law}). Notice runs from the day after it is given, so it ends no earlier than this date.`;
  return result({
    date: addDays(noticeDate, weeks * 7),
    basis,
    sources: [law],
    detail: { weeks, completeYears },
  });
});

/** A product rule, not law: review a suspension every 14 days. */
export const suspensionReview: RuleFn = ukRule((read) => {
  const suspensionStart = read.date("suspensionStart");
  const lastReview = read.optionalDate("lastReview");
  if (suspensionStart && lastReview && lastReview < suspensionStart) {
    read.reject("lastReview", "is before suspensionStart");
  }
  if (!read.ok() || !suspensionStart) return read.needs();

  return result({
    date: addDays(lastReview ?? suspensionStart, 14),
    basis:
      "Proposal, not law: DraftHR suggests reviewing a suspension every 14 days from the start or the last review. The Acas Code asks for suspension to be as brief as possible and kept under review, but sets no interval.",
    sources: ["Acas Code para 8", "DraftHR proposal"],
    toVerify: ["The 14-day interval is a DraftHR default for a lawyer to confirm."],
    detail: { proposal: true, intervalDays: 14 },
  });
});

// ---------------------------------------------------------------------------
// Redundancy
// ---------------------------------------------------------------------------

/**
 * Latest day to take a step that must come "at least N days before" an event.
 * Read as N clear days, leaving out both the day of the step and the day of
 * the event (Re Hector Whaling Ltd [1936] Ch 208), which is one day earlier
 * than counting back N days. Nothing in TULRCA settles the point, so the
 * earlier date is the safe one.
 */
function clearDaysBefore(event: IsoDate, days: number): IsoDate {
  return addDays(event, -(days + 1));
}

const clearDaysNote = (event: IsoDate, days: number) =>
  `"At least ${days} days before" is read as ${days} clear days, one day earlier than counting back ${days} days (${formatLongDate(addDays(event, -days))}); a lawyer should confirm.`;

const EMPLOYER_WIDE_THRESHOLD =
  "The Employment Rights Act 2025 adds an employer-wide threshold (TULRCA s188(A1) and s195A) to be set by regulations; once made, fewer than 20 dismissals at one establishment may still need collective consultation.";

function consultationDays(count: number, nation: UkNation): number {
  if (count >= 100) return isNi(nation) ? 90 : 45;
  return 30;
}

/**
 * Latest day collective consultation must begin: at least 30 days before the
 * first dismissal takes effect, or 45 (Great Britain) or 90 (Northern
 * Ireland) where 100 or more are proposed (TULRCA 1992 s188(1A); ERO 1996 Art
 * 216).
 */
export const collectiveConsultation: RuleFn = ukRule((read, nation) => {
  const proposedCount = read.number("proposedCount");
  const firstDismissalDate = read.date("firstDismissalDate");
  if (!read.ok() || proposedCount === undefined || !firstDismissalDate) return read.needs();

  const ni = isNi(nation);
  const sources = ni ? ["ERO 1996 Art 216"] : ["TULRCA 1992 s188(1A)"];
  const thresholdNote = ni ? [] : [EMPLOYER_WIDE_THRESHOLD];
  if (proposedCount < 20) {
    return result({
      date: null,
      basis:
        "Collective consultation applies only where 20 or more redundancy dismissals are proposed at one establishment within 90 days.",
      sources: ni ? ["ERO 1996 Art 216"] : ["TULRCA 1992 s188(1)"],
      toVerify: thresholdNote,
      detail: { applies: false, days: 0 },
    });
  }

  const days = consultationDays(proposedCount, nation);
  return result({
    date: clearDaysBefore(firstDismissalDate, days),
    basis: `With ${proposedCount} dismissals proposed at one establishment within 90 days, consultation must begin at least ${days} days before the first dismissal takes effect. Counted as clear days, this is the last day it can safely begin.`,
    sources,
    toVerify: [clearDaysNote(firstDismissalDate, days), ...thresholdNote],
    detail: { applies: true, days },
  });
});

/**
 * Latest day the HR1 must be received: at least 30 (or 45, or 90 in Northern
 * Ireland) days before the first dismissal takes effect, and before notice of
 * dismissal is given to any of the employees (TULRCA 1992 s193; ERO 1996 Art
 * 221).
 */
export const hr1Deadline: RuleFn = ukRule((read, nation) => {
  const proposedCount = read.number("proposedCount");
  const firstDismissalDate = read.date("firstDismissalDate");
  const firstNoticeDate = read.optionalDate("firstNoticeDate");
  if (!read.ok() || proposedCount === undefined || !firstDismissalDate) return read.needs();

  const ni = isNi(nation);
  const sources = ni ? ["ERO 1996 Art 221"] : ["TULRCA 1992 s193", "TULRCA 1992 s194"];
  const thresholdNote = ni ? [] : [EMPLOYER_WIDE_THRESHOLD];
  if (proposedCount < 20) {
    return result({
      date: null,
      basis: "An HR1 is needed only where 20 or more redundancy dismissals are proposed at one establishment within 90 days.",
      sources,
      toVerify: thresholdNote,
      detail: { applies: false, days: 0 },
    });
  }

  const days = consultationDays(proposedCount, nation);
  const byPeriod = clearDaysBefore(firstDismissalDate, days);
  // "Before giving notice": the HR1 could arrive earlier on the same day as
  // the first notice, but the day before is the date that can be shown safely.
  const beforeNotice = firstNoticeDate ? addDays(firstNoticeDate, -1) : undefined;
  const date = beforeNotice ? earlierOf(byPeriod, beforeNotice) : byPeriod;
  const limitedBy = beforeNotice && beforeNotice < byPeriod ? "notice" : "period";

  const toVerify = [clearDaysNote(firstDismissalDate, days)];
  if (limitedBy === "notice") {
    toVerify.push("The HR1 must arrive before the first notice of dismissal; the day before that notice is used to be safe.");
  }
  toVerify.push(...thresholdNote);
  const recipient = ni ? "the Department for the Economy" : "the Secretary of State (the Insolvency Service)";
  return result({
    date,
    basis: `The HR1 must reach ${recipient} at least ${days} days before the first dismissal takes effect and before any notice of dismissal is given. The date shown is the earlier of the two, counted as clear days.`,
    sources,
    toVerify,
    detail: { applies: true, days, limitedBy },
  });
});

/** Maximum protective award in days (TULRCA 1992 s189(4); ERO 1996 Art 217(4)). */
export const protectiveAwardMax: RuleFn = ukRule((read, nation) => {
  const dismissalDate = read.date("dismissalDate");
  if (!read.ok() || !dismissalDate) return read.needs();

  if (isNi(nation)) {
    return result({
      date: null,
      basis: "Northern Ireland: the protected period is at most 90 days (ERO 1996 Art 217(4)).",
      sources: ["ERO 1996 Art 217(4)"],
      detail: { maxDays: 90 },
    });
  }
  const after = dismissalDate >= GB_180_DAY_PROTECTIVE_AWARD_FROM;
  return result({
    date: null,
    basis: after
      ? "For dismissals taking effect on or after 6 April 2026 the protected period is at most 180 days (TULRCA 1992 s189(4) as amended)."
      : "For dismissals taking effect before 6 April 2026 the protected period is at most 90 days; the 180-day maximum applies only from that date.",
    sources: ["TULRCA 1992 s189(4)", "SI 2026/323 reg 5"],
    detail: { maxDays: after ? 180 : 90 },
  });
});

/** The cap on a week's pay, by the date the redundancy took effect. Newest first. */
const WEEKLY_CAPS: Record<"gb" | "ni", { from: IsoDate; amount: number; source: string }[]> = {
  gb: [
    { from: "2026-04-06", amount: 751, source: "gov.uk, Redundancy pay" },
    { from: "2025-04-06", amount: 719, source: "SI 2025/348" },
  ],
  ni: [
    { from: "2026-04-06", amount: 783, source: "LRA, Redundancy pay" },
    { from: "2025-04-06", amount: 749, source: "Employment Rights (Increase of Limits) Order (NI) 2025" },
  ],
};

/**
 * Statutory redundancy pay (ERA 1996 ss155, 162; the same bands in Northern
 * Ireland). Complete years of continuous employment are counted back from the
 * relevant date, up to 20. Each year earns half a week's pay, one week if the
 * employee was 22 or over for the whole year, or one and a half weeks if 41 or
 * over for the whole year, so the band is set by the age on the first day of
 * that year. The weekly cap is the one in force on the relevant date (SI
 * 2025/348 art 4: the "appropriate date" for a redundancy payment is the s145
 * relevant date).
 */
export const statutoryRedundancyPay: RuleFn = ukRule((read, nation) => {
  const startDate = read.date("startDate");
  const terminationDate = read.date("terminationDate");
  const dateOfBirth = read.date("dateOfBirth");
  const weeklyPay = read.number("weeklyPay");
  if (startDate && terminationDate && terminationDate < startDate) {
    read.reject("terminationDate", "is before startDate");
  }
  if (dateOfBirth && terminationDate && dateOfBirth >= terminationDate) {
    read.reject("dateOfBirth", "is not before terminationDate");
  }
  if (!read.ok() || !startDate || !terminationDate || !dateOfBirth || weeklyPay === undefined) {
    return read.needs();
  }

  const ni = isNi(nation);
  const completeYears = Math.floor(completeMonths(startDate, terminationDate) / 12);
  const qualifies = completeYears >= 2;
  let weeks = 0;
  for (let year = 1; year <= Math.min(completeYears, 20); year++) {
    const firstDay = addDays(addYears(terminationDate, -year), 1);
    const age = ageOn(dateOfBirth, firstDay);
    weeks += age >= 41 ? 1.5 : age >= 22 ? 1 : 0.5;
  }
  const cap = WEEKLY_CAPS[ni ? "ni" : "gb"].find((c) => terminationDate >= c.from);

  const sources = ni
    ? ["Employment Rights (NI) Order 1996 Part XII", "LRA, Redundancy pay", "nidirect, Redundancy pay"]
    : ["ERA 1996 s155", "ERA 1996 s162", "ERA 1996 s227"];
  if (cap && !sources.includes(cap.source)) sources.push(cap.source);

  const toVerify = [
    "If the employer gave less than the statutory minimum notice, the relevant date moves to when that notice would have ended (ERA 1996 s145(5)), which can add a year or change the cap.",
    "The week's pay is taken as given; how it is worked out (ERA 1996 ss221 to 229) is not checked.",
  ];
  if (!cap) toVerify.push("The weekly cap for redundancies before 6 April 2025 is not held, so no amount is given.");

  const amount = !qualifies ? 0 : cap ? Math.round(weeks * Math.min(weeklyPay, cap.amount) * 100) / 100 : null;
  const basis = qualifies
    ? `${plural(Math.min(completeYears, 20), "complete year")} count, at half a week's pay for each year under 22, one week from 22 and one and a half weeks from 41${cap ? `, with a week's pay capped at £${cap.amount}` : ""}. Only the last 20 years count.`
    : `Statutory redundancy pay needs 2 years' continuous employment ending with the relevant date, and there ${completeYears === 1 ? "is 1 complete year" : `are ${completeYears} complete years`}.`;
  return result({
    date: null,
    basis,
    sources,
    toVerify,
    detail: {
      qualifies,
      completeYears,
      weeks: qualifies ? weeks : 0,
      weeklyCap: cap ? cap.amount : null,
      amount,
    },
  });
});

export const LEAVE_TYPES = ["maternity", "adoption", "shared_parental", "neonatal", "bereaved_partner"] as const;

const OTHER_LEAVE_RULE: Record<Exclude<(typeof LEAVE_TYPES)[number], "maternity">, string> = {
  adoption: "Acas says protection runs from the start of adoption leave to 18 months after the placement date, which DraftHR does not collect yet.",
  shared_parental:
    "Acas says protection ends with the leave if it is under 6 weeks, or 18 months after the birth or placement after 6 or more continuous weeks.",
  neonatal:
    "Acas says protection ends with the leave if it is under 6 weeks, or 18 months after the birth or placement after 6 or more continuous weeks.",
  bereaved_partner:
    "Acas says protection ends with the leave if it is under 6 weeks, or 18 months after the birth or placement after 6 or more weeks.",
};

/**
 * Last day of redundancy priority protection (the right to be offered a
 * suitable vacancy first).
 *
 * Great Britain maternity: regulation 10 of the Maternity and Parental Leave
 * etc. Regulations 1999, as amended from 6 April 2024 (SI 2024/264). The
 * protected period runs from when the employer is told of the pregnancy and
 * "ends immediately before the relevant day", which is "the day after a period
 * of 18 months beginning with" the birth (if the employer was told the date)
 * or the first day of the expected week of childbirth. So the last protected
 * day is the last day of 18 months beginning with that date: a birth on
 * 9 June 2026 gives 8 December 2027.
 *
 * Northern Ireland: the priority applies only during maternity leave
 * (Maternity and Parental Leave etc. Regulations (NI) 1999 reg 10).
 */
export const familyLeaveProtectedPeriod: RuleFn = ukRule((read, nation) => {
  const leaveType = read.choice("leaveType", LEAVE_TYPES);
  const birthDate = read.optionalDate("birthDate");
  const expectedWeekStart = read.optionalDate("expectedWeekStart");
  const notifiedPregnancyDate = read.optionalDate("notifiedPregnancyDate");
  const leaveEndDate = read.optionalDate("leaveEndDate");
  if (!read.ok() || !leaveType) return read.needs();

  if (isNi(nation)) {
    if (!leaveEndDate) return needsResult(["leaveEndDate"]);
    const toVerify = [
      "No Northern Ireland extension of the priority period beyond the end of maternity leave has been confirmed.",
    ];
    if (leaveType !== "maternity") {
      toVerify.push("Whether Northern Ireland gives the same priority during other kinds of family leave is to verify.");
    }
    return result({
      date: leaveEndDate,
      basis: "In Northern Ireland the priority for suitable vacancies applies only during maternity leave, so it ends when the leave ends.",
      sources: ["MPL Regs (NI) 1999 reg 10"],
      toVerify,
      detail: { leaveType, from: notifiedPregnancyDate ?? null },
    });
  }

  if (leaveType !== "maternity") {
    return result({
      date: null,
      basis: `${OTHER_LEAVE_RULE[leaveType]} The protection also ends if employment ends.`,
      sources: ["Acas, Redundancy protection for pregnancy and new parents"],
      toVerify: ["The regulations for adoption, shared parental, neonatal care and bereaved partner's leave were not opened."],
      detail: { leaveType, leaveEndDate: leaveEndDate ?? null },
    });
  }

  const from = birthDate ?? expectedWeekStart;
  if (!from) {
    return {
      ...needsResult(["birthDate", "expectedWeekStart"]),
      basis: "Needs birthDate, or expectedWeekStart if the employer was not told the birth date, before this can be worked out.",
    };
  }

  const toVerify = [
    "The end day reads reg 10(1B) and (1C) as the last day of 18 months beginning with the birth, the day before the 18-month anniversary; a lawyer should confirm.",
  ];
  const detail: Record<string, FactValue> = {
    leaveType,
    from: notifiedPregnancyDate ?? null,
    runsFrom: birthDate ? "birth" : "expected_week",
  };
  if (birthDate) {
    toVerify.push(
      "The birth date counts only if the employer was told it before maternity leave ended (reg 10(1D)); otherwise the period runs from the expected week of childbirth."
    );
    if (expectedWeekStart) detail.endIfBirthNotNotified = lastDayOfMonthsBeginningWith(expectedWeekStart, 18);
  }
  return result({
    date: lastDayOfMonthsBeginningWith(from, 18),
    basis: `Priority for suitable vacancies runs from when the employer is told of the pregnancy until the end of 18 months beginning with the ${birthDate ? "birth" : "first day of the expected week of childbirth"}. It also ends if employment ends.`,
    sources: ["MPL Regs 1999 reg 10(1A) to (1D)", "SI 2024/264"],
    toVerify,
    detail,
  });
});

/**
 * Last day of the statutory trial period in a new or renewed role: "the
 * period of four weeks beginning with the date on which the employee starts
 * work" (ERA 1996 s138(3); ERO 1996 Art 173(3)). A period beginning with the
 * start day includes it, so four weeks (28 days) end on start + 27 days: a
 * Monday start ends on the Sunday four weeks later. The weeks are calendar
 * weeks, not working weeks (Benton v Sanderson Kayser Ltd [1989] ICR 136). A
 * longer retraining period counts only if agreed in writing before work starts
 * and stating its end date (s138(6)).
 */
export const trialPeriodEnd: RuleFn = ukRule((read, nation) => {
  const newRoleStartDate = read.date("newRoleStartDate");
  const retrainingEndDate = read.optionalDate("retrainingEndDate");
  if (newRoleStartDate && retrainingEndDate && retrainingEndDate < newRoleStartDate) {
    read.reject("retrainingEndDate", "is before newRoleStartDate");
  }
  if (!read.ok() || !newRoleStartDate) return read.needs();

  const ni = isNi(nation);
  const fourWeekEnd = addDays(newRoleStartDate, 27);
  const toVerify: string[] = [];
  if (retrainingEndDate) {
    toVerify.push(
      `The retraining end date counts only if it was agreed in writing before work started, with the terms that apply after it (${ni ? "ERO 1996 Art 173(6)" : "ERA 1996 s138(6)"}).`
    );
    if (retrainingEndDate < fourWeekEnd) {
      toVerify.push(`The retraining end date is earlier than the four-week end (${formatLongDate(fourWeekEnd)}), so it may not be a longer period at all.`);
    }
  }
  return result({
    date: retrainingEndDate ?? fourWeekEnd,
    basis: retrainingEndDate
      ? "The trial period runs to the end of the retraining period agreed in writing, in place of the usual four weeks."
      : "The trial period is four calendar weeks beginning with the day the employee starts work in the new role. Ending the new job within it keeps the redundancy dismissal and the right to a redundancy payment.",
    sources: ni ? ["ERO 1996 Art 173(3)"] : ["ERA 1996 s138(3)", "ERA 1996 s138(6)"],
    toVerify,
    detail: { fourWeekEnd },
  });
});

// ---------------------------------------------------------------------------
// Harassment
// ---------------------------------------------------------------------------

/**
 * Which duty to prevent sexual harassment applied on a date: none before
 * 26 October 2024; "reasonable steps" (Equality Act 2010 s40A) from then; "all
 * reasonable steps", with harassment by third parties covered, from 30 October
 * 2026 (ERA 2025 ss20, 21; SI 2026/1065 reg 3). The duty extends to England,
 * Wales and Scotland only.
 */
export const sexualHarassmentDuty: RuleFn = ukRule((read, nation) => {
  const conductDate = read.date("conductDate");
  if (!read.ok() || !conductDate) return read.needs();

  if (isNi(nation)) {
    return notApplicable(
      "The Equality Act 2010 prevention duty does not extend to Northern Ireland.",
      ["Whether Northern Ireland has an equivalent statutory duty to prevent sexual harassment is to verify."]
    );
  }
  if (conductDate < HARASSMENT_DUTY_FROM) {
    return result({
      date: null,
      basis: "Before 26 October 2024 there was no specific statutory duty to prevent sexual harassment; the usual employer liability and defence applied.",
      sources: ["Equality Act 2010 s109"],
      detail: { standard: "none", thirdParty: false },
    });
  }
  if (conductDate < ALL_REASONABLE_STEPS_FROM) {
    return result({
      date: null,
      basis: "From 26 October 2024 employers must take reasonable steps to prevent sexual harassment of their employees (Equality Act 2010 s40A). The stronger \"all reasonable steps\" duty starts on 30 October 2026.",
      sources: ["Equality Act 2010 s40A", "Worker Protection (Amendment of Equality Act 2010) Act 2023"],
      detail: { standard: "reasonable_steps", thirdParty: false },
    });
  }
  return result({
    date: null,
    basis: "From 30 October 2026 employers must take all reasonable steps to prevent sexual harassment of their employees, including harassment by third parties such as clients and customers.",
    sources: ["Equality Act 2010 s40A", "Equality Act 2010 s40(1A)", "ERA 2025 ss20, 21", "SI 2026/1065 reg 3"],
    toVerify: [
      "Conduct that began before 30 October 2026 and continued after it: how the two standards apply is to verify.",
      "Whether the third-party duty covers all harassment or only sexual harassment is to verify.",
    ],
    detail: { standard: "all_reasonable_steps", thirdParty: true },
  });
});
