/**
 * Billing-mode Stripe helpers — DIRECT charges where DraftHR is the merchant
 * (subscriptions, one-off letters, packs, credit packs). Deliberately separate
 * from `_utils/stripe.ts`, which owns the marketplace's Connect/destination
 * charges, so the two charge models never get conflated.
 */
import { eq } from "drizzle-orm";
import { getStripe } from "./stripe.js";
import { getDb } from "../../src/db/index.js";
import { tenants, users } from "../../src/db/schema.js";

export type BillingSubjectType = "tenant" | "user";

async function readStripeCustomerId(
  subjectType: BillingSubjectType,
  subjectId: string,
): Promise<string | null> {
  const db = getDb();
  if (subjectType === "tenant") {
    const [row] = await db
      .select({ id: tenants.stripeCustomerId })
      .from(tenants)
      .where(eq(tenants.id, subjectId))
      .limit(1);
    return row?.id ?? null;
  }
  const [row] = await db
    .select({ id: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, subjectId))
    .limit(1);
  return row?.id ?? null;
}

async function persistStripeCustomerId(
  subjectType: BillingSubjectType,
  subjectId: string,
  customerId: string,
): Promise<void> {
  const db = getDb();
  if (subjectType === "tenant") {
    await db.update(tenants).set({ stripeCustomerId: customerId }).where(eq(tenants.id, subjectId));
  } else {
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, subjectId));
  }
}

/**
 * Returns the Stripe customer id for a subject, creating + persisting one on
 * first use. The customer carries {subjectType, subjectId} metadata so webhooks
 * can resolve a Stripe event back to our tenant/user without a lookup table.
 */
export async function getOrCreateCustomer(
  subjectType: BillingSubjectType,
  subjectId: string,
  email: string | null,
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Payments are not configured");

  const existing = await readStripeCustomerId(subjectType, subjectId);
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { subjectType, subjectId },
  });
  await persistStripeCustomerId(subjectType, subjectId, customer.id);
  return customer.id;
}
