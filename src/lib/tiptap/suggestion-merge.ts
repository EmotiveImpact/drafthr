import type { JSONContent } from "@tiptap/core";
import type {
  SuggestionAttrs,
  SuggestionKind,
  SuggestionStatus,
} from "./suggestion-mark";

const MARK_NAME = "suggestion";

export type SuggestionSummary = {
  id: string;
  kind: SuggestionKind;
  author: string;
  authorId?: string;
  body?: string;
  status: SuggestionStatus;
  /** Text wrapped by the mark (insertion payload or deleted text). */
  text: string;
  createdAt: number;
};

/* ----------------------------------------------------------------------------
 * JSONContent helpers — pure tree walks. The Tiptap Editor.getJSON() shape
 * matches this exactly, so callers can pass an editor doc straight in.
 * --------------------------------------------------------------------------*/

type SuggestionMarkLike = {
  type: string;
  attrs?: Partial<SuggestionAttrs>;
};

function suggestionMarkOf(
  node: JSONContent,
): SuggestionMarkLike | undefined {
  return node.marks?.find((m): m is SuggestionMarkLike => m.type === MARK_NAME);
}

/**
 * Apply every accepted suggestion in the doc destructively.
 *
 *   accepted + insertion  → strip the mark, keep the wrapped text
 *   accepted + deletion   → drop the wrapped text and the mark
 *   pending  (any kind)   → strip the mark (treat indecision as "do not apply")
 *   rejected (any kind)   → leave the mark + text intact
 *
 * Pending insertions vanish (their text was never canonical), pending
 * deletions stay (their text was the original; we just discard the proposal).
 */
export function mergeAcceptedSuggestions(doc: JSONContent): JSONContent {
  return walk(doc) as JSONContent;
}

function walk(node: JSONContent): JSONContent | null {
  const mark = suggestionMarkOf(node);
  if (mark) {
    const status = (mark.attrs?.status ?? "pending") as SuggestionStatus;
    const kind = (mark.attrs?.kind ?? "insertion") as SuggestionKind;
    if (status === "accepted" && kind === "deletion") return null;
    if (status === "pending" && kind === "insertion") return null;
    if (status === "accepted" || status === "pending") {
      return walkStripMark({ ...node }, mark);
    }
  }
  if (Array.isArray(node.content)) {
    const next: JSONContent[] = [];
    for (const child of node.content) {
      const out = walk(child);
      if (out) next.push(out);
    }
    return { ...node, content: next };
  }
  return node;
}

function walkStripMark(
  node: JSONContent,
  removed: SuggestionMarkLike,
): JSONContent {
  const cleaned: JSONContent = {
    ...node,
    marks: (node.marks ?? []).filter((m) => m !== removed),
  };
  if (cleaned.marks && cleaned.marks.length === 0) delete cleaned.marks;
  if (Array.isArray(cleaned.content)) {
    const next: JSONContent[] = [];
    for (const child of cleaned.content) {
      const out = walk(child);
      if (out) next.push(out);
    }
    cleaned.content = next;
  }
  return cleaned;
}

/** Flatten every suggestion mark in `doc` into a summary list. */
export function listSuggestions(doc: JSONContent): SuggestionSummary[] {
  const summaries = new Map<string, SuggestionSummary>();
  collect(doc, summaries);
  return Array.from(summaries.values());
}

