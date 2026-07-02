/**
 * /api/marketplace/stripe-checkout — HR pays for a booking (Stripe Checkout,
 * destination charge to the consultant's connected account + optional platform
 * fee). POST { bookingId } → { url } to redirect the browser to.
 *
 * Guards: same-origin + rate-limit + session; only the booking's REQUESTER (the
 * HR user who placed it) can pay for it (IDOR). Off when Stripe unconfigured.
 */
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import {
  bookingPayments,
  consultantBookings,
  consultantProfiles,
  stripeConnectAccounts,
} from "../../../src/db/schema.js";
import { getStripe, appBaseUrl, platformFeeBps } from "../../_utils/stripe.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";

export const config = { runtime: "nodejs" };

const ISO_CURRENCY: Record<string, string> = { GBP: "gbp", USD: "usd", EUR: "eur" };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "stripe-checkout", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return jsonError("Payments are not configured", 503);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonRequest<{ bookingId?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const rawBookingId = typeof parsed.body.bookingId === "string" ? parsed.body.bookingId.trim() : "";
  if (!rawBookingId) return jsonError("bookingId required", 400);
  // Validate the uuid before it hits the uuid column — a non-uuid id (reachable
  // when paying against an optimistic local booking not yet swapped for the
  // server UUID) otherwise raises Postgres 22P02 → opaque 500. Treat as
  // not-found. (Matches respond.ts / message.ts / bug-#19.)
  const bookingId = serverUuidOrNull(rawBookingId);
  if (!bookingId) return jsonError("Booking not found", 404);

  try {
    const db = getDb();
    const [booking] = await db
      .select({
        id: consultantBookings.id,
        requesterUserId: consultantBookings.requesterUserId,
        consultantProfileId: consultantBookings.consultantProfileId,
        matterTitle: consultantBookings.matterTitle,
      })
      .from(consultantBookings)
      .where(eq(consultantBookings.id, bookingId))
      .limit(1);
    if (!booking) return jsonError("Booking not found", 404);
    // IDOR: only the HR user who placed the booking can pay for it.
    if (booking.requesterUserId !== auth.userRow.id) {
      return jsonError("Not your booking", 403);
    }
    if (!booking.consultantProfileId) {
      return jsonError("Booking has no specialist attached", 412);
    }

    // Idempotency / double-charge guard: never start a second checkout for a
    // booking that's already paid. Without this, a retried redirect or a
    // double-click creates a second Stripe session and charges the card twice
    // (the onConflictDoUpdate below would point the row at the new session
    // while leaving status "paid", silently losing the first payment intent).
    const [existingPayment] = await db
      .select({
        status: bookingPayments.status,
        checkoutSessionId: bookingPayments.checkoutSessionId,
      })
      .from(bookingPayments)
      .where(eq(bookingPayments.bookingId, booking.id))
      .limit(1);
    if (existingPayment?.status === "paid") {
      return jsonError("This booking is already paid", 409);
    }
    // Expire any prior unpaid Checkout session before minting a new one. Stripe
    // sessions stay completable for ~24h, so without this a click-Pay → Back →
    // click-Pay-again (or a resumed stale tab) leaves TWO live sessions for the
    // same booking — the card can be charged twice, and the second
    // checkout.session.completed would overwrite the first payment_intent_id,
    // hiding the duplicate from reconciliation. Best-effort: expiring a session
    // that's already completed/expired throws, which we ignore.
    if (existingPayment?.checkoutSessionId) {
      try {
        await stripe.checkout.sessions.expire(existingPayment.checkoutSessionId);
      } catch (err) {
        console.warn("[stripe-checkout] could not expire prior session", err);
      }
    }

    const [acct] = await db
      .select()
      .from(stripeConnectAccounts)
      .where(eq(stripeConnectAccounts.profileId, booking.consultantProfileId))
      .limit(1);
    if (!acct?.payoutsEnabled) {
      return jsonError("This specialist isn't set up to take payment yet", 412);
    }

    const [profile] = await db
      .select({ price: consultantProfiles.price, currency: consultantProfiles.currency, fullName: consultantProfiles.fullName })
      .from(consultantProfiles)
      .where(eq(consultantProfiles.id, booking.consultantProfileId))
      .limit(1);
    if (!profile) return jsonError("Specialist not found", 404);

    const amount = Math.round((profile.price ?? 0) * 100); // major → minor units
    if (amount <= 0) return jsonError("This specialist hasn't set a rate", 412);
    const currency = ISO_CURRENCY[profile.currency ?? "GBP"] ?? "gbp";
    const appFee = Math.round((amount * platformFeeBps()) / 10_000);
    const base = appBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: booking.id,
      metadata: { bookingId: booking.id },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount,
            product_data: {
              name: `Specialist letter review${profile.fullName ? ` — ${profile.fullName}` : ""}`,
              description: booking.matterTitle ?? undefined,
            },
          },
        },
      ],
      payment_intent_data: {
        transfer_data: { destination: acct.accountId },
        ...(appFee > 0 ? { application_fee_amount: appFee } : {}),
      },
      success_url: `${base}/bookings?paid=${booking.id}`,
      cancel_url: `${base}/bookings`,
    });

    // Record the pending payment (decoupled table).
    await db
      .insert(bookingPayments)
      .values({
        bookingId: booking.id,
        checkoutSessionId: session.id,
        status: "unpaid",
        amount,
        currency,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: bookingPayments.bookingId,
        set: { checkoutSessionId: session.id, amount, currency, updatedAt: new Date() },
      });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[stripe-checkout] failed", err);
    return jsonError("Could not start checkout", 502);
  }
}
