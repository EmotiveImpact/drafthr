/**
 * Keeping a review in step with what the reviewer does elsewhere:
 *   expert    the booking (accepted, paid, declined, delivered) and the
 *             expert's points and messages from the server
 *   trusted   the secure link: opened, points, messages, sent back
 *   team      the teammate's send-back, approval and messages when they
 *             reviewed on another device (their suggestions and comments
 *             reach the letter through the usual letter sync)
 * Everything soft-fails: without a server the review simply waits.
 */
import { useEffect } from "react";
import { useDraftStore } from "@/lib/store";
import { useBookingsStore } from "@/lib/bookings";
import { pullMyBookings } from "@/lib/marketplaceSync";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import {
  REVIEW_VERDICT_ASKER_LABELS,
  REVIEW_VERDICT_LABELS,
  currentRound,
  useReviewStore,
  type ReviewPointSnapshot,
  type ReviewRequest,
  type ReviewRound,
} from "@/lib/journey/reviews";
import { bookingFor } from "./actions";
import { collectReviewerWork, parseDelivery } from "./model";
import {
  assignedReviews,
  getTrustedLinkStatus,
  type AssignedReview,
  type LinkState,
  type RemotePoint,
} from "./trusted-api";

const POLL_OUT_MS = 20000;
const POLL_BACK_MS = 60000;

/** Add the reviewer's points from the server to the letter (once each). */
export function applyRemotePoints(review: ReviewRequest, points: RemotePoint[]): string[] {
  const store = useDraftStore.getState();
  const draft = store.drafts[review.draftId];
  if (!draft) return [];
  const applied = new Set(review.remoteApplied ?? []);
  const added: string[] = [];
  const who = review.reviewer;
  for (const p of points) {
    const key = p.removed ? `${p.id}:removed` : p.id;
    if (applied.has(key)) continue;
    const section = draft.sections.find((s) => s.id === p.sectionId);
    if (p.removed) {
      if (applied.has(p.id)) {
        if (p.kind === "suggestion" && section?.pendingChange?.id === p.id) {
          store.rejectSectionPending(review.draftId, section.id);
        } else if (p.kind === "comment") {
          store.deleteComment(review.draftId, p.id);
        }
      }
      added.push(key);
      continue;
    }
    if (p.kind === "suggestion") {
      // Teammates' suggestions are on the letter already (no html here).
      if (!p.proposedHtml || !section) continue;
      if (section.pendingChange && section.pendingChange.id !== p.id) continue;
      store.proposeSectionChange(review.draftId, section.id, {
        id: p.id,
        createdAt: p.at,
        proposedHtml: sanitizeLetterHtml(p.proposedHtml),
        instruction: p.note?.trim() || p.title?.trim() || "Suggested edit",
        source: "review",
        authorId: who.email || who.name,
        authorName: who.name,
        diffViewMode: "inline",
      });
      added.push(p.id);
    } else {
      if (!p.note?.trim()) continue;
      if ((draft.comments ?? []).some((c) => c.id === p.id)) {
        added.push(p.id);
        continue;
      }
      store.addComment(
        review.draftId,
        {
          sectionId: p.sectionId ?? "",
          authorId: who.email || who.name,
          authorName: who.name,
          authorEmail: who.email,
          body: p.note.trim(),
          quote: p.quote?.trim() || undefined,
        },
        p.id
      );
      added.push(p.id);
    }
  }
  if (added.length) {
    useReviewStore.getState().updateReview(review.id, { remoteApplied: [...(review.remoteApplied ?? []), ...added] });
  }
  return added;
}

