import type { FactValue, IsoDate, RuleFn, RuleResult, UkNation } from "../types.js";
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
} from "./calendar.js";
import { needsResult, notApplicable, readInputs, result, type InputReader } from "./inputs.js";

/**
 * UK rules. Great Britain (England and Wales, Scotland) and Northern Ireland
 * have separate employment law: each rule says which provision it follows for
 * the case's nation, and returns the earlier date wherever the law is not yet
 * settled, listing the point in `toVerify`.
 */

/** First relevant date to which the Great Britain six-month tribunal limit applies (SI 2026/954 reg 4). */
export const GB_SIX_MONTH_LIMIT_FROM = "2026-10-01";
/**
 * England and Wales breach of contract claims get six months where the
 * effective date of termination is on or after this date (SI 2026/759 art 3).
 */
export const EW_BREACH_OF_CONTRACT_FROM = "2026-10-01";
/**
 * Scotland breach of contract claims get six months where the effective date
 * of termination is on or after this date, under the Employment Tribunals
 * Extension of Jurisdiction (Amendment) (Scotland) Order 2026 art 3.
 */
export const SCOTLAND_BREACH_OF_CONTRACT_FROM = "2026-11-09";
/**
 * Whether the rules treat that Scottish order as made. On 13 October 2026 it
 * was still a draft laid before the Scottish Parliament (approval recommended
 * on 22 September 2026). The coordinator's brief keeps six months from
 * 9 November 2026 with a toVerify, so this is true and every such result
 * carries the three-month date in toVerify and detail.ifScottishOrderNotMade.
 * Set it to false to return the earlier, three-month date instead.
 */
export const SCOTLAND_BREACH_OF_CONTRACT_ORDER_MADE: boolean = true;
/**
 * Six months' service is enough in Great Britain where the effective date of
 * termination is on or after this date, even if notice was given earlier (ERA
 * 2025 s25; SI 2026/559 regs 3 and 4). The compensatory award cap goes on the
 * same test.
 */
export const GB_SIX_MONTH_QUALIFYING_FROM = "2027-01-01";
/** Dismissals taking effect from this date can get a 180-day protective award (SI 2026/323). */
export const GB_180_DAY_PROTECTIVE_AWARD_FROM = "2026-04-06";
/** The 18-month redundancy priority applies where leave ends on or after this date (SI 2024/264). */
export const EXTENDED_PRIORITY_FROM = "2024-04-06";
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

/**
 * Northern Ireland provisions confirmed by the NI review (13 October 2026).
 * Discrimination is set by ground (NI_GROUND_LAW); detriment and breach of
 * contract were not opened.
 */
const NI_LIMIT_SOURCE: Partial<Record<ClaimType, string>> = {
  unfair_dismissal: "ERO 1996 Art 145(2)",
  deduction: "ERO 1996 Art 55(2), (3)",
  companion: "ER(NI)O 1999 Art 13(2)",
  protective_award: "ERO 1996 Art 217(5)",
  redundancy_pay: "ERO 1996 Art 199",
};

/** Protected characteristics the rules read from the `ground` input. Others are ignored. */
export const GROUNDS = [
  "sex",
  "pregnancy_maternity",
  "race",
  "national_origin",
  "disability",
  "age",
  "sexual_orientation",
  "religion_belief",
  "political_opinion",
] as const;

type Ground = (typeof GROUNDS)[number];

/** Northern Ireland time limit provision for each ground (NI review D11, G16, G17). */
const NI_GROUND_LAW: Record<Ground, string> = {
  sex: "SDO 1976 Art 76",
  pregnancy_maternity: "SDO 1976 Art 76",
  race: "RRO 1997 Art 65",
  national_origin: "RRO 1997 Art 65",
  disability: "DDA 1995 Sch 3 para 3",
  age: "SR 2006/261 reg 48",
  sexual_orientation: "SR 2003/497 reg 41",
  religion_belief: "FETO 1998 Art 46",
  political_opinion: "FETO 1998 Art 46",
};

/** Religious belief and political opinion claims go to the Fair Employment Tribunal. */
const FAIR_EMPLOYMENT: readonly Ground[] = ["religion_belief", "political_opinion"];

/**
 * Northern Ireland grounds whose early conciliation extension sits in their own
 * provisions rather than ERO 1996 Art 249B; those pages did not open, so the
 * extension is not confirmed (NI review G22).
 */
const NI_OWN_EXTENSION: Record<string, { name: string; law: string }> = {
  age: { name: "age", law: "SR 2006/261 reg 48A" },
  sexual_orientation: { name: "sexual orientation", law: "SR 2003/497 reg 41A" },
  religion_belief: { name: "fair employment", law: "FETO 1998 Art 46B" },
  political_opinion: { name: "fair employment", law: "FETO 1998 Art 46B" },
};

/** "religion_political" stands for both fair employment grounds. */
function readGrounds(read: InputReader): Ground[] {
  const given = read.optionalList("ground") ?? [];
  if (given.includes("religion_political")) given.push(...FAIR_EMPLOYMENT);
  return GROUNDS.filter((ground) => given.includes(ground));
}

const unique = (items: string[]) => [...new Set(items)];

type Answer = {
  date: IsoDate;
  basis: string;
  sources: string[];
  toVerify: string[];
  detail: Record<string, FactValue>;
};

/**
 * Last day to present a tribunal claim, before any early conciliation
 * extension.
 *
 * Great Britain: section 152 of and Schedule 12 to the Employment Rights Act
 * 2025, in force on 1 October 2026 (SI 2026/954 reg 3), changed the primary
 * limit for unfair dismissal, discrimination, deductions, detriment, the right
 * to be accompanied and protective award claims from three months to six.
 * Regulation 4 and the Schedule apply the longer limit only where the
 * "relevant date" is on or after 1 October 2026: the act complained of (the
 * last act in a series), the failure or threat for the right to be
 * accompanied, or for unfair dismissal the effective date of termination.
 * Earlier dates keep three months. Statutory redundancy pay (ERA 1996 s164)
 * was already six months.
 *
 * Breach of contract claims are not in Schedule 12. They follow the Extension
 * of Jurisdiction Orders, keyed to the effective date of termination: England
 * and Wales from 1 October 2026 (SI 2026/759), Scotland from 9 November 2026
 * under an order still in draft on 13 October 2026 (see
 * SCOTLAND_BREACH_OF_CONTRACT_ORDER_MADE).
 *
 * Northern Ireland: the 2025 Act's change does not reach industrial tribunal
 * claims there, so they stay at three months; the redundancy pay claim is six
 * months (ERO 1996 Art 199). Discrimination follows the law for the ground,
 * and fair employment claims (religious belief or political opinion) take the
 * earlier of three months from knowledge and six months from the act.
 *
 * Every period "begins with" its start date, so it ends the day before the
 * corresponding date N months later (see lastDayOfMonthsBeginningWith).
 */
