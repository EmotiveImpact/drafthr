/**
 * /api/marketplace/stripe-webhook — Stripe → us. Verifies the signature against
 * STRIPE_WEBHOOK_SECRET (NOT same-origin — Stripe is a server-to-server caller),
 * then reconciles payout + payment state into the decoupled tables.
 *
 * Handled events:
 *   account.updated            → payoutsEnabled / detailsSubmitted on the
 *                                consultant's Connect account
 *   checkout.session.completed → mark the booking's payment paid
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
import { recordBookingPayment } from "../../_utils/marketplace-payments.js";

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
        // reflects current truth. Failed reads must retry instead of applying
        // an old event payload and acknowledging it as current state.
        const fresh = await stripe.accounts.retrieve(account.id);
        const payoutsEnabled = Boolean(fresh.payouts_enabled);
        const detailsSubmitted = Boolean(fresh.details_submitted);
        await db
          .update(stripeConnectAccounts)
          .set({ payoutsEnabled, detailsSubmitted, updatedAt: new Date() })
          .where(eq(stripeConnectAccounts.accountId, account.id));
        break;
      }
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await recordBookingPayment(session, { id: event.id, failed: event.type === "checkout.session.async_payment_failed" });
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe doesn't retry.
        break;
    }
  } catch {
    // No success acknowledgement until the database commit succeeds. The
    // operations above are safe to repeat when Stripe redelivers the event.
    console.error(JSON.stringify({ event: "marketplace_webhook_failed", type: event.type }));
    return jsonError("Payment update could not be saved. Retry this event.", 503);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