function collect(
  node: JSONContent,
  acc: Map<string, SuggestionSummary>,
): void {
  if (node.type === "text" && node.text) {
    const mark = suggestionMarkOf(node);
    if (mark?.attrs?.id) {
      const id = String(mark.attrs.id);
      const existing = acc.get(id);
      if (existing) {
        existing.text += node.text;
      } else {
        acc.set(id, {
          id,
          kind: (mark.attrs.kind ?? "insertion") as SuggestionKind,
          author: String(mark.attrs.author ?? ""),
          authorId: mark.attrs.authorId
            ? String(mark.attrs.authorId)
            : undefined,
          body: mark.attrs.body ? String(mark.attrs.body) : undefined,
          status: (mark.attrs.status ?? "pending") as SuggestionStatus,
          text: node.text,
          createdAt: Number(mark.attrs.createdAt ?? 0),
        });
      }
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collect(child, acc);
  }
}

/* ----------------------------------------------------------------------------
 * HTML helpers — DOM-based equivalents used by the store action so it doesn't
 * have to spin up a hidden Tiptap editor just to apply accepted edits. jsdom
 * provides DOMParser in tests; the browser provides it at runtime.
 * --------------------------------------------------------------------------*/

const SUGGESTION_SELECTOR =
  "ins[data-suggestion-id], del[data-suggestion-id]";

/**
 * Apply mergeAcceptedSuggestions to an HTML string.
 *
 * Two modes:
 *   - authoring (default): rejected marks are LEFT intact, so the reviewer
 *     still sees their decision in the editor.
 *   - export (`{ forExport: true }`): the result is a FINAL document, so
 *     reviewer state must never appear. Rejected/pending INSERTIONS are
 *     removed with their text (they were never wanted); rejected/pending
 *     DELETIONS are unwrapped, keeping the original text but dropping the
 *     strike-through markup. After this, no <ins>/<del> wrapper remains.
 *
 * (Bug: in authoring mode rejected insertions kept their text inside <ins>,
 * and the export sanitiser's KEEP_CONTENT + USE_PROFILES re-permitted <ins>,
 * so a clause the reviewer explicitly rejected reappeared as plain prose in
 * the exported PDF/DOCX/mobile view.)
 */
export function mergeAcceptedSuggestionsHtml(
  html: string,
  opts?: { forExport?: boolean },
): string {
  if (!html || typeof window === "undefined") return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  applyMergeToDom(root, opts?.forExport ?? false);
  return root.innerHTML;
}

/** List every suggestion in an HTML string (deduped by id, text concatenated). */
export function listSuggestionsHtml(html: string): SuggestionSummary[] {
  if (!html || typeof window === "undefined") return [];
  const root = document.createElement("div");
  root.innerHTML = html;
  const out = new Map<string, SuggestionSummary>();
  root.querySelectorAll(SUGGESTION_SELECTOR).forEach((el) => {
    const id = el.getAttribute("data-suggestion-id");
    if (!id) return;
    const tag = el.tagName.toLowerCase();
    const kindAttr = el.getAttribute("data-suggestion-kind");
    const kind: SuggestionKind =
      kindAttr === "deletion" || kindAttr === "insertion"
        ? kindAttr
        : tag === "del"
          ? "deletion"
          : "insertion";
    const statusAttr = el.getAttribute("data-status");
    const status: SuggestionStatus =
      statusAttr === "accepted" || statusAttr === "rejected"
        ? statusAttr
        : "pending";
    const text = el.textContent ?? "";
    const existing = out.get(id);
    if (existing) {
      existing.text += text;
      return;
    }
    out.set(id, {
      id,
      kind,
      author: el.getAttribute("data-author") ?? "",
      authorId: el.getAttribute("data-author-id") ?? undefined,
      body: el.getAttribute("data-body") ?? undefined,
      status,
      text,
      createdAt: Number(el.getAttribute("data-created-at") ?? 0) || 0,
    });
  });
  return Array.from(out.values());
}

function applyMergeToDom(root: ParentNode, forExport = false): void {
  // Iterate over a static snapshot because we mutate the tree as we go.
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(SUGGESTION_SELECTOR),
  );
  for (const el of nodes) {
    if (!el.parentNode) continue;
    const tag = el.tagName.toLowerCase();
    const kindAttr = el.getAttribute("data-suggestion-kind");
    const kind: SuggestionKind =
      kindAttr === "deletion" || kindAttr === "insertion"
        ? kindAttr
        : tag === "del"
          ? "deletion"
          : "insertion";
    const status = el.getAttribute("data-status") ?? "pending";
    if (status === "rejected") {
      if (!forExport) continue;
      // EXPORT: a final document must not carry reviewer state. A rejected
      // insertion was never wanted → remove it and its text. A rejected
      // deletion means the original text STAYS → unwrap, keeping the text but
      // dropping the <del> strike-through markup.
      if (kind === "insertion") {
        el.parentNode.removeChild(el);
      } else {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.parentNode.removeChild(el);
      }
      continue;
    }
    if (kind === "deletion" && status === "accepted") {
      el.parentNode.removeChild(el);
      continue;
    }
    if (kind === "insertion" && status === "pending") {
      // Pending insertions were never canonical text — drop them entirely.
      el.parentNode.removeChild(el);
      continue;
    }
    // Accepted insertion OR pending deletion → strip the wrapper, keep the
    // text. pending-deletion keeps the original text the reviewer wanted to
    // remove; accepted-insertion promotes the addition into the doc.
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.parentNode.removeChild(el);
  }
}

/** Whether `html` has any pending suggestion marks. Cheap-check used to
 * gate UI affordances ("Accept all" only appears when there's work). */
export function hasPendingSuggestions(html: string): boolean {
  if (!html) return false;
  // Cheap string probe first so we skip DOM parsing in the common case.
  if (!html.includes("data-suggestion-id")) return false;
  if (typeof window === "undefined") return false;
  const root = document.createElement("div");
  root.innerHTML = html;
  return Array.from(root.querySelectorAll(SUGGESTION_SELECTOR)).some((el) => {
    const status = el.getAttribute("data-status") ?? "pending";
    return status === "pending";
  });
}
