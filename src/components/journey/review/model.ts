/**
 * Pure helpers for the review loop: which letters DraftHR suggests an
 * expert for, the reviewer's points on a draft (what is still to decide and
 * what was decided), the summary the Approve stage shows, the back-by
 * defaults and the date and time wording. No React, no stores: everything
 * takes plain data so it is easy to test.
 */
import type { Comment, Draft, Section } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { sectionTitleText } from "@/lib/letters/display";
import { planHours, specialtiesForLetter, turnaroundWords as marketTurnaroundWords } from "@/components/consultants/market";
import {
  currentRound,
  firstName,
  type ReviewPointDecision,
  type ReviewPointSnapshot,
  type ReviewRequest,
  type ReviewRound,
  type ReviewVerdict,
} from "@/lib/journey/reviews";

/* ------------------------------------------------------------------ */
/*  Which letters get "Suggested" on the expert card                   */
/* ------------------------------------------------------------------ */

export type ExpertSuggestion = {
  suggested: boolean;
  /** "a final written warning", "a dismissal letter". */
  inWords: string;
  /** The clause after the colon, when there is one. */
  because?: string;
};

/** The letter type in words, with an article ("a final written warning"). */
export function letterInWords(draft: Draft): string {
  const level = String((draft.answers as Record<string, unknown>)?.warningLevel ?? "");
  if (draft.letterType === "warning") {
    if (level === "final_written") return "a final written warning";
    if (level === "verbal") return "a verbal warning";
    return "a written warning";
  }
  if (draft.letterType === "termination") return "a dismissal letter";
  const title = getLetterMeta(draft.letterType).title.toLowerCase();
  return /^[aeiou]/.test(title) ? `an ${title}` : `a ${title}`;
}

/**
 * DraftHR suggests an expert for high-risk letters: final written warnings,
 * dismissals and redundancies, any letter the person marked as needing
 * legal review, and employee letters the catalogue marks high-risk.
 * Ordinary warnings and offers are not suggested.
 */
export function expertSuggestion(draft: Draft): ExpertSuggestion {
  const inWords = letterInWords(draft);
  const level = String((draft.answers as Record<string, unknown>)?.warningLevel ?? "");
  if (draft.letterType === "warning" && level === "final_written") {
    return { suggested: true, inWords, because: "the next step could be dismissal" };
  }
  if (draft.letterType === "termination") return { suggested: true, inWords };
  if (draft.letterType === "redundancy") return { suggested: true, inWords, because: "it ends someone's job" };
  if (draft.context?.counselReviewRequired) return { suggested: true, inWords, because: "you marked it as needing legal review" };
  if (draft.mode === "employee" && getLetterMeta(draft.letterType).riskClass === "high") {
    return { suggested: true, inWords };
  }
  return { suggested: false, inWords };
}

/** Marketplace specialties that fit a letter type (empty: any expert fits). */
export function specialtiesFor(draft: Draft): string[] {
  // One list for the dialog and the marketplace page, so "See all N" is the
  // N the page shows when it opens for this letter.
  return specialtiesForLetter(draft);
}

/* ------------------------------------------------------------------ */
/*  The reviewer's points on the draft                                 */
/* ------------------------------------------------------------------ */

export type ReviewPointState = "open" | ReviewPointDecision;

export type ReviewPoint = ReviewPointSnapshot & {
  /** 1, 2, 3 for suggestions (the lilac numbered square). */
  n?: number;
  state: ReviewPointState;
  /** suggestion: the mark ids it left in the text. */
  markIds?: string[];
};

const TAG_RE = /<(ins|del)\b[^>]*>/gi;

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : undefined;
}