/** Bring the review in line with the server's copy. */
export function applyRemoteState(reviewId: string, state: LinkState): void {
  const st = useReviewStore.getState();
  let review = st.requests[reviewId];
  if (!review || review.status === "recalled" || review.status === "finished") return;

  if (state.openedAt) st.logEvent(reviewId, "opened", { at: state.openedAt });
  if (state.approvedAt) st.logEvent(reviewId, "approved", { at: state.approvedAt });
  for (const m of state.messages ?? []) {
    st.addMessage(reviewId, { id: m.id, from: m.from, name: m.name, body: m.body, at: m.at });
  }

  review = useReviewStore.getState().requests[reviewId];
  const round = currentRound(review);
  const remoteRound = state.rounds?.find((r) => r.n === round?.n);
  const roundPoints = (state.points ?? []).filter((p) => !round || p.round === round.n);
  applyRemotePoints(review, roundPoints);

  review = useReviewStore.getState().requests[reviewId];
  if (review.status === "out" && state.status === "back" && remoteRound?.backAt) {
    const draft = useDraftStore.getState().drafts[review.draftId];
    const live = roundPoints.filter((p) => !p.removed);
    // Points from the server (trusted, expert), or the teammate's own list.
    const snapshot: ReviewPointSnapshot[] = live.length
      ? live.map((p) => ({
          id: p.id,
          kind: p.kind,
          sectionId: p.sectionId,
          title: p.title?.trim() || p.note?.trim().slice(0, 64) || "Suggested edit",
          where: p.kind === "comment" ? "Comment" : draft?.sections.find((s) => s.id === p.sectionId)?.title,
        }))
      : (remoteRound.points ?? []);
    const pendingIds = (draft?.sections ?? [])
      .filter((s) => s.pendingChange && snapshot.some((p) => p.id === s.pendingChange!.id))
      .flatMap((s) => markIdsIn(s.html ?? ""));
    const fallback = draft && round ? collectReviewerWork(draft, review.reviewer, round.sentAt) : null;
    useReviewStore.getState().markBack(reviewId, {
      verdict: remoteRound.verdict,
      note: remoteRound.note,
      points: snapshot.length ? snapshot : fallback?.points,
      suggestionIds: pendingIds.length ? pendingIds : fallback?.suggestionIds,
      commentIds: snapshot.filter((p) => p.kind === "comment").map((p) => p.id).concat(
        snapshot.length ? [] : (fallback?.commentIds ?? [])
      ),
    });
  }
}

function markIdsIn(html: string): string[] {
  const ids: string[] = [];
  for (const tag of html.match(/<(ins|del)\b[^>]*>/gi) ?? []) {
    if (!/data-status\s*=\s*"pending"/i.test(tag)) continue;
    const id = tag.match(/data-suggestion-id\s*=\s*"([^"]*)"/i)?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Follow the booking behind an expert review. A delivery moves the review
 *  back only when `delivered` allows it: when the expert worked in the
 *  letter, the server's copy (with their points) is applied first. */
export function applyBooking(reviewId: string, opts: { delivered?: boolean } = {}): void {
  const st = useReviewStore.getState();
  const review = st.requests[reviewId];
  if (!review || review.kind !== "expert") return;
  const booking = bookingFor(review, useBookingsStore.getState().bookings);
  if (!booking) return;
  if (review.bookingId !== booking.id) st.updateReview(reviewId, { bookingId: booking.id });
  if (review.status !== "out" && review.status !== "back") return;
  if (booking.acceptedAt || booking.status === "accepted" || booking.status === "delivered") {
    st.logEvent(reviewId, "accepted", { at: booking.acceptedAt ?? Date.now() });
  }
  if (booking.paymentStatus === "paid") {
    st.logEvent(reviewId, "paid", { at: booking.acceptedAt ?? Date.now() });
  }
  if (booking.status === "declined" && review.status === "out") {
    st.markDeclined(reviewId, booking.responseNote);
    return;
  }
  const mayDeliver = opts.delivered ?? !review.trustedLinkId;
  if (mayDeliver && (booking.status === "delivered" || booking.status === "completed") && review.status === "out") {
    // The round the expert finished in the letter came back through the
    // server; a delivery from the inbox carries the verdict in its note.
    const round = currentRound(review);
    const deliveredAfterRound = (booking.deliveredAt ?? Date.now()) >= (round?.sentAt ?? 0) - 1000;
    if (round?.n === 1 && deliveredAfterRound) {
      const parsed = parseDelivery(booking.deliveryNote, REVIEW_VERDICT_LABELS);
      const asAsker = parsed.verdict ? parsed : parseDelivery(booking.deliveryNote, REVIEW_VERDICT_ASKER_LABELS);
      const draft = useDraftStore.getState().drafts[review.draftId];
      const work = draft && round ? collectReviewerWork(draft, review.reviewer, round.sentAt) : null;
      st.markBack(reviewId, {
        verdict: asAsker.verdict,
        note: asAsker.note,
        suggestionIds: work?.suggestionIds,
        commentIds: work?.commentIds,
        points: work?.points,
      });
    }
  }
}

/**
 * React: keep the open review on a draft in step (only for the person who
 * asked; the reviewer's own view has its own loop).
 */
export function useReviewSync(review: ReviewRequest | null | undefined, enabled: boolean): void {
  const id = review?.id;
  const kind = review?.kind;
  const status = review?.status;
  const linkId = review?.trustedLinkId;
  const bookingId = review?.bookingId;
  const bookings = useBookingsStore((s) => s.bookings);

  // Booking changes (from My bookings, the inbox or a pull) move the review on.
  useEffect(() => {
    if (!enabled || !id || kind !== "expert") return;
    applyBooking(id);
  }, [enabled, id, kind, bookings]);

  useEffect(() => {
    if (!enabled || !id || (status !== "out" && status !== "back")) return;
    if (!linkId && !(kind === "expert" && bookingId)) return;
    // Each run of the effect keeps its own in-flight flag, and what the
    // server says is applied even when the effect has re-run meanwhile
    // (applying only ever moves the review forward). A shared flag across
    // runs dropped the first answer and blocked the next run's first tick,
    // so "Opened the link" and "back" waited for the next poll (REVIEW-X1).
    let inFlight = false;
    let stopped = false;
    const tick = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        if (kind === "expert") await pullMyBookings().catch(() => false);
        const res = await getTrustedLinkStatus(linkId ? { linkId } : { bookingId });
        if (res.ok) applyRemoteState(id, res.data);
        if (kind === "expert") applyBooking(id, { delivered: true });
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), status === "out" ? POLL_OUT_MS : POLL_BACK_MS);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, id, kind, status, linkId, bookingId]);
}

