import { diffArrays } from "diff";
import { uid } from "@/lib/utils";
import type { SuggestionAttrs } from "./suggestion-mark";

/**
 * Inline track-changes diff. Walks oldHtml + newHtml at sentence granularity
 * (period / question / exclamation / semicolon / line break) and emits a
 * single HTML blob where:
 *   - Common sentences appear as-is (wrapped in <p> for readability — we
 *     don't try to preserve original inline formatting because that would
 *     require running the diff on a fully tokenised mark tree, and the
 *     readability win is what matters for AI proposals).
 *   - Removed sentences are wrapped in <del data-suggestion-id …>
 *   - Added sentences are wrapped in <ins data-suggestion-id …>
 *
 * Each changed sentence gets a fresh uuid so per-suggestion accept/reject
 * can target it. Inserted runs and deleted runs that sit next to each
 * other (i.e. a "replacement") share neither id nor body — the existing
 * track-changes UI surfaces them as adjacent <ins>/<del> pills which the
 * user can act on independently.
 *
 * Implementation note: we use `diffArrays` (not `diffSentences`) because
 * the npm `diff` package's sentence tokeniser regexes are tuned for prose
 * and miss our common HR-letter punctuation patterns (e.g. "12 December
 * 2025." followed by a heading). Sentence-splitting locally lets us keep
 * the regex tight to the patterns we actually see in the editor.
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
  // the user a single accept/reject target instead of N per-sentence ones.
  const oldSentences = splitSentences(oldText);
  const newSentences = splitSentences(newText);

  if (oldSentences.length === 0 && newSentences.length === 0) return "";
  if (oldSentences.length === 0) {
    return wrapWhole(newText, "insertion", attrs, createdAt);
  }
  if (newSentences.length === 0) {
    return wrapWhole(oldText, "deletion", attrs, createdAt);
  }

  // Sentence-level Myers diff via the diff package's array variant. The
  // comparator normalises whitespace so trivial reflowing doesn't show up
  // as a change — we only care about meaningful prose differences.
  const changes = diffArrays(oldSentences, newSentences, {
    comparator: (a, b) => normalise(a) === normalise(b),
  });

  const parts: string[] = [];
  for (const change of changes) {
    const sentences = change.value;
    if (sentences.length === 0) continue;
    const text = sentences.join(" ");
    if (change.added) {
      parts.push(renderMark("insertion", text, attrs, createdAt));
    } else if (change.removed) {
      parts.push(renderMark("deletion", text, attrs, createdAt));
    } else {
      parts.push(renderCommon(text));
    }
  }

  // Identical inputs → diffArrays returns one common chunk; we still
  // re-emit as plain <p>. The caller treats "no <ins> / <del>" as a
  // signal that there was nothing to propose.
  return parts.join("");
}

/* ----------------------------------------------------------------------------
 * Internals
 * --------------------------------------------------------------------------*/

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
  // Wrap each marked run in a <p> — Tiptap's schema requires inline content
  // to live inside a block, and the section editor expects paragraph-level
  // structure. Empty runs (whitespace-only) are skipped above already.
  return (
    `<p><${tag} data-suggestion-id="${id}" data-suggestion-kind="${kind}" ` +
    `data-author="${author}"${authorId}${body} ` +
    `data-created-at="${createdAt}" data-status="pending" data-suggestion="" ` +
    `class="${cls}">${escapeHtml(text)}</${tag}></p>`
  );
}

function renderCommon(text: string): string {
  // Common sentences always get wrapped in <p>. We escape any HTML
  // metacharacters since we're rebuilding from plain text.
  return `<p>${escapeHtml(text)}</p>`;
}

function wrapWhole(
  text: string,
  kind: "insertion" | "deletion",
  attrs: DiffSuggestionAttrs,
  createdAt: number,
): string {
  return renderMark(kind, text, attrs, createdAt);
}

/**
 * Strip tags + collapse entities to plain text. Block-level tags become
 * sentence boundaries (newline) so a `<p>foo</p><p>bar</p>` blob splits
 * into two sentences instead of "foobar".
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
  // Insert a sentence break after each block-level close so multi-paragraph
  // input doesn't smush together when textContent flattens it.
  root.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, li, tr, blockquote, figure, figcaption, br")
    .forEach((el) => {
      el.appendChild(document.createTextNode("\n"));
    });
  return (root.textContent ?? "").trim();
}

/**
 * Tokenise prose into sentences. Splits on terminal punctuation followed
 * by whitespace OR newline. Keeps the trailing punctuation attached so
 * the rendered diff reads naturally ("Hello." not "Hello"). Multi-line
 * input (paragraph breaks) is treated as an implicit sentence boundary.
 */
function splitSentences(text: string): string[] {
  if (!text) return [];
  // Normalise newlines into a sentinel space + period when missing one,
  // so paragraph breaks become clean splits even if the prose lacked
  // terminal punctuation (HR letters often have lists / one-liners).
  const normalised = text.replace(/\n+/g, "\n");
  const lines = normalised.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Greedy split on .!?; followed by whitespace or end-of-line. The
    // capturing group keeps the terminator attached to the preceding
    // sentence (look-behind would also work but is less portable).
    const parts = trimmed.split(/(?<=[.!?;])\s+/);
    for (const p of parts) {
      const s = p.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
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
