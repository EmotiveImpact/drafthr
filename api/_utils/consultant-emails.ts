/**
 * Email side-effects for the consultant marketplace.
 *
 * Each helper fetches the booking row, resolves the two parties' emails,
 * and dispatches via sendEmail(). All helpers soft-fail: no throw, no
 * blocking. If RESEND_API_KEY is missing the underlying helper no-ops.
 *
 * Templates are intentionally plain — production-quality HTML is a
 * separate package (api/_utils/email-templates/) — these are the
 * stop-gap until those templates are extended for the marketplace.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import {
  consultantBookings,
  consultantProfiles,
  users,
} from "../../src/db/schema.js";
import { sendEmail } from "./email.js";

type EmailPayload = {
  booking: typeof consultantBookings.$inferSelect;
  consultantEmail: string;
  consultantName: string;
  requesterEmail: string;
  requesterName: string;
  consultantProfile: typeof consultantProfiles.$inferSelect;
};

async function loadPayload(bookingId: string): Promise<EmailPayload | null> {
  const db = getDb();
  const [booking] = await db
    .select()
    .from(consultantBookings)
    .where(eq(consultantBookings.id, bookingId))
    .limit(1);
  if (!booking) return null;

  const [profile] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.id, booking.consultantProfileId))
    .limit(1);
  if (!profile) return null;

  const [consultantUser, requesterUser] = await Promise.all([
    db
      .select()
      .from(users)
      .where(eq(users.id, booking.consultantUserId))
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(users)
      .where(eq(users.id, booking.requesterUserId))
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!consultantUser?.email || !requesterUser?.email) return null;

  return {
    booking,
    consultantEmail: consultantUser.email,
    consultantName: consultantUser.legalName ?? profile.fullName,
    requesterEmail: requesterUser.email,
    requesterName: requesterUser.legalName ?? requesterUser.email,
    consultantProfile: profile,
  };
}

function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "https://app.drafthr.io";
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function sendBookingRequestEmail(bookingId: string) {
  const p = await loadPayload(bookingId);
  if (!p) return;
  const subject = `New review request: ${p.booking.matterTitle ?? "DraftHR letter"}`;
  const html = `
    <p>Hi ${escapeHtml(p.consultantName)},</p>
    <p><strong>${escapeHtml(p.requesterName)}</strong> has booked a review with you on DraftHR.</p>
    ${p.booking.matterTitle ? `<p><strong>Matter:</strong> ${escapeHtml(p.booking.matterTitle)}</p>` : ""}
    ${p.booking.message ? `<blockquote>${escapeHtml(p.booking.message)}</blockquote>` : ""}
    <p><a href="${appUrl("/c")}">Open your inbox →</a></p>
    <p style="color:#888;font-size:12px">You're receiving this because your DraftHR consultant profile is published.</p>
  `;
  return sendEmail({
    to: p.consultantEmail,
    subject,
    html,
    tags: [
      { name: "category", value: "consultant" },
      { name: "stage", value: "request" },
    ],
  });
}

export async function sendBookingAcceptedEmail(bookingId: string) {
  const p = await loadPayload(bookingId);
  if (!p) return;
  const subject = `${p.consultantProfile.fullName} accepted your review request`;
  const html = `
    <p>Hi ${escapeHtml(p.requesterName)},</p>
    <p><strong>${escapeHtml(p.consultantProfile.fullName)}</strong> has accepted your booking and started work.</p>
    ${p.booking.responseNote ? `<blockquote>${escapeHtml(p.booking.responseNote)}</blockquote>` : ""}
    <p>Expected delivery: ${
      p.booking.expectedDeliveryAt
        ? p.booking.expectedDeliveryAt.toLocaleString()
        : "soon"
    }.</p>
    <p><a href="${appUrl("/consultants")}">Open the marketplace →</a></p>
  `;
  return sendEmail({
    to: p.requesterEmail,
    subject,
    html,
    tags: [
      { name: "category", value: "consultant" },
      { name: "stage", value: "accepted" },
    ],
  });
}

export async function sendBookingDeclinedEmail(bookingId: string) {
  const p = await loadPayload(bookingId);
  if (!p) return;
  const subject = `${p.consultantProfile.fullName} couldn't take this one`;
  const html = `
    <p>Hi ${escapeHtml(p.requesterName)},</p>
    <p><strong>${escapeHtml(p.consultantProfile.fullName)}</strong> wasn't able to take your booking this time.</p>
    ${p.booking.responseNote ? `<blockquote>${escapeHtml(p.booking.responseNote)}</blockquote>` : ""}
    <p>No charge — you can rebook with another specialist in the marketplace.</p>
    <p><a href="${appUrl("/consultants")}">Browse other consultants →</a></p>
  `;
  return sendEmail({
    to: p.requesterEmail,
    subject,
    html,
    tags: [
      { name: "category", value: "consultant" },
      { name: "stage", value: "declined" },
    ],
  });
}

export async function sendBookingDeliveredEmail(bookingId: string) {
  const p = await loadPayload(bookingId);
  if (!p) return;
  const subject = `Your review from ${p.consultantProfile.fullName} is ready`;
  const html = `
    <p>Hi ${escapeHtml(p.requesterName)},</p>
    <p><strong>${escapeHtml(p.consultantProfile.fullName)}</strong> has delivered your review.</p>
    ${p.booking.deliveryNote ? `<p><strong>Summary:</strong></p><blockquote>${escapeHtml(p.booking.deliveryNote)}</blockquote>` : ""}
    <p><a href="${appUrl("/consultants")}">Open the marketplace →</a> to leave a rating.</p>
  `;
  return sendEmail({
    to: p.requesterEmail,
    subject,
    html,
    tags: [
      { name: "category", value: "consultant" },
      { name: "stage", value: "delivered" },
    ],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
