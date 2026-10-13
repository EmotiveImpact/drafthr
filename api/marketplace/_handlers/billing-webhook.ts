/**
 * /api/marketplace/billing-webhook — Stripe → us, for DIRECT-charge billing
 * (subscriptions + one-off letters/packs/credits). Separate registered Stripe
 * endpoint from the marketplace/Connect webhook, with its own signing secret
 * (STRIPE_BILLING_WEBHOOK_SECRET).
 *
 * Handled:
 *   checkout.session.completed (mode=payment)  → entitlement + credits for a one-off
 *   checkout.session.async_payment_succeeded   → the same, once a delayed
 *                                                method (Direct Debit) settles
 *   customer.subscription.created / .updated / .deleted,
 *   invoice.payment_failed, invoice.paid       → re-read the subscription from
 *                                                Stripe and mirror its CURRENT
 *                                                state (see syncSubscription)
 *   charge.refunded (full refund of a one-off)  → revoke the purchase and the
 *                                                credits it granted
 *
 * Idempotent: every delivery is deduped via webhook_events_seen (insert the
 * event id; a conflict means "already processed" → ack + skip).
 */
import type Stripe from "stripe";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { jsonError } from "../../_utils/request.js";
import { getStripe } from "../../_utils/stripe.js";
import { getDb } from "../../../src/db/index.js";
import { subscriptions, entitlementPurchases, creditLedger, webhookEventsSeen } from "../../../src/db/schema.js";
import {
  catalogFor,
  catalogEntryForPurchaseKind,
  isPriceKey,
  planForStripePriceId,
} from "../../../src/lib/billing/catalog.js";
import { dripPlanCredits, grantPlanDrip, REVOKE_PREFIX } from "../../_utils/entitlements.js";

export const config = { runtime: "nodejs" };

const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3-day grace on failed renewal

function ack(): Response {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const stripe = getStripe();
  if (!stripe) return jsonError("Payments are not configured", 503);
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET?.trim();
  if (!secret) return jsonError("Billing webhook secret not configured", 503);

  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
  } catch (err) {
    console.warn("[billing-webhook] signature verification failed", err);
    return jsonError("Invalid signature", 400);
  }

  const db = getDb();

  // Fast-path dedup: if we've already FULLY processed this event, skip. The
  // "seen" marker is written only AFTER processing succeeds (below), so an event
  // is never recorded done with its side effects half-applied — and because
  // every write below is idempotent, reprocessing after a failure is safe.
  try {
    const [seen] = await db
      .select({ eventId: webhookEventsSeen.eventId })
      .from(webhookEventsSeen)
      .where(eq(webhookEventsSeen.eventId, event.id))
      .limit(1);
    if (seen) return ack();
  } catch (err) {
    console.warn("[billing-webhook] dedup lookup failed — processing anyway", err);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      // A delayed method (Direct Debit) completes the session unpaid and
      // confirms the payment days later in this event.
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.purpose !== "billing") break; // marketplace booking — not ours
        if (s.mode === "payment" && s.payment_status === "paid") {
          await recordOneOff(db, s);
        }
        // subscription mode is handled by customer.subscription.created below.
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(db, stripe, (event.data.object as Stripe.Subscription).id);
        break;
      }
      case "charge.refunded": {
        // Only one-off billing purchases are recorded against a payment intent
        // in entitlement_purchases; a charge with no such row (a marketplace
        // booking, a subscription invoice) is left alone.
        const charge = event.data.object as Stripe.Charge;
        const pi =
          typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
        if (pi && charge.refunded) await reverseOneOff(db, pi);
        break;
      }
      case "invoice.payment_failed":
      case "invoice.paid": {
        const subId = subscriptionIdOf(event.data.object as Stripe.Invoice);
        if (subId) await syncSubscription(db, stripe, subId);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Processing failed — do NOT mark the event seen; return 500 so Stripe
    // retries with backoff. Every write here is idempotent (subscriptions upsert
    // by id; one-off purchase + its credit grant are atomic and keyed on the
    // payment intent), so a retry re-applies cleanly with no double-charge or
    // double-grant, and no paid event is ever silently dropped.
    console.error("[billing-webhook] handler error — will retry", event.type, err);
    return jsonError("Processing failed. Retry.", 500);
  }

  // Success: record the event so redeliveries fast-path out. Best-effort — if
  // this write fails, a redelivery simply reprocesses idempotently.
  try {
    await db.insert(webhookEventsSeen).values({ eventId: event.id }).onConflictDoNothing();
  } catch (err) {
    console.warn("[billing-webhook] could not record processed event", err);
  }
  return ack();
}

