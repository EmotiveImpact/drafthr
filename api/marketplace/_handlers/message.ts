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
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { consultantBookings } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

type MessageInput = { bookingId: string; text: string };

type BookingMessage = {
  id: string;
  from: "requester" | "consultant";
  text: string;
  ts: number;
};

export async function POST(req: Request): Promise<Response> {
  const originRes = enforceSameOrigin(req);
  if (originRes) return originRes;
  const limited = rateLimit(req, { name: "booking-message", max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonRequest<MessageInput>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.bookingId !== "string" || typeof body.text !== "string") {
    return jsonError("bookingId and text required", 400);
  }
  const text = body.text.trim().slice(0, 4000);
  if (!text) return jsonError("Empty message", 400);

  const db = getDb();
  const [booking] = await db
    .select()
    .from(consultantBookings)
    .where(eq(consultantBookings.id, body.bookingId))
    .limit(1);
  if (!booking) return jsonError("Booking not found", 404);

  // Derive 'from' from the booking's roles — never trust the client.
  let from: BookingMessage["from"];
  if (booking.consultantUserId === auth.userRow.id) from = "consultant";
  else if (booking.requesterUserId === auth.userRow.id) from = "requester";
  else return jsonError("Not your booking", 403);

  const existing = Array.isArray(booking.messages)
    ? (booking.messages as BookingMessage[])
    : [];
  const msg: BookingMessage = {
    id: crypto.randomUUID(),
    from,
    text,
    ts: Date.now(),
  };
  const next = [...existing, msg];

  await db
    .update(consultantBookings)
    .set({ messages: next })
    .where(eq(consultantBookings.id, booking.id));

  return new Response(JSON.stringify({ messages: next, message: msg }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
