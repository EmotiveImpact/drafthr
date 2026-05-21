/**
 * /api/marketplace/shared/<token>
 *
 * Resolves a matter-scoped share token into the underlying draft.
 * The token is issued server-side when a consultant accepts a booking;
 * it carries no information itself but maps 1:1 to a booking row with
 * a draftId and an expiry timestamp.
 *
 * Auth model: the caller must be signed in AND must be the consultant
 * named on the booking. We never serve the draft to an anonymous token
 * holder — even if a token leaks, only the assigned consultant's
 * session unlocks it. Token expiry is enforced server-side.
 */
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { jsonError } from "../../_utils/request.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import {
  consultantBookings,
  consultantProfiles,
  drafts,
  sections,
} from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  // Extract the token from the URL — path looks like
  // /api/marketplace/shared/<token>. The dispatcher routes via the
  // segments array, so the token is the LAST segment.
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const token = segments[segments.length - 1] ?? "";
  if (!token.startsWith("sht_"))
    return jsonError("Invalid share token", 400);

  const db = getDb();
  const now = new Date();
  const [booking] = await db
    .select()
    .from(consultantBookings)
    .where(
      and(
        eq(consultantBookings.shareToken, token),
        isNotNull(consultantBookings.shareTokenExpiresAt),
        gt(consultantBookings.shareTokenExpiresAt, now),
      ),
    )
    .limit(1);

  if (!booking)
    return jsonError("Share token not found or expired", 404);

  // Only the assigned consultant can resolve the token. Even if a token
  // leaks to a third party, their session won't match — and the booking
  // is bound to a single consultantUserId.
  if (booking.consultantUserId !== auth.userRow.id)
    return jsonError("Not your booking", 403);

  if (!booking.draftId)
    return jsonError("Booking has no draft attached", 412);

  // Fetch the draft + its sections. We only return read-safe fields —
  // PII like employer.legalName is included because it's needed for the
  // review, but we deliberately strip notes-on-employee / private
  // metadata that the HR-side editor would otherwise expose.
  const [draftRow] = await db
    .select()
    .from(drafts)
    .where(eq(drafts.id, booking.draftId))
    .limit(1);
  if (!draftRow) return jsonError("Draft not found", 404);

  const sectionRows = await db
    .select()
    .from(sections)
    .where(eq(sections.draftId, draftRow.id))
    .orderBy(sections.position);

  // Marketplace card data, so the SharedDraftReview UI can show who
  // booked who without a second round-trip.
  const [profile] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.id, booking.consultantProfileId))
    .limit(1);

  return new Response(
    JSON.stringify({
      booking: {
        id: booking.id,
        matterTitle: booking.matterTitle,
        message: booking.message,
        status: booking.status,
        acceptedAt: booking.acceptedAt?.getTime() ?? null,
        deliveredAt: booking.deliveredAt?.getTime() ?? null,
        expectedDeliveryAt: booking.expectedDeliveryAt?.getTime() ?? null,
      },
      draft: {
        id: draftRow.id,
        letterType: draftRow.letterType,
        mode: draftRow.mode,
        jurisdiction: draftRow.jurisdiction,
        title: draftRow.title,
        sections: sectionRows.map((s) => ({
          id: s.id,
          title: s.title,
          html: s.html,
          position: s.position,
        })),
      },
      consultantProfile: profile
        ? {
            id: profile.id,
            fullName: profile.fullName,
            initials: profile.initials,
          }
        : null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
