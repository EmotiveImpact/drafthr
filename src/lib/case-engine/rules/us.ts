import type { FactValue, IsoDate, RuleFn, RuleResult } from "../types";
import { addDays, addMonths, addYears, formatLongDate, holidaysKnownFor, isWeekend, nextBusinessDay } from "./calendar";
import { needsResult, notApplicable, readInputs, result, type InputReader } from "./inputs";

/**
 * US rules. Federal rules apply in every state; state rules cover California,
 * New York, Texas, Florida and Illinois (US review, shared tables T1 to T5)
 * and say so when a case is elsewhere.
 */

/** Wraps a US rule so that a UK case gets `notApplicable`. */
function usRule(fn: (read: InputReader, state: string) => RuleResult): RuleFn {
  return (input, ctx) => {
    if (ctx.jurisdiction.country !== "us") {
      return notApplicable("This is a US rule and the case is in the UK.");
    }
    return fn(readInputs(input), ctx.jurisdiction.state);
  };
}

const HOLIDAYS_UNKNOWN =
  "Federal holidays are only held for 2025 to 2027, so a deadline outside those years is moved past weekends only.";

const NO_ROLL = "No weekend or holiday extension is applied; how the days are counted is to verify.";

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export const TARGET_STATES = ["CA", "NY", "TX", "FL", "IL"] as const;
type TargetState = (typeof TARGET_STATES)[number];

const STATE_NAME: Record<TargetState, string> = {
  CA: "California",
  NY: "New York",
  TX: "Texas",
  FL: "Florida",
  IL: "Illinois",
};

const isTarget = (code: string): code is TargetState => (TARGET_STATES as readonly string[]).includes(code);

/** A state code from a code or a name ("ca", "California"); other states are upper-cased as given. */
function stateCode(value: string): string {
  const v = value.trim().toLowerCase();
  const match = TARGET_STATES.find((code) => v === code.toLowerCase() || v === STATE_NAME[code].toLowerCase());
  return match ?? value.trim().toUpperCase();
}

const nameOf = (code: string) => (isTarget(code) ? STATE_NAME[code] : code);

/** The states named by the `state` input (a code, a name or a list), or else the case's state. */
function statesFrom(read: InputReader, caseState: string): string[] {
  const given = read.optionalList("state");
  const states = given && given.length ? given : [caseState];
  return [...new Set(states.map(stateCode))];
}

/**
 * The one state a state-law rule runs for: the only state named, or, from a
 * list, the only one of `among`. A list naming several of `among` is refused,
 * because each needs its own facts.
 */
