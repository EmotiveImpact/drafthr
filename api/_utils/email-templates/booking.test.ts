import { describe, expect, it } from "vitest";
import { bookingEmail, bookingDueWords, type BookingEmailStage } from "./booking.js";

const facts = {
  consultantName: "Claire Booth",
  consultantProfileName: "Claire Booth",
  requesterName: "Alex Morgan",
  matterTitle: "Warning letter · Jordan Hale",
  message: "What I need: Legal check.\n\nIs 12 months right?",
  responseNote: "I'm at capacity this month.",
  deliveryNote: "Ready to send as it is\n\nAll good.",
  expectedDeliveryAt: new Date("2026-10-15T11:00:00Z"),
  appUrl: "https://app.drafthr.io",
};
const STAGES: BookingEmailStage[] = ["request", "accepted", "declined", "delivered"];

describe("booking emails", () => {
  it("follow the copy rules: no em dashes, no exclamation marks", () => {
    for (const s of STAGES) {
      const { subject, html } = bookingEmail(s, facts);
      expect(subject + html).not.toMatch(/—|!/);
    }
  });

  it("go to the right place for each step", () => {
    expect(bookingEmail("request", facts).html).toContain('href="https://app.drafthr.io/c"');
    expect(bookingEmail("accepted", facts).html).toContain('href="https://app.drafthr.io/bookings"');
    expect(bookingEmail("declined", facts).html).toContain('href="https://app.drafthr.io/consultants"');
    // Rating happens in My bookings, so the delivered email links there.
    expect(bookingEmail("delivered", facts).html).toContain('href="https://app.drafthr.io/bookings"');
  });

  it("name the people and the letter", () => {
    const req = bookingEmail("request", facts);
    expect(req.subject).toBe("New review request: Warning letter · Jordan Hale");
    expect(req.html).toContain("<strong>Alex Morgan</strong> has booked a review with you");
    expect(bookingEmail("accepted", facts).subject).toBe("Claire Booth accepted your review request");
    expect(bookingEmail("declined", facts).html).toContain("Nothing was charged.");
  });

  it("keep typed line breaks and escape typed HTML", () => {
    expect(bookingEmail("delivered", facts).html).toContain("Ready to send as it is<br /><br />All good.");
    const evil = bookingEmail("request", { ...facts, message: "<script>x</script>" }).html;
    expect(evil).not.toContain("<script>");
    expect(evil).toContain("&lt;script&gt;");
  });

  it("give the due time in UK time, British style", () => {
    expect(bookingDueWords(new Date("2026-10-15T11:00:00Z"))).toBe("Thursday 15 October, 12:00");
    expect(bookingEmail("accepted", facts).html).toContain("Expected back by Thursday 15 October, 12:00.");
  });

  it("say when a review is priority, and what a late one gets back", () => {
    const p = { ...facts, priority: true };
    const req = bookingEmail("request", p);
    expect(req.subject).toBe("New priority review request: Warning letter · Jordan Hale");
    expect(req.html).toContain("due back within 24 hours of their payment");
    expect(bookingEmail("accepted", p).html).toContain("due back within 24 hours of your payment");
    expect(bookingEmail("accepted", p).html).not.toContain("Expected back by");
    expect(bookingEmail("delivered", { ...p, lateRefund: { amount: "£100.00", made: true } }).html).toContain(
      "£100.00, the difference between the priority and standard prices, has been refunded to you.",
    );
    expect(bookingEmail("delivered", { ...p, lateRefund: { amount: "£100.00", made: false } }).html).toContain(
      "you're owed £100.00",
    );
    expect(bookingEmail("delivered", p).html).not.toContain("24 hours");
    for (const s of STAGES) expect(Object.values(bookingEmail(s, { ...p, lateRefund: { amount: "£1", made: true } })).join("")).not.toMatch(/—|!/);
  });
});
