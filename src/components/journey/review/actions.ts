/**
 * What the review loop does: send a letter to a teammate, someone you trust
 * or a DraftHR expert; recall it; decide on the reviewer's points; send it
 * back with a question; finish the review. Each action writes the review
 * request (reviews.ts), the letter (store.ts), the booking (bookings.ts) or
 * the secure link (the review-links endpoint) and nothing else. Screens call
 * these; none of them open a dialog.
 */
import { toast } from "sonner";
import type { Draft, EvidenceItem } from "@/lib/letters/types";
import { displayTitleFor } from "@/lib/letters/display";
import { useDraftStore } from "@/lib/store";
import { getJourney, isOwnLetter, markOwnLetterReady } from "@/lib/journey/stage";
import { useProfileStore } from "@/lib/profile";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getFlag } from "@/lib/flags";
import { notifyReviewRequested } from "@/lib/collab-notify";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import { pushBookingCreate, pushBookingMessage } from "@/lib/marketplaceSync";
import { toServerUuid } from "@/lib/remote-ids";
import {
  currentRound,
  firstName,
  getReviewsForDraft,
  newReviewId,
  useReviewStore,
  type ReviewRequest,
  type ReviewShare,
} from "@/lib/journey/reviews";
import type { Teammate } from "./people";
import { defaultApproverName, useSavedReviewers } from "./people";
import type { Expert } from "./experts";
import { acceptWithSettle, decideEdit, suggestedEdits, type SuggestedEdit } from "@/components/editor/suggestion-groups";
import { collectReviewerWork, reviewPoints, shareableEvidence, openPoints, type ReviewPoint } from "./model";
import {
  askAgain,
  createReviewLink,
  messageReviewer,
  revokeTrustedLink,
  type LetterSnapshot,
} from "./trusted-api";

/* ------------------------------------------------------------------ */
/*  Who is looking                                                     */
/* ------------------------------------------------------------------ */

export type Me = { name: string; email?: string; userId?: string };

