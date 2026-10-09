/**
 * /api/bookings/inbox — consultant-side inbox.
 *
 * Returns every booking addressed to the signed-in user as a consultant,
 * grouped on the client by status. Includes the requester's basic
 * identity so the consultant knows who they're working with.
 */
import { desc, eq } from "drizzle-orm";
import { jsonError } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import {
  bookingPayments,
  consultantBookings,
  consultantProfiles,
  users,
} from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const limited = rateLimit(req, { name: "marketplace-inbox", max: 60, windowMs: 60_000 });
  if (limited) return limited;
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  // Confirm the caller actually has a consultant profile — otherwise they
  // don't have an inbox at all.
  const [profile] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.userId, auth.userRow.id))
    .limit(1);
  if (!profile)
    return jsonError("You don't have a consultant profile yet", 412);

  const rows = await db
    .select({
      booking: consultantBookings,
      requesterEmail: users.email,
      requesterName: users.legalName,
      paymentStatus: bookingPayments.status,
    })
    .from(consultantBookings)
    .leftJoin(users, eq(users.id, consultantBookings.requesterUserId))
    .leftJoin(bookingPayments, eq(bookingPayments.bookingId, consultantBookings.id))
    .where(eq(consultantBookings.consultantUserId, auth.userRow.id))
    .orderBy(desc(consultantBookings.bookedAt));

  const bookings = rows.map((r) => ({
    ...toClient(r.booking, r.paymentStatus),
    requesterEmail: r.requesterEmail,
    requesterName: r.requesterName,
  }));

  return new Response(JSON.stringify({ bookings, profileStatus: profile.status }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function toClient(row: typeof consultantBookings.$inferSelect, paymentStatus: string | null) {
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
    // The consultant waits for "paid" before starting work.
    paymentStatus: paymentStatus ?? "unpaid",
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
