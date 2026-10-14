/**
 * Payment facts for a booking, shared by the Experts tab badge, My bookings
 * and the thread panel. The rules are the existing ones: checkout only starts
 * from an accepted (or delivered and unpaid) booking, and only "paid" lets
 * the work start or the booking complete.
 */
import type { Booking } from "@/lib/bookings";

/** Accepted but not yet paid (or a previous attempt failed): the requester
 *  needs to pay before the specialist can start. A booking delivered before
 *  payment was required is payable too, and can't be completed until it is. */
export function awaitingPayment(b: Booking): boolean {
  if (b.status !== "accepted" && b.status !== "delivered") return false;
  return !b.paymentStatus || b.paymentStatus === "unpaid" || b.paymentStatus === "failed";
}

/** The agreed price snapshot, formatted "£180.00", or null when the booking
 *  predates it. This is the amount checkout charges. */
export function agreedPrice(b: Booking): string | null {
  return minorMoney(b.priceAmount, b.priceCurrency);
}

function minorMoney(amount: number | undefined, currency: string | undefined): string | null {
  if (!amount || !currency) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Priority (back within 24 hours of payment)                         */
/* ------------------------------------------------------------------ */

export function isPriority(b: Booking): boolean {
  return b.turnaround === "priority";
}

/** The difference a late priority review refunds ("£100.00"), or null. */
export function priorityDifference(b: Booking): string | null {
  if (!isPriority(b) || b.priceAmount == null || b.standardPriceAmount == null) return null;
  return minorMoney(b.priceAmount - b.standardPriceAmount, b.priceCurrency);
}

/**
 * A priority review that came back late: what happened to the difference,
 * in words for the person who booked or for the expert. Null when it wasn't
 * late (or isn't priority).
 */
export function lateRefundNote(b: Booking, reader: "requester" | "consultant"): string | null {
  if (!isPriority(b) || !b.lateRefundStatus) return null;
  const amount = minorMoney(b.lateRefundAmount, b.priceCurrency) ?? "The difference";
  if (reader === "consultant") {
    return b.lateRefundStatus === "refunded"
      ? `Delivered after the 24 hours, so ${amount} was refunded to the client from your payout.`
      : `Delivered after the 24 hours, so ${amount} is being refunded to the client from your payout.`;
  }
  return b.lateRefundStatus === "refunded"
    ? `Back after the 24 hours, so ${amount} was refunded to you.`
    : `Back after the 24 hours, so you're owed ${amount}. It will be refunded to you.`;
}

/** Bank payments clearing. */
export function processingNote(b: Booking): string | null {
  return b.status === "accepted" && b.paymentStatus === "processing"
    ? "Payment processing. Bank payments such as Direct Debit can take a few working days to clear; the specialist starts once it does."
    : null;
}

/** Refunds and disputes, after the fact. */
export function disputeNote(b: Booking): string | null {
  if (b.status !== "accepted" && b.status !== "delivered") return null;
  if (b.paymentStatus === "refunded") return "This booking was refunded.";
  if (b.paymentStatus === "disputed") return "This payment is under dispute, so work on the booking is paused.";
  if (b.paymentStatus === "dispute_lost") return "This payment was reversed after a dispute.";
  return null;
}

/** With Stripe not configured, a booking that needs paying can't move on. */
export function paymentsOffNote(b: Booking): string {
  return b.status === "delivered"
    ? "Awaiting payment. Online payment isn't available yet, so this booking can't be completed."
    : "Awaiting payment. Online payment isn't available yet, so the specialist can't start on this booking.";
}

/** "£180.00, as agreed when you booked. Secure checkout via Stripe." */
export function checkoutNote(b: Booking): string {
  const p = agreedPrice(b);
  if (p && isPriority(b)) {
    return `${p} for a priority review, as agreed when you booked. The 24 hours start when you pay. Secure checkout via Stripe.`;
  }
  return p ? `${p}, as agreed when you booked. Secure checkout via Stripe.` : "Secure checkout via Stripe.";
}

/** Rating closes the booking, which needs a paid booking. */
export function canRate(b: Booking): boolean {
  return b.status === "delivered" && (!b.paymentStatus || b.paymentStatus === "paid");
}
