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
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import type { Section } from "@/lib/letters/types";
import {
  REVIEW_VERDICT_ASKER_LABELS,
  REVIEW_VERDICT_LABELS,
  currentRound,
  useReviewStore,
  type HeldSuggestion,
  type ReviewPointSnapshot,
  type ReviewRequest,
  type ReviewRound,
} from "@/lib/journey/reviews";
import { bookingFor } from "./actions";
import { collectReviewerWork, parseDelivery } from "./model";
import { rebaseSuggestion, sameText } from "./rebase";
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
  const held: Record<string, HeldSuggestion> = { ...(review.heldSuggestions ?? {}) };
  let heldChanged = false;
  const lateMarks: string[] = [];
  const rewrites: string[] = [];
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
      if (held[p.id]) {
        delete held[p.id];
        heldChanged = true;
      }
      added.push(key);
      continue;
    }
    if (p.kind === "suggestion") {
      // Teammates' suggestions are on the letter already (no html here).
      if (!p.proposedHtml) continue;
      // You already decided it (left out when you finished, or dismissed
      // while it was held): never put it back.
      if (currentRound(review)?.decisions?.[p.id]) {
        if (held[p.id]) {
          delete held[p.id];
          heldChanged = true;
        }
        added.push(p.id);
        continue;
      }
      const proposedHtml = sanitizeLetterHtml(p.proposedHtml);
      const instruction = p.note?.trim() || p.title?.trim() || "Suggested edit";
      // The store keeps one waiting change per part of the letter. When that
      // part already has another one (a DraftHR edit), or is gone, the
      // suggestion is held, never dropped or counted as accepted, and goes
      // in once the part is free (REVIEW-X24).
      if (!section || (section.pendingChange && section.pendingChange.id !== p.id)) {
        const reason = section ? "busy" : "missing";
        const was = held[p.id];
        if (!was || was.reason !== reason || was.proposedHtml !== proposedHtml || was.instruction !== instruction) {
          // What they worked on: the text without the change waiting there
          // (kept from the first hold, the text they saw doesn't change).
          const baseHtml = was?.baseHtml ?? (section ? textWithoutPending(section) : undefined);
          held[p.id] = { sectionId: p.sectionId ?? "", proposedHtml, instruction, at: p.at, reason, ...(baseHtml ? { baseHtml } : {}) };
          heldChanged = true;
        }
        continue;
      }
      // Held until now: replay it on the text as it is (REVIEW-X29).
      const placed = held[p.id] ? onTodaysText(section, { ...held[p.id], proposedHtml }) : { html: proposedHtml, overlaps: false };
      if (placed.overlaps) rewrites.push(p.id);
      store.proposeSectionChange(review.draftId, section.id, {
        id: p.id,
        createdAt: p.at,
        proposedHtml: placed.html,
        instruction,
        source: "review",
        authorId: who.email || who.name,
        authorName: who.name,
        diffViewMode: "inline",
      });
      if (held[p.id]) {
        delete held[p.id];
        heldChanged = true;
        // Placed after it came back: its marks belong to the round.
        const sec = useDraftStore.getState().drafts[review.draftId]?.sections.find((x) => x.id === section.id);
        if (review.status === "back" && sec) lateMarks.push(...markIdsIn(sec.html ?? ""));
      }
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
  if (added.length || heldChanged) {
    const last = review.rounds[review.rounds.length - 1];
    useReviewStore.getState().updateReview(review.id, {
      ...(lateMarks.length && last
        ? { rounds: [...review.rounds.slice(0, -1), { ...last, suggestionIds: [...new Set([...(last.suggestionIds ?? []), ...lateMarks])] }] }
        : {}),
      ...(added.length ? { remoteApplied: [...(review.remoteApplied ?? []), ...added] } : {}),
      ...(heldChanged ? { heldSuggestions: held } : {}),
      ...(rewrites.length ? { rewritesNewer: [...new Set([...(review.rewritesNewer ?? []), ...rewrites])] } : {}),
    });
  }
  return added;
}

/**
 * Put the reviewer's held suggestions into the letter once their part of it
 * is free (you decided the DraftHR edit that was waiting there). Each one
 * goes in once, as if it had just arrived. Returns the ids placed.
 */
