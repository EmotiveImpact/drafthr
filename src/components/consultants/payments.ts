/**
 * Payment facts for a booking, shared by the Experts tab badge, My bookings
 * and the thread panel. The rules are the existing ones: checkout only starts
 * from an accepted (or delivered and unpaid) booking, and only "paid" lets
 * the work start or the booking complete.
 */
import type { Booking } from "@/lib/bookings";
import { agoWords, shortDate } from "./market";

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

/**
 * The "you need to pay" line on a payable booking. A delivered booking says
 * when the review came back (the event that matters now); an accepted one
 * says when the expert accepted. `first` is the expert's first name.
 */
export function payLine(b: Booking, first: string, now = Date.now()): string {
  const failed = b.paymentStatus === "failed" ? " Your last payment didn't go through." : "";
  if (b.status === "delivered") {
    const when = b.deliveredAt ? `Review delivered ${shortDate(b.deliveredAt, now)}.` : "Review delivered.";
    return `${when} Pay to close the booking and rate it.${failed}`;
  }
  const when = b.acceptedAt ? `${first} accepted ${agoWords(b.acceptedAt, now)}.` : `${first} accepted.`;
  return `${when} The review starts once you pay.${failed}`;
}

/**
 * What to tell the person when checkout couldn't start, chosen by the HTTP
 * status. The server's own error text is written for developers (and can say
 * "specialist" or carry an em dash), so it is never shown as is.
 */
export function checkoutErrorMessage(status: number): string {
  switch (status) {
    case 0:
      return "We couldn't reach the payment service. Check your connection and try again.";
    case 401:
      return "You've been signed out. Sign in again, then pay for the review.";
    case 403:
      return "You can't pay for this booking. Only the person who booked it can.";
    case 404:
      return "We couldn't find this booking. Refresh the page and try again.";
    case 409:
      return "This booking can't be paid right now. It may already be paid or have a payment under way. Refresh to see where it is.";
    case 412:
      return "This expert can't take payment for this booking yet. Send them a message or try again later.";
    case 429:
      return "Too many attempts. Wait a minute, then try again.";
    case 503:
      return "Online payment isn't available yet. Try again later.";
    default:
      return "We couldn't start the payment. Try again in a moment.";
  }
}

/** Rating closes the booking, which needs a paid booking. */
export function canRate(b: Booking): boolean {
  return b.status === "delivered" && (!b.paymentStatus || b.paymentStatus === "paid");
}