export const tribunalTimeLimit: RuleFn = ukRule((read, nation) => {
  const claimType = read.choice("claimType", CLAIM_TYPES);
  const relevantDate = read.date("relevantDate");
  const grounds = readGrounds(read);
  const knowledgeDate = read.optionalDate("knowledgeDate");
  if (relevantDate && knowledgeDate && knowledgeDate < relevantDate) {
    read.reject("knowledgeDate", "is before relevantDate");
  }
  if (!read.ok() || !claimType || !relevantDate) return read.needs();

  const answer = isNi(nation)
    ? niTimeLimit(claimType, relevantDate, grounds, knowledgeDate)
    : claimType === "breach_of_contract"
      ? gbContractLimit(relevantDate, nation)
      : gbTimeLimit(claimType, relevantDate);
  answer.toVerify.push(NO_WEEKEND_ROLL);
  return result(answer);
});

function gbTimeLimit(claimType: Exclude<ClaimType, "breach_of_contract">, relevantDate: IsoDate): Answer {
  if (claimType === "redundancy_pay") {
    return {
      date: lastDayOfMonthsBeginningWith(relevantDate, 6),
      basis:
        "A statutory redundancy payment must be claimed in writing, agreed or referred to a tribunal within 6 months less one day of the relevant date (ERA 1996 s164). A tribunal may allow up to six months more if just and equitable.",
      sources: [GB_LIMIT_SOURCE.redundancy_pay],
      toVerify: [],
      detail: { months: 6 },
    };
  }
  const months = relevantDate >= GB_SIX_MONTH_LIMIT_FROM ? 6 : 3;
  const sources = [GB_LIMIT_SOURCE[claimType]];
  if (claimType === "deduction") sources.push("ERA 1996 s23(4A)");
  if (months === 6) {
    sources.push("ERA 2025 s152 and Sch 12", "SI 2026/954 reg 3, reg 4");
    // Sch 12 para 8 amends ERA 1999 s11(2); the SI's Schedule makes the failure or threat its relevant date.
    if (claimType === "companion") sources.push("SI 2026/954 Schedule");
  } else {
    sources.push("SI 2026/954 reg 4");
  }
  const twoYears =
    claimType === "deduction"
      ? " A tribunal cannot order repayment of deductions made more than two years before the claim is presented, even in a series."
      : "";
  return {
    date: lastDayOfMonthsBeginningWith(relevantDate, months),
    basis:
      (months === 6
        ? "The relevant date is on or after 1 October 2026, so under the Employment Rights Act 2025 the claim must be presented within 6 months less one day of it, subject to the Acas early conciliation extension."
        : "The relevant date is before 1 October 2026, so the claim must be presented within 3 months less one day of it, subject to the Acas early conciliation extension. The 6-month limit under the Employment Rights Act 2025 applies only from that date.") +
      twoYears,
    sources,
    toVerify: [],
    detail: { months },
  };
}

/**
 * Breach of contract (for example notice pay) in an employment tribunal, keyed
 * to the effective date of termination. A tribunal can hear it only once
 * employment has ended, and awards are capped at £25,000 (Extension of
 * Jurisdiction Orders 1994 arts 3(c) and 10); the civil courts allow six years
 * in England and Wales and five in Scotland.
 */
function gbContractLimit(relevantDate: IsoDate, nation: UkNation): Answer {
  const scotland = nation === "scotland";
  const from = scotland ? SCOTLAND_BREACH_OF_CONTRACT_FROM : EW_BREACH_OF_CONTRACT_FROM;
  const onOrAfter = relevantDate >= from;
  const months = onOrAfter && (!scotland || SCOTLAND_BREACH_OF_CONTRACT_ORDER_MADE) ? 6 : 3;
  const order = scotland ? "ETEJ (Scotland) Order 1994" : "ETEJ (England and Wales) Order 1994";
  const sources = [
    `${order} art 7`,
    scotland ? "ETEJ (Amendment) (Scotland) Order 2026 art 3 (draft)" : "SI 2026/759 art 3",
    `${order} arts 3(c), 10`,
    scotland ? "Prescription and Limitation (Scotland) Act 1973 s6" : "Limitation Act 1980 s5",
  ];
  const toVerify: string[] = [];
  const detail: Record<string, FactValue> = { months };

  let limit: string;
  if (months === 6 && scotland) {
    const ifNotMade = lastDayOfMonthsBeginningWith(relevantDate, 3);
    detail.ifScottishOrderNotMade = ifNotMade;
    limit =
      "The effective date of termination is on or after 9 November 2026, so under the Scottish order moving these claims to 6 months the claim must be presented within 6 months less one day of it";
    toVerify.push(
      `The Employment Tribunals Extension of Jurisdiction (Amendment) (Scotland) Order 2026 (art 3) was still a draft on 13 October 2026. If it is not made as drafted, the limit stays at 3 months less one day: ${formatLongDate(ifNotMade)}.`
    );
  } else if (months === 6) {
    limit = `The effective date of termination is on or after ${formatLongDate(from)}, so the claim must be presented within 6 months less one day of it`;
  } else if (onOrAfter) {
    const ifMade = lastDayOfMonthsBeginningWith(relevantDate, 6);
    detail.ifScottishOrderMade = ifMade;
    limit =
      "The effective date of termination is on or after 9 November 2026, but the Scottish order moving these claims to 6 months had not been made when this was checked, so the 3-month limit is used: within 3 months less one day of it";
    toVerify.push(
      `If the Employment Tribunals Extension of Jurisdiction (Amendment) (Scotland) Order 2026 is made as drafted (art 3), the limit is 6 months less one day: ${formatLongDate(ifMade)}. It was still a draft on 13 October 2026, so recheck whether it has been made.`
    );
  } else {
    limit = `The effective date of termination is before ${formatLongDate(from)}, so the claim must be presented within 3 months less one day of it (the 6-month limit for breach of contract claims in ${scotland ? "Scotland" : "England and Wales"} applies only from that date)`;
  }
  return {
    date: lastDayOfMonthsBeginningWith(relevantDate, months),
    basis: `A breach of contract claim, such as notice pay, runs from the effective date of termination, or the last day worked if there is none. ${limit}, subject to the Acas early conciliation extension. A tribunal can hear it only once employment has ended and can award up to £25,000; larger claims can go to the civil courts (${scotland ? "5 years in Scotland" : "6 years in England and Wales"}).`,
    sources,
    toVerify,
    detail,
  };
}