export function subscriptionIdOf(inv: Stripe.Invoice): string | null {
  const pick = (v: unknown): string | null =>
    typeof v === "string"
      ? v
      : v && typeof v === "object" && "id" in v
        ? String((v as { id: string }).id)
        : null;
  // API ≤2025 exposed invoice.subscription; 2026-05-27.dahlia (this SDK's pinned
  // version) moved it to invoice.parent.subscription_details.subscription, with a
  // line-level fallback. Check all three so the 3-day grace actually fires.
  const anyInv = inv as unknown as {
    subscription?: string | { id: string };
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
    lines?: { data?: Array<{ subscription?: string | { id: string } }> };
  };
  return (
    pick(anyInv.subscription) ??
    pick(anyInv.parent?.subscription_details?.subscription) ??
    pick(anyInv.lines?.data?.find((l) => l.subscription)?.subscription) ??
    null
  );
}

/**
 * Mirror a subscription's CURRENT state from Stripe. Stripe does not guarantee
 * event order and retries failed deliveries for days, so copying the status out
 * of whichever payload arrives let a stale `.updated` (or a late `invoice.paid`)
 * flip a canceled subscription back to active. Re-reading the object makes every
 * subscription and invoice event converge on the truth, whatever order they land.
 */
async function syncSubscription(
  db: ReturnType<typeof getDb>,
  stripe: Stripe,
  subscriptionId: string,
): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertSubscription(db, sub);
}

/**
 * The grace window for a subscription in `status`. Set once, when the row first
 * goes past_due, and kept on later failed retries; Stripe sends a fresh
 * `invoice.payment_failed` for every retry, and resetting the clock each time
 * kept a failing card fully entitled for the whole multi-week retry schedule.
 */
export function graceUntilFor(status: string, existing: Date | null, now = Date.now()): Date | null {
  if (status !== "past_due") return null;
  return existing ?? new Date(now + GRACE_MS);
}

async function upsertSubscription(
  db: ReturnType<typeof getDb>,
  sub: Stripe.Subscription,
): Promise<void> {
  const m = sub.metadata ?? {};
  const subjectType = m.subjectType === "user" ? "user" : "tenant";
  const subjectId = m.subjectId;
  if (!subjectId) return; // not one of ours (no billing metadata)
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? "";
  // The live price decides the plan, so a change made in Stripe lands here;
  // checkout metadata is only the fallback for a price we don't recognise.
  const plan = planForStripePriceId(priceId) ?? (m.plan || "unknown");
  // Stripe API ≥2025 moved current_period_* onto the subscription ITEM; older
  // versions have it on the subscription. Read the item first, fall back.
  const startUnix =
    (item as unknown as { current_period_start?: number })?.current_period_start ??
    (sub as unknown as { current_period_start?: number }).current_period_start ??
    Math.floor(Date.now() / 1000);
  const endUnix =
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    Math.floor(Date.now() / 1000);
  const periodStart = new Date(startUnix * 1000);
  const periodEnd = new Date(endUnix * 1000);

  const values = {
    subjectType,
    subjectId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    plan,
    status: sub.status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    graceUntil: graceUntilFor(sub.status, null),
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        stripePriceId: values.stripePriceId,
        plan: values.plan,
        status: values.status,
        currentPeriodStart: values.currentPeriodStart,
        currentPeriodEnd: values.currentPeriodEnd,
        cancelAtPeriodEnd: values.cancelAtPeriodEnd,
        // Keep an existing grace deadline while still past_due (see graceUntilFor).
        graceUntil:
          sub.status === "past_due"
            ? sql`coalesce(${subscriptions.graceUntil}, excluded.grace_until)`
            : null,
        updatedAt: values.updatedAt,
      },
    });

  // Grant the plan's included AI credits for the current month. On a monthly
  // plan that is this billing period; on an annual plan it is the current
  // month of the year (later months are granted lazily when entitlements are
  // read, as Stripe sends no event at those boundaries). Idempotent per
  // window, so it lands exactly once however many events Stripe sends and in
  // whatever order. Only for a usable status: a past_due/incomplete period
  // grants nothing; a later sync that finds it active grants then.
  await grantPlanDrip(db, {
    subjectType,
    subjectId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    plan,
    status: sub.status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });
}

