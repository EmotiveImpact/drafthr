/**
 * The marketplace booking emails (consultant-emails.ts sends them). Pure:
 * given the booking facts they return the subject and HTML, so the wording,
 * links and escaping can be tested and previewed without a database or a
 * mail provider.
 *
 *   request    to the consultant: an HR team booked a review
 *   accepted   to the person who booked: accepted, pay to start
 *   declined   to the person who booked: not taken, nothing charged
 *   delivered  to the person who booked: the review is ready, rate it
 *
 * Copy follows the app's rules: British English, sentence case, no em
 * dashes, no exclamation marks.
 */
import { escape } from "./_layout.js";

export type BookingEmailStage = "request" | "accepted" | "declined" | "delivered";

export type BookingEmailFacts = {
  consultantName: string;
  /** The consultant's public profile name (what the HR side sees). */
  consultantProfileName: string;
  requesterName: string;
  matterTitle?: string | null;
  message?: string | null;
  responseNote?: string | null;
  deliveryNote?: string | null;
  expectedDeliveryAt?: Date | null;
  /** The app's base URL, e.g. https://app.drafthr.io */
  appUrl: string;
};

/** "Thursday 15 October, 12:00" in UK time, whatever the server's locale. */
export function bookingDueWords(d: Date): string {
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
  return `${day.replace(/,/g, "")}, ${time}`;
}

function link(base: string, path: string, label: string): string {
  const href = `${base.replace(/\/$/, "")}${path}`;
  return `<p><a href="${escape(href)}">${escape(label)}</a></p>`;
}

function quote(text: string | null | undefined): string {
  // Typed text keeps its line breaks.
  return text ? `<blockquote>${escape(text).replace(/\r?\n/g, "<br />")}</blockquote>` : "";
}

export function bookingEmail(stage: BookingEmailStage, f: BookingEmailFacts): { subject: string; html: string } {
  switch (stage) {
    case "request":
      return {
        subject: `New review request: ${f.matterTitle || "DraftHR letter"}`,
        html: `
    <p>Hi ${escape(f.consultantName)},</p>
    <p><strong>${escape(f.requesterName)}</strong> has booked a review with you on DraftHR.</p>
    ${f.matterTitle ? `<p><strong>Letter:</strong> ${escape(f.matterTitle)}</p>` : ""}
    ${quote(f.message)}
    ${link(f.appUrl, "/c", "Open your inbox")}
    <p style="color:#74747a;font-size:12px">You're receiving this because your DraftHR consultant profile is published.</p>
  `,
      };
    case "accepted":
      return {
        subject: `${f.consultantProfileName} accepted your review request`,
        html: `
    <p>Hi ${escape(f.requesterName)},</p>
    <p><strong>${escape(f.consultantProfileName)}</strong> has accepted your booking. Pay for the review in DraftHR and they'll start work once the payment clears.</p>
    ${quote(f.responseNote)}
    <p>Expected back by ${f.expectedDeliveryAt ? escape(bookingDueWords(f.expectedDeliveryAt)) : "the date you agreed"}.</p>
    ${link(f.appUrl, "/bookings", "Pay for the review")}
  `,
      };
    case "declined":
      return {
        subject: `${f.consultantProfileName} couldn't take this one`,
        html: `
    <p>Hi ${escape(f.requesterName)},</p>
    <p><strong>${escape(f.consultantProfileName)}</strong> wasn't able to take your booking this time.</p>
    ${quote(f.responseNote)}
    <p>Nothing was charged. You can book another expert in the marketplace.</p>
    ${link(f.appUrl, "/consultants", "Find another expert")}
  `,
      };
    case "delivered":
      return {
        subject: `Your review from ${f.consultantProfileName} is ready`,
        html: `
    <p>Hi ${escape(f.requesterName)},</p>
    <p><strong>${escape(f.consultantProfileName)}</strong> has delivered your review.</p>
    ${f.deliveryNote ? `<p><strong>Summary:</strong></p>${quote(f.deliveryNote)}` : ""}
    ${link(f.appUrl, "/bookings", "Open My bookings")}
    <p>You can rate the review there.</p>
  `,
      };
  }
}
