/**
 * Email side-effects for the consultant marketplace.
 *
 * Each helper fetches the booking row, resolves the two parties' emails,
 * and dispatches via sendEmail(). All helpers soft-fail: no throw, no
 * blocking. If RESEND_API_KEY is missing the underlying helper no-ops.
 *
 * The wording lives in email-templates/booking.ts (pure, tested); this file
 * loads the booking and its two parties and sends.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import {
  consultantBookings,
  consultantProfiles,
  users,
} from "../../src/db/schema.js";
import { sendEmail } from "./email.js";
import { bookingEmail, type BookingEmailFacts, type BookingEmailStage } from "./email-templates/booking.js";

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

function facts(p: EmailPayload): BookingEmailFacts {
  return {
    consultantName: p.consultantName,
    consultantProfileName: p.consultantProfile.fullName,
    requesterName: p.requesterName,
    matterTitle: p.booking.matterTitle,
    message: p.booking.message,
    responseNote: p.booking.responseNote,
    deliveryNote: p.booking.deliveryNote,
    expectedDeliveryAt: p.booking.expectedDeliveryAt,
    appUrl: appUrl(""),
  };
}

async function send(bookingId: string, stage: BookingEmailStage) {
  const p = await loadPayload(bookingId);
  if (!p) return;
  const { subject, html } = bookingEmail(stage, facts(p));
  return sendEmail({
    to: stage === "request" ? p.consultantEmail : p.requesterEmail,
    subject,
    html,
    tags: [
      { name: "category", value: "consultant" },
      { name: "stage", value: stage },
    ],
  });
}

export async function sendBookingRequestEmail(bookingId: string) {
  return send(bookingId, "request");
}

export async function sendBookingAcceptedEmail(bookingId: string) {
  return send(bookingId, "accepted");
}

export async function sendBookingDeclinedEmail(bookingId: string) {
  return send(bookingId, "declined");
}

export async function sendBookingDeliveredEmail(bookingId: string) {
  return send(bookingId, "delivered");
}
