import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "../../src/db/index.js";
import { bookingPayments, consultantProfiles, stripeConnectAccounts, webhookEventsSeen } from "../../src/db/schema.js";
import { serverUuidOrNull } from "../../src/lib/remote-ids.js";
import { canWriteMarketplaceBookings, withMarketplaceWriteScope } from "./marketplace-session.js";
import { appBaseUrl, platformFeeBps } from "./stripe.js";
import { jsonError } from "./request.js";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Auth = Parameters<typeof withMarketplaceWriteScope>[0];
type Payment = typeof bookingPayments.$inferSelect;
type Booking = { id: string; consultantProfileId: string; matterTitle: string | null };

async function lockPayment(tx: Transaction, bookingId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`booking-payment:${bookingId}`}, 0))`);
}

/** Reserve a stable request in a short transaction. No provider call holds a
 * database lock; competing workers receive the same stored idempotency key. */
async function reserveCheckout(req: Request, auth: Auth, booking: Booking, expiredSessionId?: string): Promise<Payment | Response> {
  let reserved: Payment | undefined;
  const response = await withMarketplaceWriteScope(auth, async (tx, currentAuth) => {
    if (!canWriteMarketplaceBookings(currentAuth)) return jsonError("Your workspace role cannot start booking payments", 403);
    await lockPayment(tx, booking.id);
    const [existing] = await tx.select().from(bookingPayments).where(eq(bookingPayments.bookingId, booking.id)).limit(1);
    if (existing && !["unpaid", "failed"].includes(existing.status)) return jsonError("This booking already has a completed payment", 409);
    // Only replace a known expired session. A concurrent caller may already
    // have reserved its replacement; in that case it owns the next attempt.
    if (existing && existing.status !== "failed" && (existing.checkoutSessionId || existing.checkoutAttemptId) &&
        (!expiredSessionId || existing.checkoutSessionId !== expiredSessionId)) {
      reserved = existing;
      return new Response(null, { status: 204 });
    }
    const [account] = await tx.select().from(stripeConnectAccounts).where(eq(stripeConnectAccounts.profileId, booking.consultantProfileId)).limit(1);
    if (!account?.payoutsEnabled) return jsonError("This specialist isn't set up to take payment yet", 412);
    const [profile] = await tx.select().from(consultantProfiles).where(eq(consultantProfiles.id, booking.consultantProfileId)).limit(1);
    if (!profile) return jsonError("Specialist not found", 404);
    const amount = Math.round((profile.price ?? 0) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) return jsonError("This specialist hasn't set a valid rate", 412);
    const currency = ({ GBP: "gbp", USD: "usd", EUR: "eur" } as Record<string, string>)[profile.currency];
    if (!currency) return jsonError("This specialist's currency is unsupported", 412);
    const attemptId = randomUUID(), now = new Date(), base = appBaseUrl(req);
    const fee = Math.round(amount * platformFeeBps() / 10_000);
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment", client_reference_id: booking.id,
      metadata: { bookingId: booking.id, checkoutAttemptId: attemptId },
      // An old request must never create a fresh, payable session after its
      // provider idempotency key has been pruned.
      expires_at: Math.floor(now.getTime() / 1000) + 24 * 60 * 60,
      line_items: [{ quantity: 1, price_data: { currency, unit_amount: amount,
        product_data: { name: `Specialist letter review${profile.fullName ? ` — ${profile.fullName}` : ""}`,
          ...(booking.matterTitle ? { description: booking.matterTitle } : {}) } } }],
      payment_intent_data: { transfer_data: { destination: account.accountId },
        ...(fee > 0 ? { application_fee_amount: fee } : {}) },
      success_url: `${base}/bookings?paid=${booking.id}`, cancel_url: `${base}/bookings`,
    };
    const values = { bookingId: booking.id, checkoutSessionId: null, checkoutAttemptId: attemptId,
      checkoutParams: params, checkoutRequestedAt: now, paymentIntentId: null, status: "unpaid", amount, currency, updatedAt: now };
    [reserved] = await tx.insert(bookingPayments).values(values)
      .onConflictDoUpdate({ target: bookingPayments.bookingId, set: values }).returning();
    return new Response(null, { status: 204 });
  });
  if (response.status !== 204) return response;
  if (!reserved) throw new Error("Checkout reservation missing");
  return reserved;
}

export async function startBookingCheckout(req: Request, auth: Auth, booking: Booking, stripe: Stripe): Promise<Response> {
  let expiredSessionId: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const payment = await reserveCheckout(req, auth, booking, expiredSessionId);
    if (payment instanceof Response) return payment;
    let session: Stripe.Checkout.Session;
    if (payment.checkoutSessionId) {
      session = await stripe.checkout.sessions.retrieve(payment.checkoutSessionId);
    } else {
      if (!payment.checkoutAttemptId || !payment.checkoutParams || !payment.checkoutRequestedAt) throw new Error("Incomplete checkout reservation");
      // Stripe retains idempotency keys for at least 24 hours. If a create's
      // outcome is still unknown after that window, require reconciliation
      // instead of risking a second charge. A paid webhook can settle it.
      if (Date.now() - payment.checkoutRequestedAt.getTime() >= 23 * 60 * 60 * 1000) {
        console.error(JSON.stringify({ event: "marketplace_checkout_reconciliation_required", bookingId: booking.id }));
        return Response.json({ error: "Your earlier payment attempt needs checking. Contact support before paying again.",
          code: "payment_reconciliation_required" }, { status: 409 });
      }
      session = await stripe.checkout.sessions.create(payment.checkoutParams as Stripe.Checkout.SessionCreateParams,
        { idempotencyKey: `booking-checkout:${payment.checkoutAttemptId}` });
      // A webhook may arrive before this write, or the write may fail after
      // Stripe succeeds. Retrying uses the same saved request in either case.
      const attached = await getDb().transaction(async tx => {
        await lockPayment(tx, booking.id);
        const [current] = await tx.select().from(bookingPayments).where(eq(bookingPayments.bookingId, booking.id)).limit(1);
        if (!current || current.checkoutAttemptId !== payment.checkoutAttemptId ||
            (current.checkoutSessionId && current.checkoutSessionId !== session.id)) throw new Error("Checkout attempt changed");
        if (current.status !== "unpaid") return false;
        await tx.update(bookingPayments).set({ checkoutSessionId: session.id, updatedAt: new Date() })
          .where(eq(bookingPayments.bookingId, booking.id));
        return true;
      });
      if (!attached) return jsonError("This booking already has a completed payment", 409);
    }
    if (session.payment_status === "paid") {
      await recordBookingPayment(session);
      return jsonError("This booking is already paid", 409);
    }
    // Delayed payment methods can complete Checkout before settling. Never
    // start another payment while the first one is still being processed.
    if (session.status === "complete") {
      const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (intentId) {
        const intent = await stripe.paymentIntents.retrieve(intentId);
        if (["canceled", "requires_payment_method"].includes(intent.status)) {
          // Also recover old failures whose webhook was missed before this
          // handler supported delayed payments. Only terminal provider state
          // authorizes replacement; pending/processing intents stay blocked.
          await recordBookingPayment(session, { id: `reconciled-failure:${session.id}`, failed: true });
          continue;
        }
      }
      return jsonError("Your payment is being processed. Check this booking again shortly.", 409);
    }
    if (session.status === "expired") { expiredSessionId = session.id; continue; }
    if (session.status !== "open" || !session.url) throw new Error("Checkout is not available");
    return Response.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  }
  return jsonError("Checkout changed while loading. Please retry shortly.", 503);
}

/** Monotonic, idempotent reconciliation. A verified event can attach the
 * matching reserved attempt even when the create response was lost. */
export async function recordBookingPayment(session: Stripe.Checkout.Session, event?: { id: string; failed?: boolean }): Promise<void> {
  // Other platform Checkout flows use client_reference_id too. Only our
  // booking metadata identifies an event for this payment ledger.
  const rawId = session.metadata?.bookingId;
  if (!rawId || (session.payment_status !== "paid" && !event?.failed)) return;
  const bookingId = serverUuidOrNull(rawId);
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!bookingId || !paymentIntentId || session.mode !== "payment") throw new Error("Invalid booking payment event");
  await getDb().transaction(async tx => {
    await lockPayment(tx, bookingId);
    if (event) {
      // Claim and mutation commit together. Prefix avoids collisions with
      // the separate subscription webhook receiving the same Stripe event.
      const claimed = await tx.insert(webhookEventsSeen).values({ eventId: `marketplace:${event.id}` })
        .onConflictDoNothing().returning({ eventId: webhookEventsSeen.eventId });
      if (!claimed.length) return;
    }
    const failureReceipt = `marketplace:failed-session:${session.id}`;
    if (event?.failed && session.payment_status !== "paid") {
      // Polling and the first webhook have different event IDs. Both can
      // confirm the same terminal failure before/after its replacement.
      const [failed] = await tx.select({ eventId: webhookEventsSeen.eventId }).from(webhookEventsSeen)
        .where(eq(webhookEventsSeen.eventId, failureReceipt)).limit(1);
      if (failed) return;
    }
    const [payment] = await tx.select().from(bookingPayments).where(eq(bookingPayments.bookingId, bookingId)).limit(1);
    if (!payment) throw new Error("Booking payment reservation missing");
    const sameSession = payment.checkoutSessionId === session.id;
    const matchingReservation = !payment.checkoutSessionId && payment.checkoutAttemptId &&
      payment.checkoutAttemptId === session.metadata?.checkoutAttemptId;
    if ((!sameSession && !matchingReservation) || session.amount_total !== payment.amount ||
        session.currency !== payment.currency || (payment.paymentIntentId && payment.paymentIntentId !== paymentIntentId)) {
      throw new Error("Booking payment event does not match its reservation");
    }
    if (payment.status === "paid" || payment.status === "refunded") return;
    const status = session.payment_status === "paid" ? "paid" : "failed";
    await tx.update(bookingPayments).set({ checkoutSessionId: session.id, status, paymentIntentId, updatedAt: new Date() })
      .where(eq(bookingPayments.bookingId, bookingId));
    if (status === "failed") await tx.insert(webhookEventsSeen).values({ eventId: failureReceipt }).onConflictDoNothing();
  });
}