/** The signed-in person (or the profile in local mode). */
export function useMe(): Me {
  const auth = useAuth();
  const personal = useProfileStore((s) => s.profile.personal);
  const authName = [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(" ").trim();
  return {
    name: personal.preferredName?.trim() || personal.legalName?.trim() || authName || "You",
    email: auth.user?.email || personal.email || undefined,
    userId: auth.user?.id,
  };
}

/** Is this person the named reviewer of the request? */
export function isReviewerOf(review: ReviewRequest | null | undefined, me: Me): boolean {
  if (!review) return false;
  const r = review.reviewer;
  if (me.userId && r.userId && me.userId === r.userId) return true;
  const a = (me.email ?? "").trim().toLowerCase();
  const b = (r.email ?? "").trim().toLowerCase();
  return !!a && a === b;
}

/** Is this person the one who asked? */
export function isAskerOf(review: ReviewRequest | null | undefined, me: Me): boolean {
  if (!review) return false;
  if (!review.asker) return !isReviewerOf(review, me);
  if (me.userId && review.asker.userId) return me.userId === review.asker.userId;
  const a = (me.email ?? "").trim().toLowerCase();
  const b = (review.asker.email ?? "").trim().toLowerCase();
  if (a && b) return a === b;
  return !isReviewerOf(review, me);
}

/* ------------------------------------------------------------------ */
/*  What goes with the letter                                          */
/* ------------------------------------------------------------------ */

export type SendOptions = {
  ask: string;
  dueAt: string;
  share: Omit<ReviewShare, "letter">;
};

const MAX_EVIDENCE_TEXT = 20000;
const MAX_EVIDENCE_FILE = 1_000_000;

/** The letter as the reviewer sees it (sections in order, clean html). */
export function letterSnapshot(draft: Draft): LetterSnapshot {
  const matter = draft.matterId ? useDraftStore.getState().matters[draft.matterId]?.name : undefined;
  const emp = draft.employee?.legalName?.trim();
  const job = draft.employee?.jobTitle?.trim();
  return {
    title: displayTitleFor(draft),
    letterType: draft.letterType,
    jurisdiction: draft.context?.jurisdiction ?? null,
    mode: draft.mode,
    company: draft.employer?.legalName ?? "",
    companyAddress: draft.employer?.address?.trim() || undefined,
    about: {
      matter: matter?.trim() || undefined,
      employee: emp ? `${emp}${job ? ` · ${job}` : ""}` : undefined,
    },
    sections: draft.sections.map((s, i) => ({ id: s.id, title: s.title, html: s.html ?? "", position: i })),
  };
}

/** The evidence the person chose to share, and nothing else. */
export function sharedEvidence(draft: Draft, share: SendOptions["share"]) {
  const { files, hearingNotes } = shareableEvidence(draft.evidence);
  const pick: [EvidenceItem, "file" | "hearing-notes"][] = [
    ...(share.evidence ? files.map((e) => [e, "file"] as [EvidenceItem, "file"]) : []),
    ...(share.hearingNotes ? hearingNotes.map((e) => [e, "hearing-notes"] as [EvidenceItem, "hearing-notes"]) : []),
  ];
  return pick.map(([e, group]) => ({
    id: e.id,
    name: e.filename || e.figureLabel || (e.kind === "note" ? "Note" : "File"),
    kind: e.kind,
    content: (e.parsedSummary || e.content || "").slice(0, MAX_EVIDENCE_TEXT),
    dataUrl: e.fileDataUrl && e.fileDataUrl.length <= MAX_EVIDENCE_FILE ? e.fileDataUrl : undefined,
    group,
  }));
}

/* ------------------------------------------------------------------ */
/*  Sending it out                                                     */
/* ------------------------------------------------------------------ */

export type SendResult = { ok: true; reviewId: string } | { ok: false; message: string };

/** Someone in your team: free; they work inside the app. */
export async function sendToTeammate(
  draft: Draft,
  person: Teammate,
  opts: SendOptions & { approveInSameStep: boolean },
  me: Me
): Promise<SendResult> {
  const store = useDraftStore.getState();
  const email = person.email?.trim();
  const already = (draft.collaborators ?? []).find((c) => c.email.toLowerCase() === (email ?? "").toLowerCase());
  if (email && !already) store.inviteCollaborator(draft.id, email, "reviewer", person.name);
  const collaboratorId =
    already?.id ??
    useDraftStore
      .getState()
      .drafts[draft.id]?.collaborators?.find((c) => c.email.toLowerCase() === (email ?? "").toLowerCase())?.id;
  const reviewId = newReviewId();
  useReviewStore.getState().createReview({
    id: reviewId,
    draftId: draft.id,
    kind: "team",
    reviewer: {
      name: person.name,
      email,
      role: person.line.split(" · ")[0],
      userId: person.userId,
      collaboratorId,
    },
    ask: opts.ask,
    dueAt: opts.dueAt,
    share: opts.share,
    asker: { name: me.name, email: me.email, userId: me.userId },
    approveInSameStep: person.canApprove && opts.approveInSameStep,
  });
  if (person.userId) notifyReviewRequested(draft.id, person.userId, opts.ask || undefined);
  // So the teammate's own device knows it was asked (soft: the review works
  // here either way, and the letter's suggestions and comments sync as usual).
  void createReviewLink({
    kind: "team",
    draftId: draft.id,
    reviewId,
    reviewerName: person.name,
    reviewerEmail: email,
    reviewerUserId: person.userId,
    ask: opts.ask,
    dueAt: opts.dueAt,
    approveInSameStep: person.canApprove && opts.approveInSameStep,
    share: opts.share,
    askerName: me.name,
  }).then((res) => {
    if (res.ok) useReviewStore.getState().updateReview(reviewId, { trustedLinkId: res.data.linkId });
  });
  return { ok: true, reviewId };
}

/** Someone you trust: a secure link by email, no account needed. */
export async function sendToTrusted(
  draft: Draft,
  person: { name: string; email: string },
  opts: SendOptions,
  me: Me
): Promise<SendResult> {
  if (!getFlag("trustedReviewLinks")) {
    return { ok: false, message: "Secure review links are switched off." };
  }
  const reviewId = newReviewId();
  const res = await createReviewLink({
    kind: "trusted",
    draftId: draft.id,
    reviewId,
    reviewerName: person.name.trim(),
    reviewerEmail: person.email.trim(),
    ask: opts.ask,
    dueAt: opts.dueAt,
    share: opts.share,
    letter: letterSnapshot(draft),
    evidence: sharedEvidence(draft, opts.share),
    askerName: me.name,
  });
  if (!res.ok) return { ok: false, message: res.message };
  useReviewStore.getState().createReview({
    id: reviewId,
    draftId: draft.id,
    kind: "trusted",
    reviewer: { name: person.name.trim(), email: person.email.trim() },
    ask: opts.ask,
    dueAt: opts.dueAt,
    share: opts.share,
    asker: { name: me.name, email: me.email, userId: me.userId },
    trustedLinkId: res.data.linkId,
    trustedLinkUrl: res.data.url,
    linkExpiresAt: res.data.expiresAt,
    linkEmailed: res.data.emailed,
  });
  useSavedReviewers.getState().remember({ name: person.name.trim(), email: person.email.trim() });
  if (res.data.emailed === false && res.data.url) {
    const url = res.data.url;
    toast("The link is ready, but the email didn't send", {
      description: `Copy the link and send it to ${firstName(person.name)} yourself.`,
      duration: 12000,
      action: { label: "Copy link", onClick: () => void copyText(url) },
    });
  }
  return { ok: true, reviewId };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
    return true;
  } catch {
    toast.error("Couldn't copy the link. Select it and copy it by hand.");
    return false;
  }
}