export function placeHeldSuggestions(reviewId: string): string[] {
  const review = useReviewStore.getState().requests[reviewId];
  if (!review?.heldSuggestions || (review.status !== "out" && review.status !== "back")) return [];
  const store = useDraftStore.getState();
  const draft = store.drafts[review.draftId];
  if (!draft) return [];
  const held = { ...review.heldSuggestions };
  const placed: string[] = [];
  const rewrites: string[] = [];
  let changed = false;
  for (const [id, h] of Object.entries(held)) {
    // Already decided (left out, or dismissed): nothing to place.
    if (currentRound(review)?.decisions?.[id]) {
      delete held[id];
      changed = true;
      continue;
    }
    const section = draft.sections.find((s) => s.id === h.sectionId);
    const reason: HeldSuggestion["reason"] = section ? "busy" : "missing";
    if (!section || (section.pendingChange && section.pendingChange.id !== id)) {
      if (h.reason !== reason) {
        held[id] = { ...h, reason };
        changed = true;
      }
      continue;
    }
    if (section.pendingChange?.id !== id) {
      // Their change, replayed on the text as it is now: an edit you
      // accepted in this part meanwhile stays (REVIEW-X29).
      const onText = onTodaysText(section, h);
      if (onText.overlaps) rewrites.push(id);
      store.proposeSectionChange(review.draftId, section.id, {
        id,
        createdAt: h.at,
        proposedHtml: onText.html,
        instruction: h.instruction,
        source: "review",
        authorId: review.reviewer.email || review.reviewer.name,
        authorName: review.reviewer.name,
        diffViewMode: "inline",
      });
    }
    delete held[id];
    placed.push(id);
    changed = true;
  }
  if (changed) {
    // The marks it left in the text belong to the round, as if it had come
    // back with them (the Progress line and the list count them).
    const after = useDraftStore.getState().drafts[review.draftId];
    const marks = placed.flatMap((pid) => {
      const sec = after?.sections.find((s) => s.pendingChange?.id === pid);
      return sec ? markIdsIn(sec.html ?? "") : [];
    });
    const last = review.rounds[review.rounds.length - 1];
    const rounds =
      marks.length && last
        ? [...review.rounds.slice(0, -1), { ...last, suggestionIds: [...new Set([...(last.suggestionIds ?? []), ...marks])] }]
        : undefined;
    useReviewStore.getState().updateReview(review.id, {
      ...(rounds ? { rounds } : {}),
      heldSuggestions: held,
      ...(rewrites.length ? { rewritesNewer: [...new Set([...(review.rewritesNewer ?? []), ...rewrites])] } : {}),
      ...(placed.length ? { remoteApplied: [...(review.remoteApplied ?? []), ...placed.filter((x) => !(review.remoteApplied ?? []).includes(x))] } : {}),
    });
  }
  return placed;
}

/** A part of the letter without the change waiting in it: what a reviewer
 *  sees as the letter's own text. */
function textWithoutPending(section: Section): string {
  const html = section.pendingChange?.prevHtml ?? section.html ?? "";
  return html.includes("data-suggestion-id") ? sanitizeLetterHtml(mergeAcceptedSuggestionsHtml(html)) : html;
}

/**
 * A held suggestion on the part of the letter as it is now. When the text
 * changed after the reviewer wrote it (you accepted DraftHR's edit), their
 * change is replayed on today's text instead of putting back the wording
 * they saw; `overlaps` says some of their change rewrites the newer words.
 */
export function onTodaysText(section: Section, h: Pick<HeldSuggestion, "proposedHtml" | "baseHtml" | "at">): { html: string; overlaps: boolean } {
  const current = textWithoutPending(section);
  // Older holds kept no copy of the text: the first version saved after they
  // wrote it (when the change that was waiting went in) is that text.
  const base = h.baseHtml ?? (section.versions ?? []).find((v) => v.createdAt >= h.at)?.html;
  if (!base || sameText(base, current)) return { html: h.proposedHtml, overlaps: false };
  const theirs = h.proposedHtml.includes("data-suggestion-id")
    ? sanitizeLetterHtml(mergeAcceptedSuggestionsHtml(h.proposedHtml))
    : h.proposedHtml;
  const r = rebaseSuggestion(base, current, theirs);
  return { html: sanitizeLetterHtml(r.html), overlaps: r.overlaps };
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
  const hasHeld = !!review?.heldSuggestions && Object.keys(review.heldSuggestions).length > 0;
  // Which parts of the letter have a change waiting, as one string, so the
  // held suggestions are tried again the moment one is decided.
  const waiting = useDraftStore((s) => {
    if (!hasHeld || !review) return "";
    const d = s.drafts[review.draftId];
    return d ? d.sections.map((x) => `${x.id}:${x.pendingChange?.id ?? ""}`).join("|") : "";
  });

  useEffect(() => {
    if (!enabled || !id || !hasHeld) return;
    placeHeldSuggestions(id);
  }, [enabled, id, hasHeld, waiting]);

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
