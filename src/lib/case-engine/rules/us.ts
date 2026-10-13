import type { IsoDate, RuleFn, RuleResult } from "../types";
import { addDays, addYears, formatLongDate, holidaysKnownFor, nextBusinessDay } from "./calendar";
import { notApplicable, readInputs, result, type InputReader } from "./inputs";

/**
 * US rules (outline). Federal rules apply in every state; state rules say
 * which state they cover.
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

/**
 * Last day to file an EEOC charge: 180 calendar days from the act, or 300
 * where a state or local agency enforces a law against discrimination on the
 * same basis. For age, 300 days applies only where a state law (not just a
 * local law) bans age discrimination. Weekends and holidays count, but a
 * deadline that falls on one moves to the next business day (EEOC, "Time
 * limits for filing a charge"). Day 1 is the day after the act.
 */
export const eeocCharge: RuleFn = usRule((read) => {
  const actDate = read.date("actDate");
  const deferralState = read.optionalFlag("deferralState");
  const claimBasis = read.optionalText("basis")?.toLowerCase();
  if (!read.ok() || !actDate) return read.needs();

  const day180 = nextBusinessDay(addDays(actDate, 180));
  const day300 = nextBusinessDay(addDays(actDate, 300));
  const age = claimBasis === "age";
  const toVerify: string[] = [];
  let date: IsoDate;
  let basis: string;

  if (deferralState === true && !age) {
    date = day300;
    basis =
      "A state or local agency enforces a law against this kind of discrimination, so the charge must be filed within 300 calendar days of the act. A deadline on a weekend or federal holiday moves to the next business day.";
  } else if (deferralState === true) {
    // The input cannot say whether the law is a state law or only a local one,
    // and only a state law gives 300 days for age. Until that is confirmed the
    // earlier date is the safe one.
    date = day180;
    basis =
      "For age discrimination the 180-day limit is extended to 300 days only where a state law bans age discrimination in employment; a local law is not enough. Until that is confirmed, plan to the 180-day date.";
    toVerify.push(`If the state's own law bans age discrimination, the deadline is the 300-day date, ${formatLongDate(day300)}.`);
  } else {
    date = day180;
    basis =
      "The charge must be filed within 180 calendar days of the act, or 300 where a state or local agency enforces a law on the same basis. A deadline on a weekend or federal holiday moves to the next business day.";
    if (deferralState === undefined) {
      toVerify.push(
        "Most states have a fair employment agency, so the 300-day date may apply; the 180-day date is used until the state agency is confirmed."
      );
    }
  }

  toVerify.push("The count starts the day after the act (act date plus 180 or 300 days); a lawyer should confirm.");
  if (!holidaysKnownFor(addDays(actDate, 180)) || !holidaysKnownFor(addDays(actDate, 300))) {
    toVerify.push(HOLIDAYS_UNKNOWN);
  }
  return result({
    date,
    basis,
    sources: age
      ? ["EEOC, Time limits for filing a charge", "29 USC 626(d)"]
      : ["EEOC, Time limits for filing a charge", "42 USC 2000e-5(e)(1)"],
    toVerify,
    detail: { day180, day300 },
  });
});

const isCalifornia = (state: string) => ["ca", "california"].includes(state.trim().toLowerCase());

/**
 * Last day to file an intake form with the California Civil Rights Department:
 * "within three years of the date you were last harmed" (CRD complaint
 * process; Cal. Gov. Code s12960). The same date three years on; 29 February
 * becomes 28 February.
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
      "An employment complaint must reach the California Civil Rights Department within three years of the date the person was last harmed.",
    sources: ["California Civil Rights Department, Complaint process", "Cal. Gov. Code s12960"],
    toVerify: [
      "No weekend or holiday extension is applied, and exceptions such as delayed discovery or a minor's claim are not assumed.",
    ],
  });
});

/**
 * Latest day WARN notice must be received: "at least 60 calendar days prior
 * to" the planned closing or layoff, and a worker's last day of employment is
 * the date of that worker's layoff (20 CFR 639.5(a)(1)). Counting back 60 days
 * from the separation date, day 60 is the last day notice may arrive.
 */
export const warnNotice: RuleFn = usRule((read) => {
  const firstSeparationDate = read.date("firstSeparationDate");
  if (!read.ok() || !firstSeparationDate) return read.needs();

  return result({
    date: addDays(firstSeparationDate, -60),
    basis:
      "Where the federal WARN Act applies, notice must be given at least 60 calendar days before the first worker's last day, by a method designed to ensure it arrives by then. Each later group of separations needs its own full 60 days.",
    sources: ["29 USC 2102(a)", "20 CFR 639.5(a)", "20 CFR 639.8"],
    toVerify: [
      "Whether the employer and the layoff are covered (headcount, site and 30- or 90-day aggregation) is not checked here.",
      "State laws (for example California and New York) can require longer notice and are not covered.",
    ],
  });
});

/**
 * Older Workers Benefit Protection Act: an employee aged 40 or over must have
 * at least 21 days to consider a waiver of age claims (45 for a group exit
 * programme) and at least 7 days after signing to revoke it (29 USC
 * 626(f)(1)(F), (G)). The agreement takes effect only after the revocation
 * period ends.
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
    basis: `An employee aged 40 or over must be given at least ${days} days to consider the agreement${groupProgramme ? ", because it is offered to a group" : ""}, and may revoke it within 7 days after signing. The agreement takes effect only once the revocation period has ended.`,
    sources: ["29 USC 626(f)(1)(F)", "29 USC 626(f)(1)(G)"],
    detail,
  });
});
