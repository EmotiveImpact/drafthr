/**
 * /api/marketplace/bookings/message (POST)
 *
 * Append a chat message to a booking's inline thread. Server enforces:
 *   - caller must be the consultant or requester named on the booking,
 *   - message length cap (4000 chars after trim),
 *   - the 'from' field is derived from the caller's role on the booking,
 *     NOT trusted from the body — prevents spoofing the other party.
 *
 * Body: { bookingId, text }
 * Returns: the updated messages array so the client can sync without
 *          a second round-trip.
 */
import { eq, sql } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireMarketplaceSession as requireSessionAndTenant, withMarketplaceWriteScope, canAccessMarketplaceBooking, canWriteMarketplaceBookings } from "../../_utils/marketplace-session.js";
import { consultantBookings } from "../../../src/db/schema.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";

export const config = { runtime: "nodejs" };

type MessageInput = { bookingId: string; text: string; messageId?: string };

type BookingMessage = {
  id: string;
  from: "requester" | "consultant";
  text: string;
  ts: number;
};

export async function POST(req: Request): Promise<Response> {
  const originRes = enforceSameOrigin(req);
  if (originRes) return originRes;
  const limited = await rateLimit(req, { name: "booking-message", max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonRequest<MessageInput>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.bookingId !== "string" || typeof body.text !== "string") {
    return jsonError("bookingId and text required", 400);
  }
  // Validate the uuid before it hits the uuid column (else 22P02 → opaque 500).
  const bookingId = serverUuidOrNull(body.bookingId);
  if (!bookingId) return jsonError("Booking not found", 404);
  const text = body.text.trim().slice(0, 4000);
  if (!text) return jsonError("Empty message", 400);
  const messageId = body.messageId === undefined ? crypto.randomUUID() : serverUuidOrNull(body.messageId);
  if (!messageId) return jsonError("Invalid messageId", 400);

  return withMarketplaceWriteScope(auth, async (db, currentAuth) => {
  const [booking] = await db
    .select()
    .from(consultantBookings)
    .where(eq(consultantBookings.id, bookingId))
    .limit(1)
    .for("update");
  if (!booking) return jsonError("Booking not found", 404);
  if (!canAccessMarketplaceBooking(currentAuth, booking)) return jsonError("Not your booking in this workspace", 403);
  if (booking.consultantUserId !== auth.userRow.id && !canWriteMarketplaceBookings(currentAuth)) {
    return jsonError("Your workspace role cannot send booking messages", 403);
  }

  // Derive 'from' from the booking's roles — never trust the client.
  let from: BookingMessage["from"];
  if (booking.consultantUserId === auth.userRow.id) from = "consultant";
  else if (booking.requesterUserId === auth.userRow.id) from = "requester";
  else return jsonError("Not your booking", 403);

  const existing = Array.isArray(booking.messages)
    ? (booking.messages as BookingMessage[])
    : [];
  const duplicate = existing.find((message) => message.id === messageId);
  if (duplicate) {
    if (duplicate.from !== from || duplicate.text !== text) return jsonError("Message identifier was already used", 409);
    return Response.json({ messages: existing, message: duplicate }, { headers: { "Cache-Control": "no-store" } });
  }
  const msg: BookingMessage = {
    id: messageId,
    from,
    text,
    ts: Date.now(),
  };

  // Append atomically at the database level. A read-modify-write of the JSON
  // array (select then overwrite with [...existing, msg]) loses a message when
  // two participants post concurrently — the second writer overwrites the
  // first's append. `messages || $1::jsonb` concatenates against the CURRENT
  // stored value inside the single UPDATE, and RETURNING gives us the
  // authoritative post-append array (including any concurrent message).
  const [updated] = await db
    .update(consultantBookings)
    .set({
      messages: sql`coalesce(${consultantBookings.messages}, '[]'::jsonb) || ${JSON.stringify([msg])}::jsonb`,
    })
    .where(eq(consultantBookings.id, booking.id))
    .returning({ messages: consultantBookings.messages });

  // Zero rows means the booking was deleted between the SELECT and this UPDATE
  // (the message was never persisted). Report it rather than returning 200 with
  // a stale, fabricated array — mirrors respond.ts's not-found handling.
  if (!updated) return jsonError("Booking not found", 404);

  const messages = Array.isArray(updated.messages)
    ? (updated.messages as BookingMessage[])
    : [...existing, msg];

  return new Response(JSON.stringify({ messages, message: msg }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  });
}
