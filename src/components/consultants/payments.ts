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
  if (!b.priceAmount || !b.priceCurrency) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: b.priceCurrency.toUpperCase(),
    }).format(b.priceAmount / 100);
  } catch {
    return null;
  }
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
  return p ? `${p}, as agreed when you booked. Secure checkout via Stripe.` : "Secure checkout via Stripe.";
}

/** Rating closes the booking, which needs a paid booking. */
export function canRate(b: Booking): boolean {
  return b.status === "delivered" && (!b.paymentStatus || b.paymentStatus === "paid");
}