export { dripPlanCredits };

async function recordOneOff(
  db: ReturnType<typeof getDb>,
  s: Stripe.Checkout.Session,
): Promise<void> {
  const m = s.metadata ?? {};
  const priceKey = m.priceKey;
  const userId = m.userId;
  if (!isPriceKey(priceKey) || !userId) return;
  const entry = catalogFor(priceKey);
  const paymentIntentId =
    typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  if (!paymentIntentId) return;

  // Record the purchase + grant credits ATOMICALLY, keyed on the payment intent
  // (UNIQUE). The entitlement insert is the single idempotency anchor for the
  // WHOLE one-off — credit packs included — so credits are granted exactly once
  // even if the event is redelivered or the event-id dedup is bypassed; and
  // because both writes share one transaction, a mid-way failure rolls both back
  // for a clean retry (no orphaned entitlement that would suppress the credits).
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(entitlementPurchases)
      .values({
        userId,
        kind: entry.purchaseKind ?? priceKey,
        stripePaymentIntentId: paymentIntentId,
        // Packs are metered per-letter — stamp the allowance at grant time so the
        // create-gate can count against it. Null for single-letter/credit buys.
        lettersTotal: entry.kind === "pack" ? entry.includedLetters ?? null : null,
      })
      .onConflictDoNothing()
      .returning({ id: entitlementPurchases.id });
    if (inserted.length === 0) return; // this payment was already recorded

    if (entry.includedCredits && entry.includedCredits > 0) {
      await tx.insert(creditLedger).values({
        subjectType: "user",
        subjectId: userId,
        delta: entry.includedCredits,
        reason: entry.kind === "credits" ? "pack" : "letter_included",
        // Lets a later refund find and revoke exactly this grant.
        grantKey: `purchase:${paymentIntentId}`,
      });
    }
  });
}

/**
 * A one-off purchase was fully refunded: stop it authorising anything and take
 * back the credits it granted. Runs in one transaction keyed on the purchase's
 * refunded_at, so a redelivered event changes nothing. The clawback targets
 * the purchase's own grant (`revoke:<grantId>`) and removes only what is left
 * of it, so it never eats plan credits or other packs and never pushes the
 * balance below zero. Partial refunds are left for support to handle by hand.
 */
async function reverseOneOff(db: ReturnType<typeof getDb>, paymentIntentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [purchase] = await tx
      .update(entitlementPurchases)
      .set({ refundedAt: new Date() })
      .where(
        and(
          eq(entitlementPurchases.stripePaymentIntentId, paymentIntentId),
          isNull(entitlementPurchases.refundedAt),
        ),
      )
      .returning({ userId: entitlementPurchases.userId, kind: entitlementPurchases.kind });
    if (!purchase) return; // not a billing one-off, or already reversed

    const credits = catalogEntryForPurchaseKind(purchase.kind)?.includedCredits ?? 0;
    if (credits <= 0) return;

    // Grants since this change carry `purchase:<pi>`. Older ones were written
    // in the same transaction as the purchase, so they share its created_at.
    const [grant] = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.subjectType, "user"),
          eq(creditLedger.subjectId, purchase.userId),
          inArray(creditLedger.reason, ["pack", "letter_included"]),
          // Compared in SQL, not via a JS Date, which would drop the microseconds.
          sql`(${creditLedger.grantKey} = ${`purchase:${paymentIntentId}`} or (${creditLedger.grantKey} is null and ${creditLedger.createdAt} = (select ${entitlementPurchases.createdAt} from ${entitlementPurchases} where ${entitlementPurchases.stripePaymentIntentId} = ${paymentIntentId})))`,
        ),
      )
      .limit(1);
    if (!grant) {
      console.warn("[billing-webhook] refunded purchase has no credit grant to revoke", paymentIntentId);
      return;
    }
    await tx
      .insert(creditLedger)
      .values({
        subjectType: "user",
        subjectId: purchase.userId,
        delta: -credits,
        reason: "purchase_refund",
        grantKey: `${REVOKE_PREFIX}${grant.id}`,
      })
      .onConflictDoNothing({
        target: creditLedger.grantKey,
        where: sql`${creditLedger.grantKey} is not null`,
      });
  });
}
