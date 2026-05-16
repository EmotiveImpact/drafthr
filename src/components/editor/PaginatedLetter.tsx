import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { Loader2, MessageSquarePlus } from "lucide-react";
import {
  applyResponsivePageScale,
  observeResponsivePageScale,
  pagedPreviewStylesheet,
} from "./paged-edit/printCss";
import { buildPreviewSourceHtml } from "./paged-edit/sourceHtml";

type PreviewerInstance = {
  preview: (
    content: string | HTMLElement,
    stylesheets: Array<string | Record<string, string>>,
    renderTo: HTMLElement,
  ) => Promise<{ total?: number | null }>;
  chunker?: {
    stop?: () => void;
    destroy?: () => void;
  };
  polisher?: {
    destroy?: () => void;
  };
};

/**
 * Renders the letter as discrete A4 pages using paged.js (W3C CSS Paged
 * Media). Content flows page-to-page like Word's print preview: each page
 * is its own visible card with shadow, page numbers in the footer, and
 * the same margins / pagination rules the printed/PDF output will use.
 *
 * Read-only by design — editing is handled by the inline TipTap variant
 * in LetterPreview's "Edit on page" mode. Paged.js measures DOM heavily
 * and doesn't compose cleanly with a live editor; the two modes are
 * separate render paths sharing the same source HTML.
 *
 * paged.js is lazy-loaded (~150 KB) only when this component mounts.
 */
type AddCommentOpts = { quote?: string };