/* ------------------------------------------------------------------ */
/*  The teammate's side: reviews asked of you on another device         */
/* ------------------------------------------------------------------ */

/** Keep a copy of a review a teammate asked you to do (made on their device). */
export function importAssigned(localDraftId: string, a: AssignedReview): void {
  const prev = useReviewStore.getState().requests[a.reviewId];
  if (prev && !prev.importedAt) return; // this browser made it: it is the asker's own copy
  const rounds: ReviewRound[] = (a.state.rounds ?? []).map((r) => ({
    n: r.n,
    sentAt: r.sentAt,
    question: r.question,
    backAt: r.backAt,
    verdict: r.verdict,
    note: r.note,
    suggestionIds: prev?.rounds.find((x) => x.n === r.n)?.suggestionIds ?? [],
    commentIds: (r.points ?? []).filter((p) => p.kind === "comment").map((p) => p.id),
    points: r.points,
  }));
  if (rounds.length === 0) rounds.push({ n: 1, sentAt: a.createdAt, suggestionIds: [], commentIds: [] });
  const times = [
    a.createdAt,
    a.state.openedAt ?? 0,
    a.state.approvedAt ?? 0,
    a.state.revokedAt ?? 0,
    ...rounds.flatMap((r) => [r.sentAt, r.backAt ?? 0]),
    ...(a.state.messages ?? []).map((m) => m.at),
  ];
  useReviewStore.getState().importReview({
    id: a.reviewId,
    draftId: localDraftId,
    kind: "team",
    reviewer: { ...a.reviewer },
    ask: a.ask ?? undefined,
    dueAt: a.dueAt ?? undefined,
    share: { letter: true, evidence: a.share.evidence, hearingNotes: a.share.hearingNotes },
    status: a.state.status,
    rounds,
    trustedLinkId: a.linkId,
    asker: a.asker,
    approveInSameStep: a.approveInSameStep,
    approvedAt: a.state.approvedAt ?? undefined,
    openedAt: a.state.openedAt ?? undefined,
    messages: (a.state.messages ?? []).map((m) => ({ ...m })),
    events: prev?.events ?? [],
    remoteApplied: prev?.remoteApplied,
    createdAt: a.createdAt,
    updatedAt: Math.max(...times),
    recalledAt: a.state.status === "recalled" ? (a.state.revokedAt ?? undefined) : undefined,
    finishedAt: a.state.status === "finished" ? (a.state.revokedAt ?? undefined) : undefined,
    importedAt: Date.now(),
  });
}

/** React: fetch the reviews you were asked to do on this letter (signed in only). */
export function useAssignedReviews(draftId: string | null, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !draftId) return;
    let cancelled = false;
    const tick = async () => {
      const res = await assignedReviews(draftId);
      if (cancelled || !res.ok) return;
      for (const a of res.data.reviews) importAssigned(draftId, a);
    };
    void tick();
    const t = window.setInterval(() => void tick(), 30000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [draftId, enabled]);
}