function oneState(read: InputReader, caseState: string, among: readonly string[]): string | undefined {
  const states = statesFrom(read, caseState);
  if (states.length === 1) return states[0];
  const matches = states.filter((s) => among.includes(s));
  if (matches.length > 1) {
    read.reject("state", `names more than one of ${matches.map(nameOf).join(", ")}; run the rule once for each state`);
    return undefined;
  }
  return matches[0] ?? states[0];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// Discrimination charges
// ---------------------------------------------------------------------------

/**
 * Last day to file an EEOC charge: 180 calendar days from the act, or 300
 * where a state or local agency enforces a law against discrimination on the
 * same basis. For age, 300 days applies only where a state law (not just a
 * local law) bans age discrimination. California, New York, Texas, Florida and
 * Illinois are all 300-day states, age included (US review T2; 29 CFR
 * 1601.74). Below 15 employees (20 for age) there is no EEOC route (42 USC
 * 2000e(b); 29 USC 630(b)). Where the person first filed with a state or local
 * agency that has ended its proceedings, the charge is due within 300 days or
 * 30 days after notice of the end, whichever is earlier (42 USC 2000e-5(e)(1)).
 * Weekends and holidays count, but a deadline that falls on one moves to the
 * next business day (EEOC, "Time limits for filing a charge"). Day 1 is the day
 * after the act.
 */
export const eeocCharge: RuleFn = usRule((read, caseState) => {
  const actDate = read.date("actDate");
  const deferralState = read.optionalFlag("deferralState");
  const claimBasis = read.optionalText("basis")?.toLowerCase();
  const states = statesFrom(read, caseState);
  const headcount = read.optionalCount("employerHeadcount");
  const stateAgencyEndDate = read.optionalDate("stateAgencyEndDate");
  if (actDate && stateAgencyEndDate && stateAgencyEndDate < actDate) {
    read.reject("stateAgencyEndDate", "is before actDate");
  }
  if (!read.ok() || !actDate) return read.needs();

  const day180 = nextBusinessDay(addDays(actDate, 180));
  const day300 = nextBusinessDay(addDays(actDate, 300));
  const age = claimBasis === "age";
  const minimum = age ? 20 : 15;
  const targetStates = states.every(isTarget);
  const named = states.map(nameOf).join(" and ");
  const sources = age
    ? ["EEOC, Time limits for filing a charge", "29 USC 626(d)(1)", "29 USC 630(b)"]
    : ["EEOC, Time limits for filing a charge", "42 USC 2000e-5(e)(1)", "42 USC 2000e(b)", "42 USC 12111(5)(A)"];
  const toVerify: string[] = [];
  const detail: Record<string, FactValue> = { day180, day300, noRoute: false };

  if (headcount !== undefined && headcount < minimum) {
    detail.noRoute = true;
    return result({
      date: null,
      basis: age
        ? "The ADEA covers employers with 20 or more employees, so with fewer there is no EEOC route for age discrimination; a state agency may still take the complaint."
        : "Title VII, the ADA and the PWFA cover employers with 15 or more employees, so with fewer there is no EEOC route; a state agency may still take the complaint.",
      sources,
      detail,
    });
  }

  let use300: boolean;
  let basis: string;
  if (deferralState === true && !age) {
    use300 = true;
    basis =
      "A state or local agency enforces a law against this kind of discrimination, so the charge must be filed within 300 calendar days of the act.";
  } else if (deferralState === true && targetStates) {
    use300 = true;
    basis = `For age discrimination 300 days applies only where a state law bans age discrimination and a state agency enforces it; ${named} ${states.length === 1 ? "is" : "are"} such a state, so the charge must be filed within 300 calendar days of the act.`;
    sources.push("29 CFR 1601.74");
  } else if (deferralState === true) {
    // The input cannot say whether the law is a state law or only a local one,
    // and only a state law gives 300 days for age. Until that is confirmed the
    // earlier date is the safe one.
    use300 = false;
    basis =
      "For age discrimination the 180-day limit is extended to 300 days only where a state law bans age discrimination in employment; a local law is not enough. Until that is confirmed, plan to the 180-day date.";
    toVerify.push(`If the state's own law bans age discrimination, the deadline is the 300-day date, ${formatLongDate(day300)}.`);
  } else if (deferralState === undefined && targetStates) {
    use300 = true;
    basis = `${named} ${states.length === 1 ? "has" : "have"} a state agency that enforces a law on the same basis${age ? ", age included" : ""}, so the charge must be filed within 300 calendar days of the act.`;
    sources.push("29 CFR 1601.74");
  } else {
    use300 = false;
    basis =
      "The charge must be filed within 180 calendar days of the act, or 300 where a state or local agency enforces a law on the same basis.";
    if (deferralState === undefined) {
      toVerify.push(
        "Most states have a fair employment agency, so the 300-day date may apply; the 180-day date is used until the state agency is confirmed."
      );
    }
  }
  basis += " A deadline on a weekend or federal holiday moves to the next business day.";

  let date = use300 ? day300 : day180;
  if (stateAgencyEndDate) {
    const day30 = nextBusinessDay(addDays(stateAgencyEndDate, 30));
    detail.thirtyDaysAfterStateEnd = day30;
    if (day30 < date) {
      date = day30;
      basis +=
        " The person filed with a state or local agency first and it has ended its proceedings, so the charge is due within 30 days of notice of that, which is earlier.";
    } else {
      basis += " Thirty days after notice that the state or local agency ended its proceedings falls later, so it does not shorten the limit.";
    }
  }

  if (headcount === undefined) {
    toVerify.push(
      `There is no EEOC route if the employer had fewer than ${minimum} employees in 20 or more weeks of this or last year; the employer's size was not given.`
    );
  }
  toVerify.push("The count starts the day after the act (act date plus 180 or 300 days); a lawyer should confirm.");
  if (!holidaysKnownFor(addDays(actDate, 180)) || !holidaysKnownFor(addDays(actDate, 300))) {
    toVerify.push(HOLIDAYS_UNKNOWN);
  }
  return result({ date, basis, sources, toVerify, detail });
});

/**
 * Last day to sue after an EEOC notice of right to sue: "within ninety days
 * after the giving of such notice" (42 USC 2000e-5(f)(1)).
 */
export const eeocSuitDeadline: RuleFn = usRule((read) => {
  const noticeDate = read.date("noticeDate");
  if (!read.ok() || !noticeDate) return read.needs();
  return result({
    date: addDays(noticeDate, 90),
    basis:
      "After an EEOC notice of right to sue, a lawsuit under Title VII, the ADA or the PWFA must be filed within 90 days of the notice.",
    sources: ["42 USC 2000e-5(f)(1)"],
    toVerify: [
      "Counted from the notice date. Whether a later date of receipt can be used, and whether a deadline on a weekend or holiday moves, is to verify.",
      "The time to sue after a notice in an age discrimination (ADEA) case was not checked.",
    ],
  });
});

const isCalifornia = (state: string) => stateCode(state) === "CA";

/**
 * Last day to file an intake form with the California Civil Rights Department:
 * three years from the date the person was last harmed (Cal. Gov. Code
 * 12960(e)(5)). The same date three years on; 29 February becomes 28 February.
 */
export const caCivilRights: RuleFn = usRule((read, state) => {
  if (!isCalifornia(state)) {
    return notApplicable("The California Civil Rights Department deadline applies only to California.");
  }
  const actDate = read.date("actDate");
  if (!read.ok() || !actDate) return read.needs();
  return result({
    date: addYears(actDate, 3),
    basis:
      "An employment complaint must reach the California Civil Rights Department within three years of the date the person was last harmed. A right-to-sue notice is needed before suing, and the suit must follow within 1 year of it.",
    sources: ["California Civil Rights Department, Complaint process", "Cal. Gov. Code 12960(e)(5)", "Cal. Gov. Code 12965(c)(1)(D)"],
    toVerify: [
      NO_ROLL,
      "Up to 90 more days where the facts were first learned in the 90 days after the deadline, and up to 1 year after a minor turns 18, are not assumed (Cal. Gov. Code 12960(e)).",
    ],
  });
});

type Agency = {
  date: IsoDate | null;
  basis: string;
  sources: string[];
  toVerify: string[];
  /** Smallest employer the state law covers for this basis. */
  minimum: number;
  traps: string[];
};

/**
 * Last day to file with the state fair employment agency (US review T2).
 * California CRD 3 years; New York Division of Human Rights 3 years for acts on
 * or after 15 February 2024; Texas Workforce Commission 180 days (300 for
 * sexual harassment); Florida Commission on Human Relations 365 days; Illinois
 * Department of Human Rights 2 years for acts from 1 January 2025. No weekend
 * or holiday roll is applied.
 */
export const stateAgencyDeadline: RuleFn = usRule((read, caseState) => {
  const actDate = read.date("actDate");
  const claimBasis = read.optionalText("basis")?.toLowerCase();
  const headcount = read.optionalCount("employerHeadcount");
  const eeocFiledDate = read.optionalDate("eeocFiledDate");
  const state = oneState(read, caseState, TARGET_STATES);
  if (actDate && eeocFiledDate && eeocFiledDate < actDate) read.reject("eeocFiledDate", "is before actDate");
  if (!read.ok() || !actDate || !state) return read.needs();
  if (!isTarget(state)) {
    return notApplicable(
      `State agency deadlines are held for California, New York, Texas, Florida and Illinois only, not ${nameOf(state)}.`
    );
  }

  const sexualHarassment = claimBasis === "sexual_harassment";
  const harassment = sexualHarassment || claimBasis === "harassment";
  const detail: Record<string, FactValue> = { state, covered: true };
  let a: Agency;
  switch (state) {
    case "CA":
      a = {
        date: addYears(actDate, 3),
        basis: "A complaint must reach the California Civil Rights Department within 3 years of the act.",
        sources: ["Cal. Gov. Code 12960(e)(5)", "Cal. Gov. Code 12965(c)(1)(D)", "CRD, Employment"],
        toVerify: [
          "Up to 90 more days where the facts were first learned in the 90 days after the deadline, and up to 1 year after a minor turns 18, are not assumed (Cal. Gov. Code 12960(e)).",
        ],
        minimum: harassment ? 1 : 5,
        traps: [
          "A right-to-sue notice from CRD is needed before suing; the suit must follow within 1 year of it, a year that is paused while the EEOC investigates a charge filed with both.",
        ],
      };
      break;
    case "NY": {
      const threeYears = actDate >= "2024-02-15";
      a = {
        date: threeYears ? addYears(actDate, 3) : null,
        basis: threeYears
          ? "A complaint must reach the New York State Division of Human Rights within 3 years of the act (for acts on or after 15 February 2024)."
          : "The 3-year limit for the New York State Division of Human Rights applies to acts on or after 15 February 2024; the limit for earlier acts is not held.",
        sources: ["NY Executive Law 297(5)", "NY Executive Law 297(9)", "NY Division of Human Rights, Complaint"],
        toVerify: threeYears ? [] : ["The Division's limit for acts before 15 February 2024 was not checked."],
        minimum: 1,
        traps: [
          "Filing with the Division generally bars a court action later, unless it dismisses for administrative convenience or untimeliness; an EEOC filing does not count as filing with the Division for this rule.",
        ],
      };
      break;
    }
    case "TX": {
      const days = sexualHarassment ? 300 : 180;
      a = {
        date: addDays(actDate, days),
        basis: `A complaint must reach the Texas Workforce Commission Civil Rights Division within ${days} days of the act${sexualHarassment ? " for sexual harassment" : ""}. This is ${sexualHarassment ? "the same as" : "shorter than"} the EEOC's 300 days.`,
        sources: ["Tex. Lab. Code 21.202", "Tex. Lab. Code 21.002(8)", "Tex. Lab. Code 21.141(1)"],
        toVerify: ["The Texas Labor Code was read in the TWC compilation (effective 1 September 2021); the official text was not opened."],
        minimum: sexualHarassment ? 1 : 15,
        traps: [
          "If the complaint is not resolved within 180 days, the complainant may ask for a right-to-sue notice; suit within 60 days of receiving it, and no later than 2 years after filing (Tex. Lab. Code 21.208, 21.252, 21.254, 21.256).",
        ],
      };
      break;
    }
    case "FL":
      a = {
        date: addDays(actDate, 365),
        basis: "A complaint must reach the Florida Commission on Human Relations within 365 days of the act.",
        sources: ["Fla. Stat. 760.11(1)", "Fla. Stat. 760.02(7)", "FCHR, Employment complaint"],
        toVerify: [],
        minimum: 15,
        traps: [
          "Filing with the Commission is required before going to court.",
          "A no-cause finding bars the claim unless an administrative hearing is requested within 35 days (Fla. Stat. 760.11(7)).",
          "Suit within 1 year of a cause finding (760.11(5)); if there is no finding within 180 days, the time to sue is open (760.11(5), (8)(c)).",
        ],
      };
      break;
    case "IL": {
      const twoYears = actDate >= "2025-01-01";
      const ifTwoYears = addYears(actDate, 2);
      a = {
        date: twoYears ? ifTwoYears : addDays(actDate, 300),
        basis: twoYears
          ? "A charge must reach the Illinois Department of Human Rights within 2 years of the act."
          : "The Illinois Department of Human Rights limit was 300 days before 2 years applied from 1 January 2025; for an act before then the 300-day date is used.",
        sources: ["775 ILCS 5/7A-102(A)(1)", "775 ILCS 5/7A-102(A-1)", "IDHR news release, 30 December 2024"],
        toVerify: [
          ...(twoYears
            ? []
            : [`If the 2-year limit reaches acts before 1 January 2025, the date is ${formatLongDate(ifTwoYears)}.`]),
          "P.A. 104-425 amended Article 7A from 1 January 2026; its content was not checked.",
        ],
        minimum: 1,
        traps: [
          "An EEOC charge filed within 300 days counts as filed with the Department, but the employee must send the Department the EEOC's determination within 30 days of receiving it.",
          "After the Director's notice, 90 days to sue in circuit court (775 ILCS 5/7A-102(C)(4), (D)(4)).",
        ],
      };
      if (eeocFiledDate) {
        const counts = eeocFiledDate <= addDays(actDate, 300);
        detail.eeocChargeCounts = counts;
        a.basis += counts
          ? " The EEOC charge was filed within 300 days, so it counts as filed with the Department."
          : " The EEOC charge was filed more than 300 days after the act, so it does not count as filed with the Department.";
      }
      break;
    }
  }

  detail.traps = a.traps;
  if (headcount !== undefined && headcount < a.minimum) {
    detail.covered = false;
    return result({
      date: null,
      basis: `${STATE_NAME[state]} law covers employers with ${a.minimum} or more employees for this claim, so there is no state agency route here.`,
      sources: a.sources,
      detail,
    });
  }
  const toVerify = [...a.toVerify];
  if (headcount === undefined && a.minimum > 1) {
    toVerify.push(`${STATE_NAME[state]} law covers employers with ${a.minimum} or more employees for this claim; the employer's size was not given.`);
  }
  if (a.date) toVerify.push(NO_ROLL);
  toVerify.push("City and county agencies (for example in Chicago or New York City) are not covered.");
  return result({ date: a.date, basis: a.basis, sources: a.sources, toVerify, detail });
});

// ---------------------------------------------------------------------------
// Leaving: final pay and separation notices
// ---------------------------------------------------------------------------

export const SEPARATION_TYPES = ["discharge", "layoff", "quit_with_notice", "quit_without_notice"] as const;

/**
 * Latest day for final wages by state (US review T3). California: discharge
 * immediately (Labor Code 201(a)); a quit with at least 72 hours' notice on the
 * last day, otherwise within 72 hours (202). New York: the regular payday for
 * the pay period in which employment ended (Labor Law 191(3)). Texas: within 6
 * calendar days of a discharge or layoff, a quit by the next regular payday
 * (TWC). Illinois: no later than the next regular payday (IDOL). Florida: no
 * state rule found.
 */
export const finalPay: RuleFn = usRule((read, caseState) => {
  const separationDate = read.date("separationDate");
  const separationType = read.choice("separationType", SEPARATION_TYPES);
  const nextPayday = read.optionalDate("nextPayday");
  const state = oneState(read, caseState, TARGET_STATES);
  if (separationDate && nextPayday && nextPayday < separationDate) {
    read.reject("nextPayday", "is before separationDate");
  }
  if (!read.ok() || !separationDate || !separationType || !state) return read.needs();
  if (!isTarget(state)) {
    return notApplicable(`Final pay rules are held for California, New York, Texas, Florida and Illinois only, not ${nameOf(state)}.`);
  }

  const quit = separationType === "quit_with_notice" || separationType === "quit_without_notice";
  const detail: Record<string, FactValue> = { state, separationType };
  const byPayday = (basis: string, sources: string[], toVerify: string[] = []): RuleResult =>
    nextPayday
      ? result({ date: nextPayday, basis, sources, toVerify, detail })
      : { ...needsResult(["nextPayday"]), basis: `Needs nextPayday: ${basis}` };

  switch (state) {
    case "CA": {
      const sources = ["Cal. Labor Code 201(a)", "Cal. Labor Code 202", "Cal. Labor Code 203(a)", "Labor Commissioner, Paydays FAQ"];
      const penalty =
        " Accrued vacation is included. Wilful late payment costs a day's wages for each day late, up to 30 days.";
      if (separationType === "quit_without_notice") {
        return result({
          date: addDays(separationDate, 3),
          basis: `An employee who quits without at least 72 hours' notice must be paid within 72 hours.${penalty}`,
          sources,
          detail,
        });
      }
      return result({
        date: separationDate,
        basis:
          separationType === "quit_with_notice"
            ? `An employee who quits with at least 72 hours' notice must be paid on the last day.${penalty}`
            : `On a ${separationType === "layoff" ? "layoff" : "discharge"} final wages are due immediately, on the last day.${penalty}`,
        sources,
        toVerify:
          separationType === "layoff"
            ? ["Whether a layoff is paid on the discharge rule is not settled (Labor Code 201(a) and the Labor Commissioner's final pay FAQ could not be opened in full); paying in full on the last day is the safe course."]
            : [],
        detail,
      });
    }
    case "NY":
      return byPayday(
        "final wages are due not later than the regular payday for the pay period in which employment ended. The next regular payday is used, which is never later; where pay runs in arrears the legal date can be later.",
        ["NY Labor Law 191(3)"]
      );
    case "TX":
      if (!quit) {
        return result({
          date: addDays(separationDate, 6),
          basis: "After a discharge or layoff, final pay is due by the sixth calendar day.",
          sources: ["TWC, Final pay"],
          toVerify: ["The Texas Payday Law itself was not opened; this follows the Texas Workforce Commission page."],
          detail,
        });
      }
      return byPayday("after a quit, final pay is due by the next regular payday.", ["TWC, Final pay"], [
        "The Texas Payday Law itself was not opened; this follows the Texas Workforce Commission page.",
      ]);
    case "IL":
      return byPayday(
        "final pay, including earned vacation and holidays, is due at separation if possible and no later than the next regular payday.",
        ["Illinois Department of Labor, Wage payment FAQ"],
        ["The Illinois Wage Payment and Collection Act itself was not opened; this follows the Department of Labor's FAQ."]
      );
    case "FL":
      return result({
        date: null,
        basis:
          "No Florida rule on the timing of final pay was found, and federal law does not require former employees to be paid immediately.",
        sources: ["US DOL, Last paycheck"],
        toVerify: ["No Florida final pay rule was found; a lawyer should confirm."],
        detail,
      });
  }
});

/** The date N weekdays after `from` (weekends skipped; holidays are not). */
function addWeekdays(from: IsoDate, days: number): IsoDate {
  let day = from;
  for (let counted = 0; counted < days; ) {
    day = addDays(day, 1);
    if (!isWeekend(day)) counted++;
  }
  return day;
}

/**
 * Separation and unemployment notices by state (US review T4). `date` is the
 * earliest thing due.
 */
export const separationNotice: RuleFn = usRule((read, caseState) => {
  const separationDate = read.date("separationDate");
  const separationType = read.optionalChoice("separationType", SEPARATION_TYPES);
  const state = oneState(read, caseState, TARGET_STATES);
  if (!read.ok() || !separationDate || !state) return read.needs();
  if (!isTarget(state)) {
    return notApplicable(`Separation notice rules are held for California, New York, Texas, Florida and Illinois only, not ${nameOf(state)}.`);
  }

  const quit = separationType === "quit_with_notice" || separationType === "quit_without_notice";
  switch (state) {
    case "NY": {
      const writtenNoticeBy = addWeekdays(separationDate, 5);
      return result({
        date: separationDate,
        basis: `Give form IA 12.3 (Record of Employment) at separation, and written notice of the exact termination date and the date benefits end within 5 working days, by ${formatLongDate(writtenNoticeBy)}.`,
        sources: ["NY Labor Law 195(6)", "NY DOL, Notice of eligibility for UI benefits"],
        toVerify: ["The 5 working days are counted as weekdays; a public holiday among them may allow one more day."],
        detail: {
          state,
          writtenNoticeBy,
          notices: ["Form IA 12.3, Record of Employment: at separation", "Written notice of termination and benefits end dates: within 5 working days"],
        },
      });
    }
    case "IL":
      return result({
        date: addDays(separationDate, 5),
        basis:
          "Give each separated worker the IDES pamphlet What every worker should know about unemployment insurance at separation, or mail it within 5 calendar days.",
        sources: ["IDES, What every worker should know about unemployment insurance"],
        toVerify: ["The IDES page gives no statutory basis for this duty."],
        detail: { state, notices: ["IDES unemployment insurance pamphlet"] },
      });
    case "TX":
      return result({
        date: separationDate,
        basis:
          "Give the departing employee notice of the right to file an unemployment claim at separation. No termination letter is required.",
        sources: ["TWC, Exit interviews and notice of discharge"],
        detail: { state, notices: ["Notice of the right to file an unemployment claim"] },
      });
    case "CA":
      if (quit) {
        return result({
          date: null,
          basis:
            "California's written notice duty covers an employee who is fired, laid off or taking a leave of absence; a quit is not listed.",
          sources: ["EDD, Required notices and pamphlets"],
          toVerify: ["Whether any notice is due when an employee quits was not checked."],
          detail: { state, notices: [] },
        });
      }
      return result({
        date: separationDate,
        basis: "Give written notice of the change in employment immediately on a discharge, layoff or leave of absence.",
        sources: ["EDD, Required notices and pamphlets"],
        toVerify: ["Whether the DE 2320 pamphlet must also be given at separation is open."],
        detail: { state, notices: ["Written notice of the change in employment"] },
      });
    case "FL":
      return result({
        date: null,
        basis: "No Florida separation notice rule is held: the FloridaCommerce pages could not be read when this was checked.",
        sources: ["FloridaCommerce, Reemployment assistance (not read)"],
        toVerify: ["Whether Florida requires a separation notice is open; a lawyer should confirm."],
        detail: { state, notices: [] },
      });
  }
});

// ---------------------------------------------------------------------------
// Layoff notice
// ---------------------------------------------------------------------------

type Maybe = boolean | null;

/** Three-valued or: true if any is true, else null if any is unknown. */
function anyOf(...values: Maybe[]): Maybe {
  if (values.includes(true)) return true;
  return values.includes(null) ? null : false;
}

/** Three-valued and: false if any is false, else null if any is unknown. */
function allOf(...values: Maybe[]): Maybe {
  if (values.includes(false)) return false;
  return values.includes(null) ? null : true;
}

/** "N or more and at least 33% of the site, or `all` or more" (20 CFR 639.3(c) pattern). */
function layoffTest(losses: number, site: number | undefined, min: number, all: number): Maybe {
  if (losses >= all) return true;
  if (losses < min) return false;
  if (site === undefined) return null;
  return losses * 100 >= 33 * site;
}

/** A plant closing test where the closing flag may be unknown. */
function closingTest(closure: boolean | undefined, met: boolean): Maybe {
  if (closure === true) return met;
  if (closure === false) return false;
  return met ? null : false;
}

const DELIVERY =
  "Notice must be received, not just sent, by this date; whether notice received on the day itself is in time is not settled, so deliver it earlier.";
const REMOTE_STAFF = "Which site remote employees count at is not settled; the counts given are used as they are.";

/**
 * Latest day federal WARN notice must be received: "at least 60 calendar days
 * prior to" the planned closing or layoff, each later group with its own full
 * 60 days (20 CFR 639.5(a)(1)). With the counts given, the rule also tests
 * coverage (100 or more employees not counting part-time staff, or 100 or more
 * working 4,000 hours a week: 639.3(a)), a plant closing (50 or more losses at
 * a site: 639.3(b)), a mass layoff (50 or more and 33% of the site, or 500:
 * 639.3(c)) and 90-day aggregation (639.5(a)(1); 29 USC 2102(d)).
 */
export const warnNotice: RuleFn = usRule((read) => {
  const firstSeparationDate = read.date("firstSeparationDate");
  const separationDates = read.optionalDateList("separationDates") ?? [];
  const employerFullTime = read.optionalCount("employerFullTime");
  const employer4000Hours = read.optionalFlag("employer4000Hours");
  const site = read.optionalCount("siteFullTimeHeadcount");
  const losses30 = read.optionalCount("siteLosses30");
  const losses90 = read.optionalCount("siteLosses90");
  const closure = read.optionalFlag("closure");
  if (!read.ok() || !firstSeparationDate) return read.needs();

  const groups = [...new Set([firstSeparationDate, ...separationDates])].sort();
  const noticeDates = groups.map((d) => addDays(d, -60));

  const covered: Maybe =
    employerFullTime !== undefined && employerFullTime >= 100
      ? true
      : employer4000Hours === true
        ? true
        : employerFullTime !== undefined && employer4000Hours === false
          ? false
          : null;
  const test = (losses: number | undefined): Maybe =>
    losses === undefined ? null : anyOf(closingTest(closure, losses >= 50), layoffTest(losses, site, 50, 500));
  const in30 = test(losses30);
  // Without the 90-day count, aggregation cannot be ruled out.
  const in90 = losses90 === undefined ? null : test(losses90);
  const triggered = anyOf(in30, in90);
  const aggregated = in30 !== true && in90 === true;
  const applies = allOf(covered, triggered);

  const toVerify: string[] = [];
  if (applies === null) {
    toVerify.push(
      "Whether federal WARN applies could not be settled from the counts given (employer size, site losses within 30 and 90 days, site full-time headcount, and whether the site closes)."
    );
  }
  if (aggregated) {
    toVerify.push(
      "Losses within 90 days are added together unless the employer shows they come from separate and distinct actions and causes (20 CFR 639.5(a)(1))."
    );
  }
  if (applies !== false) toVerify.push(DELIVERY);
  if (employerFullTime !== undefined || site !== undefined || losses30 !== undefined || losses90 !== undefined) {
    toVerify.push(REMOTE_STAFF);
  }

  const detail: Record<string, FactValue> = { noticeDates, covered, triggered, aggregated, applies };
  const groupsNote =
    groups.length > 1 ? ` Each later group of separations needs its own full 60 days (${noticeDates.map(formatLongDate).join("; ")}).` : " Each later group of separations needs its own full 60 days.";
  const stateNote = " California, New York and Illinois have their own layoff notice laws, and New York needs 90 days.";
  if (applies === false) {
    return result({
      date: null,
      basis: `On the counts given, federal WARN does not apply: ${covered === false ? "the employer has fewer than 100 employees not counting part-time staff and does not meet the 4,000-hour test" : "the losses are not a plant closing or mass layoff, even added together over 90 days"}.${stateNote}`,
      sources: ["29 USC 2101(a)", "20 CFR 639.3", "20 CFR 639.5(a)"],
      toVerify,
      detail,
    });
  }
  return result({
    date: noticeDates[0],
    basis: `Where the federal WARN Act applies, notice must be given at least 60 calendar days before the first worker's last day, by a method designed to ensure it arrives by then.${groupsNote}${applies === true ? ` On the counts given it applies${aggregated ? ", once losses within 90 days are added together" : ""}.` : ""}${stateNote}`,
    sources: ["29 USC 2102(a)", "29 USC 2102(d)", "20 CFR 639.3", "20 CFR 639.5(a)", "20 CFR 639.8"],
    toVerify,
    detail,
  });
});

type StateWarnLaw = {
  coverMin: number;
  notice: number;
  coverText: string;
  closing: (losses: number) => boolean;
  layoff: (losses: number, site: number | undefined) => Maybe;
  relocationMiles: number | null;
  aggregates: boolean;
  sources: string[];
  toVerify: string[];
};

const STATE_WARN: Record<"CA" | "NY" | "IL", StateWarnLaw> = {
  NY: {
    coverMin: 50,
    notice: 90,
    coverText: "50 or more full-time employees in New York State (or 50 or more working 2,000 hours a week)",
    closing: (n) => n >= 25,
    layoff: (n, site) => layoffTest(n, site, 25, 250),
    relocationMiles: 50,
    aggregates: true,
    sources: ["NY Labor Law 860-a", "NY Labor Law 860-b", "NY DOL, WARN FAQ"],
    toVerify: ["Cutting hours by more than 50% in each month of 6 consecutive months is also a trigger and is not tested here."],
  },
  CA: {
    coverMin: 75,
    notice: 60,
    coverText: "75 or more full and part-time employees at the establishment, counting those with 6 of the last 12 months' service",
    closing: () => true,
    layoff: (n) => n >= 50,
    relocationMiles: 100,
    aggregates: false,
    sources: ["EDD, WARN", "EDD, WARN FAQs", "EDD, WSIN25-14"],
    toVerify: ["California's thresholds come from EDD pages; the Labor Code text could not be opened."],
  },
  IL: {
    coverMin: 75,
    notice: 60,
    coverText: "75 or more employees, not counting part-time staff",
    closing: (n) => n >= 50,
    layoff: (n, site) => layoffTest(n, site, 25, 250),
    relocationMiles: null,
    aggregates: false,
    sources: ["820 ILCS 65/5", "820 ILCS 65/10", "IDOL, WARN"],
    toVerify: ["Amendments to the Illinois Act after the 2025 compilation were not checked."],
  },
};

/**
 * Latest day a state layoff notice must be given in California, New York or
 * Illinois (US review T5, R22): whether the state law applies on the counts
 * given, and the notice date (New York 90 days; California and Illinois 60).
 */
export const stateWarnNotice: RuleFn = usRule((read, caseState) => {
  const firstSeparationDate = read.date("firstSeparationDate");
  const stateHeadcount = read.count("stateHeadcount");
  const losses30 = read.count("siteLosses30");
  const losses90 = read.optionalCount("siteLosses90");
  const closure = read.optionalFlag("closure");
  const site = read.optionalCount("siteFullTimeHeadcount");
  const relocationMiles = read.optionalNumber("relocationMiles");
  const state = oneState(read, caseState, ["CA", "NY", "IL"]);
  if (losses30 !== undefined && losses90 !== undefined && losses90 < losses30) {
    read.reject("siteLosses90", "is less than siteLosses30");
  }
  if (!read.ok() || !firstSeparationDate || stateHeadcount === undefined || losses30 === undefined || !state) {
    return read.needs();
  }
  if (state === "TX") return notApplicable("Texas has no state layoff notice law; federal WARN applies.");
  if (state === "FL") {
    return notApplicable("No Florida layoff notice law was found; federal WARN applies.", [
      "The FloridaCommerce WARN pages did not load, so the absence of a Florida law is not confirmed.",
    ]);
  }
  if (state !== "CA" && state !== "NY" && state !== "IL") {
    return notApplicable(`State layoff notice laws are held for California, New York and Illinois only, not ${nameOf(state)}.`);
  }

  const law = STATE_WARN[state];
  const name = STATE_NAME[state];
  const toVerify = [...law.toVerify];
  const covered = stateHeadcount >= law.coverMin;
  const test = (n: number): Maybe => anyOf(closingTest(closure, law.closing(n)), law.layoff(n, site));
  const in30 = test(losses30);
  let in90: Maybe = false;
  if (in30 !== true && law.aggregates) {
    // Without the 90-day count, aggregation cannot be ruled out.
    in90 = losses90 === undefined ? null : test(losses90);
  } else if (in30 !== true && losses90 !== undefined && test(losses90) !== false) {
    in90 = null;
    toVerify.push(`Whether ${name} adds together losses over 90 days was not checked; with them the threshold may be met.`);
  }
  let relocation: Maybe = false;
  if (relocationMiles !== undefined) {
    if (law.relocationMiles === null) {
      relocation = null;
      toVerify.push("Whether a relocation triggers notice in Illinois is open.");
    } else {
      relocation = relocationMiles >= law.relocationMiles;
    }
  }
  const triggered = anyOf(in30, in90, relocation);
  const aggregated = law.aggregates && in30 !== true && in90 === true;
  const applies = allOf(covered, triggered);
  if (aggregated) toVerify.push("New York adds together losses within 90 days (NY DOL FAQ).");
  if (applies !== false) toVerify.push(DELIVERY);
  toVerify.push(REMOTE_STAFF);

  const date = applies === false ? null : addDays(firstSeparationDate, -law.notice);
  const detail: Record<string, FactValue> = { state, covered, triggered, aggregated, applies, noticeDays: law.notice };
  const counts =
    applies === true
      ? " On the counts given it applies."
      : applies === false
        ? ` On the counts given it does not apply: ${covered ? "no closing, layoff or relocation meets its thresholds" : `the employer has fewer than ${law.coverMin}`}.`
        : " On the counts given it may apply; see what is to verify.";
  return result({
    date,
    basis: `${name}'s layoff notice law covers employers with ${law.coverText}, and needs ${plural(law.notice, "day")}' notice before the first separation.${counts}`,
    sources: law.sources,
    toVerify,
    detail,
  });
});

// ---------------------------------------------------------------------------
// Other federal limits
// ---------------------------------------------------------------------------

/**
 * Last day to file an unfair labor practice charge: no complaint may issue on
 * an act more than six months before the charge is filed and served (29 USC
 * 160(b)). The same date six months on.
 */
export const nlrbChargeLimit: RuleFn = usRule((read) => {
  const actDate = read.date("actDate");
  if (!read.ok() || !actDate) return read.needs();
  return result({
    date: addMonths(actDate, 6),
    basis:
      "An unfair labor practice charge must be filed with the NLRB, and served on the employer, within 6 months of the act.",
    sources: ["29 USC 160(b)"],
    toVerify: ["Day counting is to verify: the date is the same date 6 months on, and a deadline on a weekend or holiday is not moved."],
  });
});

/**
 * Older Workers Benefit Protection Act: an employee aged 40 or over must have
 * at least 21 days to consider a waiver of age claims (45 for a group exit
 * programme) and at least 7 days after signing to revoke it (29 USC
 * 626(f)(1)(F), (G)). The agreement takes effect only after the revocation
 * period ends; the employee may sign early, and the 7 days cannot be shortened
 * (29 CFR 1625.22(e)).
 */
export const owbpa: RuleFn = usRule((read) => {
  const agreementGivenDate = read.date("agreementGivenDate");
  const groupProgramme = read.optionalFlag("groupProgramme") === true;
  const signedDate = read.optionalDate("signedDate");
  if (agreementGivenDate && signedDate && signedDate < agreementGivenDate) {
    read.reject("signedDate", "is before agreementGivenDate");
  }
  if (!read.ok() || !agreementGivenDate) return read.needs();

  const days = groupProgramme ? 45 : 21;
  const detail: Record<string, string | number> = { considerationDays: days };
  if (signedDate) detail.revocationEnd = addDays(signedDate, 7);
  return result({
    date: addDays(agreementGivenDate, days),
    basis: `An employee aged 40 or over must be given at least ${days} days to consider the agreement${groupProgramme ? ", because it is offered to a group" : ""}, and may revoke it within 7 days after signing. The agreement takes effect only once the revocation period has ended. The employee may sign early if not pushed to, and the 7 days cannot be shortened.`,
    sources: ["29 USC 626(f)(1)(F)", "29 USC 626(f)(1)(G)", "29 CFR 1625.22(e)"],
    detail,
  });
});
