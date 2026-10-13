/**
 * Booking an expert from the sidebar's Experts page (mk-book). Goes through
 * the existing bookings flow (recordBooking, then pushBookingCreate for a
 * server expert, with the letter id mapped to the server's uuid as before),
 * and, when a letter is attached, puts that letter into the Review step
 * through reviews.ts, exactly as booking from the letter's reviewer dialog
 * does: an expert review request linked to the booking, with the ask, the
 * due date from the turnaround and the price.
 *
 * Nothing is charged here: checkout only starts once the expert accepts.
 */
import type { Consultant } from "./types";
import type { Draft } from "@/lib/letters/types";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { pushBookingCreate } from "@/lib/marketplaceSync";
import { toServerUuid } from "@/lib/remote-ids";
import { letterTitle } from "@/components/consultants/letters";
import { useReviewStore } from "@/lib/journey/reviews";
import { letterSnapshot, sharedEvidence, type Me } from "@/components/journey/review/actions";
import { createReviewLink } from "@/components/journey/review/trusted-api";
import { bookingTotals, planHours } from "./market";

export const NEEDS = ["Legal check", "Tone and fairness", "Matches our policy"] as const;
export type Need = (typeof NEEDS)[number];

/** The message the expert sees: the chosen checks, then the free text. */
export function bookingMessage(needs: readonly string[], note: string): string | undefined {
  const parts: string[] = [];
  if (needs.length) parts.push(`What I need: ${needs.join(", ")}.`);
  if (note.trim()) parts.push(note.trim());
  return parts.length ? parts.join("\n\n") : undefined;
}

export type BookResult = { ok: true; booking: Booking | undefined; reviewId?: string } | { ok: false };

export async function bookExpertFromMarketplace({
  consultant: c,
  draft,
  needs,
  note,
  asker,
}: {
  consultant: Consultant;
  draft: Draft | null;
  needs: readonly string[];
  note: string;
  /** The person booking (the review's asker), as from useMe(). */
  asker?: Me;
}): Promise<BookResult> {
  const message = bookingMessage(needs, note);
  const expectedDeliveryAt = Date.now() + planHours(c.sla) * 3600_000;
  const title = draft ? letterTitle(draft) : undefined;
  const store = useBookingsStore.getState();
  const placeholder = store.recordBooking({
    consultantInitials: c.initials,
    consultantProfileId: c.profileId,
    draftId: draft?.id ?? "",
    localDraftId: draft?.id,
    matterTitle: title,
    message,
    expectedDeliveryAt,
    messages: [],
    consultantName: c.name,
    consultantRole: c.role,
    consultantPhotoUrl: c.photoUrl || undefined,
    consultantCurrency: c.currency,
    consultantPrice: c.price,
  });

  let booking: Booking | undefined = placeholder;
  if (c.profileId) {
    const before = new Set(useBookingsStore.getState().bookings.map((b) => b.id));
    // AWAIT the create: the expert's inbox is server-driven, so a failed POST
    // means they never see the request (pushBookingCreate rolls the
    // optimistic row back on failure).
    const ok = await pushBookingCreate(
      {
        consultantProfileId: c.profileId,
        draftId: draft ? toServerUuid(draft.id) : null,
        matterTitle: title,
        message,
        expectedDeliveryAt: new Date(expectedDeliveryAt).toISOString(),
      },
      placeholder.id,
      c.initials,
    );
    if (!ok) return { ok: false };
    const all = useBookingsStore.getState().bookings;
    booking =
      all
        .filter((b) => !before.has(b.id) && b.consultantProfileId === c.profileId)
        .sort((a, b) => b.bookedAt - a.bookedAt)[0] ??
      all
        .filter((b) => b.consultantProfileId === c.profileId && (b.localDraftId ?? b.draftId) === (draft?.id ?? ""))
        .sort((a, b) => b.bookedAt - a.bookedAt)[0];
  }

  let reviewId: string | undefined;
  if (draft) {
    reviewId = useReviewStore.getState().createReview({
      draftId: draft.id,
      kind: "expert",
      reviewer: { name: c.name, role: c.role, consultantId: c.profileId },
      ask: message,
      dueAt: new Date(expectedDeliveryAt).toISOString(),
      bookingId: booking?.id,
      pricePence: bookingTotals(c.price).totalPence,
      turnaround: "standard",
      ...(asker ? { asker: { name: asker.name, email: asker.email, userId: asker.userId } } : {}),
    });
    // As when booked from the letter's reviewer dialog: the expert's review
    // state (rounds, points, messages) lives with the booking on the server,
    // so their suggestions reach this letter (REVIEW-46, REVIEW-118).
    const review = useReviewStore.getState().requests[reviewId];
    if (booking && review && c.profileId) {
      const id = reviewId;
      void createReviewLink({
        kind: "expert",
        draftId: draft.id,
        reviewId: id,
        reviewerName: c.name,
        bookingId: booking.id,
        ask: message ?? "",
        dueAt: review.dueAt,
        share: review.share,
        letter: letterSnapshot(draft),
        evidence: sharedEvidence(draft, review.share),
        askerName: asker?.name ?? "",
      }).then((res) => {
        if (res.ok) useReviewStore.getState().updateReview(id, { trustedLinkId: res.data.linkId });
      });
    }
  }
  return { ok: true, booking, reviewId };
}
