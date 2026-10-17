/**
 * Moving a reviewer's suggestion onto the letter as it is now (REVIEW-X29).
 *
 * A reviewer suggests against the text they saw. When their suggestion was
 * held (DraftHR had an edit waiting in that part) and you accepted DraftHR's
 * edit meanwhile, proposing their html as it stands would strike out the
 * words you just accepted and put the old ones back. Instead their change is
 * replayed on today's text: a three-way merge of what they saw (base), the
 * text now (current) and what they suggested (theirs), over html tokens
 * (tags, words, punctuation, spaces), so the letter's structure survives.
 *
 * - Where only they changed something, their change goes in.
 * - Where only the text changed since (DraftHR's accepted edit), it stays.
 * - Where both changed the same words, their version is kept for those
 *   words (so nothing they asked for is lost) and `overlaps` says so, so the
 *   person deciding is told that accepting it rewrites part of the edit they
 *   accepted.
 */
import { diffArrays } from "diff";

export type Rebased = {
  /** Their suggestion, on today's text. */
  html: string;
  /** Some of their change rewrites words that changed after they wrote it. */
  overlaps: boolean;
};

type Hunk = { start: number; end: number; tokens: string[]; side: "current" | "theirs" };

const TOKEN_RE = /<[^>]*>|&[#a-zA-Z0-9]+;|\s+|[\p{L}\p{N}'’]+|[\s\S]/gu;

/** Tags, entities, words, single punctuation marks; runs of space as one " ". */
export function tokens(html: string): string[] {
  return (html.match(TOKEN_RE) ?? []).map((t) => (/^\s+$/.test(t) ? " " : t));
}

/** The edits that turn base into other, as ranges of base tokens. */
function hunks(base: string[], other: string[], side: Hunk["side"]): Hunk[] {
  const out: Hunk[] = [];
  let i = 0;
  let open: Hunk | null = null;
  for (const part of diffArrays(base, other)) {
    if (!part.added && !part.removed) {
      if (open) out.push(open);
      open = null;
      i += part.value.length;
      continue;
    }
    open ??= { start: i, end: i, tokens: [], side };
    if (part.removed) {
      i += part.value.length;
      open.end = i;
    } else {
      open.tokens.push(...part.value);
    }
  }
  if (open) out.push(open);
  return out;
}

function touches(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  // Two insertions at the same point compete for it; an insertion strictly
  // inside a replaced range lands in it; ranges that share tokens overlap.
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  return a.start < b.end && b.start < a.end;
}

const same = (a: Hunk, b: Hunk) =>
  a.start === b.start && a.end === b.end && a.tokens.length === b.tokens.length && a.tokens.every((t, i) => t === b.tokens[i]);

/** Apply hunks (sorted, not overlapping) to base[from, to). */
function applyRange(base: string[], from: number, to: number, list: Hunk[]): string[] {
  const out: string[] = [];
  let i = from;
  for (const h of list) {
    out.push(...base.slice(i, h.start), ...h.tokens);
    i = h.end;
  }
  out.push(...base.slice(i, to));
  return out;
}

export function rebaseSuggestion(baseHtml: string, currentHtml: string, theirsHtml: string): Rebased {
  const base = tokens(baseHtml);
  const current = tokens(currentHtml);
  const theirs = tokens(theirsHtml);
  const mine = hunks(base, current, "current");
  if (mine.length === 0) return { html: theirsHtml, overlaps: false };
  const yours = hunks(base, theirs, "theirs");
  if (yours.length === 0) return { html: currentHtml, overlaps: false };

  // Insertions before replacements at the same point, so an insertion at the
  // start of a replaced range goes in front of it.
  const all = [...mine, ...yours].sort((a, b) => a.start - b.start || a.end - a.start - (b.end - b.start));

  // Clusters of hunks that touch one another (transitively).
  const clusters: Hunk[][] = [];
  for (const h of all) {
    const last = clusters[clusters.length - 1];
    if (last && last.some((x) => touches(x, h))) last.push(h);
    else clusters.push([h]);
  }

  let overlaps = false;
  const out: string[] = [];
  let i = 0;
  for (const c of clusters) {
    const start = Math.min(...c.map((h) => h.start));
    const end = Math.max(...c.map((h) => h.end));
    out.push(...base.slice(i, start));
    const fromCurrent = c.filter((h) => h.side === "current");
    const fromTheirs = c.filter((h) => h.side === "theirs");
    if (fromTheirs.length === 0) out.push(...applyRange(base, start, end, fromCurrent));
    else if (fromCurrent.length === 0) out.push(...applyRange(base, start, end, fromTheirs));
    else if (fromCurrent.length === fromTheirs.length && fromCurrent.every((h, k) => same(h, fromTheirs[k]))) {
      // The same change on both sides: once.
      out.push(...applyRange(base, start, end, fromCurrent));
    } else {
      overlaps = true;
      out.push(...applyRange(base, start, end, fromTheirs));
    }
    i = end;
  }
  out.push(...base.slice(i));
  return { html: out.join(""), overlaps };
}

/** The same text, ignoring how the html spaces it. */
export function sameText(a: string, b: string): boolean {
  return tokens(a).join("") === tokens(b).join("");
}
