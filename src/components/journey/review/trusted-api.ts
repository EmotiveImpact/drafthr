/**
 * Client for the secure review link endpoints (/api/store/review-links).
 * Every call soft-fails into { ok: false, message } with plain words the
 * screens show as they are; nothing here throws.
 */
import { toServerUuid } from "@/lib/remote-ids";
import type { ReviewVerdict } from "@/lib/journey/reviews";

export const REVIEW_LINKS_PATH = "/api/store/review-links";

/** How long a link lasts unless the back-by needs longer (matches the server). */
export const LINK_TTL_DAYS = 7;

export type LinkResult<T> = { ok: true; data: T } | { ok: false; message: string; status: number; code?: string };

const NOT_READY =
  "Secure links aren't available right now. Try again later or choose someone in your team.";

async function call<T>(op: string, init?: RequestInit & { query?: Record<string, string> }): Promise<LinkResult<T>> {
  const qs = new URLSearchParams({ op, ...(init?.query ?? {}) });
  try {
    const res = await fetch(`${REVIEW_LINKS_PATH}?${qs.toString()}`, {
      credentials: "same-origin",
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
    });
    const ct = res.headers.get("content-type") ?? "";
    const body = ct.includes("application/json") ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : null;
    if (!body) return { ok: false, message: NOT_READY, status: res.status || 0, code: "not-ready" };
    if (res.status === 401) {
      return { ok: false, status: 401, code: "signed-out", message: "Sign in to DraftHR to send a letter out for review." };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: typeof body.code === "string" ? body.code : undefined,
        message: typeof body.error === "string" ? body.error : NOT_READY,
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, message: NOT_READY, status: 0, code: "network" };
  }
}

/* ---------------- The person who asked (signed in) ---------------- */

export type CreatedLink = {
  linkId: string;
  /** trusted: the secure link (returned once; only its hash is stored). */
  url?: string;
  expiresAt?: number;
  /** trusted: whether the email with the link went out. */
  emailed?: boolean;
};

export type NewLinkInput = {
  kind: "team" | "trusted" | "expert";
  draftId: string;
  reviewId: string;
  reviewerName: string;
  reviewerEmail?: string;
  /** team: the workspace user asked to review. */
  reviewerUserId?: string;
  /** expert: the booking behind the review. */
  bookingId?: string;
  ask?: string;
  dueAt?: string;
  approveInSameStep?: boolean;
  share: { evidence: boolean; hearingNotes: boolean };
  /** Who asked, as the reviewer reads it. */
  askerName?: string;
  /** trusted and expert: the letter as sent (the reviewer reads this version). */
  letter?: LetterSnapshot;
  /** trusted and expert: the files you chose to share, and only those. */
  evidence?: EvidenceSnapshot[];
};

export type LetterSnapshot = {
  title: string;
  letterType: string;
  jurisdiction: string | null;
  mode: string;
  company: string;
  /** The letterhead's address, as the letter shows it. */
  companyAddress?: string;
  /** What it is about, for the chips above the letter. */
  about?: { matter?: string; employee?: string };
  sections: { id: string; title: string; html: string; position: number }[];
};

export type EvidenceSnapshot = {
  id: string;
  name: string;
  kind: string;
  content: string;
  dataUrl?: string;
  /** Which tick shared it: the evidence files, or the hearing notes. */
  group?: "file" | "hearing-notes";
};

/** Record a review on the server. trusted: issues the secure link and emails it. */
export function createReviewLink(input: NewLinkInput): Promise<LinkResult<CreatedLink>> {
  return call<CreatedLink>("create", {
    method: "POST",
    body: JSON.stringify({ ...input, draftId: toServerUuid(input.draftId) }),
  });
}

/** The secure link for someone you trust. */
export function createTrustedLink(input: Omit<NewLinkInput, "kind">): Promise<LinkResult<CreatedLink>> {
  return createReviewLink({ ...input, kind: "trusted" });
}

export function revokeTrustedLink(linkId: string, reason: "recalled" | "finished"): Promise<LinkResult<{ ok: true }>> {
  return call("revoke", { method: "POST", body: JSON.stringify({ linkId, reason }) });
}

export type RemotePoint = {
  id: string;
  kind: "suggestion" | "comment";
  sectionId: string;
  round: number;
  note?: string;
  quote?: string;
  proposedHtml?: string;
  title?: string;
  at: number;
  removed?: boolean;
};

export type RemoteMessage = { id: string; from: "asker" | "reviewer"; name: string; body: string; at: number };

