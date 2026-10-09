/**
 * /api/marketplace/stripe-webhook — Stripe → us. Verifies the signature against
 * STRIPE_WEBHOOK_SECRET (NOT same-origin — Stripe is a server-to-server caller),
 * then reconciles payout + payment state into the decoupled tables.
 *
 * Handled events:
 *   account.updated                          → payoutsEnabled / detailsSubmitted
 *                                              on the consultant's Connect account
 *   checkout.session.completed               → paid when payment_status is "paid",
 *                                              processing when an async method
 *                                              (e.g. Direct Debit) is still settling
 *   checkout.session.async_payment_succeeded → paid
 *   checkout.session.async_payment_failed    → failed
 *   charge.refunded                          → full refund: refunded, draft access
 *                                              withdrawn, Connect transfer reversed
 *   charge.dispute.created                   → disputed, draft access withdrawn
 *   charge.dispute.closed                    → won: paid again; lost: transfer
 *                                              reversed
 *
 * Every Checkout session is matched to its booking (metadata booking id, amount
 * and currency against the booking's price snapshot) before anything is marked
 * paid; a mismatch is logged and ignored. See api/_utils/marketplace-payments.ts.
 *
 * Configure the endpoint URL in Stripe (Developers → Webhooks):
 *   https://<your-domain>/api/marketplace/stripe-webhook
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { jsonError } from "../../_utils/request.js";
import { getDb } from "../../../src/db/index.js";
import { stripeConnectAccounts } from "../../../src/db/schema.js";
import { getStripe } from "../../_utils/stripe.js";
import {
  applyChargeRefunded,
  applyCheckoutSession,
  applyDisputeClosed,
  applyDisputeCreated,
} from "../../_utils/marketplace-payments.js";

export const config = { runtime: "nodejs" };

export async function POST(req: Request): Promise<Response> {
  const stripe = getStripe();
  if (!stripe) return jsonError("Payments are not configured", 503);
  // Two Stripe webhook scopes hit this same URL, each with its own signing
  // secret: the ACCOUNT endpoint (checkout.session.completed — destination
  // charges settle on the platform) and the CONNECT endpoint
  // (account.updated — events on the consultants' connected accounts). We can't
  // know which one signed a given delivery, so try each configured secret.
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    process.env.STRIPE_WEBHOOK_SECRET_CONNECT?.trim(),
  ].filter((s): s is string => Boolean(s));
  if (secrets.length === 0) return jsonError("Webhook secret not configured", 503);

  const sig = req.headers.get("stripe-signature") ?? "";
  // Raw body is required for signature verification — read it as text, never
  // JSON-parse before constructEvent.
  const raw = await req.text();

  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
      break;
    } catch {
      // Signature didn't match this secret — try the next configured scope.
    }
  }
  if (!event) {
    console.warn("[stripe-webhook] signature verification failed for all configured secrets");
    return jsonError("Invalid signature", 400);
  }

  // Booking charges are destination charges, which live on the platform
  // account. A payment or dispute event from a connected account (the Connect
  // scope) is about that account's own business, never one of our bookings.
  if (event.account && event.type !== "account.updated") {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  try {
    const db = getDb();
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        // Re-fetch current account state rather than trusting the event
        // payload. Stripe does not guarantee event ordering and retries stale
        // deliveries, so an older account.updated (payouts_enabled=false)
        // redelivered after a newer one would otherwise flip a live consultant
        // back to un-payable — and account.updated may not fire again for
        // months, so the stale false would stick. accounts.retrieve always
        // reflects current truth. Fall back to the payload if the fetch fails.
        let payoutsEnabled = Boolean(account.payouts_enabled);
        let detailsSubmitted = Boolean(account.details_submitted);
        try {
          const fresh = await stripe.accounts.retrieve(account.id);
          payoutsEnabled = Boolean(fresh.payouts_enabled);
          detailsSubmitted = Boolean(fresh.details_submitted);
        } catch (err) {
          console.warn("[stripe-webhook] account retrieve failed, using event payload", err);
        }
        await db
          .update(stripeConnectAccounts)
          .set({ payoutsEnabled, detailsSubmitted, updatedAt: new Date() })
          .where(eq(stripeConnectAccounts.accountId, account.id));
        break;
      }
      case "checkout.session.completed":
        await applyCheckoutSession(db, event.data.object as Stripe.Checkout.Session, "completed");
        break;
      case "checkout.session.async_payment_succeeded":
        await applyCheckoutSession(db, event.data.object as Stripe.Checkout.Session, "async_succeeded");
        break;
      case "checkout.session.async_payment_failed":
        await applyCheckoutSession(db, event.data.object as Stripe.Checkout.Session, "async_failed");
        break;
      case "charge.refunded":
        await applyChargeRefunded(db, stripe, event.data.object as Stripe.Charge);
        break;
      case "charge.dispute.created":
        await applyDisputeCreated(db, event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.closed":
        await applyDisputeClosed(db, stripe, event.data.object as Stripe.Dispute);
        break;
      default:
        // Unhandled event types are acknowledged so Stripe doesn't retry.
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries. Every branch above is an idempotent
    // write keyed by account or booking id, and transfer reversals carry an
    // idempotency key, so a retry is safe. Swallowing
    // the error left a paid booking marked "unpaid", which invited the HR
    // user to pay a second time.
    console.error("[stripe-webhook] handler error", event.type, err);
    return jsonError("Webhook handler failed", 500);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
