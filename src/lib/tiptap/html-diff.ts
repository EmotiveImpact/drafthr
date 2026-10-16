import { diffWordsWithSpace } from "diff";
import { uid } from "@/lib/utils";
import type { SuggestionAttrs } from "./suggestion-mark";

/**
 * Inline track-changes diff at WORD granularity — Google-Docs/Word style.
 * Walks oldHtml + newHtml as flattened prose (block boundaries become
 * paragraph breaks) and emits a single HTML blob where:
 *   - Common prose flows as-is inside <p> blocks (paragraph structure kept).
 *   - Removed words are wrapped INLINE in <del data-suggestion-id …>
 *   - Added words are wrapped INLINE in <ins data-suggestion-id …>
 *
 * Changing "31 August" to "29 August" therefore redlines ONLY "31"/"29" —
 * not the whole sentence — and the marks sit inside the sentence's own <p>,
 * so the letter reads as a real redline (strike-through old, underline new
 * mid-sentence), not as chopped-out paragraphs. Each changed run gets a
 * fresh uuid so per-suggestion accept/reject can target it.
 *
 * We flatten to text before diffing (same trade-off as before): original
 * inline formatting inside changed regions isn't preserved, because that
 * would require diffing a fully tokenised mark tree. Callers guard the
 * non-text cases (images/tables) into card mode already.
 */
export type DiffSuggestionAttrs = Omit<
  SuggestionAttrs,
  "id" | "kind" | "createdAt" | "status"
>;

export function diffHtmlAsSuggestion(
  oldHtml: string,
  newHtml: string,
  attrs: DiffSuggestionAttrs,
): string {
  const createdAt = Date.now();
  const oldText = htmlToText(oldHtml);
  const newText = htmlToText(newHtml);

  // Edge cases — if either side is empty, the diff is trivial: the entire
  // other side is the change. Wrapping the whole blob in one mark gives
  // the user a single accept/reject target instead of N word-level ones.
  if (!oldText && !newText) return "";
  if (!oldText) return wrapWhole(newText, "insertion", attrs, createdAt);
  if (!newText) return wrapWhole(oldText, "deletion", attrs, createdAt);

  // Word-level Myers diff (whitespace-preserving variant so runs of spaces
  // don't register as phantom changes). Newlines ride along inside common
  // runs and become paragraph breaks when we rebuild below.
  const runs = coalesce(diffWordsWithSpace(oldText, newText));

  const paragraphs: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) paragraphs.push(`<p>${cur.trim()}</p>`);
    cur = "";
  };

  for (const run of runs) {
    if (run.kind === "phrase") {
      // A rewritten phrase: the old words struck through as one run, then
      // the new words as one run, so the sentence still reads.
      const lead = sharedEdge(run.old, run.new, "start");
      const tail = sharedEdge(run.old.slice(lead.length), run.new.slice(lead.length), "end");
      const oldMid = run.old.slice(lead.length, run.old.length - tail.length);
      const newMid = run.new.slice(lead.length, run.new.length - tail.length);
      cur += escapeHtml(lead);
      if (oldMid.trim()) cur += renderMark("deletion", oldMid, attrs, createdAt);
      else cur += escapeHtml(oldMid);
      if (newMid.trim()) cur += renderMark("insertion", newMid, attrs, createdAt);
      cur += escapeHtml(tail);
      continue;
    }
    if (run.added || run.removed) {
      // A changed run spanning a paragraph break is rare — flatten the break
      // to a space so the mark stays a single inline element.
      const text = run.value.replace(/\n+/g, " ");
      if (!text.trim()) {
        // Whitespace-only churn is not representable as a suggestion mark.
        // REMOVED whitespace must be kept as-is (paragraph structure etc.
        // stays until someone actually accepts a real change — dropping it
        // here would apply a join unmarked, before any accept). ADDED
        // whitespace is simply not proposed.
        if (run.removed) {
          run.value.split("\n").forEach((seg, i) => {
            if (i > 0) flush();
            cur += escapeHtml(seg);
          });
        }
        continue;
      }
      cur += renderMark(run.removed ? "deletion" : "insertion", text, attrs, createdAt);
    } else {
      // Common prose — paragraph breaks close the current <p>.
      const segments = run.value.split("\n");
      segments.forEach((seg, i) => {
        if (i > 0) flush();
        cur += escapeHtml(seg);
      });
    }
  }
  flush();

  // Identical inputs → no <ins>/<del> emitted; we still re-emit the prose as
  // <p> blocks. The caller treats "no marks" as "nothing to propose".
  return paragraphs.join("");
}

/* ----------------------------------------------------------------------------
 * Internals
 * --------------------------------------------------------------------------*/

type WordRun = { value: string; added?: boolean; removed?: boolean };
type Run = (WordRun & { kind?: undefined }) | { kind: "phrase"; old: string; new: string };

/** Common words between two changes that still count as one rewrite. */
const MAX_BRIDGE_WORDS = 2;

