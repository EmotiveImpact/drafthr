/**
 * /api/bookings/respond — booking lifecycle transitions.
 *
 * The single mutation endpoint for moving a booking through its states.
 * Authorisation: only the consultant or the requester can transition,
 * and only on transitions valid for their role:
 *
 *                       consultant      requester
 *   accept              ✓               -
 *   decline             ✓               -
 *   deliver             ✓               -
 *   complete            -               ✓
 *
 * Request body: { bookingId, action, note?, rating? }
 */
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../_utils/request.js";
import { rateLimit } from "../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../_utils/session-with-tenant.js";
import { getDb } from "../../src/db/index.js";
import { consultantBookings } from "../../src/db/schema.js";
import {
  sendBookingAcceptedEmail,
  sendBookingDeclinedEmail,
  sendBookingDeliveredEmail,
} from "../_utils/consultant-emails.js";

export const config = { runtime: "nodejs" };

type Action = "accept" | "decline" | "deliver" | "complete";

type RespondInput = {
  bookingId: string;
  action: Action;
  note?: string;
  rating?: number;
};

export async function POST(req: Request): Promise<Response> {
  if (!enforceSameOrigin(req)) return jsonError(403, "Same-origin only");
  const limit = await rateLimit(req, { scope: "booking-respond", max: 60, windowSec: 60 });
  if (!limit.ok) return limit.response;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const body = await readJsonRequest<RespondInput>(req);
  if (!body || typeof body.bookingId !== "string" || typeof body.action !== "string") {
    return jsonError(400, "bookingId and action required");
  }

  const db = getDb();
  const [booking] = await db
    .select()
    .from(consultantBookings)
    .where(eq(consultantBookings.id, body.bookingId))
    .limit(1);

  if (!booking) return jsonError(404, "Booking not found");

  // ACL — only the two parties can act on a booking.
  const isConsultant = booking.consultantUserId === auth.userRow.id;
  const isRequester = booking.requesterUserId === auth.userRow.id;
  if (!isConsultant && !isRequester) return jsonError(403, "Not your booking");

  const update: Partial<typeof consultantBookings.$inferInsert> = {};
  const now = new Date();

  switch (body.action) {
    case "accept":
      if (!isConsultant) return jsonError(403, "Only the consultant can accept");
      if (booking.status !== "requested")
        return jsonError(409, `Cannot accept from status '${booking.status}'`);
      update.status = "accepted";
      update.acceptedAt = now;
      if (body.note) update.responseNote = body.note.slice(0, 2000);
      break;
    case "decline":
      if (!isConsultant) return jsonError(403, "Only the consultant can decline");
      if (booking.status !== "requested")
        return jsonError(409, `Cannot decline from status '${booking.status}'`);
      update.status = "declined";
      if (body.note) update.responseNote = body.note.slice(0, 2000);
      break;
    case "deliver":
      if (!isConsultant) return jsonError(403, "Only the consultant can deliver");
      if (booking.status !== "accepted")
        return jsonError(409, `Cannot deliver from status '${booking.status}'`);
      update.status = "delivered";
      update.deliveredAt = now;
      if (body.note) update.deliveryNote = body.note.slice(0, 8000);
      break;
    case "complete":
      if (!isRequester) return jsonError(403, "Only the requester can complete");
      if (booking.status !== "delivered")
        return jsonError(409, `Cannot complete from status '${booking.status}'`);
      update.status = "completed";
      update.completedAt = now;
      if (typeof body.rating === "number" && body.rating >= 0 && body.rating <= 5) {
        update.rating = Math.round(body.rating);
      }
      break;
    default:
      return jsonError(400, `Unknown action '${body.action}'`);
  }

  const [next] = await db
    .update(consultantBookings)
    .set(update)
    .where(eq(consultantBookings.id, booking.id))
    .returning();

  // Email side-effects, fire-and-forget — never block the API response on
  // mail delivery. Logged on failure.
  void notifyTransition(body.action, next.id).catch((err) => {
    console.error("[bookings] notify failed", body.action, err);
  });

  return new Response(JSON.stringify({ booking: toClient(next) }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function notifyTransition(action: Action, bookingId: string) {
  switch (action) {
    case "accept":
      return sendBookingAcceptedEmail(bookingId);
    case "decline":
      return sendBookingDeclinedEmail(bookingId);
    case "deliver":
      return sendBookingDeliveredEmail(bookingId);
    case "complete":
      return Promise.resolve();
  }
}

function toClient(row: typeof consultantBookings.$inferSelect) {
  return {
    id: row.id,
    consultantProfileId: row.consultantProfileId,
    draftId: row.draftId,
    matterTitle: row.matterTitle,
    message: row.message,
    status: row.status,
    responseNote: row.responseNote,
    deliveryNote: row.deliveryNote,
    rating: row.rating,
    bookedAt: row.bookedAt.getTime(),
    expectedDeliveryAt: row.expectedDeliveryAt?.getTime() ?? null,
    acceptedAt: row.acceptedAt?.getTime() ?? null,
    deliveredAt: row.deliveredAt?.getTime() ?? null,
    completedAt: row.completedAt?.getTime() ?? null,
  };
}
