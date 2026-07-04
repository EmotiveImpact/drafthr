/**
 * Billing-mode Stripe helpers — DIRECT charges where DraftHR is the merchant
 * (subscriptions, one-off letters, packs, credit packs). Deliberately separate
 * from `_utils/stripe.ts`, which owns the marketplace's Connect/destination
 * charges, so the two charge models never get conflated.
 */
import { and, eq, isNull } from "drizzle-orm";
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

/**
 * Atomically claim the customer id: set it only if still null (first writer
 * wins). Returns the id now stored — the one we pass if we won, or the
 * concurrently-set one if we lost. This keeps the DB pointer consistent with the
 * customer the subscription lands on, even if two first-ever checkouts race; a
 * losing writer's freshly-created Stripe customer is simply left unused.
 */
async function claimStripeCustomerId(
  subjectType: BillingSubjectType,
  subjectId: string,
  customerId: string,
): Promise<string> {
  const db = getDb();
  if (subjectType === "tenant") {
    const [won] = await db
      .update(tenants)
      .set({ stripeCustomerId: customerId })
      .where(and(eq(tenants.id, subjectId), isNull(tenants.stripeCustomerId)))
      .returning({ id: tenants.stripeCustomerId });
    if (won?.id) return won.id;
  } else {
    const [won] = await db
      .update(users)
      .set({ stripeCustomerId: customerId })
      .where(and(eq(users.id, subjectId), isNull(users.stripeCustomerId)))
      .returning({ id: users.stripeCustomerId });
    if (won?.id) return won.id;
  }
  // Lost the race — another request set it first. Return theirs.
  return (await readStripeCustomerId(subjectType, subjectId)) ?? customerId;
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
  // Claim atomically — if a concurrent first-time checkout beat us, use theirs.
  return claimStripeCustomerId(subjectType, subjectId, customer.id);
}
