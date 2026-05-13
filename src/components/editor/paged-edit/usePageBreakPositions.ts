import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { paginate } from "./offscreenPaginator";

/**
 * Watches a TipTap editor and emits the y-offsets where paged.js would
 * insert page breaks if the same content were rendered to A4.
 *
 * Strategy:
 *   1. On every editor update (debounced 350 ms — paginate is ~80-150 ms
 *      and we don't want to lock keystrokes) take editor.getHTML().
 *   2. Walk that HTML and stamp `data-paged-ref="0..N"` on each
 *      top-level block. Indices are stable for the duration of one
 *      pagination cycle so we don't need a permanent id on the node.
 *   3. Hand the stamped HTML to paginate() (printCss + Previewer). It
 *      returns a list of breaks where each break.sourceRef is the
 *      index of the last block that still fit on that page.
 *   4. Look up the same block in editor.view.dom by counting top-level
 *      children. Read its bounding rect's `bottom` and subtract the
 *      editor root's `top` — that's the y-pixel offset where the
 *      break overlay should sit.
 *
 * Returns { pageCount, breakOffsets } — `breakOffsets[i]` is the
 * absolute y position (in editor-relative coords) where the strip
 * marking the end of page (i+1) should render. The PageBreakOverlay
 * component (next commit) layers strips at those positions.
 *
 * The hook is intentionally fault-tolerant: if pagination throws or
 * blocks can't be matched, it falls back to the last successful
 * result rather than blanking the overlay during a hot keystroke.
 */

const DEBOUNCE_MS = 350;

type Result = {
  pageCount: number;
  /** y-offsets within the editor's content root, in CSS pixels. */
  breakOffsets: number[];
};

const EMPTY: Result = { pageCount: 1, breakOffsets: [] };

/**
 * Stamp `data-paged-ref` on each top-level block of a fragment. We use
 * the block's index as the ref because indices are stable across the
 * single round-trip from getHTML → paginate → match-in-DOM.
 */
function stampRefs(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;
  let i = 0;
  for (const child of Array.from(root.children)) {
    // Skip invisible anchor markers — they don't render a visible
    // block in the editor either, so the index walk in the live DOM
    // would otherwise drift.
    if (child.hasAttribute("data-section-anchor")) continue;
    child.setAttribute("data-paged-ref", String(i));
    i++;
  }
  return root.innerHTML;
}

/**
 * Walk top-level children of the editor's ProseMirror root, skipping
 * anchors, and return the nth visible block.
 */
function findBlockByIndex(editorRoot: HTMLElement, index: number): HTMLElement | null {
  let i = 0;
  for (const child of Array.from(editorRoot.children)) {
    if ((child as HTMLElement).hasAttribute("data-section-anchor")) continue;
    if (i === index) return child as HTMLElement;
    i++;
  }
  return null;
}

export function usePageBreakPositions(editor: Editor | null): Result {
  const [result, setResult] = useState<Result>(EMPTY);
  const timerRef = useRef<number | null>(null);
  // Holds the latest successful result so an in-flight pagination
  // failure (or a transient layout glitch) doesn't blank the overlay.
  const lastGoodRef = useRef<Result>(EMPTY);
  // Guard against state updates after unmount or after a stale call
  // finishes — paginate is async and the editor might be torn down
  // before we get to setState.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!editor) return;

    let cancelled = false;

    const recompute = async () => {
      if (cancelled || !aliveRef.current) return;
      const html = editor.getHTML();
      const stamped = stampRefs(html);
      const wrapped = `<div class="letter-body">${stamped}</div>`;
      let pagination;
      try {
        pagination = await paginate(wrapped);
      } catch {
        return; // keep lastGood
      }
      if (cancelled || !aliveRef.current) return;

      const editorRoot = editor.view.dom as HTMLElement;
      if (!editorRoot.isConnected) return;
      const rootTop = editorRoot.getBoundingClientRect().top;
      const breakOffsets: number[] = [];
      for (const br of pagination.breaks) {
        if (!br.sourceRef) continue;
        const idx = Number.parseInt(br.sourceRef, 10);
        if (!Number.isFinite(idx)) continue;
        const block = findBlockByIndex(editorRoot, idx);
        if (!block) continue;
        const rect = block.getBoundingClientRect();
        // Position the break overlay right at the bottom edge of the
        // last block that fits — i.e. just after it in document order.
        breakOffsets.push(rect.bottom - rootTop);
      }

      const next: Result = {
        pageCount: pagination.pageCount,
        breakOffsets,
      };
      lastGoodRef.current = next;
      setResult(next);
    };

    const schedule = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void recompute();
      }, DEBOUNCE_MS);
    };

    editor.on("update", schedule);
    // Initial pass — let TipTap mount and apply CSS before measuring.
    const initial = window.setTimeout(() => {
      void recompute();
    }, 50);

    return () => {
      cancelled = true;
      editor.off("update", schedule);
      window.clearTimeout(initial);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [editor]);

  return result;
}
