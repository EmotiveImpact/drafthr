import { useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Review requests: the optional Review step of the letter journey.
 *
 * Contract (design/build/phase3/brief.md section 5). The foundation created
 * these types and a working minimal store; the review builder owns this file
 * and extends it. Every name the foundation exported is kept.
 *
 * A request is one ask for a second look at one draft:
 *   kind      team     someone in your workspace (free; can approve in the same step)
 *             trusted  the person's own solicitor or HR consultant (secure link, no account)
 *             expert   a DraftHR marketplace expert (a booking, paid when they accept)
 *   status    out      with the reviewer; editing is paused
 *             back     the reviewer sent it back; your turn to decide
 *             recalled you took it back before they finished (or the expert declined)
 *             finished you finished the review; the letter moves on to approval
 * Every round is kept: each send-back starts a new round with its own
 * question, verdict, note, the ids of the reviewer's suggestions and
 * comments (those live on the draft, in its sections and comments), a
 * snapshot of the points as they came back, and what you decided on each.
 *
 * The request also holds the message thread with the reviewer (team and
 * trusted; an expert's thread is the booking's), and a timeline of what
 * happened (sent, opened, accepted, back) for the reviewer card.
 *
 * Persisted per browser under "drafthr.reviews.v1".
 */

export type ReviewKind = "team" | "trusted" | "expert";

export type ReviewRequestStatus = "out" | "back" | "recalled" | "finished";

/** The reviewer's verdict on a round. */
export type ReviewVerdict = "ready" | "ready-with-changes" | "rethink";

export const REVIEW_VERDICT_LABELS: Record<ReviewVerdict, string> = {
  ready: "Ready to send as it is",
  "ready-with-changes": "Ready once my changes are in",
  rethink: "Needs a rethink",
};

/** The verdict as the person who asked reads it ("Ready once the changes are in"). */
export const REVIEW_VERDICT_ASKER_LABELS: Record<ReviewVerdict, string> = {
  ready: "Ready to send as it is",
  "ready-with-changes": "Ready once the changes are in",
  rethink: "Needs a rethink",
};

export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  team: "Someone in your team",
  trusted: "Someone you trust",
  expert: "A DraftHR expert",
};

export type ReviewerRef = {
  name: string;
  email?: string;
  /** "Head of HR", "Chartered MCIPD · DraftHR expert", "Solicitor". */
  role?: string;
  /** team: the collaborator on the draft. */
  collaboratorId?: string;
  /** team: the workspace user, when known. */
  userId?: string;
  /** expert: the marketplace profile. */
  consultantId?: string;
};

/** What the reviewer can see. The letter is always shared. */
export type ReviewShare = {
  letter: true;
  evidence: boolean;
  hearingNotes: boolean;
};

/** A message between the person who asked and the reviewer. */
export type ReviewMessage = {
  id: string;
  from: "asker" | "reviewer";
  name: string;
  body: string;
  at: number;
};

/** Something that happened to the request (the reviewer card's live timeline). */
export type ReviewEventKind =
  | "sent"
  | "link-sent"
  | "opened"
  | "requested"
  | "accepted"
  | "paid"
  | "declined"
  | "back"
  | "sent-back"
  | "recalled"
  | "finished"
  | "approved";

export type ReviewEvent = {
  id: string;
  kind: ReviewEventKind;
  at: number;
  detail?: string;
};

/** What you did with one of the reviewer's points. */
export type ReviewPointDecision = "accepted" | "rejected" | "resolved";

/** One of the reviewer's points, as it was when the round came back. */
export type ReviewPointSnapshot = {
  /** The suggestion's pending-change id, or the comment id. */
  id: string;
  kind: "suggestion" | "comment";
  sectionId?: string;
  title: string;
  where?: string;
};

