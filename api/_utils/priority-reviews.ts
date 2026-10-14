/**
 * Priority expert reviews: back within 24 hours of payment, for a higher price
 * the expert sets.
 *
 *   - Off until the operator sets FEATURE_PRIORITY_REVIEWS=1. The client's
 *     VITE_FEATURE_PRIORITY_REVIEWS=1 counts too, so one variable turns on
 *     both the screens and the server; FEATURE_PRIORITY_REVIEWS=0 keeps the
 *     server off whatever the client says.
 *   - Each expert opts in by setting a priority price above their standard
 *     one. Null means they don't offer it.
 *   - The 24 hours start when the booking is paid, because the expert can't
 *     open the letter before then.
 *   - Delivered late, the requester automatically gets the difference between
 *     the priority and standard prices back, taken from the expert's share.
 */
import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import type { getDb } from "../../src/db/index.js";
import { bookingPayments, consultantBookings } from "../../src/db/schema.js";
import { getStripe } from "./stripe.js";

type Db = ReturnType<typeof getDb>;
type BookingRow = typeof consultantBookings.$inferSelect;

export const PRIORITY_HOURS = 24;
const PRIORITY_MS = PRIORITY_HOURS * 3600_000;

/** The highest priority price, in whole units (the standard rate's cap). */
export const MAX_PRIORITY_PRICE = 5000;

export function priorityReviewsOn(): boolean {
  const raw = (
    process.env.FEATURE_PRIORITY_REVIEWS?.trim() ||
    process.env.VITE_FEATURE_PRIORITY_REVIEWS?.trim() ||
    ""
  ).toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/** True when the profile has a usable priority price (above the standard one). */
export function offersPriority(profile: { price: number | null; priorityPrice: number | null }): boolean {
  return (
    typeof profile.priorityPrice === "number" &&
    typeof profile.price === "number" &&
    profile.priorityPrice > profile.price
  );
}

/**
 * Validate a priority price from the profile form against the standard price
 * it will sit beside. null, 0 or "" turns priority off.
 */
export function validatePriorityPrice(
  input: unknown,
  price: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (input === null || input === "" || input === 0) return { ok: true, value: null };
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0) {
    return { ok: false, error: "priorityPrice must be a whole number" };
  }
  if (input <= price) {
    return { ok: false, error: "Your priority price must be more than your standard price." };
  }
  if (input > MAX_PRIORITY_PRICE) {
    return { ok: false, error: `Your priority price can be at most ${MAX_PRIORITY_PRICE}.` };
  }
  return { ok: true, value: input };
}

/** The priority facts a booking response carries. */
export function priorityFields(row: BookingRow) {
  return {
    turnaround: row.turnaround ?? "standard",
    standardPriceAmount: row.standardPriceAmount ?? null,
    priorityDueAt: row.priorityDueAt?.getTime() ?? null,
    lateRefundStatus: row.lateRefundStatus ?? null,
    lateRefundAmount: row.lateRefundAmount ?? null,
  };
}

/**
 * Start a priority booking's 24 hours once it is paid. Only the first payment
 * starts it: a won dispute or a retried webhook leaves the due time alone.
 * The due time also becomes the booking's expected delivery, so every screen
 * that shows "Due back by" shows it.
 */
export async function startPriorityClock(db: Db, bookingId: string, now = new Date()): Promise<void> {
  const due = new Date(now.getTime() + PRIORITY_MS);
  await db
    .update(consultantBookings)
    .set({ priorityDueAt: due, expectedDeliveryAt: due })
    .where(
      and(
        eq(consultantBookings.id, bookingId),
        eq(consultantBookings.turnaround, "priority"),
        isNull(consultantBookings.priorityDueAt),
        eq(consultantBookings.status, "accepted"),
      ),
    );
}

export type LateRefundResult = "not_late" | "already" | "refunded" | "owed" | "failed";

/**
 * A priority review delivered after its due time: refund the difference
 * between the priority and standard prices. One refund per booking, however
 * often this runs (a claim on late_refund_status, then a Stripe idempotency
 * key). The refund reverses the same share of the expert's transfer and, when
 * the platform took a fee, of that fee. When Stripe is off or the payment
 * can't be found, the refund is recorded as owed, to be made by hand.
 *
 * The charge.refunded webhook that follows records the partial refund and
 * leaves the booking paid.
 */
export async function refundLatePriority(
  db: Db,
  booking: BookingRow,
  now = new Date(),
  stripe: Stripe | null = getStripe(),
): Promise<LateRefundResult> {
  if (booking.turnaround !== "priority" || !booking.priorityDueAt) return "not_late";
  if (now.getTime() <= booking.priorityDueAt.getTime()) return "not_late";
  if (booking.priceAmount == null || booking.standardPriceAmount == null) return "not_late";
  const difference = booking.priceAmount - booking.standardPriceAmount;
  if (difference <= 0) return "not_late";

  const [claimed] = await db
    .update(consultantBookings)
    .set({ lateRefundStatus: "pending", lateRefundAmount: difference })
    .where(and(eq(consultantBookings.id, booking.id), isNull(consultantBookings.lateRefundStatus)))
    .returning({ id: consultantBookings.id });
  if (!claimed) return "already";

  const settle = async (status: "refunded" | "owed" | "failed") => {
    await db
      .update(consultantBookings)
      .set({ lateRefundStatus: status })
      .where(eq(consultantBookings.id, booking.id));
  };

  const [payment] = await db
    .select({ status: bookingPayments.status, paymentIntentId: bookingPayments.paymentIntentId })
    .from(bookingPayments)
    .where(eq(bookingPayments.bookingId, booking.id))
    .limit(1);
  if (!stripe || !payment?.paymentIntentId || payment.status !== "paid") {
    console.warn("[priority-reviews] late priority refund owed, to be made by hand", {
      booking: booking.id,
      amount: difference,
      stripe: Boolean(stripe),
      payment: payment?.status ?? null,
    });
    await settle("owed");
    return "owed";
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
    await stripe.refunds.create(
      {
        payment_intent: payment.paymentIntentId,
        amount: difference,
        reverse_transfer: true,
        ...((intent.application_fee_amount ?? 0) > 0 ? { refund_application_fee: true } : {}),
        metadata: { bookingId: booking.id, reason: "priority_late" },
      },
      { idempotencyKey: `booking-priority-late-${booking.id}` },
    );
    await settle("refunded");
    return "refunded";
  } catch (err) {
    console.error("[priority-reviews] late priority refund failed", booking.id, err);
    await settle("failed");
    return "failed";
  }
}
