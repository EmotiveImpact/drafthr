import type { UkRegion } from "./letters/types";
import { parseDateOnly, toDateOnly } from "./date-only";

/**
 * UK employment tribunal primary time limits.
 *
 * Great Britain: section 152 of and Schedule 12 to the Employment Rights Act
 * 2025, in force on 1 October 2026 (SI 2026/954), changed the primary limit
 * for most claims (unfair dismissal, discrimination, unlawful deductions and
 * the rest) from three months to six. Regulation 4 of that SI applies the
 * longer limit only where the "relevant date" is on or after 1 October 2026:
 * the act complained of (the last act in a series), or for unfair dismissal
 * the effective date of termination. Earlier acts keep three months.
 *
 * Northern Ireland: employment law is devolved and the 2025 Act's change does
 * not reach industrial tribunal claims there, so they stay at three months
 * (for example Article 145 of the Employment Rights (NI) Order 1996).
 *
 * The period "begins with" the relevant date, so it ends the day before the
 * corresponding date N months later. Where the end month has no corresponding
 * date it ends on that month's last day (Dodds v Walker [1981] 1 WLR 1027;
 * Pruden v Cunard Ellerman Ltd [1993] IRLR 317, EAT: EDT 31 August, last day
 * 30 November).
 *
 * Early conciliation stops the clock on top of this, and the claimant always
 * has at least a month after the certificate (ERA 1996 s.207B). That
 * extension depends on dates we do not collect, so it is not added here.
 */

/** First relevant date to which the Great Britain six-month limit applies. */
export const GB_SIX_MONTH_LIMIT_FROM = "2026-10-01";

export type UkLimitationMonths = 3 | 6;

export type UkTribunalLimitation = {
  /** Last day to present the claim, before any early conciliation extension. */
  iso: string;
  months: UkLimitationMonths;
  /** Human-readable statutory basis shown with the deadline. */
  basis: string;
};

/** Length of the primary limit for an act on `actDate` in `ukRegion`. */
export function ukLimitationMonths(actDate: string, ukRegion?: UkRegion): UkLimitationMonths {
  if (ukRegion === "Northern Ireland") return 3;
  return actDate.slice(0, 10) >= GB_SIX_MONTH_LIMIT_FROM ? 6 : 3;
}

/**
 * Last day of a period of `months` months beginning with `startDate`
 * ("N months less one day"), or undefined for an invalid date.
 */
export function lastDayOfMonthsBeginningWith(startDate: string, months: number): string | undefined {
  const start = parseDateOnly(startDate);
  if (!start) return undefined;
  const day = start.getDate();
  const end = new Date(start.getFullYear(), start.getMonth() + months, 1);
  const daysInEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  // No corresponding date (e.g. 31 March + 6 months): the month's last day.
  // Otherwise the day before the corresponding date; day 1 rolls back into
  // the previous month's last day.
  end.setDate(day > daysInEndMonth ? daysInEndMonth : day - 1);
  return toDateOnly(end);
}

/**
 * The primary tribunal time limit for an act on `actDate`, chosen by region
 * and by whether the act fell before or on/after 1 October 2026. An unset
 * region is treated as Great Britain, matching the rest of the app's default.
 */
export function ukTribunalLimitation(
  actDate: string,
  ukRegion?: UkRegion
): UkTribunalLimitation | undefined {
  const parsed = parseDateOnly(actDate);
  if (!parsed) return undefined;
  const act = toDateOnly(parsed);
  const months = ukLimitationMonths(act, ukRegion);
  const iso = lastDayOfMonthsBeginningWith(act, months);
  if (!iso) return undefined;
  return { iso, months, basis: limitationBasis(months, ukRegion) };
}

function limitationBasis(months: UkLimitationMonths, ukRegion?: UkRegion): string {
  if (ukRegion === "Northern Ireland") {
    return (
      "Northern Ireland: most industrial tribunal claims, including unfair dismissal (Article 145, Employment Rights (Northern Ireland) Order 1996), " +
      "must be presented within 3 months less one day of the act complained of (for dismissal, the effective date of termination), " +
      "subject to the Labour Relations Agency early conciliation extension. The Employment Rights Act 2025 six-month limit does not apply in Northern Ireland."
    );
  }
  if (months === 6) {
    const basis =
      "Employment Rights Act 2025: for an act on or after 1 October 2026, most tribunal claims (including unfair dismissal under ERA 1996 s.111, " +
      "discrimination under Equality Act 2010 s.123 and unlawful deductions under ERA 1996 s.23) must be presented within 6 months less one day " +
      "of the act complained of (for dismissal, the effective date of termination), subject to the ACAS Early Conciliation extension.";
    return ukRegion
      ? basis
      : `${basis} In Northern Ireland the limit is 3 months less one day: set the UK region in Edit details if that applies.`;
  }
  return (
    "Act before 1 October 2026: tribunal claims (including unfair dismissal under ERA 1996 s.111 and discrimination under Equality Act 2010 s.123) " +
    "must be presented within 3 months less one day of the act complained of (for dismissal, the effective date of termination), " +
    "subject to the ACAS Early Conciliation extension. The 6-month limit under the Employment Rights Act 2025 applies only to acts on or after 1 October 2026."
  );
}
