import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { sanitizeLetterHtml } from "@/lib/sanitize";

import { wrapInPrintHtml } from "./printCss";

/**
 * Edit-on-page that IS paged.js. Each rendered .pagedjs_page card is
 * the user's edit surface — they type directly into the same A4 cards
 * Preview shows, with real whitespace between pages. No fake overlay
 * strips, no continuous scrolling card. The on-screen letter and the
 * printed letter are the same DOM.
 *
 * The hard part: paged.js mutates its DOM during a flow. Live TipTap
 * can't survive that, which is why earlier iterations punted to a
 * single continuous editor. Here we take a different deal: TipTap is
 * gone, the source of truth is plain HTML in state, and we re-flow on
 * a typing-idle debounce. Cursor is captured before each re-flow
 * (against a stable data-paged-ref + char offset) and restored after.
 *
 * Tradeoffs the user explicitly accepted picking this approach:
 *   - Cursor jumps briefly during re-pagination (~60-150 ms of layout)
 *   - Overflow text spills past the page bottom until re-flow lands
 *   - No collaborative cursor / undo stack (browser native only)
 *
 * Tradeoffs avoided:
 *   - No fake "page-break" overlays — page breaks are real DOM
 *   - No drift between editor and print render — they share CSS, paged.js
 *   - No two-tree-sync problem
 */

const REPAGINATE_DELAY_MS = 600;

type CursorState = {
  /** data-paged-ref of the source block the caret is inside. */
  ref: string;
  /** Char offset from the start of that block's text content. */
  offset: number;
};

export function PagedEditor({
  draft,
  onDone,
}: {
  draft: Draft;
  onDone: () => void;
}) {
  const updateSection = useDraftStore((state) => state.updateSection);

  const containerRef = useRef<HTMLDivElement>(null);
  /** The HTML truth — kept current via reconstructSourceHtml() on every save. */
  const sourceHtmlRef = useRef<string>(buildMergedSourceHtml(draft));
  /** Monotonic token to drop stale paginations when typing fires fast. */
  const flowTokenRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const [busy, setBusy] = useState(true);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ------------------------------------------------------------------------
   * Render pipeline — paginate sourceHtmlRef into the container.
   * ----------------------------------------------------------------------*/
  const repaginate = useCallback(async (cursor: CursorState | null) => {
    const container = containerRef.current;
    if (!container) return;
    const token = ++flowTokenRef.current;

    const scrollEl = findScrollAncestor(container);
    const scrollTop = scrollEl?.scrollTop ?? 0;

    setBusy(true);
    setError(null);
    try {
      const { Previewer } = await import("pagedjs");
      if (token !== flowTokenRef.current) return;

      // Stamp data-paged-ref on visible blocks before passing to paged.js
      // so we can match source positions in the rendered clones after.
      const stamped = stampPagedRefs(sourceHtmlRef.current);
      const full = wrapInPrintHtml(stamped);

      container.innerHTML = "";
      const previewer = new Previewer();
      const flow = await previewer.preview(full, [], container);
      if (token !== flowTokenRef.current) return;

      setPageCount(flow.total ?? null);

      // Turn every page's content area into an editable surface.
      // overflow:visible so text spills past the page bottom rather than
      // being clipped while the user types ahead of the next re-flow.
      const pageContents =
        container.querySelectorAll<HTMLElement>(".pagedjs_page_content");
      for (const pc of pageContents) {
        pc.contentEditable = "true";
        pc.spellcheck = true;
        pc.style.outline = "none";
        pc.style.overflow = "visible";
      }

      // Restore caret + scroll *after* contentEditable is set, otherwise
      // some browsers reject the selection on read-only nodes.
      if (cursor) restoreCursor(container, cursor);
      if (scrollEl) scrollEl.scrollTop = scrollTop;
      setBusy(false);
    } catch (err) {
      if (token === flowTokenRef.current) {
        setError(err instanceof Error ? err.message : "Failed to paginate");
        setBusy(false);
      }
    }
  }, []);

  /* ------------------------------------------------------------------------
   * Lifecycle — initial paginate + cleanup.
   * ----------------------------------------------------------------------*/
  useEffect(() => {
    void repaginate(null);
    return () => {
      // Invalidate any in-flight pagination so it can't setState after unmount.
      flowTokenRef.current++;
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
    // We want one paginate per draft.id — rebuilding on every render would
    // wipe the user's keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  /* ------------------------------------------------------------------------
   * Input handler — debounce + reconstruct source + save + re-paginate.
   * ----------------------------------------------------------------------*/
  const flushPendingEdit = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cursor = captureCursor(container);
    const nextSource = reconstructSourceHtml(container);
    sourceHtmlRef.current = nextSource;
    // Save to store at section granularity so collaborators / other surfaces
    // see updates without re-loading the whole letter.
    saveToStore(nextSource, draft, updateSection);
    setDirty(false);
    void repaginate(cursor);
  }, [draft, updateSection, repaginate]);

  const onInput = useCallback(() => {
    setDirty(true);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      flushPendingEdit();
    }, REPAGINATE_DELAY_MS);
  }, [flushPendingEdit]);

  /* ------------------------------------------------------------------------
   * Done — flush pending edit, save, hand back to parent.
   * ----------------------------------------------------------------------*/
  const handleDone = useCallback(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const container = containerRef.current;
    if (container) {
      const nextSource = reconstructSourceHtml(container);
      sourceHtmlRef.current = nextSource;
      saveToStore(nextSource, draft, updateSection);
    }
    setDirty(false);
    onDone();
  }, [draft, updateSection, onDone]);

  return (
    <div className="paged-edit-shell">
      <div className="mx-auto mb-3 flex w-[min(8.27in,100%)] items-center justify-between rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-1.5 text-[11px] shadow-sm">
        <span className="text-[var(--ds-muted)]">
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Paginating…
            </span>
          ) : error ? (
            <span className="text-[var(--ds-red-fg)]">{error}</span>
          ) : pageCount != null ? (
            `${pageCount} page${pageCount === 1 ? "" : "s"} · A4`
          ) : (
            ""
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span
            className="text-[10px] text-[var(--ds-muted)] tabular-nums"
            aria-live="polite"
          >
            {dirty ? "Saving…" : "Saved"}
          </span>
          <button
            type="button"
            onClick={handleDone}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--ds-ink)] px-2.5 text-[11px] font-medium text-white transition hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>

      {/* The paged.js render IS the editor. onInput bubbles up here from
       * every contentEditable page-content child. */}
      <div
        ref={containerRef}
        className="paged-editor-canvas"
        onInput={onInput}
      />
    </div>
  );
}

