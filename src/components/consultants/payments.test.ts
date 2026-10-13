import { describe, expect, it } from "vitest";
import type { Booking } from "@/lib/bookings";
import { agreedPrice, awaitingPayment, canRate, checkoutNote, disputeNote, processingNote } from "./payments";

const bk = (over: Partial<Booking>): Booking =>
  ({ id: "b1", consultantId: "c1", consultantInitials: "SW", status: "requested", bookedAt: 0, ...over }) as Booking;

describe("payments", () => {
  it("asks for payment only once a booking is accepted or delivered and unpaid", () => {
    expect(awaitingPayment(bk({ status: "requested" }))).toBe(false);
    expect(awaitingPayment(bk({ status: "accepted", paymentStatus: "unpaid" }))).toBe(true);
    expect(awaitingPayment(bk({ status: "accepted", paymentStatus: "failed" }))).toBe(true);
    expect(awaitingPayment(bk({ status: "delivered", paymentStatus: "unpaid" }))).toBe(true);
    expect(awaitingPayment(bk({ status: "accepted", paymentStatus: "paid" }))).toBe(false);
    expect(awaitingPayment(bk({ status: "accepted", paymentStatus: "processing" }))).toBe(false);
    expect(awaitingPayment(bk({ status: "completed", paymentStatus: "unpaid" }))).toBe(false);
  });

  it("formats the agreed price snapshot, and shows none without one", () => {
    expect(agreedPrice(bk({ priceAmount: 18000, priceCurrency: "gbp" }))).toBe("£180.00");
    expect(agreedPrice(bk({}))).toBeNull();
    expect(checkoutNote(bk({ priceAmount: 9500, priceCurrency: "gbp" }))).toBe(
      "£95.00, as agreed when you booked. Secure checkout via Stripe.",
    );
    expect(checkoutNote(bk({}))).toBe("Secure checkout via Stripe.");
  });

  it("only lets a paid delivered booking be rated", () => {
    expect(canRate(bk({ status: "delivered", paymentStatus: "paid" }))).toBe(true);
    expect(canRate(bk({ status: "delivered", paymentStatus: "unpaid" }))).toBe(false);
    expect(canRate(bk({ status: "delivered", paymentStatus: "refunded" }))).toBe(false);
    expect(canRate(bk({ status: "accepted", paymentStatus: "paid" }))).toBe(false);
  });

  it("keeps the processing, refund and dispute notes", () => {
    expect(processingNote(bk({ status: "accepted", paymentStatus: "processing" }))).toMatch(/^Payment processing\./);
    expect(disputeNote(bk({ status: "delivered", paymentStatus: "refunded" }))).toBe("This booking was refunded.");
    expect(disputeNote(bk({ status: "accepted", paymentStatus: "disputed" }))).toBe(
      "This payment is under dispute, so work on the booking is paused.",
    );
    expect(disputeNote(bk({ status: "accepted", paymentStatus: "dispute_lost" }))).toBe(
      "This payment was reversed after a dispute.",
    );
  });
});
