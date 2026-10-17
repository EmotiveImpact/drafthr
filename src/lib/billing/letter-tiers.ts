/**
 * Value tiers for one-off letter purchases. A single-letter purchase is bought
 * for a tier (routine, standard, high-stakes, tribunal-bound) and may only
 * authorise a letter of that tier or a cheaper one, so a £9.99 routine letter
 * can't be spent on a tribunal-bound one.
 *
 * Kept as an explicit map (no imports) because the API bundle loads this file
 * directly; tests/lib/billing/letter-tiers.test.ts checks that every letter
 * type in the letter catalogue has a tier here.
 */

export type LetterTier = "routine" | "standard" | "high" | "tribunal";

const TIER_RANK: Record<LetterTier, number> = { routine: 0, standard: 1, high: 2, tribunal: 3 };

export const LETTER_TIER_BY_TYPE: Record<string, LetterTier> = {
  // Employee letters (matches the Pricing page blurbs)
  resignation_clean: "routine",
  resignation_withdrawal: "routine",
  flexible_working_request: "routine",
  holiday_request: "routine",
  sickness_notification: "routine",
  right_to_disconnect: "routine",
  subject_access_request: "routine",
  grievance: "standard",
  appeal: "standard",
  accommodation_request: "standard",
  pay_dispute: "standard",
  redundancy_consultation_response: "standard",
  pip_response: "standard",
  reference_dispute: "standard",
  settlement_counter_offer: "high",
  resignation_with_grievance: "high",
  whistleblowing: "high",
  resignation_constructive: "tribunal",
  constructive_dismissal_warning: "tribunal",
  acas_ec_notification: "tribunal",
  tribunal_cover: "tribunal",
  // Employer letters (normally covered by a workspace plan)
  reference: "routine",
  promotion: "routine",
  salary_increase: "routine",
  leave_approval: "routine",
  resignation_acceptance: "routine",
  offer: "standard",
  probation_outcome: "standard",
  contract_amendment: "standard",
  return_to_work: "standard",
  right_to_work: "standard",
  termination: "high",
  warning: "high",
  suspension_confirmation: "high",
  investigation_meeting_invite: "high",
  disciplinary_hearing_invite: "high",
  redundancy: "high",
  settlement_cover: "high",
};

/** The tier a letter type needs. Unknown types need the top tier. */
export function letterTierFor(letterType: string | null | undefined): LetterTier {
  return (letterType && Object.prototype.hasOwnProperty.call(LETTER_TIER_BY_TYPE, letterType)
    ? LETTER_TIER_BY_TYPE[letterType]
    : "tribunal");
}

/** The tier a single-letter purchase kind was bought for (`letter_<tier>`), or null. */
export function tierOfLetterPurchase(kind: string): LetterTier | null {
  const tier = kind.startsWith("letter_") ? kind.slice("letter_".length) : "";
  return Object.prototype.hasOwnProperty.call(TIER_RANK, tier) ? (tier as LetterTier) : null;
}

/** Does a single-letter purchase of `kind` authorise a letter of `letterType`? */
export function letterPurchaseCovers(kind: string, letterType: string | null | undefined): boolean {
  const bought = tierOfLetterPurchase(kind);
  if (!bought) return false;
  return TIER_RANK[bought] >= TIER_RANK[letterTierFor(letterType)];
}

/**
 * Of the unconsumed single-letter purchases, the one to spend on `letterType`:
 * the cheapest tier that covers it, so a tribunal purchase isn't used up on a
 * routine letter while a routine purchase sits unused. With no letter type
 * (the billing-status preview, which has no letter in hand), any purchase counts.
 */
export function pickLetterPurchase<T extends { kind: string }>(
  purchases: T[],
  letterType?: string | null,
): T | undefined {
  const usable = purchases.filter((p) =>
    letterType === undefined
      ? tierOfLetterPurchase(p.kind) !== null
      : letterPurchaseCovers(p.kind, letterType),
  );
  return usable.sort(
    (a, b) => TIER_RANK[tierOfLetterPurchase(a.kind)!] - TIER_RANK[tierOfLetterPurchase(b.kind)!],
  )[0];
}