/* ============================================================================
 * Source HTML composition
 * ==========================================================================*/

/**
 * Merge all sections into one HTML fragment with hidden section-anchor
 * sentinels between them. The anchors survive paged.js's clone-and-stamp
 * pass and let us split content back into sections at save time.
 */
function buildMergedSourceHtml(draft: Draft): string {
  return draft.sections
    .map((s) => {
      const anchor = `<div data-section-anchor data-section-id="${escAttr(s.id)}" style="display:none;height:0;line-height:0;margin:0;padding:0;"></div>`;
      return anchor + sanitizeLetterHtml(s.html || "");
    })
    .join("");
}

/**
 * Stamp `data-paged-ref="0..N"` on every top-level visible block (skipping
 * section anchors). Refs are by position; they're stable for one round-trip
 * from "render → user edits → reconstruct → re-render" and that's all we
 * need.
 */
function stampPagedRefs(html: string): string {
  const doc = new DOMParser().parseFromString(`<div class="letter-body">${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return `<div class="letter-body">${html}</div>`;
  let i = 0;
  for (const child of Array.from(root.children)) {
    if (child.hasAttribute("data-section-anchor")) continue;
    child.setAttribute("data-paged-ref", String(i));
    i++;
  }
  return root.outerHTML;
}

/* ============================================================================
 * Cursor capture / restore — keep the caret stable across re-pagination.
 * ==========================================================================*/

function captureCursor(root: HTMLElement): CursorState | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const start = range.startContainer;
  // Only care about selections inside our editable surface — paged.js
  // chrome (page numbers, etc.) shouldn't be the cursor anchor anyway.
  if (!root.contains(start)) return null;

  let el: HTMLElement | null =
    start.nodeType === 3
      ? (start.parentElement as HTMLElement | null)
      : (start as HTMLElement);
  let refEl: HTMLElement | null = null;
  while (el && el !== root) {
    if (el.hasAttribute && el.hasAttribute("data-paged-ref")) {
      refEl = el;
      break;
    }
    el = el.parentElement;
  }
  if (!refEl) return null;

  const offset = textOffsetWithin(refEl, start, range.startOffset);
  return { ref: refEl.getAttribute("data-paged-ref")!, offset };
}

function textOffsetWithin(
  root: HTMLElement,
  target: Node,
  targetOffset: number,
): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === target) return total + targetOffset;
    total += (node.textContent || "").length;
    node = walker.nextNode();
  }
  return total;
}

function restoreCursor(root: HTMLElement, cursor: CursorState): void {
  // A long block may have been split across multiple pages, so a single
  // data-paged-ref can appear in several rendered clones. Walk them in
  // order and decrement the offset until it lands inside one.
  const matches = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-paged-ref="${CSS.escape(cursor.ref)}"]`),
  );
  if (matches.length === 0) return;

  let remaining = cursor.offset;
  for (const match of matches) {
    const len = (match.textContent || "").length;
    if (remaining <= len) {
      const placed = placeCaretInTextAt(match, remaining);
      if (placed) {
        // Make sure the caret's page-content is actually focused so
        // typing continues, not just visually marked.
        const pageContent = match.closest<HTMLElement>(".pagedjs_page_content");
        pageContent?.focus({ preventScroll: true });
        return;
      }
    }
    remaining -= len;
  }
  // Cursor fell past the content (e.g. content shrunk) — drop it at the
  // end of the last matching block instead of losing it entirely.
  const last = matches[matches.length - 1];
  const range = document.createRange();
  range.selectNodeContents(last);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  last.closest<HTMLElement>(".pagedjs_page_content")?.focus({ preventScroll: true });
}

