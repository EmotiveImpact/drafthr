/**
 * Billing price catalog — the single source of truth for every purchasable SKU.
 *
 * `stripePriceId` is read from env per key (seeded by scripts/stripe/seed-catalog.ts)
 * so TEST vs LIVE differ by environment, not code. Amounts are GBP minor units
 * (pence). Pricing decided 2026-07-02 — see ROADMAP.md §2.
 */

export type PriceKey =
  // HR subscriptions (workspace-scoped)
  | "sub_starter_monthly"
  | "sub_starter_annual"
  | "sub_pro_monthly"
  | "sub_pro_annual"
  | "sub_business_monthly"
  | "sub_business_annual"
  // Employee subscription (user-scoped)
  | "sub_employee_plus"
  // Employee one-off letters (value-tiered)
  | "letter_routine"
  | "letter_standard"
  | "letter_high"
  | "letter_tribunal"
  // Employee case packs
  | "pack_grievance"
  | "pack_settlement"
  | "pack_tribunal"
  // AI credit packs
  | "credits_single"
  | "credits_small"
  | "credits_medium"
  | "credits_best";

export type PlanId = "starter" | "pro" | "business" | "employee_plus";

export type CatalogEntry = {
  mode: "subscription" | "payment";
  amountMinor: number; // GBP pence
  label: string;
  kind: "plan" | "letter" | "pack" | "credits";
  /** For subscriptions: the internal plan id written to subscriptions.plan. */
  plan?: PlanId;
  /** Recurring plan-included AI credits, dripped each cycle (no rollover). */
  includedCreditsPerCycle?: number;
  /** One-time AI credits granted on purchase (credit packs + some letter tiers). */
  includedCredits?: number;
  /** For case packs: how many letters the pack authorises (metered per-letter). */
  includedLetters?: number;
  /** For one-off purchases: the entitlement_purchases.kind value. */
  purchaseKind?: string;
  /** Env var holding the Stripe price id (seeded by the catalog script). */
  stripePriceIdEnv: string;
};

export const CATALOG: Record<PriceKey, CatalogEntry> = {
  // --- HR subscriptions -------------------------------------------------------
  sub_starter_monthly: { mode: "subscription", amountMinor: 2900, label: "Starter (monthly)", kind: "plan", plan: "starter", stripePriceIdEnv: "STRIPE_PRICE_SUB_STARTER_MONTHLY" },
  sub_starter_annual: { mode: "subscription", amountMinor: 31900, label: "Starter (annual)", kind: "plan", plan: "starter", stripePriceIdEnv: "STRIPE_PRICE_SUB_STARTER_ANNUAL" },
  sub_pro_monthly: { mode: "subscription", amountMinor: 7900, label: "Pro (monthly)", kind: "plan", plan: "pro", includedCreditsPerCycle: 20, stripePriceIdEnv: "STRIPE_PRICE_SUB_PRO_MONTHLY" },
  sub_pro_annual: { mode: "subscription", amountMinor: 86900, label: "Pro (annual)", kind: "plan", plan: "pro", includedCreditsPerCycle: 20, stripePriceIdEnv: "STRIPE_PRICE_SUB_PRO_ANNUAL" },
  sub_business_monthly: { mode: "subscription", amountMinor: 19900, label: "Business (monthly)", kind: "plan", plan: "business", includedCreditsPerCycle: 20, stripePriceIdEnv: "STRIPE_PRICE_SUB_BUSINESS_MONTHLY" },
  sub_business_annual: { mode: "subscription", amountMinor: 218900, label: "Business (annual)", kind: "plan", plan: "business", includedCreditsPerCycle: 20, stripePriceIdEnv: "STRIPE_PRICE_SUB_BUSINESS_ANNUAL" },

  // --- Employee Plus subscription --------------------------------------------
  sub_employee_plus: { mode: "subscription", amountMinor: 9900, label: "Employee Plus", kind: "plan", plan: "employee_plus", includedCreditsPerCycle: 10, stripePriceIdEnv: "STRIPE_PRICE_SUB_EMPLOYEE_PLUS" },

  // --- Employee one-off letters (value-tiered by stakes) ---------------------
  letter_routine: { mode: "payment", amountMinor: 999, label: "Routine letter", kind: "letter", purchaseKind: "letter_routine", stripePriceIdEnv: "STRIPE_PRICE_LETTER_ROUTINE" },
  letter_standard: { mode: "payment", amountMinor: 2900, label: "Standard letter", kind: "letter", purchaseKind: "letter_standard", stripePriceIdEnv: "STRIPE_PRICE_LETTER_STANDARD" },
  letter_high: { mode: "payment", amountMinor: 5900, label: "High-stakes letter", kind: "letter", purchaseKind: "letter_high", includedCredits: 1, stripePriceIdEnv: "STRIPE_PRICE_LETTER_HIGH" },
  letter_tribunal: { mode: "payment", amountMinor: 9900, label: "Tribunal-bound letter", kind: "letter", purchaseKind: "letter_tribunal", includedCredits: 2, stripePriceIdEnv: "STRIPE_PRICE_LETTER_TRIBUNAL" },

  // --- Employee case packs (metered: a pack authorises N letters) ------------
  pack_grievance: { mode: "payment", amountMinor: 6900, label: "Grievance Pack", kind: "pack", purchaseKind: "pack_grievance", includedLetters: 4, stripePriceIdEnv: "STRIPE_PRICE_PACK_GRIEVANCE" },
  pack_settlement: { mode: "payment", amountMinor: 11900, label: "Settlement Pack", kind: "pack", purchaseKind: "pack_settlement", includedLetters: 6, stripePriceIdEnv: "STRIPE_PRICE_PACK_SETTLEMENT" },
  pack_tribunal: { mode: "payment", amountMinor: 24900, label: "Tribunal Prep Pack", kind: "pack", purchaseKind: "pack_tribunal", includedLetters: 8, stripePriceIdEnv: "STRIPE_PRICE_PACK_TRIBUNAL" },

  // --- AI credit packs (never expire) ----------------------------------------
  credits_single: { mode: "payment", amountMinor: 199, label: "1 AI credit", kind: "credits", includedCredits: 1, stripePriceIdEnv: "STRIPE_PRICE_CREDITS_SINGLE" },
  credits_small: { mode: "payment", amountMinor: 499, label: "5 AI credits", kind: "credits", includedCredits: 5, stripePriceIdEnv: "STRIPE_PRICE_CREDITS_SMALL" },
  credits_medium: { mode: "payment", amountMinor: 899, label: "10 AI credits", kind: "credits", includedCredits: 10, stripePriceIdEnv: "STRIPE_PRICE_CREDITS_MEDIUM" },
  credits_best: { mode: "payment", amountMinor: 1999, label: "25 AI credits", kind: "credits", includedCredits: 25, stripePriceIdEnv: "STRIPE_PRICE_CREDITS_BEST" },
};

