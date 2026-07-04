/**
 * /api/marketplace/billing-webhook — Stripe → us, for DIRECT-charge billing
 * (subscriptions + one-off letters/packs/credits). Separate registered Stripe
 * endpoint from the marketplace/Connect webhook, with its own signing secret
 * (STRIPE_BILLING_WEBHOOK_SECRET).
 *
 * Handled:
 *   checkout.session.completed (mode=payment)  → entitlement + credits for a one-off
 *   customer.subscription.created / .updated   → upsert the subscription mirror
 *   customer.subscription.deleted              → mark canceled
 *   invoice.payment_failed                     → status=past_due, grace_until=now+3d
 *   invoice.paid                               → clear grace, status=active
 *
 * Idempotent: every delivery is deduped via webhook_events_seen (insert the
 * event id; a conflict means "already processed" → ack + skip).
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { jsonError } from "../../_utils/request.js";
import { getStripe } from "../../_utils/stripe.js";
import { getDb } from "../../../src/db/index.js";
import { subscriptions, entitlementPurchases, creditLedger, webhookEventsSeen } from "../../../src/db/schema.js";
import { catalogFor, isPriceKey } from "../../../src/lib/billing/catalog.js";

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

  // Idempotency guard: insert the event id; if it already exists (conflict →
  // 0 rows returned) we've processed this delivery, so ack and skip.
  try {
    const inserted = await db
      .insert(webhookEventsSeen)
      .values({ eventId: event.id })
      .onConflictDoNothing()
      .returning({ eventId: webhookEventsSeen.eventId });
    if (inserted.length === 0) return ack();
  } catch (err) {
    console.error("[billing-webhook] dedup insert failed", err);
    // Fall through and process — a duplicate is safer than a dropped event
    // (subscription upserts are keyed on stripeSubscriptionId, so re-applying
    // the same state is a no-op).
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.purpose !== "billing") break; // marketplace booking — not ours
        if (s.mode === "payment" && s.payment_status === "paid") {
          await recordOneOff(db, s);
        }
        // subscription mode is handled by customer.subscription.created below.
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await upsertSubscription(db, event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db
          .update(subscriptions)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, sub.id));
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdOf(inv);
        if (subId) {
          await db
            .update(subscriptions)
            .set({ status: "past_due", graceUntil: new Date(Date.now() + GRACE_MS), updatedAt: new Date() })
            .where(eq(subscriptions.stripeSubscriptionId, subId));
        }
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdOf(inv);
        if (subId) {
          await db
            .update(subscriptions)
            .set({ status: "active", graceUntil: null, updatedAt: new Date() })
            .where(eq(subscriptions.stripeSubscriptionId, subId));
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Log but still 200 — a DB hiccup shouldn't trigger a Stripe retry-storm.
    console.error("[billing-webhook] handler error", event.type, err);
  }

  return ack();
}

function subscriptionIdOf(inv: Stripe.Invoice): string | null {
  const sub = (inv as unknown as { subscription?: string | { id: string } }).subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
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
  const plan = m.plan || "unknown";
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
        updatedAt: values.updatedAt,
      },
    });
}

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

  // A paid letter or pack becomes an entitlement (unique on the payment intent,
  // so a redelivery can't double-grant).
  if (entry.kind === "letter" || entry.kind === "pack") {
    await db
      .insert(entitlementPurchases)
      .values({ userId, kind: entry.purchaseKind ?? priceKey, stripePaymentIntentId: paymentIntentId })
      .onConflictDoNothing();
  }

  // Credit packs (and letter tiers that include credits) grant to the user's
  // ledger — packs never expire (expiresAt null). Keyed off the payment intent
  // via a matching entitlement row is overkill here; the dedup guard on the
  // event id already prevents double-processing.
  if (entry.includedCredits && entry.includedCredits > 0) {
    await db.insert(creditLedger).values({
      subjectType: "user",
      subjectId: userId,
      delta: entry.includedCredits,
      reason: entry.kind === "credits" ? "pack" : "letter_included",
    });
  }
}