function placeCaretInTextAt(root: HTMLElement, offset: number): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return true;
    }
    remaining -= len;
    node = walker.nextNode() as Text | null;
  }
  return false;
}

/* ============================================================================
 * Source reconstruction — fold the rendered page-contents back into the
 * source HTML that paginate() consumes. Handles paged.js's mid-block splits
 * by merging all instances of a given data-paged-ref into a single element
 * whose innerHTML is the concatenation of every instance's innerHTML.
 * ==========================================================================*/

type RebuildItem =
  | { kind: "anchor"; outerHTML: string; sectionId: string }
  | { kind: "block"; ref: string; first: HTMLElement; innerParts: string[] };

function reconstructSourceHtml(container: HTMLElement): string {
  const pageContents = container.querySelectorAll<HTMLElement>(".pagedjs_page_content");
  const items: RebuildItem[] = [];
  const blockIndex = new Map<string, number>();
  const seenAnchors = new Set<string>();

  for (const pc of pageContents) {
    const walker = document.createTreeWalker(pc, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode() as HTMLElement | null;
    while (node) {
      if (node.hasAttribute("data-section-anchor")) {
        const id = node.getAttribute("data-section-id") || "";
        if (!seenAnchors.has(id)) {
          seenAnchors.add(id);
          items.push({
            kind: "anchor",
            sectionId: id,
            outerHTML: anchorHtmlFor(id),
          });
        }
      } else if (node.hasAttribute("data-paged-ref")) {
        const ref = node.getAttribute("data-paged-ref")!;
        if (blockIndex.has(ref)) {
          const item = items[blockIndex.get(ref)!];
          if (item.kind === "block") item.innerParts.push(node.innerHTML);
        } else {
          blockIndex.set(ref, items.length);
          items.push({
            kind: "block",
            ref,
            first: node,
            innerParts: [node.innerHTML],
          });
        }
      }
      node = walker.nextNode() as HTMLElement | null;
    }
  }

  const parts: string[] = [];
  for (const item of items) {
    if (item.kind === "anchor") {
      parts.push(item.outerHTML);
      continue;
    }
    const clone = item.first.cloneNode(false) as HTMLElement;
    // paged.js stamps data-ref on every element. Strip it so the next
    // round doesn't see stale UUIDs from this render.
    clone.removeAttribute("data-ref");
    clone.removeAttribute("data-id");
    clone.removeAttribute("data-paged-ref");
    clone.innerHTML = item.innerParts.join("");
    parts.push(clone.outerHTML);
  }

  return parts.join("");
}

function anchorHtmlFor(id: string): string {
  return `<div data-section-anchor data-section-id="${escAttr(id)}" style="display:none;height:0;line-height:0;margin:0;padding:0;"></div>`;
}

/* ============================================================================
 * Save — split reconstructed source by anchor + push each section to store.
 * ==========================================================================*/

function saveToStore(
  sourceHtml: string,
  draft: Draft,
  updateSection: (draftId: string, sectionId: string, html: string) => void,
): void {
  const splits = splitBySection(sourceHtml);
  for (const section of draft.sections) {
    const next = splits[section.id] ?? "";
    if (next !== (section.html || "")) {
      updateSection(draft.id, section.id, next);
    }
  }
}

function splitBySection(sourceHtml: string): Record<string, string> {
  const doc = new DOMParser().parseFromString(`<div>${sourceHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const result: Record<string, string> = {};
  if (!root) return result;
  let currentId: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (currentId != null) result[currentId] = buf.join("");
    buf = [];
  };
  for (const node of Array.from(root.childNodes)) {
    if (
      node.nodeType === 1 &&
      (node as HTMLElement).getAttribute("data-section-anchor") !== null
    ) {
      flush();
      currentId = (node as HTMLElement).getAttribute("data-section-id");
      continue;
    }
    if (node.nodeType === 1) buf.push((node as HTMLElement).outerHTML);
    else if (node.nodeType === 3) buf.push(node.textContent ?? "");
  }
  flush();
  return result;
}

/* ============================================================================
 * Utilities
 * ==========================================================================*/

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function findScrollAncestor(el: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body) {
    const cs = getComputedStyle(cur);
    if (/(auto|scroll)/.test(cs.overflowY) && cur.scrollHeight > cur.clientHeight) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}