/** A DraftHR expert: a booking through the existing bookings flow. */
export async function bookExpert(draft: Draft, expert: Expert, opts: SendOptions, me: Me): Promise<SendResult> {
  const dueMs = Date.parse(opts.dueAt);
  const title = displayTitleFor(draft);
  const placeholder = useBookingsStore.getState().recordBooking({
    consultantInitials: expert.initials,
    consultantProfileId: expert.id,
    draftId: draft.id,
    localDraftId: draft.id,
    matterTitle: title,
    message: opts.ask.trim() || undefined,
    expectedDeliveryAt: Number.isFinite(dueMs) ? dueMs : Date.now() + 48 * 3600000,
    messages: [],
    consultantName: expert.name,
    consultantRole: expert.cred,
    consultantPhotoUrl: expert.photoUrl ?? undefined,
    consultantCurrency: expert.symbol,
    consultantPrice: expert.price,
  });
  const before = new Set(useBookingsStore.getState().bookings.map((b) => b.id));
  const ok = await pushBookingCreate(
    {
      consultantProfileId: expert.id,
      draftId: toServerUuid(draft.id),
      matterTitle: title,
      message: opts.ask.trim() || undefined,
      expectedDeliveryAt: Number.isFinite(dueMs) ? new Date(dueMs).toISOString() : undefined,
    },
    placeholder.id,
    expert.initials
  );
  if (!ok) {
    toast.error("Couldn't send your booking request. Please try again.");
    return { ok: false, message: "Couldn't send your booking request. Please try again." };
  }
  const booking =
    useBookingsStore
      .getState()
      .bookings.filter(
        (b) => !before.has(b.id) && b.consultantProfileId === expert.id && (b.localDraftId ?? b.draftId) === draft.id
      )
      .sort((a, b) => b.bookedAt - a.bookedAt)[0] ??
    useBookingsStore
      .getState()
      .bookings.filter((b) => b.consultantProfileId === expert.id && b.localDraftId === draft.id)
      .sort((a, b) => b.bookedAt - a.bookedAt)[0];
  const reviewId = newReviewId();
  useReviewStore.getState().createReview({
    id: reviewId,
    draftId: draft.id,
    kind: "expert",
    reviewer: { name: expert.name, role: expert.cred, consultantId: expert.id },
    ask: opts.ask,
    dueAt: opts.dueAt,
    share: opts.share,
    asker: { name: me.name, email: me.email, userId: me.userId },
    bookingId: booking?.id,
    pricePence: Math.round(expert.price * 100),
    turnaround: "standard",
  });
  if (booking) {
    // The expert's review state (rounds, points, messages) lives with the
    // booking on the server, so their suggestions reach this letter.
    void createReviewLink({
      kind: "expert",
      draftId: draft.id,
      reviewId,
      reviewerName: expert.name,
      bookingId: booking.id,
      ask: opts.ask,
      dueAt: opts.dueAt,
      share: opts.share,
      letter: letterSnapshot(draft),
    evidence: sharedEvidence(draft, opts.share),
    askerName: me.name,
    }).then((res) => {
      if (res.ok) useReviewStore.getState().updateReview(reviewId, { trustedLinkId: res.data.linkId });
    });
  }
  return { ok: true, reviewId };
}

