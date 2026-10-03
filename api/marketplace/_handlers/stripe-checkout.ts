/**
 * /api/marketplace/stripe-checkout — HR pays for a booking (Stripe Checkout,
 * destination charge to the consultant's connected account + optional platform
 * fee). POST { bookingId } → { url } to redirect the browser to.
 *
 * Guards: same-origin + rate-limit + session; only the booking's REQUESTER (the
 * HR user who placed it) can pay for it (IDOR). Off when Stripe unconfigured.
 */
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireMarketplaceSession as requireSessionAndTenant, canWriteMarketplaceBookings } from "../../_utils/marketplace-session.js";
import { getDb } from "../../../src/db/index.js";
import { consultantBookings } from "../../../src/db/schema.js";
import { getStripe } from "../../_utils/stripe.js";
import { startBookingCheckout } from "../../_utils/marketplace-payments.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";

export const config = { runtime: "nodejs" };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = await rateLimit(req, { name: "stripe-checkout", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return jsonError("Payments are not configured", 503);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!canWriteMarketplaceBookings(auth)) return jsonError("Your workspace role cannot start booking payments", 403);

  const parsed = await readJsonRequest<{ bookingId?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const rawBookingId = typeof parsed.body.bookingId === "string" ? parsed.body.bookingId.trim() : "";
  if (!rawBookingId) return jsonError("bookingId required", 400);
  // Validate the uuid before it hits the uuid column — a non-uuid id (reachable
  // when paying against an optimistic local booking not yet swapped for the
  // server UUID) otherwise raises Postgres 22P02 → opaque 500. Treat as
  // not-found. (Matches respond.ts / message.ts / bug-#19.)
  const bookingId = serverUuidOrNull(rawBookingId);
  if (!bookingId) return jsonError("Booking not found", 404);

  try {
    const db = getDb();
    const [booking] = await db
      .select({
        id: consultantBookings.id,
        requesterUserId: consultantBookings.requesterUserId,
        tenantId: consultantBookings.tenantId,
        consultantProfileId: consultantBookings.consultantProfileId,
        matterTitle: consultantBookings.matterTitle,
      })
      .from(consultantBookings)
      .where(eq(consultantBookings.id, bookingId))
      .limit(1);
    if (!booking) return jsonError("Booking not found", 404);
    // IDOR: only the HR user who placed the booking can pay for it.
    if (booking.requesterUserId !== auth.userRow.id || !auth.activeMember || booking.tenantId !== auth.activeTenant?.id) {
      return jsonError("Not your booking", 403);
    }
    if (!booking.consultantProfileId) {
      return jsonError("Booking has no specialist attached", 412);
    }

    return await startBookingCheckout(req, auth, { ...booking, consultantProfileId: booking.consultantProfileId }, stripe);
  } catch (err) {
    console.error(JSON.stringify({ event: "marketplace_checkout_failed", type: err instanceof Error ? err.name : "unknown" }));
    return jsonError("Could not start checkout", 502);
  }
}
