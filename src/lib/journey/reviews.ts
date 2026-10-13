import { useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Review requests: the optional Review step of the letter journey.
 *
 * Contract (design/build/phase3/brief.md section 5). The foundation created
 * these types and a working minimal store; the review builder owns this file
 * afterwards and may extend it, but must keep every exported name.
 *
 * A request is one ask for a second look at one draft:
 *   kind      team     someone in your workspace (free; can approve in the same step)
 *             trusted  the person's own solicitor or HR consultant (secure link, no account)
 *             expert   a DraftHR marketplace expert (a booking, paid when they accept)
 *   status    out      with the reviewer; editing is paused
 *             back     the reviewer sent it back; your turn to decide
 *             recalled you took it back before they finished
 *             finished you finished the review; the letter moves on to approval
 * Every round is kept: each send-back starts a new round with its own
 * verdict, note and the ids of the reviewer's suggestions and comments
 * (those live on the draft, in its sections and comments).
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
  createdAt: number;
  updatedAt: number;
  recalledAt?: number;
  finishedAt?: number;
};

export type NewReviewRequest = {
  draftId: string;
  kind: ReviewKind;
  reviewer: ReviewerRef;
  ask?: string;
  dueAt?: string;
  share?: Partial<Omit<ReviewShare, "letter">>;
  bookingId?: string;
  trustedLinkId?: string;
  pricePence?: number;
};

export type ReviewBackInput = {
  verdict?: ReviewVerdict;
  note?: string;
  suggestionIds?: string[];
  commentIds?: string[];
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
  /** Drop every request for a draft (the draft was deleted). */
  clearDraft: (draftId: string) => void;
};

function rid(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `rvw_${rand}`;
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
  return { ...requests, [id]: { ...fn(r, now), updatedAt: now } };
}

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set) => ({
      requests: {},

      createReview: (input) => {
        const id = rid();
        const now = Date.now();
        set((s) => {
          const next: Record<string, ReviewRequest> = { ...s.requests };
          for (const r of Object.values(next)) {
            if (r.draftId === input.draftId && OPEN.includes(r.status)) {
              next[r.id] = { ...r, status: "recalled", recalledAt: now, updatedAt: now };
            }
          }
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
            };
            return { ...r, status: "back", rounds };
          }),
        })),

      sendBack: (id, question) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) => {
            if (r.status !== "back") return r;
            return {
              ...r,
              status: "out",
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
            OPEN.includes(r.status) ? { ...r, status: "recalled", recalledAt: now } : r
          ),
        })),

      finish: (id) =>
        set((s) => ({
          requests: patchRequest(s.requests, id, (r, now) =>
            r.status === "back" || r.status === "out" ? { ...r, status: "finished", finishedAt: now } : r
          ),
        })),

      updateReview: (id, patch) =>
        set((s) => ({ requests: patchRequest(s.requests, id, (r) => ({ ...r, ...patch })) })),

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