export function PaginatedLetter({
  draft,
  onAddComment,
  onFocusComment,
}: {
  draft: Draft;
  /** Open the new-comment panel for a section, optionally seeded with the
   * selected quote. Called when the user clicks the floating "+ Comment"
   * bubble that appears next to a text selection inside a paged page. */
  onAddComment?: (sectionId: string, opts?: AddCommentOpts) => void;
  /** Focus an existing inline-anchored comment when the user clicks its
   * `<mark data-comment-id>` highlight in the paged render. */
  onFocusComment?: (commentId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewerRef = useRef<PreviewerInstance | null>(null);
  const [busy, setBusy] = useState(true);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Position + section id of the selection bubble. Null = no bubble. */
  const [selectionBubble, setSelectionBubble] = useState<{
    top: number;
    left: number;
    sectionId: string;
    quote: string;
  } | null>(null);

  // Build the source HTML once per draft change. This includes letterhead,
  // resolved figure references (so [See Fig N] reflects current numbering),
  // signature embedded into the signature section, an auto-Attachments
  // block when there are attached evidence items, and the disclaimer.
  const sourceHtml = buildPreviewSourceHtml(draft);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return observeResponsivePageScale(container);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let previewer: PreviewerInstance | null = null;
    destroyPreviewer(previewerRef.current);
    previewerRef.current = null;
    container.replaceChildren();
    setBusy(true);
    setError(null);

    void (async () => {
      try {
        // Lazy import — pagedjs is ~150 KB and only needed in preview.
        const { Previewer } = await import("pagedjs");
        if (cancelled) return;
        previewer = new Previewer() as PreviewerInstance;
        const flow = await previewer.preview(sourceHtml, [pagedPreviewStylesheet()], container);
        if (cancelled) {
          destroyPreviewer(previewer);
          return;
        }
        applyResponsivePageScale(container);
        previewerRef.current = previewer;
        setPageCount(flow.total ?? null);
        setBusy(false);
      } catch (err) {
        if (previewer) destroyPreviewer(previewer);
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to paginate");
        setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      destroyPreviewer(previewer);
      if (previewerRef.current === previewer) {
        previewerRef.current = null;
      }
    };
  }, [sourceHtml]);

  // Comment-mark click + selection bubble. Wires up once per paginate
  // cycle because paged.js replaces the DOM under .pagedjs_pages each
  // time `sourceHtml` changes; we attach to the container which survives.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!onAddComment && !onFocusComment) return;

    const onClick = (event: MouseEvent) => {
      if (!onFocusComment) return;
      const target = event.target as HTMLElement | null;
      const mark = target?.closest?.("mark[data-comment-id]") as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute("data-comment-id");
      if (id) {
        event.preventDefault();
        onFocusComment(id);
      }
    };

    const onSelectionChange = () => {
      if (!onAddComment) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelectionBubble(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const anchorEl = range.commonAncestorContainer as HTMLElement;
      // Must be inside a paged.js page body.
      const pageBody = (
        anchorEl.nodeType === 3 ? anchorEl.parentElement : anchorEl
      )?.closest?.(".pagedjs_page .letter-body");
      if (!pageBody) {
        setSelectionBubble(null);
        return;
      }
      // Determine the section the selection sits inside so the new comment
      // is anchored correctly. Section anchors are emitted by sourceHtml as
      // `data-section-anchor` markers.
      const sectionAnchor = (
        anchorEl.nodeType === 3 ? anchorEl.parentElement : anchorEl
      )?.closest?.("[data-section-anchor]") as HTMLElement | null;
      const sectionId =
        sectionAnchor?.getAttribute("data-section-anchor") ??
        // Fall back to the first section so the comment doesn't get
        // orphaned — better than dropping the click on the floor.
        draft.sections[0]?.id ??
        "";
      if (!sectionId) {
        setSelectionBubble(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelectionBubble(null);
        return;
      }
      const containerRect = container.getBoundingClientRect();
      setSelectionBubble({
        // Position the bubble just above the selection in container-local
        // coordinates so it tracks horizontal scroll.
        top: rect.top - containerRect.top - 34,
        left: rect.left - containerRect.left + rect.width / 2 - 60,
        sectionId,
        quote: sel.toString().trim().slice(0, 240),
      });
    };

    container.addEventListener("click", onClick);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      container.removeEventListener("click", onClick);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [draft.sections, onAddComment, onFocusComment, sourceHtml]);

  return (
    <div className="paginated-letter-shell">
      {/* Top hint — page count + busy state. Sits above the paginated stack
       * so it doesn't get caught up in paged.js's DOM transformations. */}
      <div className="mx-auto max-w-[8.27in] mb-3 px-1 flex items-center justify-between text-[11px] text-[var(--ds-muted)]">
        <span>
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Paginating…
            </span>
          ) : error ? (
            <span className="text-[var(--ds-red-fg)]">{error}</span>
          ) : pageCount ? (
            `${pageCount} page${pageCount === 1 ? "" : "s"} · A4`
          ) : (
            ""
          )}
        </span>
      </div>

      {/* paged.js renders into this container. Each generated page becomes
       * a `.pagedjs_page` element which our print CSS styles as a paper
       * card. We position the selection bubble relative to this wrapper
       * so it scrolls with the pages. */}
      <div ref={containerRef} className="paged-letter-container relative">
        {selectionBubble && onAddComment && (
          <button
            type="button"
            onMouseDown={(e) => {
              // Prevent the click clearing the selection before we read it.
              e.preventDefault();
            }}
            onClick={() => {
              onAddComment(selectionBubble.sectionId, { quote: selectionBubble.quote });
              setSelectionBubble(null);
              // Clear the browser selection so the bubble dismisses cleanly.
              window.getSelection()?.removeAllRanges();
            }}
            style={{ top: selectionBubble.top, left: selectionBubble.left }}
            className="absolute z-30 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--ds-ink)] text-white text-[11px] font-medium shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:opacity-95"
          >
            <MessageSquarePlus className="size-3" />
            Comment
          </button>
        )}
      </div>
    </div>
  );
}

function destroyPreviewer(previewer: PreviewerInstance | null): void {
  if (!previewer) return;
  try {
    previewer.chunker?.stop?.();
    previewer.chunker?.destroy?.();
    previewer.polisher?.destroy?.();
  } catch {
    // paged.js cleanup should not mask preview rendering.
  }
}
