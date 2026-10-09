/**
 * /api/bookings/respond — booking lifecycle transitions.
 *
 * The single mutation endpoint for moving a booking through its states.
 * Authorisation: only the consultant or the requester can transition,
 * and only on transitions valid for their role:
 *
 *                       consultant      requester       needs payment
 *   accept              ✓               -               -
 *   decline             ✓               -               -
 *   deliver             ✓               -               ✓
 *   complete            -               ✓               ✓
 *   rate                -               ✓               ✓
 *
 * Payment: the requester pays once the consultant accepts. Delivering,
 * completing and rating all require the booking's payment to be recorded as
 * paid, and draft access (the share link) is only minted on payment, by the
 * Stripe webhook. A booking someone placed on their own consultant profile can
 * never be worked or rated.
 *
 * Rating: one 1 to 5 rating per completed, paid booking, given either with
 * "complete" or afterwards with "rate".
 *
 * Request body: { bookingId, action, note?, rating? }
 */
import { and, eq, exists, isNull } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import {
  bookingPayments,
  consultantBookings,
  consultantProfiles,
} from "../../../src/db/schema.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";
import {
  paymentStatusOf,
  priceSnapshot,
  recomputeConsultantRating,
} from "../../_utils/marketplace-payments.js";
import {
  sendBookingAcceptedEmail,
  sendBookingDeclinedEmail,
  sendBookingDeliveredEmail,
} from "../../_utils/consultant-emails.js";

export const config = { runtime: "nodejs" };

type Action = "accept" | "decline" | "deliver" | "complete" | "rate";

/** Actions that only a paid booking can take. */
const PAID_ACTIONS: ReadonlySet<string> = new Set(["deliver", "complete", "rate"]);

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
  // Validate the uuid before it reaches the uuid column — a non-uuid string
  // otherwise throws Postgres 22P02 out of this un-try/catch'd handler as an
  // opaque 500 instead of a clean 404. (Matches bug-#19 / SE-04.)
  const bookingId = serverUuidOrNull(body.bookingId);
  if (!bookingId) return jsonError("Booking not found", 404);

  const db = getDb();
  const [booking] = await db
    .select()
    .from(consultantBookings)
    .where(eq(consultantBookings.id, bookingId))
    .limit(1);

  if (!booking) return jsonError("Booking not found", 404);

  // ACL — only the two parties can act on a booking.
  const isConsultant = booking.consultantUserId === auth.userRow.id;
  const isRequester = booking.requesterUserId === auth.userRow.id;
  if (!isConsultant && !isRequester) return jsonError("Not your booking", 403);
  // A booking placed on one's own profile (creation refuses these; this
  // catches any that predate that check) can't be worked or rated.
  if (booking.requesterUserId === booking.consultantUserId)
    return jsonError("You can't act on a booking of your own profile", 403);

  const paymentStatus = await paymentStatusOf(db, booking.id);
  if (PAID_ACTIONS.has(body.action) && paymentStatus !== "paid") {
    return jsonError("This booking hasn't been paid yet", 402);
  }

  let rating: number | undefined;
  if (body.rating !== undefined && body.rating !== null) {
    if (
      typeof body.rating !== "number" ||
      !Number.isInteger(body.rating) ||
      body.rating < 1 ||
      body.rating > 5
    ) {
      return jsonError("rating must be a whole number from 1 to 5", 400);
    }
    rating = body.rating;
  }

  const update: Partial<typeof consultantBookings.$inferInsert> = {};
  const now = new Date();
  // The status the booking must STILL be in for this transition to apply. Each
  // case below already validated booking.status equals exactly one value, so
  // booking.status IS the expected-from after the switch. We add it to the
  // UPDATE WHERE so two concurrent requests can't both pass the read-check and
  // both write (TOCTOU → duplicate share tokens / emails / double rating); a
  // zero-row result is the lost race. (Senior sweep B12.)
  const expectedFrom = booking.status;

  switch (body.action) {
    case "accept":
      if (!isConsultant) return jsonError("Only the consultant can accept", 403);
      if (booking.status !== "requested")
        return jsonError(`Cannot accept from status '${booking.status}'`, 409);
      update.status = "accepted";
      update.acceptedAt = now;
      if (body.note) update.responseNote = body.note.slice(0, 2000);
      // No share token here: draft access opens only once the requester has
      // paid (the Stripe webhook mints it). Legacy bookings placed before
      // price snapshots existed get one now, so checkout never reads the
      // live rate.
      if (booking.priceAmount === null) {
        const [profile] = await db
          .select({ price: consultantProfiles.price, currency: consultantProfiles.currency })
          .from(consultantProfiles)
          .where(eq(consultantProfiles.id, booking.consultantProfileId))
          .limit(1);
        const price = profile ? priceSnapshot(profile) : null;
        if (price) {
          update.priceAmount = price.priceAmount;
          update.priceCurrency = price.priceCurrency;
        }
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
      if (rating !== undefined) update.rating = rating;
      break;
    case "rate":
      if (!isRequester) return jsonError("Only the requester can rate", 403);
      if (booking.status !== "completed")
        return jsonError("Only a completed booking can be rated", 409);
      if (booking.rating !== null) return jsonError("This booking has already been rated", 409);
      if (rating === undefined) return jsonError("rating required", 400);
      update.rating = rating;
      break;
    default:
      return jsonError(`Unknown action '${body.action}'`, 400);
  }

  const [next] = await db
    .update(consultantBookings)
    .set(update)
    .where(
      and(
        eq(consultantBookings.id, booking.id),
        // Compare-and-set: the booking must still be in the status the
        // transition validated against (TOCTOU guard, B12).
        eq(consultantBookings.status, expectedFrom),
        // One rating per booking, even under concurrent requests.
        ...(body.action === "rate" ? [isNull(consultantBookings.rating)] : []),
        // Re-check payment inside the write, so a refund or dispute landing
        // between the read above and this update can't be raced past.
        ...(PAID_ACTIONS.has(body.action)
          ? [
              exists(
                db
                  .select({ one: bookingPayments.bookingId })
                  .from(bookingPayments)
                  .where(
                    and(
                      eq(bookingPayments.bookingId, consultantBookings.id),
                      eq(bookingPayments.status, "paid"),
                    ),
                  ),
              ),
            ]
          : []),
      ),
    )
    .returning();
  if (!next) {
    return jsonError("Booking already transitioned — please refresh.", 409);
  }

  // Recompute the consultant's aggregate rating + review count whenever a
  // rating lands. Without this, consultant_profiles.rating_x10 stays at the
  // seed 50 (5.0) forever and the marketplace's core trust signal is dead.
  if (typeof update.rating === "number") {
    try {
      await recomputeConsultantRating(db, booking.consultantProfileId);
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

  return new Response(JSON.stringify({ booking: toClient(next, paymentStatus) }), {
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
    case "rate":
      return Promise.resolve();
  }
}

function toClient(row: typeof consultantBookings.$inferSelect, paymentStatus: string) {
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
    priceAmount: row.priceAmount,
    priceCurrency: row.priceCurrency,
    paymentStatus,
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
