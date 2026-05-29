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
import { and, eq, isNotNull } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { consultantBookings, consultantProfiles } from "../../../src/db/schema.js";
import {
  sendBookingAcceptedEmail,
  sendBookingDeclinedEmail,
  sendBookingDeliveredEmail,
} from "../../_utils/consultant-emails.js";

export const config = { runtime: "nodejs" };

type Action = "accept" | "decline" | "deliver" | "complete";

type RespondInput = {
  bookingId: string;
  action: Action;
  note?: string;
  rating?: number;
};

export async function POST(req: Request): Promise<Response> {
  const originRes = enforceSameOrigin(req);
  if (originRes) return originRes;
  const limited = rateLimit(req, { name: "booking-respond", max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonRequest<RespondInput>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.bookingId !== "string" || typeof body.action !== "string") {
    return jsonError("bookingId and action required", 400);
  }

  const db = getDb();
  const [booking] = await db
    .select()
    .from(consultantBookings)
    .where(eq(consultantBookings.id, body.bookingId))
    .limit(1);

  if (!booking) return jsonError("Booking not found", 404);

  // ACL — only the two parties can act on a booking.
  const isConsultant = booking.consultantUserId === auth.userRow.id;
  const isRequester = booking.requesterUserId === auth.userRow.id;
  if (!isConsultant && !isRequester) return jsonError("Not your booking", 403);

  const update: Partial<typeof consultantBookings.$inferInsert> = {};
  const now = new Date();

  switch (body.action) {
    case "accept":
      if (!isConsultant) return jsonError("Only the consultant can accept", 403);
      if (booking.status !== "requested")
        return jsonError(`Cannot accept from status '${booking.status}'`, 409);
      update.status = "accepted";
      update.acceptedAt = now;
      if (body.note) update.responseNote = body.note.slice(0, 2000);
      // Mint a matter-scoped share token if a draft is attached. The
      // consultant uses it on /shared/:token to fetch the specific draft
      // without joining the HR tenant. Expires 30 days after acceptance.
      if (booking.draftId) {
        update.shareToken = generateShareToken();
        update.shareTokenExpiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
      }
      break;
    case "decline":
      if (!isConsultant) return jsonError("Only the consultant can decline", 403);
      if (booking.status !== "requested")
        return jsonError(`Cannot decline from status '${booking.status}'`, 409);
      update.status = "declined";
      if (body.note) update.responseNote = body.note.slice(0, 2000);
      break;
    case "deliver":
      if (!isConsultant) return jsonError("Only the consultant can deliver", 403);
      if (booking.status !== "accepted")
        return jsonError(`Cannot deliver from status '${booking.status}'`, 409);
      update.status = "delivered";
      update.deliveredAt = now;
      if (body.note) update.deliveryNote = body.note.slice(0, 8000);
      break;
    case "complete":
      if (!isRequester) return jsonError("Only the requester can complete", 403);
      if (booking.status !== "delivered")
        return jsonError(`Cannot complete from status '${booking.status}'`, 409);
      update.status = "completed";
      update.completedAt = now;
      if (typeof body.rating === "number" && body.rating >= 0 && body.rating <= 5) {
        update.rating = Math.round(body.rating);
      }
      break;
    default:
      return jsonError(`Unknown action '${body.action}'`, 400);
  }

  const [next] = await db
    .update(consultantBookings)
    .set(update)
    .where(eq(consultantBookings.id, booking.id))
    .returning();

  // When a booking completes with a rating, recompute the consultant's
  // aggregate rating + review count from all their rated completions.
  // Without this, consultant_profiles.rating_x10 stays at the seed 50
  // (5.0) forever and the marketplace's core trust signal is dead.
  if (body.action === "complete" && typeof update.rating === "number") {
    try {
      const rated = await db
        .select({ rating: consultantBookings.rating })
        .from(consultantBookings)
        .where(
          and(
            eq(consultantBookings.consultantProfileId, booking.consultantProfileId),
            eq(consultantBookings.status, "completed"),
            isNotNull(consultantBookings.rating),
          ),
        );
      const values = rated
        .map((r) => r.rating)
        .filter((r): r is number => typeof r === "number");
      if (values.length > 0) {
        const avg = values.reduce((s, r) => s + r, 0) / values.length;
        await db
          .update(consultantProfiles)
          .set({ rating: Math.round(avg * 10), reviews: values.length })
          .where(eq(consultantProfiles.id, booking.consultantProfileId));
      }
    } catch (err) {
      // Aggregation failure must not fail the completion response.
      console.error("[bookings] rating aggregation failed", err);
    }
  }

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

/**
 * Generates a 32-char URL-safe share token. Uses crypto.randomUUID()
 * with the dashes stripped — gives 128 bits of entropy and renders as a
 * clean URL path segment without needing base64url normalisation.
 */
function generateShareToken(): string {
  return "sht_" + crypto.randomUUID().replace(/-/g, "");
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
    shareToken: row.shareToken,
    messages: row.messages,
    shareTokenExpiresAt: row.shareTokenExpiresAt?.getTime() ?? null,
    bookedAt: row.bookedAt.getTime(),
    expectedDeliveryAt: row.expectedDeliveryAt?.getTime() ?? null,
    acceptedAt: row.acceptedAt?.getTime() ?? null,
    deliveredAt: row.deliveredAt?.getTime() ?? null,
    completedAt: row.completedAt?.getTime() ?? null,
  };
}
