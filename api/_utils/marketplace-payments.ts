/**
 * Marketplace payment rules, shared by the booking handlers, checkout and the
 * marketplace Stripe webhook.
 *
 *   - A booking's price is snapshotted onto the booking when it is placed;
 *     checkout charges from that snapshot, never the consultant's live rate.
 *   - Only a booking whose booking_payments row is "paid" can be delivered,
 *     completed or rated, and only a paid booking gets a draft share link.
 *   - Refunds and disputes withdraw draft access; a full refund also reverses
 *     the consultant's Connect transfer.
 *   - A Checkout session only counts when its metadata names a real booking
 *     and its amount and currency equal that booking's snapshot.
 *   - Paying a priority booking starts its 24 hours (priority-reviews.ts).
 */
import type Stripe from "stripe";
import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import type { getDb } from "../../src/db/index.js";
import {
  bookingPayments,
  consultantBookings,
  consultantProfiles,
} from "../../src/db/schema.js";
import { serverUuidOrNull } from "../../src/lib/remote-ids.js";
import { startPriorityClock } from "./priority-reviews.js";

type Db = ReturnType<typeof getDb>;

export type BookingPaymentStatus =
  | "unpaid"
  | "processing"
  | "paid"
  | "failed"
  | "refunded"
  | "disputed"
  | "dispute_lost";

const ISO_CURRENCY: Record<string, string> = { GBP: "gbp", USD: "usd", EUR: "eur" };

/** Seed rating (x10) a profile shows before it has any qualifying reviews. */
const DEFAULT_RATING_X10 = 50;

const SHARE_TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;

/** Booking states in which the consultant works on (or has worked on) the draft. */
const ACCESS_STATUSES = ["accepted", "delivered", "completed"] as const;

/**
 * The price snapshot stored on a booking: the consultant's rate in minor units
 * plus the lowercase ISO currency Stripe expects. Null when no rate is set.
 */
export function priceSnapshot(profile: {
  price: number | null;
  currency: string | null;
}): { priceAmount: number; priceCurrency: string } | null {
  const amount = Math.round((profile.price ?? 0) * 100);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { priceAmount: amount, priceCurrency: ISO_CURRENCY[profile.currency ?? "GBP"] ?? "gbp" };
}

/** The booking's payment status ("unpaid" when no checkout was ever started). */
export async function paymentStatusOf(db: Db, bookingId: string): Promise<BookingPaymentStatus> {
  const [row] = await db
    .select({ status: bookingPayments.status })
    .from(bookingPayments)
    .where(eq(bookingPayments.bookingId, bookingId))
    .limit(1);
  return (row?.status as BookingPaymentStatus | undefined) ?? "unpaid";
}

/**
 * Generates a 32-char URL-safe share token. Uses crypto.randomUUID() with the
 * dashes stripped, giving 128 bits of entropy.
 */
export function generateShareToken(): string {
  return "sht_" + crypto.randomUUID().replace(/-/g, "");
}

/**
 * Mint the consultant's draft share link for a paid booking. No-op when the
 * booking has no draft, already has a link, or isn't in a working state. The
 * caller is responsible for having confirmed the payment.
 */
export async function grantDraftAccess(db: Db, bookingId: string, now = new Date()): Promise<void> {
  await db
    .update(consultantBookings)
    .set({
      shareToken: generateShareToken(),
      shareTokenExpiresAt: new Date(now.getTime() + SHARE_TOKEN_TTL_MS),
    })
    .where(
      and(
        eq(consultantBookings.id, bookingId),
        isNotNull(consultantBookings.draftId),
        isNull(consultantBookings.shareToken),
        inArray(consultantBookings.status, [...ACCESS_STATUSES]),
      ),
    );
}

/** Withdraw the consultant's draft share link (refund, dispute). */
export async function revokeDraftAccess(db: Db, bookingId: string): Promise<void> {
  await db
    .update(consultantBookings)
    .set({ shareToken: null, shareTokenExpiresAt: null })
    .where(eq(consultantBookings.id, bookingId));
}

/**
 * Recompute a consultant's aggregate rating from qualifying reviews only:
 * completed, rated, still-paid bookings that someone other than the consultant
 * placed. Refunded, disputed and self-placed bookings don't count.
 */
