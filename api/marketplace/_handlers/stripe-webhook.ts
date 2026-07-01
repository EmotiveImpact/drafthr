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
import { bookingPayments, stripeConnectAccounts } from "../../../src/db/schema.js";
import { getStripe } from "../../_utils/stripe.js";

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
        await db
          .update(stripeConnectAccounts)
          .set({
            payoutsEnabled: Boolean(account.payouts_enabled),
            detailsSubmitted: Boolean(account.details_submitted),
            updatedAt: new Date(),
          })
          .where(eq(stripeConnectAccounts.accountId, account.id));
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.bookingId ?? session.client_reference_id ?? "";
        if (bookingId && session.payment_status === "paid") {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          await db
            .update(bookingPayments)
            .set({ status: "paid", paymentIntentId, updatedAt: new Date() })
            .where(eq(bookingPayments.bookingId, bookingId));
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe doesn't retry.
        break;
    }
  } catch (err) {
    // Log but still 200 — a DB hiccup shouldn't make Stripe retry-storm; the
    // next account.updated / a manual reconcile will catch up.
    console.error("[stripe-webhook] handler error", event.type, err);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