export type ReviewRound = {
  /** 1-based. */
  n: number;
  sentAt: number;
  /** On rounds after the first: the question you sent back with. */
  question?: string;
  backAt?: number;
  verdict?: ReviewVerdict;
  note?: string;
  /** Ids of the reviewer's suggestion marks on the draft (data-suggestion-id). */
  suggestionIds: string[];
  /** Ids of the reviewer's comments on the draft. */
  commentIds: string[];
  /** The reviewer's points as they came back (titles survive accepting). */
  points?: ReviewPointSnapshot[];
  /** Your decision on each point, by point id. */
  decisions?: Record<string, { decision: ReviewPointDecision; at: number }>;
};

export type ReviewRequest = {
  id: string;
  draftId: string;
  kind: ReviewKind;
  reviewer: ReviewerRef;
  /** "What should they look at?" */
  ask?: string;
  /** Back-by date and time, ISO 8601. */
  dueAt?: string;
  share: ReviewShare;
  status: ReviewRequestStatus;
  rounds: ReviewRound[];
  /** expert: the booking behind it (bookings flow). */
  bookingId?: string;
  /** trusted: the secure link's id on the server (never the token itself). */
  trustedLinkId?: string;
  /** expert: agreed price in pence, VAT included. */
  pricePence?: number;
  /** expert: the turnaround chosen when booking. */
  turnaround?: "standard" | "priority";
  /** Who asked (shown to the reviewer: "<name> asked you to look at"). */
  asker?: { name: string; email?: string; userId?: string };
  /** team: the reviewer can approve at the end of the review (no separate step). */
  approveInSameStep?: boolean;
  /** team: when the reviewer approved in the same step. */
  approvedAt?: number;
  /** trusted: the link as issued to you once (for "Copy link"). Kept in this browser only. */
  trustedLinkUrl?: string;
  /** trusted: when the link stops working. */
  linkExpiresAt?: number;
  /** trusted: whether the link email went out. */
  linkEmailed?: boolean;
  /** When the reviewer first opened it. */
  openedAt?: number;
  /** expert: the expert declined, with their reason. */
  declinedAt?: number;
  declineReason?: string;
  /** expert: your rating of the review, 1 to 5. */
  rating?: number;
  /** The message thread with the reviewer (team and trusted; experts use the booking's). */
  messages?: ReviewMessage[];
  /** What happened, oldest first. */
  events?: ReviewEvent[];
  /** trusted and expert: ids of the reviewer's points (from the server)
   *  already added to the letter here, so a sync never adds one twice. */
  remoteApplied?: string[];
  /** A copy of a request made on another device (the teammate's view). */
  importedAt?: number;
  createdAt: number;
  updatedAt: number;
  recalledAt?: number;
  finishedAt?: number;
};

export type NewReviewRequest = {
  /** Use this id (a server link was made for it first). Default: a new one. */
  id?: string;
  draftId: string;
  kind: ReviewKind;
  reviewer: ReviewerRef;
  ask?: string;
  dueAt?: string;
  share?: Partial<Omit<ReviewShare, "letter">>;
  bookingId?: string;
  trustedLinkId?: string;
  pricePence?: number;
  turnaround?: "standard" | "priority";
  asker?: { name: string; email?: string; userId?: string };
  approveInSameStep?: boolean;
  trustedLinkUrl?: string;
  linkExpiresAt?: number;
  linkEmailed?: boolean;
  /** The first event on the timeline (default: "sent", trusted "link-sent", expert "requested"). */
  firstEvent?: ReviewEventKind;
};

export type ReviewBackInput = {
  verdict?: ReviewVerdict;
  note?: string;
  suggestionIds?: string[];
  commentIds?: string[];
  points?: ReviewPointSnapshot[];
};

