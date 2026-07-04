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
    // Processing failed — do NOT mark the event seen; return 500 so Stripe
    // retries with backoff. Every write here is idempotent (subscriptions upsert
    // by id; one-off purchase + its credit grant are atomic and keyed on the
    // payment intent), so a retry re-applies cleanly with no double-charge or
    // double-grant, and no paid event is ever silently dropped.
    console.error("[billing-webhook] handler error — will retry", event.type, err);
    return jsonError("Processing failed — retry", 500);
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

  // Record the purchase + grant credits ATOMICALLY, keyed on the payment intent
  // (UNIQUE). The entitlement insert is the single idempotency anchor for the
  // WHOLE one-off — credit packs included — so credits are granted exactly once
  // even if the event is redelivered or the event-id dedup is bypassed; and
  // because both writes share one transaction, a mid-way failure rolls both back
  // for a clean retry (no orphaned entitlement that would suppress the credits).
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(entitlementPurchases)
      .values({ userId, kind: entry.purchaseKind ?? priceKey, stripePaymentIntentId: paymentIntentId })
      .onConflictDoNothing()
      .returning({ id: entitlementPurchases.id });
    if (inserted.length === 0) return; // this payment was already recorded

    if (entry.includedCredits && entry.includedCredits > 0) {
      await tx.insert(creditLedger).values({
        subjectType: "user",
        subjectId: userId,
        delta: entry.includedCredits,
        reason: entry.kind === "credits" ? "pack" : "letter_included",
      });
    }
  });
}