export type RemoteRound = {
  n: number;
  sentAt: number;
  question?: string;
  backAt?: number;
  verdict?: ReviewVerdict;
  note?: string;
  /** team: the points as sent back (their content is on the draft). */
  points?: SentPoint[];
};

export type LinkState = {
  status: "out" | "back" | "recalled" | "finished";
  /** team: when the teammate approved in the same step. */
  approvedAt?: number | null;
  openedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  rounds: RemoteRound[];
  messages: RemoteMessage[];
  points: RemotePoint[];
};

export function getTrustedLinkStatus(q: { linkId?: string; bookingId?: string }): Promise<LinkResult<LinkState>> {
  const query: Record<string, string> = {};
  if (q.linkId) query.linkId = q.linkId;
  if (q.bookingId) query.bookingId = q.bookingId;
  return call<LinkState>("status", { query });
}

/** Round n+1: your question, and the letter as it reads now. */
export function askAgain(linkId: string, question: string, letter?: LetterSnapshot): Promise<LinkResult<{ ok: true }>> {
  return call("ask", { method: "POST", body: JSON.stringify({ linkId, question, letter }) });
}

/** `id` is the message's id here, so the copy that comes back is not added twice. */
export function messageReviewer(
  linkId: string,
  text: string,
  id?: string
): Promise<LinkResult<{ messages: RemoteMessage[] }>> {
  return call("message", { method: "POST", body: JSON.stringify({ linkId, text, id }) });
}

/* ---------------- The reviewer (no account, token only) ---------------- */

export type OpenedLink = {
  linkId: string;
  letter: LetterSnapshot;
  asker: { name: string };
  reviewer: { name: string };
  ask: string | null;
  dueAt: number | null;
  expiresAt: number;
  evidence: EvidenceSnapshot[];
  state: LinkState;
};

export function openLink(token: string): Promise<LinkResult<OpenedLink>> {
  return call<OpenedLink>("open", { query: { token } });
}

export type ReviewerAction =
  | { action: "suggest"; sectionId: string; proposedHtml: string; note?: string; quote?: string; title?: string }
  | { action: "comment"; sectionId: string; note: string; quote?: string }
  | { action: "remove"; pointId: string }
  | { action: "message"; text: string; id?: string }
  | { action: "send-back"; verdict: ReviewVerdict; note?: string; points?: SentPoint[] };

/** A point as sent back (team: the point itself lives on the draft). */
export type SentPoint = { id: string; kind: "suggestion" | "comment"; sectionId?: string; title: string; where?: string };

export function actOnLink(token: string, act: ReviewerAction): Promise<LinkResult<{ state: LinkState }>> {
  return call<{ state: LinkState }>("act", { method: "POST", query: { token }, body: JSON.stringify(act) });
}

/* ---------------- A teammate (signed in, in the same workspace) ---------------- */

export type AssignedReview = {
  linkId: string;
  reviewId: string;
  draftId: string;
  asker: { name: string; email?: string; userId?: string };
  reviewer: { name: string; email?: string; userId?: string };
  ask: string | null;
  dueAt: string | null;
  approveInSameStep: boolean;
  share: { evidence: boolean; hearingNotes: boolean };
  createdAt: number;
  state: LinkState;
};

/** Reviews you were asked to do on a letter (made on the asker's device). */
export function assignedReviews(draftId: string): Promise<LinkResult<{ reviews: AssignedReview[] }>> {
  return call<{ reviews: AssignedReview[] }>("assigned", { query: { draftId: toServerUuid(draftId) } });
}

/** A teammate's send-back, message or "opened" (their points live on the draft). */
export function actAsTeammate(
  linkId: string,
  act: ReviewerAction | { action: "opened" } | { action: "approve" }
): Promise<LinkResult<{ state: LinkState }>> {
  return call<{ state: LinkState }>("team-act", { method: "POST", query: { linkId }, body: JSON.stringify(act) });
}

/* ---------------- The expert (signed in as the booked consultant) ---------------- */

export type ExpertReview = {
  linkId: string;
  asker: { name: string };
  ask: string | null;
  dueAt: number | null;
  /** The letter as HR shared it with the booking. */
  letter: LetterSnapshot;
  /** Only the files HR chose to share. */
  evidence: EvidenceSnapshot[];
  state: LinkState;
};

export function openExpertReview(bookingId: string): Promise<LinkResult<ExpertReview>> {
  return call<ExpertReview>("expert-open", { query: { bookingId } });
}

export function actAsExpert(bookingId: string, act: ReviewerAction): Promise<LinkResult<{ state: LinkState }>> {
  return call<{ state: LinkState }>("expert-act", { method: "POST", query: { bookingId }, body: JSON.stringify(act) });
}