function niTimeLimit(
  claimType: ClaimType,
  relevantDate: IsoDate,
  grounds: Ground[],
  knowledgeDate: IsoDate | undefined
): Answer {
  if (claimType === "redundancy_pay") {
    return {
      date: lastDayOfMonthsBeginningWith(relevantDate, 6),
      basis:
        "Northern Ireland: a statutory redundancy payment must be claimed in writing, agreed or referred to a tribunal within 6 months less one day of the relevant date (ERO 1996 Art 199). A tribunal may allow up to six months more if just and equitable.",
      sources: ["ERO 1996 Art 199"],
      toVerify: [],
      detail: { months: 6 },
    };
  }
  if (claimType === "discrimination") return niDiscrimination(relevantDate, grounds, knowledgeDate);

  const source = NI_LIMIT_SOURCE[claimType];
  const toVerify: string[] = [];
  if (!source) {
    toVerify.push(
      "The Northern Ireland provision for this claim type was not opened; 3 months less one day is the usual industrial tribunal limit there."
    );
  }
  const basis =
    claimType === "deduction"
      ? "Northern Ireland: an unlawful deductions claim must be presented within 3 months less one day of the payment the deduction was made from, or of the last deduction in a series, subject to the Labour Relations Agency early conciliation extension. Article 55 has no two-year limit on how far back the claim reaches."
      : "Northern Ireland: the claim must be presented within 3 months less one day of the relevant date, subject to the Labour Relations Agency early conciliation extension. The Employment Rights Act 2025 six-month limit does not apply in Northern Ireland.";
  return {
    date: lastDayOfMonthsBeginningWith(relevantDate, 3),
    basis,
    sources: [source ?? "Employment Rights (NI) Order 1996"],
    toVerify,
    detail: { months: 3 },
  };
}

/**
 * Northern Ireland discrimination: three months beginning when the act was
 * done for sex, race, disability, age and sexual orientation. Fair employment
 * claims (religious belief or political opinion) end on the earlier of three
 * months from when the claimant first knew, or might reasonably have known, of
 * the act and six months from the act (FETO 1998 Art 46(1)), which is never
 * earlier than three months from the act.
 */
function niDiscrimination(relevantDate: IsoDate, grounds: Ground[], knowledgeDate: IsoDate | undefined): Answer {
  const threeMonths = lastDayOfMonthsBeginningWith(relevantDate, 3);
  const fairEmploymentOnly = grounds.length > 0 && grounds.every((g) => FAIR_EMPLOYMENT.includes(g));
  if (fairEmploymentOnly) {
    const sixMonths = lastDayOfMonthsBeginningWith(relevantDate, 6);
    const fromKnowledge = lastDayOfMonthsBeginningWith(knowledgeDate ?? relevantDate, 3);
    const date = earlierOf(fromKnowledge, sixMonths);
    const toVerify: string[] = [];
    if (!knowledgeDate) {
      toVerify.push(
        `Counted from the act itself. If the claimant first knew of it later, the limit is the earlier of 3 months from then and 6 months from the act, ${formatLongDate(sixMonths)} at the latest (FETO 1998 Art 46(1)).`
      );
    }
    return {
      date,
      basis:
        "Northern Ireland: a religious belief or political opinion claim goes to the Fair Employment Tribunal. It must be presented by the earlier of 3 months less one day from when the claimant first knew, or might reasonably have known, of the act, and 6 months less one day from the act, subject to early conciliation.",
      sources: ["FETO 1998 Art 46(1)"],
      toVerify,
      detail: { months: date === sixMonths && fromKnowledge !== sixMonths ? 6 : 3 },
    };
  }

  const laws = grounds.length
    ? unique(grounds.map((g) => NI_GROUND_LAW[g]))
    : ["SDO 1976 Art 76", "RRO 1997 Art 65", "DDA 1995 Sch 3 para 3", "SR 2006/261 reg 48", "SR 2003/497 reg 41", "FETO 1998 Art 46"];
  const fairEmploymentToo = grounds.length === 0 || grounds.some((g) => FAIR_EMPLOYMENT.includes(g));
  return {
    date: threeMonths,
    basis: `Northern Ireland: a discrimination claim must be presented within 3 months less one day of when the act was done, subject to the Labour Relations Agency early conciliation extension. Conduct over a period counts from its end, and a tribunal may extend time where it is just and equitable.${fairEmploymentToo ? " A religious belief or political opinion claim to the Fair Employment Tribunal can end later, never earlier." : ""}`,
    sources: laws,
    toVerify: [],
    detail: { months: 3 },
  };
}

/**
 * Where Article 249B applies in Northern Ireland (NI review G21; R5; R19).
 * Age, sexual orientation and fair employment claims are left out (G22).
 */
const NI_249B_SCOPE =
  "Article 249B is applied to unfair dismissal (ERO 1996 Art 145(2A)), deductions (Art 55(2A)), protective awards (Art 217(5A)), redundancy payments (Art 199(4)), the right to be accompanied (ER(NI)O 1999 Art 13(2A)) and sex, race and disability claims (SDO 1976 Art 76(1A); RRO 1997 Art 65(1A); DDA 1995 Sch 3 para 3(1A)). Age, sexual orientation and fair employment claims use their own provisions (SR 2006/261 reg 48A; SR 2003/497 reg 41A; FETO 1998 Art 46B), not yet confirmed; for those, rely on the date before the extension.";