/* ------------------------------------------------------------------ */
/*  Skip review                                                        */
/* ------------------------------------------------------------------ */

/** Straight to approval with the usual approver (the existing approval flow). */
export function skipReviewTo(draftId: string, approver: { name: string; userId?: string }): void {
  useDraftStore.getState().submitForReview(draftId, approver.name, undefined);
  if (approver.userId) notifyReviewRequested(draftId, approver.userId);
  toast.success(`Sent to ${firstName(approver.name)} to approve`);
}

/* ------------------------------------------------------------------ */
/*  While it's out                                                     */
/* ------------------------------------------------------------------ */

/** Take it back. Trusted links stop working at once. */
export async function recallReview(review: ReviewRequest): Promise<void> {
  // A teammate's suggestions from this round sit in the letter itself;
  // recalling withdraws them, so the letter is as it was when it went out
  // (ready for review again) and nobody decides on a review that was
  // called back (REVIEW-X2). Their comments stay on the letter. Points from
  // a secure link or an expert were never applied, so nothing to undo.
  if (review.kind === "team" && review.status === "out") withdrawRoundSuggestions(review);
  useReviewStore.getState().recall(review.id);
  toast(`Recalled from ${firstName(review.reviewer.name) || "the reviewer"}`);
  if (review.trustedLinkId) {
    const res = await revokeTrustedLink(review.trustedLinkId, "recalled");
    if (!res.ok && review.kind === "trusted") {
      toast.error("Recalled here, but the secure link couldn't be switched off yet. Try again from the letter.");
    }
  }
}

function withdrawRoundSuggestions(review: ReviewRequest): void {
  const store = useDraftStore.getState();
  const draft = store.drafts[review.draftId];
  const round = currentRound(review);
  if (!draft || !round) return;
  // Suggestions sent back in an earlier round are the asker's to decide.
  const earlier = new Set(
    review.rounds
      .filter((r) => r.n < round.n)
      .flatMap((r) => [...r.suggestionIds, ...(r.points ?? []).map((p) => p.id)])
  );
  const work = collectReviewerWork(draft, review.reviewer, round.sentAt);
  for (const p of work.points) {
    if (p.kind !== "suggestion" || !p.sectionId || earlier.has(p.id)) continue;
    const section = draft.sections.find((s) => s.id === p.sectionId);
    if (section?.pendingChange?.id !== p.id) continue;
    if (pendingMarkIdsOf(section.html ?? "").some((id) => earlier.has(id))) continue;
    store.rejectSectionPending(review.draftId, p.sectionId);
  }
}

