/**
 * /api/bookings — booking CRUD for the requester (HR) side.
 *
 * GET  — list bookings placed by the signed-in user, newest first.
 *        ?consultant=<profileId> filters to one consultant.
 * POST — create a new booking. Body: { consultantProfileId, draftId?,
 *        matterTitle?, message?, expectedDeliveryAt? }. The consultant's
 *        current rate is snapshotted onto the booking as the agreed price;
 *        a consultant can't book themselves.
 */
import { and, desc, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import {
  bookingPayments,
  consultantBookings,
  consultantProfiles,
  drafts,
} from "../../../src/db/schema.js";
import { sendBookingRequestEmail } from "../../_utils/consultant-emails.js";
import { priceSnapshot } from "../../_utils/marketplace-payments.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";

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
      paymentStatus: bookingPayments.status,
    })
    .from(consultantBookings)
    .leftJoin(
      consultantProfiles,
      eq(consultantProfiles.id, consultantBookings.consultantProfileId),
    )
    .leftJoin(bookingPayments, eq(bookingPayments.bookingId, consultantBookings.id))
    .where(and(...filters))
    .orderBy(desc(consultantBookings.bookedAt));

  const bookings = rows.map((r) => ({
    ...toClient(r.booking, r.paymentStatus),
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
  const limited = rateLimit(req, { name: "booking-create", max: 30, windowMs: 60_000 });
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
  if (!serverUuidOrNull(body.consultantProfileId)) {
    return jsonError("Consultant profile not found", 404);
  }

  const db = getDb();
  const [profile] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.id, body.consultantProfileId))
    .limit(1);

  if (!profile) return jsonError("Consultant profile not found", 404);
  if (profile.status !== "published")
    return jsonError("Consultant is not currently accepting bookings", 412);
  // A consultant booking themselves could deliver to themselves and rate
  // themselves up. Refuse it outright.
  if (profile.userId === auth.userRow.id)
    return jsonError("You can't book your own consultant profile", 403);
  // Snapshot the rate now: checkout charges this, so a later rate change
  // can't alter what the requester agreed to pay.
  const price = priceSnapshot(profile);
  if (!price) return jsonError("This specialist hasn't set a rate yet", 412);

  // SECURITY: verify the attached draft belongs to the caller's tenant BEFORE
  // binding it to the booking. The share-review read path (shared.ts) fetches
  // the draft by id alone — deliberately, trusting that creation authorised it.
  // Without this check an HR user could pass ANY draft UUID (incl. another
  // tenant's) and, once a consultant accepts, leak that draft's full letter +
  // PII via the 30-day share token. Coerce non-UUID ids to a draftless booking
  // (as before); reject a valid-format id that isn't in this tenant.
  let boundDraftId: string | null = serverUuidOrNull(body.draftId ?? null);
  if (boundDraftId) {
    const [ownedDraft] = await db
      .select({ id: drafts.id })
      .from(drafts)
      .where(and(eq(drafts.id, boundDraftId), eq(drafts.tenantId, auth.activeTenant.id)))
      .limit(1);
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
      tenantId: auth.activeTenant.id,
      requesterUserId: auth.userRow.id,
      consultantUserId: profile.userId,
      consultantProfileId: profile.id,
      // Tenant-verified above (or null for a draftless / malformed-id booking).
      draftId: boundDraftId,
      matterTitle: body.matterTitle?.slice(0, 280) ?? null,
      message: body.message?.slice(0, 4000) ?? null,
      status: "requested",
      priceAmount: price.priceAmount,
      priceCurrency: price.priceCurrency,
      expectedDeliveryAt: expected,
      bookedAt: new Date(),
    })
    .returning();

  // Fire-and-forget — don't block the response on email delivery; surfacing
  // a 200 with a booking the consultant can see is the success signal.
  void sendBookingRequestEmail(row.id).catch((err) => {
    console.error("[bookings] email send failed", err);
  });

  return new Response(JSON.stringify({ booking: toClient(row, null) }), {
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

function toClient(row: typeof consultantBookings.$inferSelect, paymentStatus: string | null) {
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
    priceAmount: row.priceAmount,
    priceCurrency: row.priceCurrency,
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