export async function recomputeConsultantRating(db: Db, profileId: string): Promise<void> {
  const rated = await db
    .select({ rating: consultantBookings.rating })
    .from(consultantBookings)
    .innerJoin(bookingPayments, eq(bookingPayments.bookingId, consultantBookings.id))
    .where(
      and(
        eq(consultantBookings.consultantProfileId, profileId),
        eq(consultantBookings.status, "completed"),
        isNotNull(consultantBookings.rating),
        eq(bookingPayments.status, "paid"),
        ne(consultantBookings.requesterUserId, consultantBookings.consultantUserId),
      ),
    );
  const values = rated.map((r) => r.rating).filter((r): r is number => typeof r === "number");
  const avg = values.length > 0 ? values.reduce((s, r) => s + r, 0) / values.length : null;
  await db
    .update(consultantProfiles)
    .set({
      rating: avg === null ? DEFAULT_RATING_X10 : Math.round(avg * 10),
      reviews: values.length,
    })
    .where(eq(consultantProfiles.id, profileId));
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

export type CheckoutEventKind = "completed" | "async_succeeded" | "async_failed";

/**
 * Apply a Checkout session event to the booking it was created for. Returns
 * the payment status written, or "ignored" when the session doesn't match a
 * booking (missing or mismatched booking id, amount or currency). Ignored
 * sessions are logged and never touch payment state.
 */
export async function applyCheckoutSession(
  db: Db,
  session: Stripe.Checkout.Session,
  kind: CheckoutEventKind,
): Promise<BookingPaymentStatus | "ignored"> {
  const bookingId = serverUuidOrNull(session.metadata?.bookingId ?? null);
  if (!bookingId) {
    console.warn("[marketplace-payments] session has no booking id, ignoring", session.id);
    return "ignored";
  }
  if (session.client_reference_id && session.client_reference_id !== bookingId) {
    console.warn("[marketplace-payments] session booking ids disagree, ignoring", session.id);
    return "ignored";
  }

  const [booking] = await db
    .select({
      id: consultantBookings.id,
      priceAmount: consultantBookings.priceAmount,
      priceCurrency: consultantBookings.priceCurrency,
    })
    .from(consultantBookings)
    .where(eq(consultantBookings.id, bookingId))
    .limit(1);
  if (!booking) {
    console.warn("[marketplace-payments] session names an unknown booking, ignoring", session.id);
    return "ignored";
  }

  if (kind === "async_failed") {
    // Only the session we recorded can fail the booking's payment; a stale
    // session failing must not clobber a newer one.
    await db
      .update(bookingPayments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(
        and(
          eq(bookingPayments.bookingId, booking.id),
          eq(bookingPayments.checkoutSessionId, session.id),
          inArray(bookingPayments.status, ["unpaid", "processing"]),
        ),
      );
    return "failed";
  }

  // A localised (Adaptive Pricing) session rendered for an older API version
  // reports the customer's currency at the top level and the amount we
  // created it with under currency_conversion; compare against that.
  const source = session.currency_conversion;
  const amountTotal = source ? source.amount_total : session.amount_total;
  const currency = ((source ? source.source_currency : session.currency) ?? "").toLowerCase();
  if (
    booking.priceAmount === null ||
    amountTotal !== booking.priceAmount ||
    currency !== booking.priceCurrency
  ) {
    console.warn("[marketplace-payments] session amount does not match the booking, ignoring", {
      session: session.id,
      booking: booking.id,
      amountTotal,
      currency,
      expectedAmount: booking.priceAmount,
      expectedCurrency: booking.priceCurrency,
    });
    return "ignored";
  }

  let status: BookingPaymentStatus;
  if (session.payment_status === "paid") status = "paid";
  else if (kind === "completed" && session.payment_status === "unpaid") status = "processing";
  else {
    console.warn("[marketplace-payments] unexpected session payment status, ignoring", session.id, session.payment_status);
    return "ignored";
  }

  const paymentIntentId = idOf(session.payment_intent);
  const now = new Date();
  // Never move a refunded or disputed payment back to paid/processing on a
  // late or retried event, and never downgrade paid to processing. A failed
  // payment isn't moved back to processing either: that is the same session's
  // completed event arriving after its async_payment_failed (a new checkout
  // resets the row to unpaid first).
  const overwritable = status === "paid" ? ["unpaid", "processing", "failed", "paid"] : ["unpaid", "processing"];
  const [written] = await db
    .insert(bookingPayments)
    .values({
      bookingId: booking.id,
      checkoutSessionId: session.id,
      paymentIntentId,
      status,
      amount: booking.priceAmount,
      currency: booking.priceCurrency,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: bookingPayments.bookingId,
      set: { checkoutSessionId: session.id, paymentIntentId, status, updatedAt: now },
      setWhere: inArray(bookingPayments.status, overwritable),
    })
    .returning({ status: bookingPayments.status });
  if (!written) {
    console.warn("[marketplace-payments] payment already refunded or disputed, ignoring session", session.id);
    return "ignored";
  }

  if (status === "paid") {
    await grantDraftAccess(db, booking.id, now);
    // A priority booking's 24 hours start now, when the expert can open it.
    await startPriorityClock(db, booking.id, now);
  }
  return status;
}

async function paymentForCharge(db: Db, paymentIntentId: string | null, chargeId: string | null) {
  const matchers = [];
  if (paymentIntentId) matchers.push(eq(bookingPayments.paymentIntentId, paymentIntentId));
  if (chargeId) matchers.push(eq(bookingPayments.chargeId, chargeId));
  if (matchers.length === 0) return null;
  const [row] = await db
    .select({
      bookingId: bookingPayments.bookingId,
      status: bookingPayments.status,
      transferId: bookingPayments.transferId,
      consultantProfileId: consultantBookings.consultantProfileId,
    })
    .from(bookingPayments)
    .innerJoin(consultantBookings, eq(consultantBookings.id, bookingPayments.bookingId))
    .where(or(...matchers))
    .limit(1);
  return row ?? null;
}

/**
 * paymentForCharge for a refund, falling back to the bookingId the checkout
 * put in the PaymentIntent's metadata when no row carries this payment intent
 * yet. Stripe doesn't order events and retries failed deliveries later, so a
 * refund can arrive before the checkout.session.completed that records the
 * intent; ignoring it would let that late event mark the booking paid and
 * open draft access with the money already returned. The row is stamped with
 * the intent (only while it isn't paid), so the refund lands on it and the
 * late completed event then finds a refunded payment and is ignored.
 */
async function paymentForRefund(db: Db, stripe: Stripe, paymentIntentId: string | null, chargeId: string) {
  const found = await paymentForCharge(db, paymentIntentId, chargeId);
  if (found || !paymentIntentId) return found;
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const bookingId = serverUuidOrNull(intent.metadata?.bookingId ?? null);
  if (!bookingId) return null;
  await db
    .update(bookingPayments)
    .set({ paymentIntentId })
    .where(
      and(
        eq(bookingPayments.bookingId, bookingId),
        inArray(bookingPayments.status, ["unpaid", "processing", "failed"]),
      ),
    );
  return paymentForCharge(db, paymentIntentId, chargeId);
}

/**
 * Pull back the consultant's share of a destination charge. Skips a transfer
 * that is already fully reversed (e.g. the refund was issued with
 * reverse_transfer), and uses an idempotency key so a webhook retry can't
 * reverse twice.
 */
async function reverseTransfer(stripe: Stripe, transferId: string, idempotencyKey: string): Promise<void> {
  const transfer = await stripe.transfers.retrieve(transferId);
  if (transfer.reversed || transfer.amount_reversed >= transfer.amount) return;
  await stripe.transfers.createReversal(
    transferId,
    { metadata: { reason: idempotencyKey } },
    { idempotencyKey },
  );
}

/**
 * charge.refunded: record the refund. A full refund marks the payment
 * refunded, withdraws draft access, reverses the consultant's transfer and
 * drops the booking's rating from the consultant's aggregate. A partial refund
 * is recorded but leaves the booking paid.
 */
export async function applyChargeRefunded(db: Db, stripe: Stripe, charge: Stripe.Charge): Promise<"refunded" | "partial" | "ignored"> {
  const payment = await paymentForRefund(db, stripe, idOf(charge.payment_intent), charge.id);
  if (!payment) {
    console.warn("[marketplace-payments] refund for an unknown charge, ignoring", charge.id);
    return "ignored";
  }
  const transferId = idOf(charge.transfer) ?? payment.transferId;
  const full = charge.refunded || charge.amount_refunded >= charge.amount;
  await db
    .update(bookingPayments)
    .set({
      chargeId: charge.id,
      transferId,
      amountRefunded: charge.amount_refunded,
      ...(full ? { status: "refunded" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(bookingPayments.bookingId, payment.bookingId));
  if (!full) return "partial";

  await revokeDraftAccess(db, payment.bookingId);
  if (transferId) await reverseTransfer(stripe, transferId, `booking-refund-${charge.id}`);
  await recomputeConsultantRating(db, payment.consultantProfileId);
  return "refunded";
}

/**
 * charge.dispute.created: mark a paid payment disputed and withdraw draft
 * access. A payment that is already refunded (cardholders do dispute refunded
 * charges) only records the dispute: marking it disputed would let a won
 * dispute restore it to paid and reopen a booking whose money went back.
 */
export async function applyDisputeCreated(db: Db, dispute: Stripe.Dispute): Promise<"disputed" | "ignored"> {
  const payment = await paymentForCharge(db, idOf(dispute.payment_intent), idOf(dispute.charge));
  if (!payment) {
    console.warn("[marketplace-payments] dispute for an unknown charge, ignoring", dispute.id);
    return "ignored";
  }
  if (payment.status !== "paid" && payment.status !== "disputed") {
    await db
      .update(bookingPayments)
      .set({ disputeId: dispute.id, chargeId: idOf(dispute.charge), updatedAt: new Date() })
      .where(eq(bookingPayments.bookingId, payment.bookingId));
    console.warn("[marketplace-payments] dispute on a payment that isn't paid, recorded only", dispute.id, payment.status);
    return "ignored";
  }
  await db
    .update(bookingPayments)
    .set({ status: "disputed", disputeId: dispute.id, chargeId: idOf(dispute.charge), updatedAt: new Date() })
    .where(
      and(
        eq(bookingPayments.bookingId, payment.bookingId),
        inArray(bookingPayments.status, ["paid", "disputed"]),
      ),
    );
  await revokeDraftAccess(db, payment.bookingId);
  await recomputeConsultantRating(db, payment.consultantProfileId);
  return "disputed";
}

/**
 * charge.dispute.closed: a lost dispute is final (the funds went back to the
 * cardholder), so the consultant's transfer is reversed as for a full refund.
 * Any other outcome (won, inquiry closed) restores the booking to paid and
 * re-opens draft access.
 */
export async function applyDisputeClosed(
  db: Db,
  stripe: Stripe,
  dispute: Stripe.Dispute,
): Promise<"paid" | "dispute_lost" | "ignored"> {
  const payment = await paymentForCharge(db, idOf(dispute.payment_intent), idOf(dispute.charge));
  if (!payment || payment.status !== "disputed") {
    console.warn("[marketplace-payments] close for a dispute we aren't tracking, ignoring", dispute.id);
    return "ignored";
  }
  const lost = dispute.status === "lost";
  await db
    .update(bookingPayments)
    .set({ status: lost ? "dispute_lost" : "paid", updatedAt: new Date() })
    .where(and(eq(bookingPayments.bookingId, payment.bookingId), eq(bookingPayments.status, "disputed")));
  if (lost) {
    // The dispute payload carries only the charge id; the transfer lives on
    // the charge (destination charge), so look it up when we haven't seen it.
    let transferId = payment.transferId;
    const chargeId = idOf(dispute.charge);
    if (!transferId && chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      transferId = idOf(charge.transfer);
    }
    if (transferId) await reverseTransfer(stripe, transferId, `booking-dispute-${dispute.id}`);
  } else {
    await grantDraftAccess(db, payment.bookingId);
  }
  await recomputeConsultantRating(db, payment.consultantProfileId);
  return lost ? "dispute_lost" : "paid";
}