function pendingMarkIdsOf(html: string): string[] {
  const ids: string[] = [];
  for (const tag of html.match(/<(ins|del)\b[^>]*>/gi) ?? []) {
    if (!/data-status\s*=\s*"pending"/i.test(tag)) continue;
    const id = tag.match(/data-suggestion-id\s*=\s*"([^"]*)"/i)?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Take back one optimistic message from a booking's local thread. */
function removeBookingMessage(bookingId: string, messageId: string) {
  useBookingsStore.setState((state) => ({
    bookings: state.bookings.map((b) =>
      b.id === bookingId ? { ...b, messages: (b.messages ?? []).filter((m) => m.id !== messageId) } : b
    ),
  }));
}

/** A message to the reviewer (an expert's goes on the booking's thread). */
export async function messageTheReviewer(review: ReviewRequest, text: string, me: Me): Promise<boolean> {
  const body = text.trim();
  if (!body) return false;
  if (review.kind === "expert" && review.bookingId) {
    const id = useBookingsStore.getState().appendMessage(review.bookingId, "requester", body);
    if (!id) return false;
    // The expert only sees the server's thread. If it didn't get there, take
    // the bubble back (the sync layer says so) and give the words back to
    // the reply box, rather than showing a message as sent that never was.
    const ok = await pushBookingMessage(review.bookingId, "requester", body);
    if (!ok) removeBookingMessage(review.bookingId, id);
    return ok;
  }
  const id = useReviewStore.getState().addMessage(review.id, { from: "asker", name: me.name, body });
  if (!id) return false;
  if (review.trustedLinkId) void messageReviewer(review.trustedLinkId, body, id);
  return true;
}

/* ------------------------------------------------------------------ */
/*  Back to you: deciding                                              */
/* ------------------------------------------------------------------ */

export function acceptPoint(review: ReviewRequest, point: ReviewPoint, opts: { animate?: boolean } = {}): void {
  // A held suggestion isn't in the letter yet: there is nothing to accept,
  // and accepting "the change in that section" would take DraftHR's instead.
  if (point.kind !== "suggestion" || !point.sectionId || point.held) return;
  keepSnapshot(review, point);
  useReviewStore.getState().decide(review.id, point.id, "accepted");
  // Felt motion (letter-live): the struck words fade, the new words settle
  // from lilac to ink, then the change is applied through the same accept
  // path. Instant with reduced motion, and for Accept all (REVIEW-74).
  const edit = editFor(review.draftId, point);
  if (edit && opts.animate !== false) acceptWithSettle(review.draftId, edit);
  else if (edit) decideEdit(review.draftId, edit, true);
  else useDraftStore.getState().acceptSectionPending(review.draftId, point.sectionId);
}

export function rejectPoint(review: ReviewRequest, point: ReviewPoint): void {
  if (point.kind !== "suggestion") return;
  if (point.held || !point.sectionId) {
    // Never in the letter: leave it out without touching the text (the
    // section's own waiting change, if any, is someone else's).
    keepSnapshot(review, point);
    dropHeld(review.id, point.id);
    useReviewStore.getState().decide(review.id, point.id, "rejected");
    return;
  }
  keepSnapshot(review, point);
  const edit = editFor(review.draftId, point);
  if (edit) decideEdit(review.draftId, edit, false);
  else useDraftStore.getState().rejectSectionPending(review.draftId, point.sectionId);
  useReviewStore.getState().decide(review.id, point.id, "rejected");
}

function dropHeld(reviewId: string, pointId: string): void {
  const live = useReviewStore.getState().requests[reviewId];
  if (!live?.heldSuggestions?.[pointId]) return;
  const held = { ...live.heldSuggestions };
  delete held[pointId];
  useReviewStore.getState().updateReview(reviewId, { heldSuggestions: held });
}

/** The reviewer's edit on the page that a point stands for (its marks, else
 *  the reviewer's change in that section). */
function editFor(draftId: string, point: ReviewPoint): SuggestedEdit | undefined {
  const draft = useDraftStore.getState().drafts[draftId];
  if (!draft) return undefined;
  const mine = suggestedEdits(draft).filter((e) => !e.ai && e.section.id === point.sectionId);
  const marks = new Set(point.markIds ?? []);
  return (
    mine.find((e) => e.pending?.id === point.id) ??
    mine.find((e) => e.ids.some((id) => marks.has(id) || id === point.id)) ??
    mine[0]
  );
}

/** Keep what the point said once it leaves the text, so the rounds history
 *  and the list still name it ("Tie this to the written standard"). */
function keepSnapshot(review: ReviewRequest, point: ReviewPoint): void {
  const live = useReviewStore.getState().requests[review.id] ?? review;
  const rounds = live.rounds.slice();
  const last = rounds[rounds.length - 1];
  if (!last || (last.points ?? []).some((p) => p.id === point.id)) return;
  const { id, kind, sectionId, title, where } = point;
  rounds[rounds.length - 1] = { ...last, points: [...(last.points ?? []), { id, kind, sectionId, title, where }] };
  useReviewStore.getState().updateReview(review.id, { rounds });
}

export function resolvePoint(review: ReviewRequest, point: ReviewPoint, resolved = true): void {
  if (point.kind !== "comment") return;
  useDraftStore.getState().resolveComment(review.draftId, point.id, resolved);
  useReviewStore.getState().decide(review.id, point.id, resolved ? "resolved" : null);
}

/** Accept every open suggestion from this reviewer in this round, with Undo. */
export function acceptAllPoints(review: ReviewRequest): number {
  const draft = useDraftStore.getState().drafts[review.draftId];
  if (!draft) return 0;
  const open = openPoints(reviewPoints(draft, review)).filter((p) => p.kind === "suggestion" && p.sectionId && !p.held);
  if (open.length === 0) return 0;
  const before = draft.sections;
  for (const p of open) acceptPoint(review, p, { animate: false });
  toast(`Accepted ${open.length === 1 ? "1 change" : `${open.length} changes`}`, {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: () => {
        useDraftStore.getState().setSections(review.draftId, before);
        for (const p of open) useReviewStore.getState().decide(review.id, p.id, null);
      },
    },
  });
  return open.length;
}

