import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { resolveFigureRefsInHtml, displayModeOf, figureLabelFor } from "@/lib/evidence";
import { Loader2 } from "lucide-react";

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

/* ============================================================================
 * Print CSS — wraps the source into a paged.js-ready document.
 *
 * Defines:
 *   @page sizing + margins (A4, 1in × 1.1in)
 *   @page footer with page number ("Page n of N")
 *   .pagedjs_page styling (card look, shadow)
 *   Letter typography (Iowan Old Style serif, 11pt)
 *   Figure / attachment / signature spacing
 *
 * paged.js evaluates @page rules and counter(page) / counter(pages) to
 * generate per-page chrome.
 * ==========================================================================*/

function wrapInPrintHtml(bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page {
    size: A4;
    margin: 1in 1.1in 1.2in 1.1in;
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: 'Geist', -apple-system, sans-serif;
      font-size: 9pt;
      color: #94a3b8;
      padding-top: 0.4in;
    }
  }

  /* paged.js places each generated page inside .pagedjs_page. Style as a
   * paper card so the on-screen preview looks like a print preview. */
  .pagedjs_pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 0;
  }
  .pagedjs_page {
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.06);
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    margin: 0 !important;
  }

  /* MOBILE: A4 paper (8.27in / ~794px) doesn't fit in a 390px viewport.
   * Use the CSS zoom property (not transform scale) so the parent
   * container sees the scaled height and the canvas reflows naturally —
   * no negative-margin compensation needed. Supported in Chrome, Safari,
   * Edge, and Firefox 126+. Native pinch-zoom still works on iOS after
   * this fit-to-width.
   *
   * 0.48 is calibrated so A4 (794px) -> ~381px which fits inside the
   * canvas with the 12px gutter on a 390px viewport. */
  @media (max-width: 640px) {
    .pagedjs_pages {
      zoom: 0.48;
    }
    .pagedjs_page {
      box-shadow: 0 4px 14px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.10);
    }
  }

  /* Body typography — matches the PDF render so on-screen matches print.
   * Scoped to .pagedjs_page rather than bare body so the font-family
   * doesn't leak into Radix dropdown portals (which mount under
   * document.body) and turn the rest of the UI serif while Preview is
   * mounted. Children of .pagedjs_page (p, h2, table, etc.) inherit
   * font/colour from this rule; descendants outside paged.js's pages
   * (i.e. the entire app shell) are unaffected. */
  body { margin: 0; }
  .pagedjs_page {
    font-family: "Source Serif 4 Variable", "Source Serif Pro", Charter, Georgia, serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #0f172a;
  }
  p { margin: 0 0 8pt 0; }
  h1, h2, h3 { margin: 14pt 0 6pt; line-height: 1.25; }
  h2 { font-size: 14pt; font-weight: 600; }
  h3 { font-size: 12pt; font-weight: 600; }
  strong { font-weight: 600; }
  em { color: #475569; font-style: italic; }
  /* Lists — explicit rules so Tailwind preflight (which zeroes ul/ol
   * styling) doesn't strip the bullets/numbers + padding. Mirrors the
   * Edit-mode .section-editor-letter rules so both surfaces wrap
   * identically. */
  ul { list-style: disc; padding-left: 1.5em; margin: 6pt 0; }
  ol { list-style: decimal; padding-left: 1.5em; margin: 6pt 0; }
  li { margin: 2pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 8pt; text-align: left; }
  hr.letter-rule { border: none; border-top: 1px solid #cbd5e1; margin: 14pt 0; }

  /* Inline images / pasted screenshots inside the letter body. */
  .letter-body img,
  figure img { max-width: 100%; height: auto; border-radius: 3px; margin: 6pt 0; }

  .letterhead { text-align: center; margin-bottom: 18pt; }
  .letterhead img { max-height: 120px; max-width: 100%; }

  .signature-image { margin: 6pt 0; }
  .signature-image img { max-height: 54px; }

  /* Figure reference token — [See Fig 1] — sits inline. */
  .figure-ref { font-style: italic; color: #475569; }
  .attachment-ref { font-style: italic; color: #475569; }

  /* Attachments block — auto-generated at end of letter when there are
   * evidence items marked "attached". */
  .attachments-section { margin-top: 18pt; }
  .attachments-section h2 {
    font-size: 13pt;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4pt;
    margin-bottom: 6pt;
  }
  .attachments-list {
    list-style: decimal;
    padding-left: 1.2em;
    font-size: 11pt;
  }
  .attachments-list li { margin: 2pt 0; }
  .attachments-list .att-num {
    color: #94a3b8;
    font-size: 9pt;
    margin-left: 6pt;
  }

  /* Figures appendix — own page break, numbered exhibit list. */
  .figures-section { margin-top: 0; }
  .figures-section h2 {
    font-size: 14pt;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4pt;
    margin-bottom: 10pt;
  }
  .figure-item {
    margin: 0 0 14pt 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .figure-item figcaption {
    font-family: Georgia, serif;
    font-size: 11pt;
    margin-bottom: 4pt;
    color: #0f172a;
  }
  .figure-item img {
    max-width: 100%;
    max-height: 5in;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    page-break-inside: avoid;
  }
  .figure-body {
    font-size: 10.5pt;
    color: #334155;
    white-space: pre-wrap;
    background: #f8fafc;
    padding: 6pt 8pt;
    border-radius: 3px;
  }

  /* Force a page break before these blocks so exhibits / attachments
   * start on their own page — tribunal-bundle convention. */
  .page-break-before { page-break-before: always; break-before: page; }

  /* Disclaimer at bottom of last letter page. */
  .letter-disclaimer { font-size: 9.5pt; color: #64748b; }
</style></head>
<body>
${bodyHtml}
</body></html>`;
}

