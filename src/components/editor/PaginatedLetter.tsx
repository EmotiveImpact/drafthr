import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { Loader2 } from "lucide-react";
import { pagedPreviewStylesheet } from "./paged-edit/printCss";
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
export function PaginatedLetter({ draft }: { draft: Draft }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewerRef = useRef<PreviewerInstance | null>(null);
  const [busy, setBusy] = useState(true);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build the source HTML once per draft change. This includes letterhead,
  // resolved figure references (so [See Fig N] reflects current numbering),
  // signature embedded into the signature section, an auto-Attachments
  // block when there are attached evidence items, and the disclaimer.
  const sourceHtml = buildPreviewSourceHtml(draft);

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
       * card. */}
      <div ref={containerRef} className="paged-letter-container" />
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