/** Send it back to the reviewer with a question: round n+1. */
export async function sendBackToReviewer(review: ReviewRequest, question: string): Promise<void> {
  const q = question.trim();
  // The reviewer's points so far are kept as the round's snapshot.
  const draft = useDraftStore.getState().drafts[review.draftId];
  if (draft) {
    const round = currentRound(review);
    const pts = reviewPoints(draft, review);
    if (round && pts.length > 0) {
      useReviewStore.getState().updateReview(review.id, {
        rounds: review.rounds.map((r) =>
          r.n === round.n
            ? {
                ...r,
                points: pts.map(({ id, kind, sectionId, title, where }) => ({ id, kind, sectionId, title, where })),
              }
            : r
        ),
      });
    }
  }
  useReviewStore.getState().sendBack(review.id, q);
  if (review.kind === "expert" && review.bookingId && q) {
    const bookingId = review.bookingId;
    const id = useBookingsStore.getState().appendMessage(bookingId, "requester", q);
    // With a review link the question also reaches them there (askAgain
    // below), so a failed thread copy needs no alarm; without one, the
    // sync layer tells the person it didn't send.
    void pushBookingMessage(bookingId, "requester", q, { quiet: !!review.trustedLinkId }).then((ok) => {
      if (!ok && id) removeBookingMessage(bookingId, id);
    });
  }
  if (review.trustedLinkId) {
    const d = useDraftStore.getState().drafts[review.draftId];
    void askAgain(review.trustedLinkId, q, d ? letterSnapshot(d) : undefined);
  }
  toast(`Sent back to ${firstName(review.reviewer.name) || "the reviewer"}`);
}

/** What finishing does with the points you haven't decided: the letter goes
 *  on to approval as it is, so a suggestion still to decide is left out
 *  (the letter keeps your wording, recorded as a decision), and a comment
 *  still open is marked resolved. Nothing undecided is carried into a
 *  locked letter (LETTER-X37). */
export function closeOpenPoints(review: ReviewRequest): { leftOut: number; resolved: number } {
  const draft = useDraftStore.getState().drafts[review.draftId];
  if (!draft) return { leftOut: 0, resolved: 0 };
  const open = openPoints(reviewPoints(draft, useReviewStore.getState().requests[review.id] ?? review));
  let leftOut = 0;
  let resolved = 0;
  for (const p of open) {
    const live = useReviewStore.getState().requests[review.id] ?? review;
    if (p.kind === "suggestion") {
      rejectPoint(live, p);
      leftOut += 1;
    } else {
      resolvePoint(live, p, true);
      resolved += 1;
    }
  }
  return { leftOut, resolved };
}

/** What finishing led to: ready to send (a teammate approved in the same
 *  step), with the approver (the usual one), the approver still to pick, or
 *  held at "Send for approval" because a required check fails. */
export type FinishOutcome = "ready-to-send" | "with-approver" | "pick-approver" | "blocked";

/** Finish the review: the letter goes on to the usual approver (or straight
 *  to Send when a teammate approved it in the same step). With no usual
 *  approver the caller asks who approves; a failing required check holds it
 *  at "Send for approval" with the reason. */