type ReviewStore = {
  requests: Record<string, ReviewRequest>;
  /** Send a draft out for review. Any other open request on the draft is
   *  recalled first, so a draft has at most one open request. Returns the id. */
  createReview: (input: NewReviewRequest) => string;
  /** The reviewer sent the current round back. */
  markBack: (id: string, input?: ReviewBackInput) => void;
  /** Send it back to the reviewer with a question: starts a new round. */
  sendBack: (id: string, question?: string) => void;
  /** Take it back before the reviewer finishes. */
  recall: (id: string) => void;
  /** You are done with the review; the letter moves on to approval. */
  finish: (id: string) => void;
  /** Patch fields (reviewer details, due date, booking id). */
  updateReview: (id: string, patch: Partial<Omit<ReviewRequest, "id" | "draftId" | "createdAt">>) => void;
  /** Add a message to the thread. Returns its id, or null for an empty one. */
  addMessage: (
    id: string,
    input: { from: ReviewMessage["from"]; name: string; body: string; at?: number; id?: string }
  ) => string | null;
  /** Record that something happened (once per kind and round unless repeat is set). */
  logEvent: (id: string, kind: ReviewEventKind, opts?: { at?: number; detail?: string; repeat?: boolean }) => void;
  /** Record your decision on a point of the current round (null clears it). */
  decide: (id: string, pointId: string, decision: ReviewPointDecision | null) => void;
  /** The expert declined: the request is withdrawn and the letter is ready again. */
  markDeclined: (id: string, reason?: string) => void;
  /** Keep a copy of a request made on another device (the teammate's view
   *  of a review they were asked to do). Replaces an older copy. */
  importReview: (request: ReviewRequest) => void;
  /** Drop every request for a draft (the draft was deleted). */
  clearDraft: (draftId: string) => void;
};

/** A new review request id ("rvw_…"). */
export function newReviewId(): string {
  return rid();
}

function rid(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `rvw_${rand}`;
}

