import { describe, expect, it } from "vitest";
import type { Booking } from "@/lib/bookings";
import {
  agreedPrice,
  awaitingPayment,
  canRate,
  checkoutErrorMessage,
  checkoutNote,
  disputeNote,
  isPriority,
  lateRefundNote,
  payLine,
  priorityDifference,
  paymentsOffNote,
  processingNote,
} from "./payments";

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

  it("calls the reviewer an expert, never a specialist (MARKET-X18)", () => {
    const notes = [
      processingNote(bk({ status: "accepted", paymentStatus: "processing" })),
      paymentsOffNote(bk({ status: "accepted", paymentStatus: "unpaid" })),
      paymentsOffNote(bk({ status: "delivered", paymentStatus: "unpaid" })),
    ];
    for (const n of notes) expect(n).not.toMatch(/specialist/i);
    expect(notes[0]).toMatch(/the expert starts once it does\.$/);
    expect(notes[1]).toMatch(/so the expert can't start on this booking\.$/);
  });

  describe("priority", () => {
    const pr = (over: Partial<Booking> = {}) =>
      bk({ turnaround: "priority", priceAmount: 25000, standardPriceAmount: 15000, priceCurrency: "gbp", ...over });

    it("knows a priority booking and the difference a late one refunds", () => {
      expect(isPriority(pr())).toBe(true);
      expect(isPriority(bk({}))).toBe(false);
      expect(priorityDifference(pr())).toBe("£100.00");
      expect(priorityDifference(bk({ priceAmount: 15000, priceCurrency: "gbp" }))).toBeNull();
    });

    it("says the 24 hours start at payment when checking out", () => {
      expect(checkoutNote(pr())).toBe(
        "£250.00 for a priority review, as agreed when you booked. The 24 hours start when you pay. Secure checkout via Stripe.",
      );
    });

    it("says what happened to the difference when it came back late", () => {
      expect(lateRefundNote(pr(), "requester")).toBeNull();
      const refunded = pr({ lateRefundStatus: "refunded", lateRefundAmount: 10000 });
      expect(lateRefundNote(refunded, "requester")).toBe("Back after the 24 hours, so £100.00 was refunded to you.");
      expect(lateRefundNote(refunded, "consultant")).toBe(
        "Delivered after the 24 hours, so £100.00 was refunded to the client from your payout.",
      );
      expect(lateRefundNote(pr({ lateRefundStatus: "owed", lateRefundAmount: 10000 }), "requester")).toBe(
        "Back after the 24 hours, so you're owed £100.00. It will be refunded to you.",
      );
    });
  });

  describe("payLine", () => {
    const DAY = 86_400_000;
    const now = Date.UTC(2026, 9, 14, 12);

    it("says when a delivered booking's review came back, not when it was accepted", () => {
      const line = payLine(
        bk({ status: "delivered", paymentStatus: "unpaid", acceptedAt: now - 8 * DAY, deliveredAt: now - 6 * DAY }),
        "Daniel",
        now,
      );
      expect(line).toBe("Review delivered 8 Oct. Pay to close the booking and rate it.");
      expect(line).not.toMatch(/accepted/);
    });

    it("says when an accepted booking was accepted", () => {
      expect(payLine(bk({ status: "accepted", paymentStatus: "unpaid", acceptedAt: now - 2 * DAY }), "Sarah", now)).toBe(
        "Sarah accepted 2 days ago. The review starts once you pay.",
      );
    });

    it("adds that the last payment failed", () => {
      expect(payLine(bk({ status: "accepted", paymentStatus: "failed" }), "James", now)).toBe(
        "James accepted. The review starts once you pay. Your last payment didn't go through.",
      );
    });
  });

  describe("checkoutErrorMessage", () => {
    it("gives the person plain copy for every status, never the server's text", () => {
      for (const status of [0, 400, 401, 403, 404, 409, 412, 413, 415, 429, 500, 502, 503]) {
        const msg = checkoutErrorMessage(status);
        expect(msg).toMatch(/\.$/);
        expect(msg).not.toMatch(/[\u2014!]|specialist|required|configured/i);
      }
      expect(checkoutErrorMessage(401)).toBe("You've been signed out. Sign in again, then pay for the review.");
      expect(checkoutErrorMessage(503)).toBe("Online payment isn't available yet. Try again later.");
    });
  });
});