/** Pending mark ids in a section's html. */
function pendingMarkIds(section: Section): string[] {
  const html = section.html ?? "";
  if (!html.includes("data-suggestion-id")) return [];
  const ids: string[] = [];
  for (const tag of html.match(TAG_RE) ?? []) {
    if (!/data-status\s*=\s*"pending"/i.test(tag)) continue;
    const id = attr(tag, "data-suggestion-id");
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Plain text of some html, for titles. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, n = 64): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Where a section sits, in words ("Right of appeal"). */
export function sectionWhere(draft: Draft, sectionId: string | undefined): string | undefined {
  if (!sectionId) return undefined;
  const t = draft.sections.find((s) => s.id === sectionId)?.title;
  return t ? sectionTitleText(t) : undefined;
}

/** Does this pending change come from the reviewer? */
function isTheirs(section: Section, review: ReviewRequest, round: ReviewRound | undefined): boolean {
  const pc = section.pendingChange;
  if (!pc) return false;
  const ids = new Set(round?.suggestionIds ?? []);
  if (pendingMarkIds(section).some((id) => ids.has(id))) return true;
  if (round?.points?.some((p) => p.kind === "suggestion" && p.id === pc.id)) return true;
  // Card-mode proposals leave no marks: match on the author.
  if (pc.source !== "review") return false;
  const who = (pc.authorName ?? "").trim().toLowerCase();
  const email = (pc.authorId ?? "").trim().toLowerCase();
  return (
    (!!who && who === review.reviewer.name.trim().toLowerCase()) ||
    (!!email && !!review.reviewer.email && email === review.reviewer.email.toLowerCase())
  );
}

/** A suggestion's short title: the reviewer's note, or the words it adds. */
function suggestionTitle(section: Section): string {
  const pc = section.pendingChange;
  const note = pc?.instruction?.trim();
  if (note) return clip(note);
  const html = section.html ?? "";
  const ins = html.match(/<ins\b[^>]*>([\s\S]*?)<\/ins>/i)?.[1];
  if (ins) return clip(`Add "${plainText(ins)}"`);
  return `Change to ${section.title.toLowerCase()}`;
}

/**
 * The reviewer's points in the current round (or a given round): their
 * suggested edits (one per section, as the store keeps one pending change
 * per section) and their comments, each with its state. Points decided
 * earlier keep their row through the round's snapshot.
 */
export function reviewPoints(draft: Draft, review: ReviewRequest, round = currentRound(review)): ReviewPoint[] {
  if (!round) return [];
  const decisions = round.decisions ?? {};
  const points: ReviewPoint[] = [];
  const seen = new Set<string>();

  // Live suggestions still pending in the text.
  for (const s of draft.sections) {
    if (!isTheirs(s, review, round)) continue;
    const pc = s.pendingChange!;
    const id = pc.id;
    seen.add(id);
    const snap = round.points?.find((p) => p.id === id);
    points.push({
      id,
      kind: "suggestion",
      sectionId: s.id,
      title: snap?.title ?? suggestionTitle(s),
      where: snap?.where ?? sectionTitleText(s.title),
      state: "open",
      markIds: pendingMarkIds(s),
    });
  }
  // Suggestions from the snapshot no longer pending: decided (or gone).
  for (const p of round.points ?? []) {
    if (p.kind !== "suggestion" || seen.has(p.id)) continue;
    seen.add(p.id);
    const d = decisions[p.id]?.decision;
    points.push({ ...p, state: d ?? "accepted" });
  }
  // Suggestions decided from the Edits tab or a margin card that the round
  // has no snapshot for: the decision is the record, so "You accepted 1
  // change" counts them.
  const commentIdsInRound = new Set([...round.commentIds, ...(round.points ?? []).filter((p) => p.kind === "comment").map((p) => p.id)]);
  for (const [id, d] of Object.entries(decisions)) {
    if (seen.has(id) || commentIdsInRound.has(id) || (d.decision !== "accepted" && d.decision !== "rejected")) continue;
    seen.add(id);
    points.push({ id, kind: "suggestion", title: "Suggested change", where: "Letter", state: d.decision });
  }

  // Comments.
  const comments = draft.comments ?? [];
  const commentIds = new Set(round.commentIds);
  for (const p of round.points ?? []) if (p.kind === "comment") commentIds.add(p.id);
  for (const id of commentIds) {
    const c = comments.find((x) => x.id === id);
    const snap = round.points?.find((p) => p.id === id);
    if (!c && !snap) continue;
    points.push({
      id,
      kind: "comment",
      sectionId: c?.sectionId ?? snap?.sectionId,
      title: snap?.title ?? clip(c?.body ?? ""),
      where: "Comment",
      state: c ? (c.resolved ? "resolved" : "open") : (decisions[id]?.decision ?? "resolved"),
    });
  }

  // Number the suggestions in letter order.
  const order = new Map(draft.sections.map((s, i) => [s.id, i]));
  const sugg = points.filter((p) => p.kind === "suggestion");
  sugg.sort((a, b) => (order.get(a.sectionId ?? "") ?? 99) - (order.get(b.sectionId ?? "") ?? 99));
  sugg.forEach((p, i) => (p.n = i + 1));
  const comm = points.filter((p) => p.kind === "comment");
  return [...sugg, ...comm];
}

export function openPoints(points: ReviewPoint[]): ReviewPoint[] {
  return points.filter((p) => p.state === "open");
}

/**
 * Collect what a reviewer left on a draft since a moment (their suggested
 * edits and comments), for the send-back of a round.
 */
export function collectReviewerWork(
  draft: Draft,
  reviewer: { name: string; email?: string },
  since: number
): { suggestionIds: string[]; commentIds: string[]; points: ReviewPointSnapshot[] } {
  const name = reviewer.name.trim().toLowerCase();
  const email = (reviewer.email ?? "").trim().toLowerCase();
  const mine = (authorName?: string, authorId?: string) =>
    (!!name && (authorName ?? "").trim().toLowerCase() === name) ||
    (!!email && (authorId ?? "").trim().toLowerCase() === email);
  const suggestionIds: string[] = [];
  const points: ReviewPointSnapshot[] = [];
  for (const s of draft.sections) {
    const pc = s.pendingChange;
    if (!pc || pc.source !== "review" || !mine(pc.authorName, pc.authorId)) continue;
    suggestionIds.push(...pendingMarkIds(s));
    points.push({ id: pc.id, kind: "suggestion", sectionId: s.id, title: suggestionTitle(s), where: sectionTitleText(s.title) });
  }
  const commentIds: string[] = [];
  for (const c of draft.comments ?? []) {
    if (c.parentId || c.createdAt < since || !mine(c.authorName, c.authorEmail ?? c.authorId)) continue;
    commentIds.push(c.id);
    points.push({ id: c.id, kind: "comment", sectionId: c.sectionId, title: clip(c.body), where: "Comment" });
  }
  return { suggestionIds, commentIds, points };
}

/** The reviewer's own comments on the draft (any round), newest last. */
export function reviewerComments(draft: Draft, reviewer: { name: string; email?: string }): Comment[] {
  const name = reviewer.name.trim().toLowerCase();
  const email = (reviewer.email ?? "").trim().toLowerCase();
  return (draft.comments ?? []).filter(
    (c) =>
      !c.parentId &&
      ((c.authorName ?? "").trim().toLowerCase() === name ||
        (!!email && (c.authorEmail ?? c.authorId ?? "").toLowerCase() === email))
  );
}

/* ------------------------------------------------------------------ */
/*  Summary for the Approve stage and the rounds history               */
/* ------------------------------------------------------------------ */

export type RoundSummary = {
  n: number;
  sentAt: number;
  backAt?: number;
  question?: string;
  verdict?: ReviewVerdict;
  note?: string;
  changes: number;
  comments: number;
  accepted: number;
  rejected: number;
  resolved: number;
  /** Titles of the suggestions you kept your own wording on. */
  keptTitles: string[];
};

export function summariseRound(draft: Draft, review: ReviewRequest, round: ReviewRound): RoundSummary {
  const pts = reviewPoints(draft, review, round);
  const changes = pts.filter((p) => p.kind === "suggestion");
  const comments = pts.filter((p) => p.kind === "comment");
  return {
    n: round.n,
    sentAt: round.sentAt,
    backAt: round.backAt,
    question: round.question,
    verdict: round.verdict,
    note: round.note,
    changes: changes.length,
    comments: Math.max(comments.length, round.commentIds.length),
    accepted: changes.filter((p) => p.state === "accepted").length,
    rejected: changes.filter((p) => p.state === "rejected").length,
    resolved: comments.filter((p) => p.state === "resolved").length,
    keptTitles: changes.filter((p) => p.state === "rejected").map((p) => p.title),
  };
}


export type ReviewSummaryData = {
  reviewerName: string;
  rounds: number;
  verdict?: ReviewVerdict;
  accepted: number;
  kept: number;
  resolved: number;
  perRound: RoundSummary[];
};

export function reviewSummary(draft: Draft, review: ReviewRequest): ReviewSummaryData {
  const perRound = review.rounds.map((r) => summariseRound(draft, review, r));
  const lastWithVerdict = [...review.rounds].reverse().find((r) => r.verdict);
  return {
    reviewerName: review.reviewer.name,
    rounds: review.rounds.filter((r) => r.backAt || r.n === 1).length || review.rounds.length,
    verdict: lastWithVerdict?.verdict,
    accepted: perRound.reduce((n, r) => n + r.accepted, 0),
    kept: perRound.reduce((n, r) => n + r.rejected, 0),
    resolved: perRound.reduce((n, r) => n + r.resolved, 0),
    perRound,
  };
}

/* ------------------------------------------------------------------ */
/*  Dates, times and wording                                           */
/* ------------------------------------------------------------------ */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export { plural };

/** "09:24" */
export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "Thu 15 Oct, 12:00" */
export function fmtDayDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}, ${fmtTime(ms)}`;
}

/** "Thu 15 Oct" */
export function fmtDayDate(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
}

/** "Thu 12:00" */
export function fmtDayTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${fmtTime(ms)}`;
}