function eid(prefix = "rev"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rand}`;
}

const OPEN: ReviewRequestStatus[] = ["out", "back"];

function patchRequest(
  requests: Record<string, ReviewRequest>,
  id: string,
  fn: (r: ReviewRequest, now: number) => ReviewRequest
): Record<string, ReviewRequest> {
  const r = requests[id];
  if (!r) return requests;
  const now = Date.now();
  const next = fn(r, now);
  if (next === r) return requests;
  return { ...requests, [id]: { ...next, updatedAt: now } };
}

function withEvent(r: ReviewRequest, kind: ReviewEventKind, at: number, detail?: string): ReviewEvent[] {
  return [...(r.events ?? []), { id: eid(), kind, at, detail }];
}

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set, get) => ({
      requests: {},

      createReview: (input) => {
        const id = input.id && !get().requests[input.id] ? input.id : rid();
        const now = Date.now();
        set((s) => {
          const next: Record<string, ReviewRequest> = { ...s.requests };
          for (const r of Object.values(next)) {
            if (r.draftId === input.draftId && OPEN.includes(r.status)) {
              next[r.id] = {
                ...r,
                status: "recalled",
                recalledAt: now,
                updatedAt: now,
                events: withEvent(r, "recalled", now),
              };
            }
          }
          const first: ReviewEventKind =
            input.firstEvent ?? (input.kind === "trusted" ? "link-sent" : input.kind === "expert" ? "requested" : "sent");
          next[id] = {
            id,
            draftId: input.draftId,
            kind: input.kind,
            reviewer: input.reviewer,
            ask: input.ask?.trim() || undefined,
            dueAt: input.dueAt,
            share: {
              letter: true,
              evidence: input.share?.evidence ?? true,
              hearingNotes: input.share?.hearingNotes ?? false,
            },
            status: "out",
            rounds: [{ n: 1, sentAt: now, suggestionIds: [], commentIds: [] }],
            bookingId: input.bookingId,
            trustedLinkId: input.trustedLinkId,
            pricePence: input.pricePence,
            turnaround: input.turnaround,
            asker: input.asker,
            approveInSameStep: input.kind === "team" ? input.approveInSameStep : undefined,
            trustedLinkUrl: input.trustedLinkUrl,
            linkExpiresAt: input.linkExpiresAt,
            linkEmailed: input.linkEmailed,
            messages: [],
            events: [{ id: eid(), kind: first, at: now }],
            createdAt: now,
            updatedAt: now,
          };
          return { requests: next };
        });
        return id;
      },

      markBack: (id, input = {}) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) => {
            if (r.status !== "out") return r;
            const rounds = r.rounds.slice();
            const last = rounds[rounds.length - 1] ?? { n: 1, sentAt: r.createdAt, suggestionIds: [], commentIds: [] };
            rounds[rounds.length - 1] = {
              ...last,
              backAt: now,
              verdict: input.verdict ?? last.verdict,
              note: input.note?.trim() || last.note,
              suggestionIds: input.suggestionIds ?? last.suggestionIds,
              commentIds: input.commentIds ?? last.commentIds,
              points: input.points ?? last.points,
            };
            return { ...r, status: "back", rounds, events: withEvent(r, "back", now) };
          }),
        })),

      sendBack: (id, question) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) => {
            if (r.status !== "back") return r;
            return {
              ...r,
              status: "out",
              events: withEvent(r, "sent-back", now, question?.trim() || undefined),
              rounds: [
                ...r.rounds,
                {
                  n: r.rounds.length + 1,
                  sentAt: now,
                  question: question?.trim() || undefined,
                  suggestionIds: [],
                  commentIds: [],
                },
              ],
            };
          }),
        })),

      recall: (id) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) =>
            OPEN.includes(r.status)
              ? { ...r, status: "recalled", recalledAt: now, events: withEvent(r, "recalled", now) }
              : r
          ),
        })),

      finish: (id) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) =>
            r.status === "back" || r.status === "out"
              ? { ...r, status: "finished", finishedAt: now, events: withEvent(r, "finished", now) }
              : r
          ),
        })),

      updateReview: (id, patch) =>
        set((s) => ({ requests: patchRequest(s.requests, id, (r) => ({ ...r, ...patch })) })),

      addMessage: (id, input) => {
        const body = input.body.trim().slice(0, 4000);
        const req = get().requests[id];
        if (!body || !req) return null;
        if (input.id && req.messages?.some((m) => m.id === input.id)) return input.id;
        const mid = input.id ?? eid("msg");
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) => ({
            ...r,
            messages: [...(r.messages ?? []), { id: mid, from: input.from, name: input.name, body, at: input.at ?? now }].sort(
              (a, b) => a.at - b.at
            ),
          })),
        }));
        return mid;
      },

      logEvent: (id, kind, opts = {}) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) => {
            const events = r.events ?? [];
            if (!opts.repeat) {
              // Once per round: "opened" in round 1 does not hide one in round 2.
              const roundStart = currentRound(r)?.sentAt ?? r.createdAt;
              if (events.some((e) => e.kind === kind && e.at >= roundStart)) return r;
            }
            const at = opts.at ?? now;
            const next: ReviewRequest = {
              ...r,
              events: [...events, { id: eid(), kind, at, detail: opts.detail }].sort((a, b) => a.at - b.at),
            };
            if (kind === "opened" && !r.openedAt) next.openedAt = at;
            if (kind === "approved") next.approvedAt = at;
            return next;
          }),
        })),

      decide: (id, pointId, decision) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) => {
            const rounds = r.rounds.slice();
            const last = rounds[rounds.length - 1];
            if (!last) return r;
            const decisions = { ...(last.decisions ?? {}) };
            if (decision) decisions[pointId] = { decision, at: now };
            else delete decisions[pointId];
            rounds[rounds.length - 1] = { ...last, decisions };
            return { ...r, rounds };
          }),
        })),

      markDeclined: (id, reason) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) =>
            OPEN.includes(r.status)
              ? {
                  ...r,
                  status: "recalled",
                  recalledAt: now,
                  declinedAt: now,
                  declineReason: reason?.trim() || undefined,
                  events: withEvent(r, "declined", now, reason?.trim() || undefined),
                }
              : r
          ),
        })),

      importReview: (request) =>
        set((s) => {
          const prev = s.requests[request.id];
          // Never overwrite the asker's own copy, only an earlier import.
          if (prev && (!prev.importedAt || prev.updatedAt >= request.updatedAt)) return s;
          return { requests: { ...s.requests, [request.id]: request } };
        }),

      clearDraft: (draftId) =>
        set((s) => {
          const next: Record<string, ReviewRequest> = {};
          for (const r of Object.values(s.requests)) if (r.draftId !== draftId) next[r.id] = r;
          return { requests: next };
        }),
    }),
    {
      name: "drafthr.reviews.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ requests: s.requests }),
    }
  )
);

/* ------------------------------------------------------------------ */
/*  Reads                                                              */
/* ------------------------------------------------------------------ */

/** Every request for a draft, newest first. Pure: pass the requests map. */
export function reviewsForDraft(
  requests: Record<string, ReviewRequest>,
  draftId: string
): ReviewRequest[] {
  return Object.values(requests)
    .filter((r) => r.draftId === draftId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** The open request (out with the reviewer, or back with you), if any. */
export function activeReviewIn(
  requests: Record<string, ReviewRequest>,
  draftId: string
): ReviewRequest | null {
  return reviewsForDraft(requests, draftId).find((r) => OPEN.includes(r.status)) ?? null;
}

/** The newest request that was not recalled (open or finished), if any.
 *  This is what the journey reads: a finished review means the Review step
 *  is done. */
export function latestReviewIn(
  requests: Record<string, ReviewRequest>,
  draftId: string
): ReviewRequest | null {
  return reviewsForDraft(requests, draftId).find((r) => r.status !== "recalled") ?? null;
}

/** The newest request of any status (recalled included), if any. */
export function newestReviewIn(
  requests: Record<string, ReviewRequest>,
  draftId: string
): ReviewRequest | null {
  return reviewsForDraft(requests, draftId)[0] ?? null;
}

/** Every request for a draft, newest first. */
export function getReviewsForDraft(draftId: string): ReviewRequest[] {
  return reviewsForDraft(useReviewStore.getState().requests, draftId);
}

/** The open review request for a draft (status out or back), or null. */
export function getActiveReview(draftId: string): ReviewRequest | null {
  return activeReviewIn(useReviewStore.getState().requests, draftId);
}

/** The newest non-recalled request (out, back or finished), or null. */
export function getLatestReview(draftId: string): ReviewRequest | null {
  return latestReviewIn(useReviewStore.getState().requests, draftId);
}

/** React: the open review request for a draft, or null. */
export function useActiveReview(draftId: string | undefined): ReviewRequest | null {
  const requests = useReviewStore((s) => s.requests);
  return useMemo(() => (draftId ? activeReviewIn(requests, draftId) : null), [requests, draftId]);
}

/** React: the newest non-recalled request for a draft, or null. */
export function useLatestReview(draftId: string | undefined): ReviewRequest | null {
  const requests = useReviewStore((s) => s.requests);
  return useMemo(() => (draftId ? latestReviewIn(requests, draftId) : null), [requests, draftId]);
}

/** React: the newest request of any status (for "recalled" and "declined" lines). */
export function useNewestReview(draftId: string | undefined): ReviewRequest | null {
  const requests = useReviewStore((s) => s.requests);
  return useMemo(() => (draftId ? newestReviewIn(requests, draftId) : null), [requests, draftId]);
}

/** React: every request for a draft, newest first. */
export function useReviewsForDraft(draftId: string | undefined): ReviewRequest[] {
  const requests = useReviewStore((s) => s.requests);
  return useMemo(() => (draftId ? reviewsForDraft(requests, draftId) : []), [requests, draftId]);
}

/** The current (last) round of a request. */
export function currentRound(r: ReviewRequest): ReviewRound | undefined {
  return r.rounds[r.rounds.length - 1];
}

/** First name for short labels ("With Claire"). */
export function firstName(name: string | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}
