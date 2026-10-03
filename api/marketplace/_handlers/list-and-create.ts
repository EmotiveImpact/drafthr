/**
 * /api/bookings — booking CRUD for the requester (HR) side.
 *
 * GET  — list bookings placed by the signed-in user, newest first.
 *        ?consultant=<profileId> filters to one consultant.
 * POST — create a new booking. Body: { consultantProfileId, draftId?,
 *        matterTitle?, message?, expectedDeliveryAt? }.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireMarketplaceSession as requireSessionAndTenant, withMarketplaceWriteScope, canWriteMarketplaceBookings } from "../../_utils/marketplace-session.js";
import { getDb } from "../../../src/db/index.js";
import {
  consultantBookings,
  consultantProfiles,
  drafts,
} from "../../../src/db/schema.js";
import { sendBookingRequestEmail } from "../../_utils/consultant-emails.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";

export const config = { runtime: "nodejs" };

type CreateBookingInput = {
  /** Stable identifier for retries of one booking intent. */
  requestId?: string;
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
    return jsonError("No active tenant — bookings are tenant-scoped", 412);

  const url = new URL(req.url);
  const filterConsultantProfileId = url.searchParams.get("consultant");

  const db = getDb();
  const filters = [
    eq(consultantBookings.requesterUserId, auth.userRow.id),
    eq(consultantBookings.tenantId, auth.activeTenant.id),
  ];
  if (filterConsultantProfileId) {
    // The column is a uuid — a non-UUID filter value makes Postgres raise
    // 22P02, which surfaced as a generic 500 (bug #19). A non-UUID consultant
    // can't match anything, so return an empty list cleanly instead.
    if (!serverUuidOrNull(filterConsultantProfileId)) {
      return new Response(JSON.stringify({ bookings: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    filters.push(eq(consultantBookings.consultantProfileId, filterConsultantProfileId));
  }

  // Join the consultant profile so the HR-side list can render the
  // consultant's name / initials / photo directly, instead of trying to
  // match a UUID back to a locally-cached card (which fails cross-device).
  const rows = await db
    .select({
      booking: consultantBookings,
      consultantName: consultantProfiles.fullName,
      consultantInitials: consultantProfiles.initials,
      consultantRole: consultantProfiles.role,
      consultantPhotoUrl: consultantProfiles.photoUrl,
      consultantCurrency: consultantProfiles.currency,
      consultantPrice: consultantProfiles.price,
    })
    .from(consultantBookings)
    .leftJoin(
      consultantProfiles,
      eq(consultantProfiles.id, consultantBookings.consultantProfileId),
    )
    .where(and(...filters))
    .orderBy(desc(consultantBookings.bookedAt));

  const bookings = rows.map((r) => ({
    ...toClient(r.booking),
    consultantName: r.consultantName,
    consultantInitials: r.consultantInitials,
    consultantRole: r.consultantRole,
    consultantPhotoUrl: r.consultantPhotoUrl,
    consultantCurrency: r.consultantCurrency,
    consultantPrice: r.consultantPrice,
  }));

  return new Response(JSON.stringify({ bookings }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const originRes = enforceSameOrigin(req);
  if (originRes) return originRes;
  const limited = await rateLimit(req, { name: "booking-create", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant)
    return jsonError("No active tenant — bookings are tenant-scoped", 412);

  const parsed = await readJsonRequest<CreateBookingInput>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.consultantProfileId !== "string") {
    return jsonError("consultantProfileId required", 400);
  }
  // Guard the uuid column: a non-UUID id would make Postgres raise 22P02 →
  // generic 500 (bug #19). Treat it as a missing profile (same as a real
  // not-found), which is the honest outcome.
  const consultantProfileId = serverUuidOrNull(body.consultantProfileId);
  if (!consultantProfileId) {
    return jsonError("Consultant profile not found", 404);
  }
  const requestId = body.requestId === undefined ? crypto.randomUUID() : serverUuidOrNull(body.requestId);
  if (!requestId) return jsonError("Invalid requestId", 400);
  if (body.message !== undefined && typeof body.message !== "string" || body.matterTitle !== undefined && typeof body.matterTitle !== "string") {
    return jsonError("message and matterTitle must be text", 400);
  }

  let createdBookingId: string | undefined;
  const response = await withMarketplaceWriteScope(auth, async (db, currentAuth) => {
  if (!canWriteMarketplaceBookings(currentAuth)) return jsonError("Your workspace role cannot create bookings", 403);
  const [existing] = await db.select().from(consultantBookings).where(eq(consultantBookings.id, requestId)).limit(1);
  if (existing) {
    // A guessed ID must never return another participant's record. Reusing
    // an intent ID with changed contents also fails rather than creating two.
    if (existing.requesterUserId !== auth.userRow.id || existing.tenantId !== auth.activeTenant!.id ||
        existing.consultantProfileId !== consultantProfileId || existing.draftId !== serverUuidOrNull(body.draftId ?? null) ||
        existing.message !== (body.message?.slice(0, 4000) ?? null) || existing.matterTitle !== (body.matterTitle?.slice(0, 280) ?? null) ||
        (body.expectedDeliveryAt && existing.expectedDeliveryAt?.getTime() !== new Date(body.expectedDeliveryAt).getTime())) {
      return jsonError("Booking request identifier was already used", 409);
    }
    return Response.json({ booking: toClient(existing) }, { headers: { "Cache-Control": "no-store" } });
  }
  const [profile] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.id, consultantProfileId))
    .limit(1);

  if (!profile) return jsonError("Consultant profile not found", 404);
  if (profile.status !== "published")
    return jsonError("Consultant is not currently accepting bookings", 412);

  // Bind only a live draft owned by this workspace. Hold its share lock until
  // insertion commits so deletion cannot pass this check and revoke existing
  // shares before a new booking appears. Accept and delete use the same draft
  // before booking lock order. Preserve draftless legacy identifiers.
  let boundDraftId: string | null = serverUuidOrNull(body.draftId ?? null);
  if (boundDraftId) {
    const [ownedDraft] = await db
      .select({ id: drafts.id })
      .from(drafts)
      .where(and(eq(drafts.id, boundDraftId), eq(drafts.tenantId, auth.activeTenant!.id), isNull(drafts.deletedAt)))
      .limit(1).for("share");
    if (!ownedDraft) return jsonError("Draft not found in this workspace", 404);
    boundDraftId = ownedDraft.id;
  }

  let expected: Date;
  if (body.expectedDeliveryAt) {
    expected = new Date(body.expectedDeliveryAt);
    // A malformed caller-supplied value yields an Invalid Date, which Drizzle's
    // pg driver throws on (toISOString) → an unhandled 500. Reject it cleanly.
    if (Number.isNaN(expected.getTime())) {
      return jsonError("Invalid expectedDeliveryAt", 400);
    }
  } else {
    expected = new Date(Date.now() + parseSlaMs(profile.sla));
  }

  const [row] = await db
    .insert(consultantBookings)
    .values({
      id: requestId,
      tenantId: auth.activeTenant!.id,
      requesterUserId: auth.userRow.id,
      consultantUserId: profile.userId,
      consultantProfileId: profile.id,
      // Tenant-verified above (or null for a draftless / malformed-id booking).
      draftId: boundDraftId,
      matterTitle: body.matterTitle?.slice(0, 280) ?? null,
      message: body.message?.slice(0, 4000) ?? null,
      status: "requested",
      expectedDeliveryAt: expected,
      bookedAt: new Date(),
    })
    .onConflictDoNothing({ target: consultantBookings.id })
    .returning();

  if (!row) return jsonError("Booking request identifier was already used", 409);

  createdBookingId = row.id;

  return new Response(JSON.stringify({ booking: toClient(row) }), {
    status: 201,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  });
  // Run notifications only after the booking transaction commits.
  if (createdBookingId) void sendBookingRequestEmail(createdBookingId).catch((err) => {
    console.error("[bookings] email send failed", err);
  });
  return response;
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