/**
 * The time limit once early conciliation is added (ERA 1996 s207B, applied
 * to the Equality Act by s140B and to protective awards by TULRCA s292A; ERO
 * 1996 Art 249B in Northern Ireland, which has the same formula).
 *
 * Subsection (3): the days from the day after Day A up to and including Day B
 * are not counted, so they are added to the limit. Subsection (4): if the
 * limit so extended would expire between Day A and one month after Day B, it
 * expires at the end of that period instead. "One month after Day B" is the
 * corresponding date in the next month, or that month's last day where there
 * is none. Conciliation started after the limit has passed extends nothing:
 * s207B only stops the clock on a limit that has not yet expired.
 *
 * In Northern Ireland, for age, sexual orientation and fair employment claims
 * (the `ground` input), the extension is not confirmed and the unextended
 * date is returned.
 */
export const earlyConciliation: RuleFn = ukRule((read, nation) => {
  const limitDate = read.date("limitDate");
  const dayA = read.date("dayA");
  const dayB = read.date("dayB");
  const grounds = readGrounds(read);
  if (dayA && dayB && dayB < dayA) read.reject("dayB", "is before dayA");
  if (!read.ok() || !limitDate || !dayA || !dayB) return read.needs();

  const ni = isNi(nation);
  const body = ni ? "the Labour Relations Agency" : "Acas";
  const sources = ni
    ? ["ERO 1996 Art 249B", "Industrial Tribunals (NI) Order 1996 Art 20A"]
    : ["ERA 1996 s207B", "Equality Act 2010 s140B", "TULRCA 1992 s292A", "ETA 1996 s18A", "SI 2025/1153 reg 2"];
  const ownExtension = ni ? grounds.filter((g) => g in NI_OWN_EXTENSION) : [];
  const toVerify: string[] = [];
  if (ni && grounds.length === 0) toVerify.push(NI_249B_SCOPE);

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
  const oneMonthAfterDayB = addMonths(dayB, 1);
  const extendedDate = laterOf(addDays(limitDate, stoppedDays), oneMonthAfterDayB);
  if (Number(dayB.slice(8)) > Number(oneMonthAfterDayB.slice(8))) {
    toVerify.push(
      "The month after the certificate has no matching date, so one month after Day B is taken as that month's last day."
    );
  }

  if (ownExtension.length) {
    const kinds = unique(ownExtension.map((g) => NI_OWN_EXTENSION[g].name));
    const laws = unique(ownExtension.map((g) => NI_OWN_EXTENSION[g].law));
    return result({
      date: limitDate,
      basis: `For ${kinds.join(" and ")} claims in Northern Ireland the early conciliation extension is in their own provisions, which have not been confirmed, so the date before any extension is shown.`,
      sources: [...sources, ...laws],
      toVerify: [
        `${laws.join(" and ")} ${laws.length === 1 ? "is" : "are"} expected to work like ERO 1996 Art 249B, which would give ${formatLongDate(extendedDate)}; a lawyer should confirm.`,
        ...toVerify,
      ],
      detail: { stoppedDays, oneMonthAfterDayB, extendedDate },
    });
  }

  toVerify.push(NO_WEEKEND_ROLL);
  return result({
    date: extendedDate,
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
    const days = `${holidaysSkipped.map(formatLongDate).join(" and ")} as ${holidaysSkipped.length === 1 ? "a bank holiday" : "bank holidays"}`;
    toVerify.push(
      isNi(nation)
        ? `Counts ${days} because gov.uk lists ${holidaysSkipped.length === 1 ? "it" : "them"} for Northern Ireland. New Year's Day, the early May bank holiday and 12 July are not in Schedule 1 to the Banking and Financial Dealings Act 1971, and whether such days count for ER(NI)O 1999 Art 15(6) is not settled; treating them as non-working gives the worker the longer window.`
        : `Counts ${days} under the Banking and Financial Dealings Act 1971 because gov.uk lists ${holidaysSkipped.length === 1 ? "it" : "them"} for ${NATION_NAME[nation]}.`
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
 * period is "not less than" two years (Great Britain), six months (Great
 * Britain where the effective date of termination is on or after 1 January
 * 2027, even if notice was given in 2026: ERA 2025 s25(2); SI 2026/559 regs 3
 * and 4) or one year (Northern Ireland, ERO 1996 Art 140(1)) "ending with the
 * effective date of termination", counting the start day: someone who started
 * on 1 May 2025 has two years on 30 April 2027.
 *
 * Where employment ended with less than the statutory minimum notice, that
 * notice is added to the termination date for this test (ERA 1996 s97(2) for a
 * dismissal, s97(4) for a resignation; ERO 1996 Art 129(2)). The
 * `withoutNotice` input says whether that happened; without it the rule says
 * when adding the notice would change the answer.
 */
export const qualifyingService: RuleFn = ukRule((read, nation) => {
  const startDate = read.date("startDate");
  const terminationDate = read.date("terminationDate");
  const automatic = read.optionalFlag("automaticReason") === true;
  const withoutNotice = read.optionalFlag("withoutNotice");
  const resignation = read.optionalFlag("resignation") === true;
  if (startDate && terminationDate && terminationDate < startDate) {
    read.reject("terminationDate", "is before startDate");
  }
  if (!read.ok() || !startDate || !terminationDate) return read.needs();

  const ni = isNi(nation);
  const monthsFor = (date: IsoDate) => (ni ? 12 : date >= GB_SIX_MONTH_QUALIFYING_FROM ? 6 : 24);
  // SI 2026/559 reg 4 picks the regime by the effective date of termination itself.
  const months = monthsFor(terminationDate);
  const metOn = lastDayOfMonthsBeginningWith(startDate, months);
  const s97Section = ni ? "ERO 1996 Art 129(2)" : resignation ? "ERA 1996 s97(4)" : "ERA 1996 s97(2)";
  const s97Date = addDays(terminationDate, 7 * statutoryNoticeWeeks(startDate, terminationDate));
  const testDate = withoutNotice === true ? s97Date : terminationDate;
  const qualifies = automatic || testDate >= metOn;
  const period = months === 24 ? "2 years'" : months === 12 ? "1 year's" : "6 months'";

  const toVerify: string[] = [];
  const sources = ni ? ["ERO 1996 Art 140(1)", "ERO 1996 Art 129(2)"] : ["ERA 1996 s108(1)", s97Section];
  if (months === 6) sources.push("ERA 2025 s25(2)", "SI 2026/559 regs 3, 4");
  if (automatic) sources.push(ni ? "ERO 1996 Art 140(3)" : "ERA 1996 s108(3)");

  const detail: Record<string, FactValue> = { qualifies, months };
  if (!automatic && withoutNotice !== false && s97Date !== terminationDate) {
    detail.s97Date = s97Date;
    if (withoutNotice === undefined && (s97Date >= metOn) !== qualifies) {
      toVerify.push(
        `If employment ended with less than the statutory minimum notice, ${s97Section} treats it as ending on ${formatLongDate(s97Date)} for this test, and the answer would change.`
      );
    }
    if (!ni && terminationDate < GB_SIX_MONTH_QUALIFYING_FROM && s97Date >= GB_SIX_MONTH_QUALIFYING_FROM) {
      const sixMonthsMet = s97Date >= lastDayOfMonthsBeginningWith(startDate, 6);
      if (sixMonthsMet !== (s97Date >= metOn)) {
        toVerify.push(
          "If statutory notice is added, the date falls in 2027. Whether that later date also brings in the 6-month period under SI 2026/559 reg 4 is not settled, so the 2-year period is used; with 6 months the period would be met."
        );
      }
    }
    if (!ni && withoutNotice === true && !resignation) {
      toVerify.push(
        "Whether statutory notice is added where summary dismissal was justified by the employee's conduct (ERA 1996 s86(6)) is not settled."
      );
    }
    if (ni && withoutNotice === true && resignation) {
      toVerify.push("ERO 1996 Art 129(2) was read for a dismissal; the Northern Ireland rule for a resignation without full notice was not checked.");
    }
  }

  const law = ni ? "ERO 1996 Art 140(1)" : "ERA 1996 s108(1)";
  let basis = automatic
    ? `No qualifying period applies to a dismissal for an automatically unfair reason (${ni ? "ERO 1996 Art 140(3)" : "ERA 1996 s108(3)"}). The date shown is when the usual ${period} continuous employment would be met.`
    : `Ordinary unfair dismissal needs ${period} continuous employment ending with the effective date of termination (${law}${months === 6 ? " as amended by ERA 2025 s25(2)" : ""}).${months === 24 ? " The 6-month period applies where the effective date of termination is on or after 1 January 2027, including notice given before then that ends on or after it." : ""}${months === 6 ? " It applies because the effective date of termination is on or after 1 January 2027, even if notice was given earlier." : ""}`;
  if (!automatic && withoutNotice === true && s97Date !== terminationDate) {
    basis += ` Employment ended without full statutory notice, so that notice is added and the test is applied on ${formatLongDate(s97Date)} (${s97Section}).`;
  }
  return result({ date: metOn, basis, sources, toVerify, detail });
});

/**
 * Written reasons for dismissal, due within 14 days of a request (ERA 1996
 * s92(2); ERO 1996 Art 124(2)). The employee needs 2 years' service in Great
 * Britain, or 6 months where the effective date of termination is on or after
 * 1 January 2027 (s92(3); ERA 2025 Sch 3 para 1(2); SI 2026/559 reg 4), and 1
 * year in Northern Ireland (Art 124(3)). Someone dismissed while pregnant or on
 * maternity or adoption leave gets reasons without asking and whatever their
 * service (s92(4), (4A); Art 124(4), (4A)).
 */
export const writtenReasons: RuleFn = ukRule((read, nation) => {
  const requestDate = read.date("requestDate");
  const automatic = read.optionalFlag("pregnantOrOnLeave") === true;
  const startDate = read.optionalDate("startDate");
  const terminationDate = read.optionalDate("terminationDate");
  if (startDate && terminationDate && terminationDate < startDate) {
    read.reject("terminationDate", "is before startDate");
  }
  if (!read.ok() || !requestDate) return read.needs();

  const ni = isNi(nation);
  // "Within fourteen days of" the request: the request day itself is not counted.
  const date = addDays(requestDate, 14);
  const sources = ni ? ["ERO 1996 Art 124(2), (3)"] : ["ERA 1996 s92(2), (3)"];
  if (automatic) sources.push(ni ? "ERO 1996 Art 124(4), (4A)" : "ERA 1996 s92(4), (4A)");

  const detail: Record<string, FactValue> = { automatic };
  let service = ni
    ? " The employee needs 1 year's continuous employment for this right (Art 124(3))."
    : " The employee needs 2 years' continuous employment for this right, or 6 months where the effective date of termination is on or after 1 January 2027 (s92(3)).";
  if (startDate && terminationDate) {
    const monthsNeeded = ni ? 12 : terminationDate >= GB_SIX_MONTH_QUALIFYING_FROM ? 6 : 24;
    if (monthsNeeded === 6) sources.push("ERA 2025 Sch 3 para 1(2)", "SI 2026/559 reg 4");
    const met = terminationDate >= lastDayOfMonthsBeginningWith(startDate, monthsNeeded);
    detail.qualifies = automatic || met;
    detail.monthsNeeded = monthsNeeded;
    const needed = monthsNeeded === 24 ? "2 years'" : monthsNeeded === 12 ? "1 year's" : "6 months'";
    service = ` The employee needs ${needed} continuous employment ending with the effective date of termination, and ${met ? "has it" : "does not have it"}.`;
  }

  const basis = automatic
    ? `Someone dismissed while pregnant or on maternity or adoption leave is entitled to written reasons without asking and whatever their length of service (${ni ? "ERO 1996 Art 124(4), (4A)" : "ERA 1996 s92(4), (4A)"}). Any request must still be answered within 14 days.`
    : `An employer must give written reasons for dismissal within 14 days of the employee's request (${ni ? "ERO 1996 Art 124(2)" : "ERA 1996 s92(2)"}).${service}`;
  return result({ date, basis, sources, detail });
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
    sources: isNi(nation) ? ["ERO 1996 Art 118(1), (6)"] : ["ERA 1996 s86(1), (6)"],
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
  const sources = ni ? ["ERO 1996 Art 221", "ERO 1996 Art 222"] : ["TULRCA 1992 s193", "TULRCA 1992 s194"];
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
  const niRoute = ni
    ? " In Northern Ireland it is sent on the NISRA online HR1 form, a copy goes to each representative consulted, and failing to notify is an offence (ERO 1996 Art 221(6), Art 222)."
    : "";
  return result({
    date,
    basis: `The HR1 must reach ${recipient} at least ${days} days before the first dismissal takes effect and before any notice of dismissal is given. The date shown is the earlier of the two, counted as clear days.${niRoute}`,
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
      ? "For dismissals taking effect on or after 6 April 2026 the protected period is at most 180 days (TULRCA 1992 s189(4) as amended). Each dismissal's own date decides, so earlier dismissals in the same group keep 90 days."
      : "For dismissals taking effect before 6 April 2026 the protected period is at most 90 days; the 180-day maximum applies only to dismissals taking effect from that date, each dismissal's own date deciding.",
    sources: ["TULRCA 1992 s189(4)", "SI 2026/323 reg 5"],
    detail: { maxDays: after ? 180 : 90 },
  });
});

/** The cap on a week's pay, by the date the redundancy took effect. Newest first. */
const WEEKLY_CAPS: Record<"gb" | "ni", { from: IsoDate; amount: number; source: string }[]> = {
  gb: [
    { from: "2026-04-06", amount: 751, source: "SI 2026/310 Schedule" },
    { from: "2025-04-06", amount: 719, source: "SI 2025/348" },
  ],
  ni: [
    { from: "2026-04-06", amount: 783, source: "SR 2026/57 Schedule" },
    { from: "2025-04-06", amount: 749, source: "Employment Rights (Increase of Limits) Order (NI) 2025" },
  ],
};

const weeklyCapOn = (date: IsoDate, nation: UkNation) => WEEKLY_CAPS[isNi(nation) ? "ni" : "gb"].find((c) => date >= c.from);

/**
 * Statutory redundancy pay (ERA 1996 ss155, 162; ERO 1996 Arts 190, 197 in
 * Northern Ireland, with the same bands). Two years' continuous employment are
 * needed everywhere. Complete years are counted back from the relevant date,
 * up to 20. Each year earns half a week's pay, one week if the employee was 22
 * or over for the whole year, or one and a half weeks if 41 or over for the
 * whole year, so the band is set by the age on the first day of that year. The
 * weekly cap is the one in force on the relevant date (SI 2026/310 art 4(2)(o):
 * the "appropriate date" is the s145 relevant date; SR 2026/57 art 4(2)(l):
 * the Art 180 relevant date).
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
  const cap = weeklyCapOn(terminationDate, nation);

  const sources = ni
    ? ["ERO 1996 Art 190", "ERO 1996 Art 197", "ERO 1996 Art 23(1)", "SR 2026/57 art 4(2)(l)"]
    : ["ERA 1996 s155", "ERA 1996 s162", "ERA 1996 s227(1)", "SI 2026/310 art 4(2)(o)"];
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

/** The fixed cap on the unfair dismissal compensatory award, by effective date of termination. Newest first. */
const COMPENSATION_CAPS: Record<"gb" | "ni", { from: IsoDate; amount: number; source: string }[]> = {
  gb: [
    { from: "2026-04-06", amount: 123543, source: "SI 2026/310 Schedule" },
    { from: "2025-04-06", amount: 118223, source: "SI 2025/348" },
  ],
  ni: [
    { from: "2026-04-06", amount: 123785, source: "SR 2026/57 Schedule" },
    { from: "2025-04-06", amount: 118455, source: "SR 2026/57 Schedule" },
  ],
};

const pounds = (amount: number) => `£${amount.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

/**
 * The cap on the unfair dismissal compensatory award. Great Britain: the
 * lower of the fixed cap and 52 weeks' pay (ERA 1996 s124(1ZA)), removed where
 * the effective date of termination is on or after 1 January 2027 (ERA 2025
 * s25(3) omits s124; SI 2026/559 reg 4). Northern Ireland keeps a fixed cap
 * (ERO 1996 Art 158(1)), keyed to the effective date of termination (SR
 * 2026/57 art 4(2)(j)).
 */
export const compensationCap: RuleFn = ukRule((read, nation) => {
  const terminationDate = read.date("terminationDate");
  const weeklyPay = read.optionalNumber("weeklyPay");
  if (!read.ok() || !terminationDate) return read.needs();

  const ni = isNi(nation);
  if (!ni && terminationDate >= GB_SIX_MONTH_QUALIFYING_FROM) {
    return result({
      date: null,
      basis:
        "The effective date of termination is on or after 1 January 2027, so the compensatory award has no cap: the Employment Rights Act 2025 removes both the fixed cap and the 52 weeks' pay limit.",
      sources: ["ERA 2025 s25(3)", "SI 2026/559 reg 4"],
      detail: { capRemoved: true, fixedCap: null, weeksPayCap: null, cap: null },
    });
  }

  const fixed = COMPENSATION_CAPS[ni ? "ni" : "gb"].find((c) => terminationDate >= c.from);
  const weeksPayCap = !ni && weeklyPay !== undefined ? Math.round(weeklyPay * 52 * 100) / 100 : null;
  const sources = ni ? ["ERO 1996 Art 158(1)", "SR 2026/57 art 4(2)(j)"] : ["ERA 1996 s124(1ZA)"];
  if (fixed && !sources.includes(fixed.source)) sources.push(fixed.source);
  const toVerify: string[] = [];
  if (!fixed) toVerify.push("The cap for an effective date of termination before 6 April 2025 is not held.");
  if (!ni && weeklyPay === undefined) {
    toVerify.push("weeklyPay was not given, so the 52 weeks' pay limit, which may be lower, is not worked out.");
  }
  if (!ni && weeklyPay !== undefined) {
    toVerify.push("The week's pay is taken as given; how it is worked out (ERA 1996 ss221 to 229) is not checked.");
  }

  const known = [fixed?.amount, weeksPayCap ?? undefined].filter((n): n is number => n !== undefined);
  const cap = known.length ? Math.min(...known) : null;
  let basis: string;
  if (ni) {
    basis = fixed
      ? `Northern Ireland keeps the cap on the compensatory award: ${pounds(fixed.amount)} where the effective date of termination is on or after ${formatLongDate(fixed.from)}. The Great Britain removal from 1 January 2027 does not apply.`
      : "Northern Ireland keeps the cap on the compensatory award; the amount for this date is not held.";
  } else {
    const limb = weeksPayCap === null ? "52 weeks' pay" : `52 weeks' pay (${pounds(weeksPayCap)})`;
    basis = fixed
      ? `The effective date of termination is before 1 January 2027, so the compensatory award is capped at the lower of ${pounds(fixed.amount)} and ${limb}. The cap is removed where the effective date of termination is on or after 1 January 2027.`
      : `The compensatory award is capped at the lower of the fixed cap for this date, which is not held, and ${limb}.`;
  }
  return result({
    date: null,
    basis,
    sources,
    toVerify,
    detail: { capRemoved: false, fixedCap: fixed ? fixed.amount : null, weeksPayCap, cap },
  });
});

/**
 * The limit on a week's pay (ERA 1996 s227(1); ERO 1996 Art 23(1)) on the
 * "appropriate date" the Increase of Limits Orders set for each claim: for a
 * companion claim, the date of the failure or threat (SI 2026/310 art
 * 4(2)(r)); for redundancy pay, the relevant date.
 */
export const weeklyPayCap: RuleFn = ukRule((read, nation) => {
  const appropriateDate = read.date("appropriateDate");
  if (!read.ok() || !appropriateDate) return read.needs();

  const ni = isNi(nation);
  const cap = weeklyCapOn(appropriateDate, nation);
  const law = ni ? "ERO 1996 Art 23(1)" : "ERA 1996 s227(1)";
  if (!cap) {
    return result({
      date: null,
      basis: `A week's pay is capped (${law}); the limit for this date is not held.`,
      sources: [law],
      toVerify: ["The weekly pay limit before 6 April 2025 is not held."],
      detail: { weeklyCap: null },
    });
  }
  return result({
    date: null,
    basis: `A week's pay is capped at £${cap.amount} where the appropriate date is on or after ${formatLongDate(cap.from)} (${law}). For a companion claim the appropriate date is the date of the failure or threat.`,
    sources: ni ? [law, cap.source] : [law, cap.source, "SI 2026/310 art 4(2)(r)"],
    detail: { weeklyCap: cap.amount },
  });
});

export const LEAVE_TYPES = [
  "maternity",
  "adoption",
  "shared_parental",
  "neonatal",
  "bereaved_partner",
  "paternity",
] as const;

type LeaveType = (typeof LEAVE_TYPES)[number];

/** Great Britain regulation for each leave type's priority (GB review R01, R33). */
const GB_PRIORITY_LAW: Record<Exclude<LeaveType, "paternity">, string[]> = {
  maternity: ["MPL Regs 1999 reg 10(1) to (1E)", "MPL Regs 1999 reg 20(1)(b)", "SI 2024/264 reg 3"],
  adoption: ["PAL Regs 2002 reg 23", "SI 2024/264"],
  shared_parental: ["SPL Regs 2014 reg 39", "SI 2024/264"],
  neonatal: ["SI 2025/375 reg 14"],
  bereaved_partner: ["SI 2026/237 reg 14"],
};

const LEAVE_NAME: Record<LeaveType, string> = {
  maternity: "maternity leave",
  adoption: "adoption leave",
  shared_parental: "shared parental leave",
  neonatal: "neonatal care leave",
  bereaved_partner: "bereaved partner's paternity leave",
  paternity: "paternity leave",
};

/** Northern Ireland: priority only during these leaves (NI review R6, G4). */
const NI_PRIORITY_LAW: Partial<Record<LeaveType, string>> = {
  maternity: "MPL Regs (NI) 1999 reg 10",
  adoption: "PAL Regs (NI) 2002 reg 23",
  shared_parental: "SPL Regs (NI) 2015 reg 39",
};

/**
 * Last day of redundancy priority protection (the right to be offered a
 * suitable available vacancy first).
 *
 * Great Britain: the protection runs through the leave and then for a period
 * that "ends immediately before the relevant day", the day after 18 months
 * beginning with the birth (if the employer was told the date), the first day
 * of the expected week of childbirth, or the adoption placement or entry date.
 * So the last protected day is the day before the 18-month anniversary: a
 * birth on 9 June 2026 gives 8 December 2027 (MPL Regs 1999 reg 10(1B), (1C);
 * PAL Regs 2002 reg 23; SPL Regs 2014 reg 39; SI 2025/375 reg 14; SI 2026/237
 * reg 14). Shared parental, neonatal care and bereaved partner's paternity
 * leave get the 18 months only after six or more consecutive weeks of that
 * leave; otherwise protection ends with the leave. Ordinary paternity leave
 * gives no priority. The extended periods apply where the leave ends on or
 * after 6 April 2024 (SI 2024/264).
 *
 * Northern Ireland: priority applies only during maternity, adoption or shared
 * parental leave, and ends when the leave ends (NI review R6, R7).
 */
export const familyLeaveProtectedPeriod: RuleFn = ukRule((read, nation) => {
  const leaveType = read.choice("leaveType", LEAVE_TYPES);
  const birthDate = read.optionalDate("birthDate");
  const expectedWeekStart = read.optionalDate("expectedWeekStart");
  const notifiedPregnancyDate = read.optionalDate("notifiedPregnancyDate");
  const leaveEndDate = read.optionalDate("leaveEndDate");
  const placementDate = read.optionalDate("placementDate");
  const sixWeeks = read.optionalFlag("sixConsecutiveWeeks");
  const birthNotified = read.optionalFlag("birthNotified");
  if (!read.ok() || !leaveType) return read.needs();

  const name = LEAVE_NAME[leaveType];
  if (isNi(nation)) {
    const law = NI_PRIORITY_LAW[leaveType];
    if (!law) {
      return result({
        date: null,
        basis: `In Northern Ireland the priority for suitable vacancies is confirmed only during maternity, adoption and shared parental leave; ${name} is not among them.`,
        sources: Object.values(NI_PRIORITY_LAW),
        toVerify: [`Whether Northern Ireland gives any priority during ${name} was not checked.`],
        detail: { leaveType, covered: false },
      });
    }
    if (!leaveEndDate) return needsResult(["leaveEndDate"]);
    return result({
      date: leaveEndDate,
      basis: `In Northern Ireland the priority for suitable vacancies applies only while the employee is on ${name}, so it ends when the leave ends. There is no protection from notification of pregnancy and no 18-month extension.`,
      sources: [law],
      detail: { leaveType, covered: true, from: notifiedPregnancyDate ?? null },
    });
  }

  if (leaveType === "paternity") {
    return result({
      date: null,
      basis:
        "Ordinary paternity leave gives no redundancy priority. Bereaved partner's paternity leave is separate and is covered.",
      sources: ["Acas, Redundancy protection for pregnancy and new parents", "SI 2026/237 reg 14"],
      detail: { leaveType, covered: false },
    });
  }

  const sources = [...GB_PRIORITY_LAW[leaveType]];
  const detail: Record<string, FactValue> = { leaveType, covered: true };

  if (leaveEndDate && leaveEndDate < EXTENDED_PRIORITY_FROM && leaveType !== "neonatal" && leaveType !== "bereaved_partner") {
    return result({
      date: leaveEndDate,
      basis: `The ${name} ended before 6 April 2024, so the 18-month extension does not apply and the priority ended with the leave.`,
      sources: unique([...sources, "SI 2024/264"]),
      detail: { ...detail, extended: false },
    });
  }

  if (leaveType === "shared_parental" || leaveType === "neonatal" || leaveType === "bereaved_partner") {
    if (sixWeeks === undefined) {
      return {
        ...needsResult(["sixConsecutiveWeeks"]),
        basis: `Needs sixConsecutiveWeeks: the protection after ${name} runs to 18 months only after six or more consecutive weeks of it, and otherwise ends with the leave.`,
      };
    }
    if (!sixWeeks) {
      if (!leaveEndDate) return needsResult(["leaveEndDate"]);
      return result({
        date: leaveEndDate,
        basis: `Fewer than six consecutive weeks of ${name} were taken, so the priority for suitable vacancies ends when the leave ends. It also ends if employment ends.`,
        sources,
        detail: { ...detail, extended: false },
      });
    }
    const from = placementDate ?? birthDate;
    if (!from) {
      return {
        ...needsResult(["birthDate", "placementDate"]),
        basis: "Needs birthDate, or placementDate for an adoption, before this can be worked out.",
      };
    }
    return result({
      date: lastDayOfMonthsBeginningWith(from, 18),
      basis: `After six or more consecutive weeks of ${name}, the priority for suitable vacancies lasts until the day before the 18-month anniversary of the ${placementDate ? "placement" : "birth"}. It also ends if employment ends.`,
      sources,
      detail: { ...detail, extended: true, runsFrom: placementDate ? "placement" : "birth" },
    });
  }

  if (leaveType === "adoption") {
    if (!placementDate) return needsResult(["placementDate"]);
    return result({
      date: lastDayOfMonthsBeginningWith(placementDate, 18),
      basis:
        "Priority for suitable vacancies runs through adoption leave and until the day before the 18-month anniversary of the placement (or, for an overseas adoption, the child's entry into Great Britain). It also ends if employment ends.",
      sources,
      detail: { ...detail, extended: true, runsFrom: "placement" },
    });
  }

  // Maternity: the birth date counts only if the employer was told it (reg 10(1D)).
  const useBirth = birthDate !== undefined && birthNotified !== false;
  const from = useBirth ? birthDate : expectedWeekStart;
  if (!from) {
    return {
      ...needsResult(birthNotified === false ? ["expectedWeekStart"] : ["birthDate", "expectedWeekStart"]),
      basis:
        birthNotified === false
          ? "Needs expectedWeekStart: the employer was not told the birth date, so the period runs from the expected week of childbirth."
          : "Needs birthDate, or expectedWeekStart if the employer was not told the birth date, before this can be worked out.",
    };
  }
  const toVerify: string[] = [];
  Object.assign(detail, {
    extended: true,
    from: notifiedPregnancyDate ?? null,
    runsFrom: useBirth ? "birth" : "expected_week",
  });
  if (useBirth && birthNotified === undefined) {
    toVerify.push(
      "The birth date counts only if the employee told the employer it before maternity leave ended (MPL Regs 1999 reg 10(1D)); otherwise the period runs from the expected week of childbirth."
    );
    if (expectedWeekStart) detail.endIfBirthNotNotified = lastDayOfMonthsBeginningWith(expectedWeekStart, 18);
  }
  return result({
    date: lastDayOfMonthsBeginningWith(from, 18),
    basis: `Priority for suitable vacancies runs from when the employer is told of the pregnancy, through maternity leave, until the day before the 18-month anniversary of the ${useBirth ? "birth" : "first day of the expected week of childbirth"}. A redundancy dismissal without offering a suitable available vacancy is automatically unfair. The priority also ends if employment ends.`,
    sources,
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
    sources: ni ? ["ERO 1996 Art 173(3), (6)"] : ["ERA 1996 s138(3)", "ERA 1996 s138(6)"],
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
      "Northern Ireland has no statutory duty to prevent sexual harassment: Equality Act 2010 s40A and the Employment Rights Act 2025 changes extend to England, Wales and Scotland only (Worker Protection (Amendment of Equality Act 2010) Act 2023 s5(1)). An employer there is still liable for harassment by its staff unless it took reasonably practicable steps to prevent it (SDO 1976 Art 42(3)), and for third-party sex harassment once it knows of two earlier incidents (SDO 1976 Art 8(2B) to (2D))."
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
      "Equality Act 2010 s40(1A) uses \"harass\" without limit, so on its face the third-party duty covers harassment related to a protected characteristic as well as sexual harassment; a lawyer should confirm.",
    ],
    detail: { standard: "all_reasonable_steps", thirdParty: true },
  });
});
