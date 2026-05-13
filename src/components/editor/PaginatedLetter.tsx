import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { resolveFigureRefsInHtml, displayModeOf, figureLabelFor } from "@/lib/evidence";
import { Loader2 } from "lucide-react";
import { wrapInPrintHtml } from "./paged-edit/printCss";

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
  const [busy, setBusy] = useState(true);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build the source HTML once per draft change. This includes letterhead,
  // resolved figure references (so [See Fig N] reflects current numbering),
  // signature embedded into the signature section, an auto-Attachments
  // block when there are attached evidence items, and the disclaimer.
  const sourceHtml = buildSourceHtml(draft);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    container.innerHTML = "";
    setBusy(true);
    setError(null);

    void (async () => {
      try {
        // Lazy import — pagedjs is ~150 KB and only needed in preview.
        const { Previewer } = await import("pagedjs");
        if (cancelled) return;
        const previewer = new Previewer();
        const fullDoc = wrapInPrintHtml(sourceHtml);
        const flow = await previewer.preview(fullDoc, [], container);
        if (cancelled) return;
        setPageCount(flow.total ?? null);
        setBusy(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to paginate");
        setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
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

/* ============================================================================
 * Source HTML composition
 * ==========================================================================*/

function buildSourceHtml(draft: Draft): string {
  const letterhead = letterheadHtml(draft);
  const signature = signatureHtml(draft);
  const evidence = draft.evidence ?? [];
  const sectionsHtml = draft.sections
    .map((s) =>
      s.sectionId === "signature" && signature
        ? signature + sanitizeLetterHtml(s.html)
        : sanitizeLetterHtml(s.html)
    )
    .join("\n");
  const resolved =
    evidence.length > 0 ? resolveFigureRefsInHtml(sectionsHtml, evidence) : sectionsHtml;
  const attachments = buildAttachmentsBlock(draft);
  const figures = buildFiguresAppendix(draft);
  const disclaimer = sanitizeLetterHtml(disclaimerHtmlFor(draft));

  return `
    ${letterhead}
    <div class="letter-body">${resolved}</div>
    ${attachments}
    ${figures}
    <hr class="letter-rule" />
    <div class="letter-disclaimer">${disclaimer}</div>
  `;
}

function letterheadHtml(draft: Draft): string {
  const url = draft.employer.letterheadDataUrl;
  if (!url) return "";
  return `<div class="letterhead"><img src="${url}" alt="" /></div>`;
}

function signatureHtml(draft: Draft): string {
  const url = draft.employer.signatureDataUrl;
  if (!url) return "";
  return `<div class="signature-image"><img src="${url}" alt="" /></div>`;
}

function buildAttachmentsBlock(draft: Draft): string {
  const attached = (draft.evidence ?? []).filter((e) => displayModeOf(e) === "attached");
  if (attached.length === 0) return "";
  const items = attached
    .map(
      (e, i) =>
        `<li><strong>${escHtml(e.filename || `${e.kind} item`)}</strong>${
          e.content ? ` — ${escHtml(e.content)}` : ""
        }<span class="att-num">[Attachment ${i + 1}]</span></li>`
    )
    .join("\n");
  return `<section class="attachments-section page-break-before">
    <h2>Attachments</h2>
    <ol class="attachments-list">${items}</ol>
  </section>`;
}

function buildFiguresAppendix(draft: Draft): string {
  const all = draft.evidence ?? [];
  const figs = all.filter((e) => displayModeOf(e) === "figure");
  if (figs.length === 0) return "";
  return `<section class="figures-section page-break-before">
    <h2>Exhibits</h2>
    ${figs
      .map((item) => {
        const label = figureLabelFor(item, all);
        const isImage = item.mimeType?.startsWith("image/");
        return `<figure class="figure-item">
          <figcaption><strong>${escHtml(label)}</strong>${
          item.filename ? ` — ${escHtml(item.filename)}` : ""
        }</figcaption>
          ${
            isImage && item.fileDataUrl
              ? `<img src="${item.fileDataUrl}" alt="${escHtml(item.filename || "")}" />`
              : ""
          }
          ${item.content ? `<p class="figure-body">${escHtml(item.content)}</p>` : ""}
        </figure>`;
      })
      .join("\n")}
  </section>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