export function catalogFor(key: PriceKey): CatalogEntry {
  return CATALOG[key];
}

/**
 * Plan-included AI credits dripped each billing cycle, by internal plan id.
 * Monthly and annual share a plan and the same drip (Pro 20, Business 20,
 * Employee Plus 10); Starter has none. Derived from the catalog so the number
 * lives in exactly one place. 0 for unknown / non-dripping plans.
 */
export function creditsPerCycleForPlan(plan: string): number {
  for (const entry of Object.values(CATALOG)) {
    if (entry.plan === plan && entry.includedCreditsPerCycle) {
      return entry.includedCreditsPerCycle;
    }
  }
  return 0;
}

/**
 * How many letters a case pack authorises, resolved from its entitlement `kind`
 * (the purchaseKind written to entitlement_purchases). 0 for a non-pack / unknown
 * kind. Single source of truth for both the purchase grant and the backfill.
 */
export function packLetterAllowance(kind: string): number {
  for (const entry of Object.values(CATALOG)) {
    if (entry.kind === "pack" && entry.purchaseKind === kind && entry.includedLetters) {
      return entry.includedLetters;
    }
  }
  return 0;
}

/**
 * Pick the first pack that still has letters left (total − used > 0). Legacy
 * pack rows with a null allowance are treated as having none. Pure so the gate
 * decision is unit-testable without a DB.
 */
export function pickUsablePack<T extends { lettersTotal: number | null; lettersUsed: number | null }>(
  packs: T[],
): T | undefined {
  return packs.find((p) => (p.lettersTotal ?? 0) - (p.lettersUsed ?? 0) > 0);
}

/**
 * The catalogue entry behind an entitlement_purchases.kind. Letters and packs
 * store their purchaseKind; credit packs have none and store the price key.
 */
export function catalogEntryForPurchaseKind(kind: string): CatalogEntry | null {
  for (const key of Object.keys(CATALOG) as PriceKey[]) {
    const entry = CATALOG[key];
    if (entry.mode === "payment" && (entry.purchaseKind ?? key) === kind) return entry;
  }
  return null;
}

export function isPriceKey(v: unknown): v is PriceKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CATALOG, v);
}

/**
 * The Stripe price id for a key, from env (seeded per environment). Null if unset.
 * Server-only — this module is also imported client-side for labels/amounts, so
 * guard `process` in case it's ever called there (returns null rather than crash).
 */
export function stripePriceId(key: PriceKey): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  return process.env[CATALOG[key].stripePriceIdEnv]?.trim() || null;
}

/**
 * The plan a Stripe subscription price belongs to, by matching it against this
 * environment's seeded price ids. Used by the billing webhook so a plan change
 * made in Stripe (portal or support) reaches the app, rather than trusting the
 * plan frozen into checkout metadata. Null if the price is not one of ours.
 */
export function planForStripePriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  for (const key of Object.keys(CATALOG) as PriceKey[]) {
    const entry = CATALOG[key];
    if (entry.kind === "plan" && entry.plan && stripePriceId(key) === priceId) return entry.plan;
  }
  return null;
}

/**
 * Whether a Stripe subscription price bills yearly or monthly, by matching it
 * against this environment's seeded price ids. Annual prices are the
 * `*_annual` keys; every other plan price is monthly. Null if the price is not
 * one of ours. Annual plans still get their allowances (credits, the Starter
 * letter cap) month by month, so callers use this to split the billing period.
 */
export function billingIntervalForStripePriceId(
  priceId: string | null | undefined,
): "month" | "year" | null {
  if (!priceId) return null;
  for (const key of Object.keys(CATALOG) as PriceKey[]) {
    if (CATALOG[key].kind === "plan" && stripePriceId(key) === priceId) {
      return key.endsWith("_annual") ? "year" : "month";
    }
  }
  return null;
}