export async function finishReview(review: ReviewRequest): Promise<FinishOutcome> {
  const draft = useDraftStore.getState().drafts[review.draftId];
  if (draft) {
    const round = currentRound(review);
    const pts = reviewPoints(draft, review);
    if (round && pts.length > 0 && !round.points?.length) {
      useReviewStore.getState().updateReview(review.id, {
        rounds: review.rounds.map((r) =>
          r.n === round.n
            ? {
                ...r,
                points: pts.map(({ id, kind, sectionId, title, where }) => ({ id, kind, sectionId, title, where })),
              }
            : r
        ),
      });
    }
  }
  closeOpenPoints(review);
  useReviewStore.getState().finish(review.id);
  const fresh = useReviewStore.getState().requests[review.id];
  let outcome: FinishOutcome;
  const own = useDraftStore.getState().drafts[review.draftId];
  if (own && isOwnLetter(own)) {
    // An employee's own letter has no approver: finishing the review makes
    // it ready to send, unless a required check still fails (LETTER-X25).
    const action = getJourney(own, fresh ?? review).primaryAction;
    if (action && !action.disabled && markOwnLetterReady(review.draftId)) {
      toast.success("Review finished. It's ready to send.");
      outcome = "ready-to-send";
    } else {
      toast.success("Review finished");
      outcome = "blocked";
    }
  } else if (fresh?.kind === "team" && fresh.approveInSameStep && fresh.approvedAt) {
    useDraftStore.getState().approveDraft(review.draftId, fresh.reviewer.name, "Approved during review");
    toast.success(`Review finished. ${firstName(fresh.reviewer.name)} approved it, so it's ready to send.`);
    outcome = "ready-to-send";
  } else {
    const drafts = useDraftStore.getState().drafts;
    const now = drafts[review.draftId];
    const action = now ? getJourney(now, fresh ?? review).primaryAction : null;
    const approver = defaultApproverName(drafts);
    if (!now || action?.id !== "send-for-approval" || action.disabled) {
      toast.success("Review finished");
      outcome = "blocked";
    } else if (approver) {
      useDraftStore.getState().submitForReview(review.draftId, approver, undefined);
      toast.success(`Review finished. Sent to ${firstName(approver)} to approve.`);
      outcome = "with-approver";
    } else {
      toast.success("Review finished. Choose who approves it.");
      outcome = "pick-approver";
    }
  }
  if (review.trustedLinkId) void revokeTrustedLink(review.trustedLinkId, "finished");
  return outcome;
}

/* ------------------------------------------------------------------ */
/*  Expert bookings                                                    */
/* ------------------------------------------------------------------ */

/** The booking behind an expert review, if it is in this browser. */
export function bookingFor(review: ReviewRequest | null | undefined, bookings: Booking[]): Booking | undefined {
  if (!review || review.kind !== "expert") return undefined;
  if (review.bookingId) {
    const b = bookings.find((x) => x.id === review.bookingId);
    if (b) return b;
  }
  // The local placeholder id was swapped for the server's: match on the letter and the expert.
  return bookings
    .filter(
      (b) =>
        (b.localDraftId ?? b.draftId) === review.draftId &&
        (!review.reviewer.consultantId || b.consultantProfileId === review.reviewer.consultantId) &&
        b.bookedAt >= review.createdAt - 60000
    )
    .sort((a, b) => b.bookedAt - a.bookedAt)[0];
}

/** Accepted but not yet paid (or a previous attempt failed). Matches My bookings. */
export function isAwaitingPayment(b: Booking | undefined): boolean {
  if (!b || (b.status !== "accepted" && b.status !== "delivered")) return false;
  return !b.paymentStatus || b.paymentStatus === "unpaid" || b.paymentStatus === "failed";
}

/** The refund or dispute note My bookings shows, if any. */
export function paymentNote(b: Booking | undefined): string | null {
  if (!b || (b.status !== "accepted" && b.status !== "delivered")) return null;
  if (b.paymentStatus === "refunded") return "This booking was refunded.";
  if (b.paymentStatus === "disputed") return "This payment is under dispute, so work on the booking is paused.";
  if (b.paymentStatus === "dispute_lost") return "This payment was reversed after a dispute.";
  return null;
}

/** The booking's agreed price, formatted ("£95"), or null. */
export function bookingPrice(b: Booking | undefined, review?: ReviewRequest | null): string | null {
  const amount = b?.priceAmount ?? review?.pricePence;
  if (!amount) return null;
  const cur = (b?.priceCurrency ?? "gbp").toUpperCase();
  try {
    const whole = amount % 100 === 0;
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return null;
  }
}

/** The open request on a draft, from anywhere. */
export function activeReviewFor(draftId: string): ReviewRequest | undefined {
  return getReviewsForDraft(draftId).find((r) => r.status === "out" || r.status === "back");
}