/**
 * Join changes that sit a word or two apart into one rewritten phrase. A
 * plain word diff of a reworded clause interleaves struck and inserted
 * fragments ("aredo not yet completemeet ..."), which cannot be read; the
 * reader wants the old phrase struck through, then the new one. A single
 * changed word ("31" to "29") and changes far apart stay as they are, and a
 * paragraph break always ends a phrase.
 */
function coalesce(runs: WordRun[]): Run[] {
  const out: Run[] = [];
  const changed = (r: WordRun | undefined) => Boolean(r && (r.added || r.removed));
  const bridge = (r: WordRun) =>
    !r.added && !r.removed && !r.value.includes("\n") && (r.value.match(/\S+/g)?.length ?? 0) <= MAX_BRIDGE_WORDS;
  let i = 0;
  while (i < runs.length) {
    if (!changed(runs[i])) {
      out.push(runs[i]);
      i += 1;
      continue;
    }
    // Grow the cluster: changed runs, and short common runs between changes.
    let j = i;
    let end = i;
    while (j < runs.length) {
      const r = runs[j];
      if (changed(r)) {
        // A change across a paragraph break stays on its own.
        if (r.value.includes("\n")) {
          if (j === i) end = j;
          break;
        }
        end = j;
        j += 1;
      } else if (bridge(r) && changed(runs[j + 1])) {
        j += 1;
      } else break;
    }
    const cluster = runs.slice(i, end + 1);
    const hasDel = cluster.some((r) => r.removed && r.value.trim());
    const hasIns = cluster.some((r) => r.added && r.value.trim());
    if (cluster.length === 1 || !(hasDel && hasIns)) {
      // A lone change, or only one side changed: keep the word runs.
      out.push(...cluster);
    } else {
      out.push({
        kind: "phrase",
        old: cluster.filter((r) => !r.added).map((r) => r.value).join(""),
        new: cluster.filter((r) => !r.removed).map((r) => r.value).join(""),
      });
    }
    i = end + 1;
  }
  return out;
}

/** The whitespace both strings share at their start (or end). */
function sharedEdge(a: string, b: string, side: "start" | "end"): string {
  const re = side === "start" ? /^\s*/ : /\s*$/;
  const wa = a.match(re)?.[0] ?? "";
  const wb = b.match(re)?.[0] ?? "";
  const n = Math.min(wa.length, wb.length);
  return side === "start" ? wa.slice(0, n) : wa.slice(wa.length - n);
}

function renderMark(
  kind: "insertion" | "deletion",
  text: string,
  attrs: DiffSuggestionAttrs,
  createdAt: number,
): string {
  const tag = kind === "deletion" ? "del" : "ins";
  const id = uid("sug");
  const author = escapeAttr(attrs.author);
  const authorId = attrs.authorId ? ` data-author-id="${escapeAttr(attrs.authorId)}"` : "";
  const body = attrs.body ? ` data-body="${escapeAttr(attrs.body)}"` : "";
  const cls =
    "ds-suggestion " +
    (kind === "deletion" ? "ds-suggestion-del" : "ds-suggestion-ins") +
    " ds-suggestion-pending";
  // INLINE mark — no block wrapper. The caller composes these into the
  // surrounding paragraph so the redline flows mid-sentence.
  return (
    `<${tag} data-suggestion-id="${id}" data-suggestion-kind="${kind}" ` +
    `data-author="${author}"${authorId}${body} ` +
    `data-created-at="${createdAt}" data-status="pending" data-suggestion="" ` +
    `class="${cls}">${escapeHtml(text)}</${tag}>`
  );
}

function wrapWhole(
  text: string,
  kind: "insertion" | "deletion",
  attrs: DiffSuggestionAttrs,
  createdAt: number,
): string {
  // One mark PER PARAGRAPH so a multi-paragraph proposal keeps its breaks
  // through accept (a single flattened <p> would lose them permanently).
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${renderMark(kind, line, attrs, createdAt)}</p>`)
    .join("");
}

/**
 * Strip tags + collapse entities to plain text. Block-level tags become
 * paragraph boundaries (newline) so a `<p>foo</p><p>bar</p>` blob splits
 * into two paragraphs instead of "foobar".
 */
function htmlToText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") {
    // Best-effort fallback for SSR / non-DOM contexts (tests use jsdom).
    return html
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|figure|figcaption)>/gi, "$&\n")
      .replace(/<br\s*\/?>(?!\n)/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
  const root = document.createElement("div");
  root.innerHTML = html;
  // Insert a paragraph break after each block-level close so multi-paragraph
  // input doesn't smush together when textContent flattens it.
  root.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, li, tr, blockquote, figure, figcaption, br")
    .forEach((el) => {
      el.appendChild(document.createTextNode("\n"));
    });
  // Collapse intra-line whitespace so incidental indentation in source HTML
  // doesn't surface as phantom word-diff churn.
  return (root.textContent ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
