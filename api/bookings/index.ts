/**
 * /api/bookings — booking CRUD for the requester (HR) side.
 *
 * GET  — list bookings placed by the signed-in user, newest first.
 *        ?consultant=<profileId> filters to one consultant.
 * POST — create a new booking. Body: { consultantProfileId, draftId?,
 *        matterTitle?, message?, expectedDeliveryAt? }.
 */
import { and, desc, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../_utils/request.js";
import { rateLimit } from "../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../_utils/session-with-tenant.js";
import { getDb } from "../../src/db/index.js";
import {
  consultantBookings,
  consultantProfiles,
} from "../../src/db/schema.js";
import { sendBookingRequestEmail } from "../_utils/consultant-emails.js";

export const config = { runtime: "nodejs" };

type CreateBookingInput = {
  consultantProfileId: string;
  draftId?: string | null;
  matterTitle?: string;
  message?: string;
  /** ISO timestamp; falls back to consultant SLA if unset. */
  expectedDeliveryAt?: string;
};

export async function GET(req: Request): Promise<Response> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant)
    return jsonError(412, "No active tenant — bookings are tenant-scoped");

  const url = new URL(req.url);
  const filterConsultantProfileId = url.searchParams.get("consultant");

  const db = getDb();
  const filters = [
    eq(consultantBookings.requesterUserId, auth.userRow.id),
    eq(consultantBookings.tenantId, auth.activeTenant.id),
  ];
  if (filterConsultantProfileId) {
    filters.push(eq(consultantBookings.consultantProfileId, filterConsultantProfileId));
  }

  const rows = await db
    .select()
    .from(consultantBookings)
    .where(and(...filters))
    .orderBy(desc(consultantBookings.bookedAt));

  return new Response(JSON.stringify({ bookings: rows.map(toClient) }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!enforceSameOrigin(req)) return jsonError(403, "Same-origin only");
  const limit = await rateLimit(req, { scope: "booking-create", max: 30, windowSec: 60 });
  if (!limit.ok) return limit.response;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant)
    return jsonError(412, "No active tenant — bookings are tenant-scoped");

  const body = await readJsonRequest<CreateBookingInput>(req);
  if (!body || typeof body.consultantProfileId !== "string") {
    return jsonError(400, "consultantProfileId required");
  }

  const db = getDb();
  const [profile] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.id, body.consultantProfileId))
    .limit(1);

  if (!profile) return jsonError(404, "Consultant profile not found");
  if (profile.status !== "published")
    return jsonError(412, "Consultant is not currently accepting bookings");

  const expected = body.expectedDeliveryAt
    ? new Date(body.expectedDeliveryAt)
    : new Date(Date.now() + parseSlaMs(profile.sla));

  const [row] = await db
    .insert(consultantBookings)
    .values({
      tenantId: auth.activeTenant.id,
      requesterUserId: auth.userRow.id,
      consultantUserId: profile.userId,
      consultantProfileId: profile.id,
      draftId: body.draftId ?? null,
      matterTitle: body.matterTitle?.slice(0, 280) ?? null,
      message: body.message?.slice(0, 4000) ?? null,
      status: "requested",
      expectedDeliveryAt: expected,
      bookedAt: new Date(),
    })
    .returning();

  // Fire-and-forget — don't block the response on email delivery; surfacing
  // a 200 with a booking the consultant can see is the success signal.
  void sendBookingRequestEmail(row.id).catch((err) => {
    console.error("[bookings] email send failed", err);
  });

  return new Response(JSON.stringify({ booking: toClient(row) }), {
    status: 201,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function parseSlaMs(sla: string): number {
  const range = sla.match(/^(\d+)-\d+h$/);
  if (range) return parseInt(range[1], 10) * 3600_000;
  const single = sla.match(/^(\d+)h$/);
  if (single) return parseInt(single[1], 10) * 3600_000;
  return 24 * 3600_000;
}

function toClient(row: typeof consultantBookings.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    requesterUserId: row.requesterUserId,
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
