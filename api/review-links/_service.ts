/**
 * The review-links service: everything the endpoint does, behind a small
 * storage port so the rules are tested without a database.
 *
 * Security model
 *   - A trusted link's token is 256 random bits ("rvl_" + base64url). Only
 *     its SHA-256 hash is stored; the token is returned once to the asker
 *     and put in the email.
 *   - Resolving a token checks the hash, that the link is a trusted one,
 *     not revoked (recall), not finished, and not past its expiry.
 *   - With a token the reviewer can only suggest, comment, remove their own
 *     point, message and send back. Nothing else is accepted: no edit to
 *     the letter, no approval, no export.
 *   - Signed-in callers are bound to their row: the asker by tenant and
 *     user, a teammate by reviewer_user_id and tenant, an expert by being
 *     the consultant on the paid booking.
 *   - The letter and files come from the snapshot the asker shared; files
 *     the asker did not tick are never stored, and are filtered again on
 *     the way out.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { NewReviewLinkRow, ReviewLinkRow } from "./_table.js";

/* ------------------------------------------------------------------ */
/*  Shapes                                                             */
/* ------------------------------------------------------------------ */

export type Kind = "team" | "trusted" | "expert";
export type Verdict = "ready" | "ready-with-changes" | "rethink";
const VERDICTS: Verdict[] = ["ready", "ready-with-changes", "rethink"];

export type LetterDoc = {
  title: string;
  letterType: string;
  jurisdiction: string | null;
  mode: string;
  company: string;
  companyAddress?: string;
  about?: { matter?: string; employee?: string };
  sections: { id: string; title: string; html: string; position: number }[];
};

export type EvidenceDoc = {
  id: string;
  name: string;
  kind: string;
  content: string;
  dataUrl?: string;
  /** Which tick shared it. */
  group: "file" | "hearing-notes";
};

export type SentPoint = { id: string; kind: "suggestion" | "comment"; sectionId?: string; title: string; where?: string };

export type RoundDoc = {
  n: number;
  sentAt: number;
  question?: string;
  backAt?: number;
  verdict?: Verdict;
  note?: string;
  points?: SentPoint[];
};

export type MessageDoc = { id: string; from: "asker" | "reviewer"; name: string; body: string; at: number };

