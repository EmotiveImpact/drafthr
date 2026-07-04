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

  // --- Employee case packs ----------------------------------------------------
  pack_grievance: { mode: "payment", amountMinor: 6900, label: "Grievance Pack", kind: "pack", purchaseKind: "pack_grievance", stripePriceIdEnv: "STRIPE_PRICE_PACK_GRIEVANCE" },
  pack_settlement: { mode: "payment", amountMinor: 11900, label: "Settlement Pack", kind: "pack", purchaseKind: "pack_settlement", stripePriceIdEnv: "STRIPE_PRICE_PACK_SETTLEMENT" },
  pack_tribunal: { mode: "payment", amountMinor: 24900, label: "Tribunal Prep Pack", kind: "pack", purchaseKind: "pack_tribunal", stripePriceIdEnv: "STRIPE_PRICE_PACK_TRIBUNAL" },

  // --- AI credit packs (never expire) ----------------------------------------
  credits_single: { mode: "payment", amountMinor: 199, label: "1 AI credit", kind: "credits", includedCredits: 1, stripePriceIdEnv: "STRIPE_PRICE_CREDITS_SINGLE" },
  credits_small: { mode: "payment", amountMinor: 499, label: "5 AI credits", kind: "credits", includedCredits: 5, stripePriceIdEnv: "STRIPE_PRICE_CREDITS_SMALL" },
  credits_medium: { mode: "payment", amountMinor: 899, label: "10 AI credits", kind: "credits", includedCredits: 10, stripePriceIdEnv: "STRIPE_PRICE_CREDITS_MEDIUM" },
  credits_best: { mode: "payment", amountMinor: 1999, label: "25 AI credits", kind: "credits", includedCredits: 25, stripePriceIdEnv: "STRIPE_PRICE_CREDITS_BEST" },
};

export function catalogFor(key: PriceKey): CatalogEntry {
  return CATALOG[key];
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