/** "14 Oct, 09:10" */
export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}, ${fmtTime(ms)}`;
}

/** "21 Oct" */
export function fmtShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
}

/** "2 hours", "1 day", "35 minutes". */
export function fmtDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return plural(mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours < 48) return plural(hours, "hour");
  return plural(Math.round(hours / 24), "day");
}

/** "ahead of time", "on time", "3 hours late". */
export function backTiming(backAt: number, dueAt: string | undefined): string {
  if (!dueAt) return "";
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return "";
  const diff = backAt - due;
  if (diff > 5 * 60000) return `${fmtDuration(diff)} late`;
  if (diff < -60 * 60000) return "ahead of time";
  return "on time";
}

/** "Back at 14:32, ahead of time" (or "Back on Mon 12 Oct at 14:32, …"). */
export function backLine(backAt: number, dueAt: string | undefined, now = Date.now()): string {
  const sameDay = new Date(backAt).toDateString() === new Date(now).toDateString();
  const when = sameDay ? `Back at ${fmtTime(backAt)}` : `Back on ${fmtDayDate(backAt)} at ${fmtTime(backAt)}`;
  const timing = backTiming(backAt, dueAt);
  return timing ? `${when}, ${timing}` : when;
}

/** A sensible default back-by: at least `minHours` from now, rounded up to
 *  the next 12:00 or 17:00 on a weekday. */
export function defaultDueAt(minHours = 48, now = Date.now()): string {
  const d = new Date(now + minHours * 3600000);
  d.setSeconds(0, 0);
  const hour = d.getHours();
  if (hour < 12 || (hour === 12 && d.getMinutes() === 0)) d.setHours(12, 0);
  else if (hour < 17 || (hour === 17 && d.getMinutes() === 0)) d.setHours(17, 0);
  else {
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0);
  }
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** Turnaround hours from a marketplace SLA ("24h", "24-48h"). */
export function slaHours(sla: string | undefined): number {
  // The upper end of a range ("24-48h" is 48), as the marketplace promises it.
  return planHours(sla);
}

/** "24 hours", "2 days": the marketplace's own words, so the dialog and the
 *  cards say the same thing (MARKET-X3). */
export function turnaroundWords(sla: string | undefined): string {
  return marketTurnaroundWords(sla);
}

/** Money: "£95", "£95.50". */
export function money(amount: number, symbol = "£"): string {
  const whole = Math.round(amount * 100) % 100 === 0;
  return `${symbol}${whole ? Math.round(amount).toString() : amount.toFixed(2)}`;
}

/** The asker's first name for the reviewer's copy ("Send back to Alex"). */
export function askerFirst(review: ReviewRequest, fallback = "them"): string {
  return firstName(review.asker?.name) || fallback;
}

/** The ask split into questions when it holds several, else one paragraph. */
export function askItems(ask: string | undefined): string[] {
  const text = (ask ?? "").trim();
  if (!text) return [];
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  const qs = text.match(/[^?]+\?/g)?.map((q) => q.trim()) ?? [];
  const rest = text.replace(/[^?]+\?/g, "").trim();
  if (qs.length > 1) return rest ? [...qs, rest] : qs;
  return [text];
}

/* ------------------------------------------------------------------ */
/*  What can be shared                                                  */
/* ------------------------------------------------------------------ */

const HEARING_RE =
  /\b(hearing|meeting|investigation)\b.*\b(notes?|minutes|record)\b|\b(notes?|minutes)\b.*\b(hearing|meeting)\b/i;

/** Is this evidence item the notes of a hearing or meeting? */
export function isHearingNote(e: { kind: string; filename?: string; content?: string }): boolean {
  if (e.kind !== "note" && e.kind !== "document") return false;
  const name = e.filename ?? "";
  const head = (e.content ?? "").slice(0, 120);
  return HEARING_RE.test(name) || (e.kind === "note" && HEARING_RE.test(head));
}

/** The letter's evidence split into files and hearing notes. */
export function shareableEvidence<T extends { kind: string; filename?: string; content?: string }>(
  evidence: T[] | undefined
): { files: T[]; hearingNotes: T[] } {
  const files: T[] = [];
  const hearingNotes: T[] = [];
  for (const e of evidence ?? []) (isHearingNote(e) ? hearingNotes : files).push(e);
  return { files, hearingNotes };
}

/** The evidence a reviewer was given: files when the asker shared evidence,
 * hearing notes only when they shared those too. The letter is always shared. */
export function evidenceSharedWith<T extends { kind: string; filename?: string; content?: string }>(
  evidence: T[] | undefined,
  share: { evidence: boolean; hearingNotes: boolean } | undefined
): T[] {
  return (evidence ?? []).filter((e) => Boolean(isHearingNote(e) ? share?.hearingNotes : share?.evidence));
}

/** Verdict from a delivery note written by the reviewer's send-back. */
export function parseDelivery(note: string | undefined, labels: Record<ReviewVerdict, string>): {
  verdict?: ReviewVerdict;
  note?: string;
} {
  const text = (note ?? "").trim();
  if (!text) return {};
  for (const [v, label] of Object.entries(labels) as [ReviewVerdict, string][]) {
    if (text.toLowerCase().startsWith(label.toLowerCase())) {
      const rest = text.slice(label.length).replace(/^[.:\s]+/, "").trim();
      return { verdict: v, note: rest || undefined };
    }
  }
  return { note: text };
}