export type PointDoc = {
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

export type StateDoc = { rounds: RoundDoc[]; messages: MessageDoc[]; points: PointDoc[] };

export type LinkStateView = {
  status: ReviewLinkRow["status"];
  approvedAt: number | null;
  openedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  rounds: RoundDoc[];
  messages: MessageDoc[];
  points: PointDoc[];
};

export type ReviewerAct =
  | { action: "suggest"; sectionId: string; proposedHtml: string; note?: string; quote?: string; title?: string }
  | { action: "comment"; sectionId: string; note: string; quote?: string }
  | { action: "remove"; pointId: string }
  | { action: "message"; text: string; id?: string }
  | { action: "send-back"; verdict: Verdict; note?: string; points?: SentPoint[] };

/* ------------------------------------------------------------------ */
/*  Ports                                                              */
/* ------------------------------------------------------------------ */

export interface ReviewLinkRepo {
  insert(row: NewReviewLinkRow): Promise<ReviewLinkRow>;
  findById(id: string): Promise<ReviewLinkRow | null>;
  findByTokenHash(hash: string): Promise<ReviewLinkRow | null>;
  findByClientReview(tenantId: string, clientReviewId: string): Promise<ReviewLinkRow | null>;
  /** The newest link for a booking. */
  findByBooking(bookingId: string): Promise<ReviewLinkRow | null>;
  /** Team links on a letter for this reviewer, in this workspace. */
  findAssigned(tenantId: string, draftId: string, reviewerUserId: string): Promise<ReviewLinkRow[]>;
  update(id: string, patch: Partial<NewReviewLinkRow>): Promise<ReviewLinkRow | null>;
}

export type BookingFacts = {
  id: string;
  tenantId: string;
  requesterUserId: string;
  consultantUserId: string;
  status: "requested" | "accepted" | "declined" | "delivered" | "completed";
  paid: boolean;
};

export interface Directory {
  /** An active member of the workspace. */
  isMember(tenantId: string, userId: string): Promise<boolean>;
  booking(bookingId: string): Promise<BookingFacts | null>;
}

export type Mailer = (to: string, subject: string, html: string) => Promise<boolean>;

export type Ctx = {
  repo: ReviewLinkRepo;
  dir: Directory;
  now?: () => number;
};

/** The signed-in caller. */
export type Actor = { userId: string; tenantId: string | null; name: string };

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */

export class LinkError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const NOT_READY_MESSAGE =
  "Secure links aren't available right now. Try again later or choose someone in your team.";

/** The table isn't there (migration not run) or the database is off. */
export function isNotReady(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  if (e.code === "42P01") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  if (/relation "?review_links"? does not exist/i.test(msg)) return true;
  if (/DATABASE_URL is not configured/i.test(msg)) return true;
  return e.cause ? isNotReady(e.cause) : false;
}

const NOT_ALLOWED = "Reviewers can suggest changes and comment, but can't change, approve or send the letter.";

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */

const TOKEN_RE = /^rvl_[A-Za-z0-9_-]{43}$/;

export function newToken(): string {
  return `rvl_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const LINK_TTL_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;
const MAX_TTL_DAYS = 30;

/** 7 days, or until two days after the back-by when that is later (30 at most). */
export function linkExpiry(now: number, dueAt: number | null): number {
  const base = now + LINK_TTL_DAYS * DAY;
  const wanted = dueAt ? Math.max(base, dueAt + 2 * DAY) : base;
  return Math.min(wanted, now + MAX_TTL_DAYS * DAY);
}

/* ------------------------------------------------------------------ */
/*  Input cleaning                                                     */
/* ------------------------------------------------------------------ */

const MAX_NAME = 120;
const MAX_TEXT = 4000;
const MAX_HTML = 200_000;
const MAX_SECTIONS = 200;
const MAX_EVIDENCE = 50;
const MAX_EVIDENCE_TEXT = 20_000;
const MAX_DATA_URL = 1_500_000;
const MAX_POINTS = 300;
const MAX_MESSAGES = 500;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function optStr(v: unknown, max: number): string | undefined {
  const s = str(v, max);
  return s || undefined;
}

/** Strip anything executable from suggested html (the letter is html). */
export function cleanHtml(v: unknown): string {
  const html = typeof v === "string" ? v.slice(0, MAX_HTML) : "";
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

function cleanLetter(v: unknown): LetterDoc | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  const sections = Array.isArray(l.sections) ? l.sections.slice(0, MAX_SECTIONS) : [];
  const out: LetterDoc = {
    title: str(l.title, 200) || "Letter",
    letterType: str(l.letterType, 80),
    jurisdiction: optStr(l.jurisdiction, 40) ?? null,
    mode: str(l.mode, 20) || "employer",
    company: str(l.company, 200),
    companyAddress: optStr(l.companyAddress, 300),
    about: cleanAbout(l.about),
    sections: sections
      .map((s, i) => {
        const r = (s ?? {}) as Record<string, unknown>;
        return {
          id: str(r.id, 80),
          title: str(r.title, 200),
          html: cleanHtml(r.html),
          position: typeof r.position === "number" && Number.isFinite(r.position) ? r.position : i,
        };
      })
      .filter((s) => s.id),
  };
  return out.sections.length ? out : null;
}

function cleanAbout(v: unknown): LetterDoc["about"] {
  if (!v || typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  const out = { matter: optStr(a.matter, 120), employee: optStr(a.employee, 160) };
  return out.matter || out.employee ? out : undefined;
}

function cleanEvidence(v: unknown, share: { evidence: boolean; hearingNotes: boolean }): EvidenceDoc[] {
  if (!Array.isArray(v)) return [];
  const out: EvidenceDoc[] = [];
  for (const raw of v.slice(0, MAX_EVIDENCE)) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const group: EvidenceDoc["group"] = e.group === "hearing-notes" ? "hearing-notes" : "file";
    if (group === "file" && !share.evidence) continue;
    if (group === "hearing-notes" && !share.hearingNotes) continue;
    const id = str(e.id, 80);
    if (!id) continue;
    const dataUrl = typeof e.dataUrl === "string" && e.dataUrl.startsWith("data:") && e.dataUrl.length <= MAX_DATA_URL ? e.dataUrl : undefined;
    out.push({
      id,
      name: str(e.name, 200) || "File",
      kind: str(e.kind, 40) || "document",
      content: str(e.content, MAX_EVIDENCE_TEXT),
      ...(dataUrl ? { dataUrl } : {}),
      group,
    });
  }
  return out;
}

function cleanPoints(v: unknown): SentPoint[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_POINTS).flatMap((raw) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const id = str(p.id, 80);
    const kind = p.kind === "comment" ? "comment" : p.kind === "suggestion" ? "suggestion" : null;
    if (!id || !kind) return [];
    return [{ id, kind, sectionId: optStr(p.sectionId, 80), title: str(p.title, 200) || "Point", where: optStr(p.where, 200) }];
  });
}

function parseTime(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Views                                                              */
/* ------------------------------------------------------------------ */

function stateOf(row: ReviewLinkRow): StateDoc {
  const s = (row.state ?? {}) as Partial<StateDoc>;
  return {
    rounds: Array.isArray(s.rounds) ? s.rounds : [],
    messages: Array.isArray(s.messages) ? s.messages : [],
    points: Array.isArray(s.points) ? s.points : [],
  };
}

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

export function stateView(row: ReviewLinkRow): LinkStateView {
  const s = stateOf(row);
  return {
    status: row.status,
    approvedAt: ms(row.approvedAt),
    openedAt: ms(row.openedAt),
    expiresAt: ms(row.expiresAt),
    revokedAt: ms(row.revokedAt),
    rounds: s.rounds,
    messages: s.messages,
    points: s.points,
  };
}

function evidenceView(row: ReviewLinkRow): EvidenceDoc[] {
  const all = Array.isArray(row.evidence) ? (row.evidence as EvidenceDoc[]) : [];
  return all.filter((e) => (e.group === "hearing-notes" ? row.shareHearingNotes : row.shareEvidence));
}

function letterView(row: ReviewLinkRow): LetterDoc {
  const l = row.letter as LetterDoc;
  return { ...l, sections: [...(l.sections ?? [])].sort((a, b) => a.position - b.position) };
}

/* ------------------------------------------------------------------ */
/*  The asker (signed in)                                              */
/* ------------------------------------------------------------------ */

export type CreateInput = {
  kind?: unknown;
  draftId?: unknown;
  reviewId?: unknown;
  reviewerName?: unknown;
  reviewerEmail?: unknown;
  reviewerUserId?: unknown;
  bookingId?: unknown;
  askerName?: unknown;
  ask?: unknown;
  dueAt?: unknown;
  approveInSameStep?: unknown;
  share?: unknown;
  letter?: unknown;
  evidence?: unknown;
};

export type Created = { row: ReviewLinkRow; token?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireTenant(actor: Actor): string {
  if (!actor.tenantId) throw new LinkError("You need a workspace to send a letter for review.", 400, "no-workspace");
  return actor.tenantId;
}

export async function createLink(ctx: Ctx, actor: Actor, input: CreateInput): Promise<Created> {
  const tenantId = requireTenant(actor);
  const now = ctx.now?.() ?? Date.now();
  const kind = input.kind;
  if (kind !== "team" && kind !== "trusted" && kind !== "expert") throw new LinkError("Choose who reviews it.", 400, "bad-kind");
  const draftId = str(input.draftId, 40);
  if (!UUID_RE.test(draftId)) throw new LinkError("Invalid letter id.", 400, "bad-draft");
  const clientReviewId = str(input.reviewId, 80);
  if (!clientReviewId) throw new LinkError("Invalid review id.", 400, "bad-review");
  const reviewerName = str(input.reviewerName, MAX_NAME);
  if (!reviewerName) throw new LinkError("Enter the reviewer's name.", 400, "bad-name");
  const letter = cleanLetter(input.letter);
  if (!letter) throw new LinkError("The letter couldn't be shared. Try again.", 400, "bad-letter");
  const shareRaw = (input.share ?? {}) as Record<string, unknown>;
  const share = { evidence: shareRaw.evidence === true, hearingNotes: shareRaw.hearingNotes === true };
  const dueAt = parseTime(input.dueAt);

  let reviewerEmail: string | null = null;
  let reviewerUserId: string | null = null;
  let bookingId: string | null = null;
  if (kind === "trusted") {
    reviewerEmail = str(input.reviewerEmail, 254).toLowerCase();
    if (!EMAIL_RE.test(reviewerEmail)) throw new LinkError("Enter a valid email address.", 400, "bad-email");
  } else if (kind === "team") {
    reviewerUserId = str(input.reviewerUserId, 40);
    if (!UUID_RE.test(reviewerUserId) || !(await ctx.dir.isMember(tenantId, reviewerUserId))) {
      throw new LinkError("That person isn't in your workspace.", 403, "not-member");
    }
    reviewerEmail = optStr(input.reviewerEmail, 254)?.toLowerCase() ?? null;
  } else {
    bookingId = str(input.bookingId, 40);
    const b = UUID_RE.test(bookingId) ? await ctx.dir.booking(bookingId) : null;
    if (!b || b.requesterUserId !== actor.userId || b.tenantId !== tenantId) {
      throw new LinkError("Booking not found.", 404, "no-booking");
    }
  }

  const token = kind === "trusted" ? newToken() : undefined;
  const fields: Partial<NewReviewLinkRow> = {
    kind,
    draftId: draftId.toLowerCase(),
    reviewerName,
    reviewerEmail,
    reviewerUserId,
    bookingId,
    askerName: str(input.askerName, MAX_NAME) || actor.name || "Your colleague",
    ask: optStr(input.ask, MAX_TEXT) ?? null,
    dueAt: dueAt ? new Date(dueAt) : null,
    shareEvidence: share.evidence,
    shareHearingNotes: share.hearingNotes,
    approveInSameStep: kind === "team" && input.approveInSameStep === true,
    letter,
    evidence: cleanEvidence(input.evidence, share),
    tokenHash: token ? hashToken(token) : null,
    expiresAt: kind === "trusted" ? new Date(linkExpiry(now, dueAt)) : null,
    updatedAt: new Date(now),
  };

  // A retry of the same request (the reply was lost): reuse the row. A
  // trusted link gets a fresh token, as the first one can't be read back.
  const existing = await ctx.repo.findByClientReview(tenantId, clientReviewId);
  if (existing) {
    if (existing.askerUserId !== actor.userId) throw new LinkError("Review not found.", 404, "not-found");
    const row = await ctx.repo.update(existing.id, fields);
    return { row: row ?? existing, token };
  }
  const row = await ctx.repo.insert({
    ...(fields as NewReviewLinkRow),
    tenantId,
    clientReviewId,
    askerUserId: actor.userId,
    status: "out",
    state: { rounds: [{ n: 1, sentAt: now }], messages: [], points: [] } satisfies StateDoc,
    createdAt: new Date(now),
  });
  return { row, token };
}

/** The asker's own link (by id or by booking), in their workspace. */
async function askersRow(ctx: Ctx, actor: Actor, q: { linkId?: unknown; bookingId?: unknown }): Promise<ReviewLinkRow> {
  const tenantId = requireTenant(actor);
  const linkId = str(q.linkId, 40);
  const bookingId = str(q.bookingId, 40);
  const row = UUID_RE.test(linkId)
    ? await ctx.repo.findById(linkId)
    : UUID_RE.test(bookingId)
      ? await ctx.repo.findByBooking(bookingId)
      : null;
  if (!row || row.tenantId !== tenantId || row.askerUserId !== actor.userId) {
    throw new LinkError("Review not found.", 404, "not-found");
  }
  return row;
}

export async function revokeLink(ctx: Ctx, actor: Actor, body: { linkId?: unknown; reason?: unknown }): Promise<ReviewLinkRow> {
  const row = await askersRow(ctx, actor, body);
  const now = ctx.now?.() ?? Date.now();
  const status = body.reason === "finished" ? "finished" : "recalled";
  return (await ctx.repo.update(row.id, { status, revokedAt: row.revokedAt ?? new Date(now), updatedAt: new Date(now) })) ?? row;
}

export async function linkStatus(ctx: Ctx, actor: Actor, q: { linkId?: unknown; bookingId?: unknown }): Promise<LinkStateView> {
  return stateView(await askersRow(ctx, actor, q));
}

/** Round n+1: the asker's question, and the letter as it reads now. */
export async function askAgain(
  ctx: Ctx,
  actor: Actor,
  body: { linkId?: unknown; question?: unknown; letter?: unknown },
): Promise<ReviewLinkRow> {
  const row = await askersRow(ctx, actor, body);
  if (row.status !== "back") throw new LinkError("It isn't back with you, so it can't be sent back yet.", 409, "not-back");
  const now = ctx.now?.() ?? Date.now();
  const question = str(body.question, MAX_TEXT);
  if (!question) throw new LinkError("Write a question or note to send back.", 400, "no-question");
  const s = stateOf(row);
  const n = (s.rounds.at(-1)?.n ?? 0) + 1;
  const letter = cleanLetter(body.letter);
  return (
    (await ctx.repo.update(row.id, {
      status: "out",
      state: { ...s, rounds: [...s.rounds, { n, sentAt: now, question }] },
      ...(letter ? { letter } : {}),
      ...(row.kind === "trusted" && row.expiresAt
        ? { expiresAt: new Date(Math.max(row.expiresAt.getTime(), now + LINK_TTL_DAYS * DAY)) }
        : {}),
      updatedAt: new Date(now),
    })) ?? row
  );
}

export async function askerMessage(
  ctx: Ctx,
  actor: Actor,
  body: { linkId?: unknown; text?: unknown; id?: unknown },
): Promise<MessageDoc[]> {
  const row = await askersRow(ctx, actor, body);
  if (row.status === "recalled" || row.status === "finished") throw new LinkError("This review has ended.", 409, "ended");
  const next = addMessage(row, ctx.now?.() ?? Date.now(), "asker", row.askerName, body.text, body.id);
  const saved = await ctx.repo.update(row.id, { state: next, updatedAt: new Date(ctx.now?.() ?? Date.now()) });
  return stateOf(saved ?? row).messages;
}

/* ------------------------------------------------------------------ */
/*  The reviewer with a secure link (no account)                       */
/* ------------------------------------------------------------------ */

/** Find a usable trusted link by its token, or say plainly why not. */
export async function resolveToken(ctx: Ctx, token: unknown): Promise<ReviewLinkRow> {
  const t = typeof token === "string" ? token.trim() : "";
  if (!TOKEN_RE.test(t)) throw new LinkError("This link isn't valid.", 404, "invalid");
  const row = await ctx.repo.findByTokenHash(hashToken(t));
  if (!row || row.kind !== "trusted") throw new LinkError("This link isn't valid.", 404, "invalid");
  const now = ctx.now?.() ?? Date.now();
  if (row.status === "finished") throw new LinkError("This review is finished.", 410, "finished");
  if (row.revokedAt || row.status === "recalled") throw new LinkError("This link is no longer active.", 410, "revoked");
  if (!row.expiresAt || row.expiresAt.getTime() <= now) throw new LinkError("This link has expired.", 410, "expired");
  return row;
}

export type OpenedView = {
  linkId: string;
  letter: LetterDoc;
  asker: { name: string };
  reviewer: { name: string };
  ask: string | null;
  dueAt: number | null;
  expiresAt: number;
  evidence: EvidenceDoc[];
  state: LinkStateView;
};

export async function openWithToken(ctx: Ctx, token: unknown): Promise<OpenedView> {
  let row = await resolveToken(ctx, token);
  const now = ctx.now?.() ?? Date.now();
  if (!row.openedAt) row = (await ctx.repo.update(row.id, { openedAt: new Date(now), updatedAt: new Date(now) })) ?? row;
  return {
    linkId: row.id,
    letter: letterView(row),
    asker: { name: row.askerName },
    reviewer: { name: row.reviewerName },
    ask: row.ask,
    dueAt: ms(row.dueAt),
    expiresAt: row.expiresAt!.getTime(),
    evidence: evidenceView(row),
    state: stateView(row),
  };
}

export async function actWithToken(ctx: Ctx, token: unknown, act: unknown): Promise<LinkStateView> {
  const row = await resolveToken(ctx, token);
  return stateView(await applyReviewerAct(ctx, row, act, { points: true }));
}

/* ------------------------------------------------------------------ */
/*  A teammate (signed in, same workspace)                             */
/* ------------------------------------------------------------------ */

export type AssignedView = {
  linkId: string;
  reviewId: string;
  draftId: string;
  asker: { name: string; userId: string };
  reviewer: { name: string; email?: string; userId?: string };
  ask: string | null;
  dueAt: string | null;
  approveInSameStep: boolean;
  share: { evidence: boolean; hearingNotes: boolean };
  createdAt: number;
  state: LinkStateView;
};

export async function assignedTo(ctx: Ctx, actor: Actor, draftIdRaw: unknown): Promise<AssignedView[]> {
  const tenantId = requireTenant(actor);
  const draftId = str(draftIdRaw, 40).toLowerCase();
  if (!UUID_RE.test(draftId)) throw new LinkError("Invalid letter id.", 400, "bad-draft");
  const rows = await ctx.repo.findAssigned(tenantId, draftId, actor.userId);
  return rows
    .filter((r) => r.kind === "team" && r.tenantId === tenantId && r.reviewerUserId === actor.userId)
    .map((r) => ({
      linkId: r.id,
      reviewId: r.clientReviewId,
      draftId: r.draftId,
      asker: { name: r.askerName, userId: r.askerUserId },
      reviewer: { name: r.reviewerName, email: r.reviewerEmail ?? undefined, userId: r.reviewerUserId ?? undefined },
      ask: r.ask,
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      approveInSameStep: r.approveInSameStep,
      share: { evidence: r.shareEvidence, hearingNotes: r.shareHearingNotes },
      createdAt: r.createdAt.getTime(),
      state: stateView(r),
    }));
}

export async function teamAct(ctx: Ctx, actor: Actor, linkIdRaw: unknown, act: unknown): Promise<LinkStateView> {
  const tenantId = requireTenant(actor);
  const linkId = str(linkIdRaw, 40);
  const row = UUID_RE.test(linkId) ? await ctx.repo.findById(linkId) : null;
  if (!row || row.kind !== "team" || row.tenantId !== tenantId || row.reviewerUserId !== actor.userId) {
    throw new LinkError("Review not found.", 404, "not-found");
  }
  const a = (act ?? {}) as Record<string, unknown>;
  const now = ctx.now?.() ?? Date.now();
  if (a.action === "opened") {
    if (row.openedAt || row.status !== "out") return stateView(row);
    return stateView((await ctx.repo.update(row.id, { openedAt: new Date(now), updatedAt: new Date(now) })) ?? row);
  }
  if (a.action === "approve") {
    if (!row.approveInSameStep) throw new LinkError("This review doesn't include approving it.", 403, "not-allowed");
    if (row.status !== "out" && row.status !== "back") throw new LinkError("This review has ended.", 409, "ended");
    return stateView((await ctx.repo.update(row.id, { approvedAt: row.approvedAt ?? new Date(now), updatedAt: new Date(now) })) ?? row);
  }
  // A teammate's suggestions and comments live on the letter itself.
  return stateView(await applyReviewerAct(ctx, row, act, { points: false }));
}

/* ------------------------------------------------------------------ */
/*  An expert (signed in as the consultant on the booking)             */
/* ------------------------------------------------------------------ */

async function expertsRow(ctx: Ctx, actor: Actor, bookingIdRaw: unknown): Promise<ReviewLinkRow> {
  const bookingId = str(bookingIdRaw, 40);
  const b = UUID_RE.test(bookingId) ? await ctx.dir.booking(bookingId) : null;
  if (!b || b.consultantUserId !== actor.userId) throw new LinkError("Booking not found.", 404, "no-booking");
  if (b.status !== "accepted" && b.status !== "delivered" && b.status !== "completed") {
    throw new LinkError("Access opens once you accept the booking.", 403, "not-accepted");
  }
  if (!b.paid) throw new LinkError("Draft access opens once the booking is paid.", 402, "not-paid");
  const row = await ctx.repo.findByBooking(bookingId);
  if (!row || row.kind !== "expert" || row.tenantId !== b.tenantId) throw new LinkError("Review not found.", 404, "not-found");
  return row;
}

export type ExpertView = {
  linkId: string;
  asker: { name: string };
  ask: string | null;
  dueAt: number | null;
  letter: LetterDoc;
  evidence: EvidenceDoc[];
  state: LinkStateView;
};

export async function expertOpen(ctx: Ctx, actor: Actor, bookingId: unknown): Promise<ExpertView> {
  let row = await expertsRow(ctx, actor, bookingId);
  const now = ctx.now?.() ?? Date.now();
  if (!row.openedAt) row = (await ctx.repo.update(row.id, { openedAt: new Date(now), updatedAt: new Date(now) })) ?? row;
  return {
    linkId: row.id,
    asker: { name: row.askerName },
    ask: row.ask,
    dueAt: ms(row.dueAt),
    letter: letterView(row),
    evidence: evidenceView(row),
    state: stateView(row),
  };
}

export async function expertAct(ctx: Ctx, actor: Actor, bookingId: unknown, act: unknown): Promise<LinkStateView> {
  const row = await expertsRow(ctx, actor, bookingId);
  return stateView(await applyReviewerAct(ctx, row, act, { points: true }));
}

/* ------------------------------------------------------------------ */
/*  What a reviewer may do                                             */
/* ------------------------------------------------------------------ */

function addMessage(row: ReviewLinkRow, now: number, from: MessageDoc["from"], name: string, text: unknown, id: unknown): StateDoc {
  const s = stateOf(row);
  const body = str(text, MAX_TEXT);
  if (!body) throw new LinkError("Write a message first.", 400, "empty");
  const mid = optStr(id, 64) ?? `msg_${randomBytes(9).toString("base64url")}`;
  if (s.messages.some((m) => m.id === mid)) return s;
  if (s.messages.length >= MAX_MESSAGES) throw new LinkError("This thread is full.", 409, "full");
  return { ...s, messages: [...s.messages, { id: mid, from, name, body, at: now }] };
}

async function applyReviewerAct(
  ctx: Ctx,
  row: ReviewLinkRow,
  act: unknown,
  opts: { points: boolean },
): Promise<ReviewLinkRow> {
  const a = (act ?? {}) as Record<string, unknown>;
  const now = ctx.now?.() ?? Date.now();
  const s = stateOf(row);
  const round = s.rounds.at(-1);
  const n = round?.n ?? 1;
  const ended = row.status === "recalled" || row.status === "finished";
  if (ended) throw new LinkError("This review has ended.", 409, "ended");
  const save = async (state: StateDoc, extra: Partial<NewReviewLinkRow> = {}) =>
    (await ctx.repo.update(row.id, { state, ...extra, updatedAt: new Date(now) })) ?? row;

  switch (a.action) {
    case "message":
      return save(addMessage(row, now, "reviewer", row.reviewerName, a.text, a.id));

    case "suggest":
    case "comment": {
      if (!opts.points) throw new LinkError("Suggest and comment in the letter itself.", 400, "use-letter");
      if (row.status !== "out") throw new LinkError("You've sent it back. Wait for them to send it to you again.", 409, "sent-back");
      const sectionId = str(a.sectionId, 80);
      const letter = row.letter as LetterDoc;
      if (!letter.sections?.some((x) => x.id === sectionId)) throw new LinkError("That part of the letter wasn't found.", 400, "bad-section");
      if (s.points.filter((p) => !p.removed).length >= MAX_POINTS) throw new LinkError("Too many points on this letter.", 409, "full");
      const id = `pt_${randomBytes(9).toString("base64url")}`;
      if (a.action === "suggest") {
        const proposedHtml = cleanHtml(a.proposedHtml);
        if (!proposedHtml.trim()) throw new LinkError("Write the new wording first.", 400, "empty");
        if (s.points.some((p) => p.kind === "suggestion" && !p.removed && p.round === n && p.sectionId === sectionId)) {
          throw new LinkError("This part already has your suggestion. Edit or remove it first.", 409, "section-taken");
        }
        const point: PointDoc = {
          id,
          kind: "suggestion",
          sectionId,
          round: n,
          proposedHtml,
          note: optStr(a.note, MAX_TEXT),
          quote: optStr(a.quote, 400),
          title: optStr(a.title, 200),
          at: now,
        };
        return save({ ...s, points: [...s.points, point] });
      }
      const note = str(a.note, MAX_TEXT);
      if (!note) throw new LinkError("Write your comment first.", 400, "empty");
      const point: PointDoc = { id, kind: "comment", sectionId, round: n, note, quote: optStr(a.quote, 400), at: now };
      return save({ ...s, points: [...s.points, point] });
    }

    case "remove": {
      if (!opts.points) throw new LinkError(NOT_ALLOWED, 403, "not-allowed");
      if (row.status !== "out") throw new LinkError("You've sent it back. Wait for them to send it to you again.", 409, "sent-back");
      const pointId = str(a.pointId, 80);
      const p = s.points.find((x) => x.id === pointId && x.round === n && !x.removed);
      if (!p) throw new LinkError("That point wasn't found.", 404, "no-point");
      return save({ ...s, points: s.points.map((x) => (x.id === pointId ? { ...x, removed: true } : x)) });
    }

    case "send-back": {
      if (row.status !== "out" || !round) throw new LinkError("You've already sent this round back.", 409, "sent-back");
      const verdict = a.verdict as Verdict;
      if (!VERDICTS.includes(verdict)) throw new LinkError("Pick a verdict first.", 400, "no-verdict");
      const points = opts.points
        ? s.points
            .filter((p) => p.round === n && !p.removed)
            .map((p) => ({ id: p.id, kind: p.kind, sectionId: p.sectionId, title: p.title ?? p.note?.slice(0, 64) ?? "Point" }))
        : cleanPoints(a.points);
      const rounds = s.rounds.map((r) =>
        r.n === n ? { ...r, backAt: now, verdict, note: optStr(a.note, MAX_TEXT), points } : r,
      );
      return save({ ...s, rounds }, { status: "back" });
    }

    default:
      // Anything else (edit the letter, approve, export, delete): refused.
      throw new LinkError(NOT_ALLOWED, 403, "not-allowed");
  }
}

/* ------------------------------------------------------------------ */
/*  An in-memory store (tests, local tools)                            */
/* ------------------------------------------------------------------ */

export function memoryRepo(): ReviewLinkRepo & { rows: Map<string, ReviewLinkRow> } {
  const rows = new Map<string, ReviewLinkRow>();
  const clone = (r: ReviewLinkRow) => structuredClone(r);
  return {
    rows,
    async insert(row) {
      const id = row.id ?? randomUUID();
      const now = new Date();
      if (row.tokenHash && [...rows.values()].some((r) => r.tokenHash === row.tokenHash)) throw new Error("duplicate token");
      const full = {
        tokenHash: null,
        bookingId: null,
        reviewerEmail: null,
        reviewerUserId: null,
        ask: null,
        dueAt: null,
        shareEvidence: false,
        shareHearingNotes: false,
        approveInSameStep: false,
        evidence: [],
        status: "out",
        expiresAt: null,
        revokedAt: null,
        openedAt: null,
        approvedAt: null,
        state: { rounds: [], messages: [], points: [] },
        createdAt: now,
        updatedAt: now,
        ...row,
        id,
      } as ReviewLinkRow;
      rows.set(id, full);
      return clone(full);
    },
    async findById(id) {
      const r = rows.get(id);
      return r ? clone(r) : null;
    },
    async findByTokenHash(hash) {
      const r = [...rows.values()].find((x) => x.tokenHash === hash);
      return r ? clone(r) : null;
    },
    async findByClientReview(tenantId, clientReviewId) {
      const r = [...rows.values()].find((x) => x.tenantId === tenantId && x.clientReviewId === clientReviewId);
      return r ? clone(r) : null;
    },
    async findByBooking(bookingId) {
      const r = [...rows.values()].filter((x) => x.bookingId === bookingId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return r ? clone(r) : null;
    },
    async findAssigned(tenantId, draftId, reviewerUserId) {
      return [...rows.values()]
        .filter((x) => x.tenantId === tenantId && x.draftId === draftId && x.reviewerUserId === reviewerUserId)
        .map(clone);
    },
    async update(id, patch) {
      const r = rows.get(id);
      if (!r) return null;
      const next = { ...r, ...patch } as ReviewLinkRow;
      rows.set(id, next);
      return clone(next);
    },
  };
}
