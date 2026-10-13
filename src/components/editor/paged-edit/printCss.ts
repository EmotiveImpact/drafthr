/**
 * Shared print CSS + page geometry for the letter render path.
 *
 * Both Preview (paged.js multi-page render) and edit-on-page need to know
 * the same A4 geometry and ship the same body typography rules so the
 * two paged letter surfaces agree on margins, fonts, list bullets and
 * table borders down to the fraction-of-a-point.
 *
 * Anything that affects how a printed page LOOKS belongs here.
 */

/* ----------------------------------------------------------------------------
 * A4 geometry — keep in lockstep with the @page rule below. 96 CSS pixels
 * per inch. 8.27in × 96 = 794. Margins are 1in top, 1.2in bottom,
 * 1.1in left/right (matches the tribunal-bundle convention HR teams
 * already use for printed correspondence).
 * --------------------------------------------------------------------------*/
export const PAGE_WIDTH_PX = Math.round(8.27 * 96); // 794
export const PAGE_HEIGHT_PX = Math.round(11.69 * 96); // 1122
export const MARGIN_TOP_PX = Math.round(1.0 * 96); // 96
export const MARGIN_BOTTOM_PX = Math.round(1.2 * 96); // 115
export const MARGIN_SIDE_PX = Math.round(1.1 * 96); // 106
export const PAGE_CONTENT_WIDTH_PX = PAGE_WIDTH_PX - MARGIN_SIDE_PX * 2; // 582
export const PAGE_CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - MARGIN_TOP_PX - MARGIN_BOTTOM_PX; // 911
const MIN_SCREEN_PAGE_SCALE = 0.25;
const SCREEN_PAGE_GUTTER_PX = 8;

/* ----------------------------------------------------------------------------
 * Full stylesheet handed to paged.js. paged.js inserts processed rules
 * into the host document, so body typography is scoped under .pagedjs_page
 * to avoid leaking into the app shell.
 * --------------------------------------------------------------------------*/
export const LETTER_PRINT_CSS = `
  @page {
    size: A4;
    margin: 1in 1.1in 1.2in 1.1in;
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: var(--font-sans);
      font-size: 9pt;
      color: var(--ds-subtle);
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
    zoom: var(--paged-page-scale, 1);
  }
  .pagedjs_page {
    background: var(--ds-surface);
    box-shadow: 0 2px 8px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.06);
    border: 1px solid var(--ds-line);
    border-radius: 4px;
    margin: 0 !important;
  }

  /* MOBILE: page scale is calculated from the live preview/editor column
   * width and applied through --paged-page-scale. Keep only mobile shadow
   * changes here so the page can resize continuously across all widths. */
  @media (max-width: 640px) {
    .pagedjs_page {
      box-shadow: 0 4px 14px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.10);
    }
  }

  /* Body typography, Newsreader like the letter on screen. Matches the PDF render so on-screen matches print.
   * Scoped to .pagedjs_page rather than bare body so the font-family
   * doesn't leak into Radix dropdown portals (which mount under
   * document.body) and turn the rest of the UI serif while Preview is
   * mounted. */
  .pagedjs_page {
    font-family: var(--font-serif);
    font-size: 11pt;
    line-height: 1.55;
    color: var(--ds-ink);
  }
  .pagedjs_page p { margin: 0 0 8pt 0; }
  .pagedjs_page h1,
  .pagedjs_page h2,
  .pagedjs_page h3 { margin: 14pt 0 6pt; line-height: 1.25; }
  .pagedjs_page h2 { font-size: 14pt; font-weight: 600; }
  .pagedjs_page h3 { font-size: 12pt; font-weight: 600; }
  .pagedjs_page strong { font-weight: 600; }
  .pagedjs_page em { color: var(--ds-body); font-style: italic; }
  .pagedjs_page ul { list-style: disc; padding-left: 1.5em; margin: 6pt 0; }
  .pagedjs_page ol { list-style: decimal; padding-left: 1.5em; margin: 6pt 0; }
  .pagedjs_page li { margin: 2pt 0; overflow-wrap: anywhere; }
  .pagedjs_page table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 6pt 0; }
  .pagedjs_page th,
  .pagedjs_page td { border: 1px solid var(--ds-line-strong); padding: 4pt 8pt; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  .pagedjs_page hr.letter-rule { border: none; border-top: 1px solid var(--ds-line-strong); margin: 14pt 0; }

  /* The edit-on-page path reconstructs source HTML from paged.js clones.
   * Avoid splitting structures where paged.js rebuilds ancestor chains in a
   * way that cannot be losslessly flattened back into editable source. */
  .pagedjs_page .letter-body > p,
  .pagedjs_page .letter-body > h1,
  .pagedjs_page .letter-body > h2,
  .pagedjs_page .letter-body > h3,
  .pagedjs_page .letter-body > h4,
  .pagedjs_page .letter-body > div:not([data-section-anchor]),
  .pagedjs_page .letter-body > blockquote,
  /* Sections are wrapped in [data-section-anchor] divs (the wrapper itself
   * must stay splittable — a whole section can span pages), so mirror the
   * block-level avoid rules one level down for the wrapped children. */
  .pagedjs_page .letter-body > [data-section-anchor] > p,
  .pagedjs_page .letter-body > [data-section-anchor] > h1,
  .pagedjs_page .letter-body > [data-section-anchor] > h2,
  .pagedjs_page .letter-body > [data-section-anchor] > h3,
  .pagedjs_page .letter-body > [data-section-anchor] > h4,
  .pagedjs_page .letter-body > [data-section-anchor] > div,
  .pagedjs_page .letter-body > [data-section-anchor] > blockquote,
  .pagedjs_page .letter-body table,
  .pagedjs_page .letter-body figure,
  .pagedjs_page .letter-body img,
  .pagedjs_page .letter-body li {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* Inline images / pasted screenshots inside the letter body. */
  .pagedjs_page .letter-body img,
  .pagedjs_page figure img {
    max-width: 100%;
    max-height: ${PAGE_CONTENT_HEIGHT_PX - 24}px;
    height: auto;
    object-fit: contain;
    border-radius: 3px;
    margin: 6pt 0;
  }

  .pagedjs_page .letterhead { text-align: center; margin-bottom: 18pt; }
  .pagedjs_page .letterhead img { max-height: 120px; max-width: 100%; }

  .pagedjs_page .signature-image { margin: 6pt 0; }
  .pagedjs_page .signature-image img { max-height: 54px; }

  /* Figure reference token — [See Fig 1] — sits inline. */
  .pagedjs_page .figure-ref { font-style: italic; color: var(--ds-body); }
  .pagedjs_page .attachment-ref { font-style: italic; color: var(--ds-body); }

  /* Attachments block — auto-generated at end of letter when there are
   * evidence items marked "attached". */
  .pagedjs_page .attachments-section { margin-top: 18pt; }
  .pagedjs_page .attachments-section h2 {
    font-size: 13pt;
    border-bottom: 1px solid var(--ds-line-strong);
    padding-bottom: 4pt;
    margin-bottom: 6pt;
  }
  .pagedjs_page .attachments-list {
    list-style: decimal;
    padding-left: 1.2em;
    font-size: 11pt;
  }
  .pagedjs_page .attachments-list li { margin: 2pt 0; }
  .pagedjs_page .attachments-list .att-num {
    color: var(--ds-subtle);
    font-size: 9pt;
    margin-left: 6pt;
  }

  /* Figures appendix — own page break, numbered exhibit list. */
  .pagedjs_page .figures-section { margin-top: 0; }
  .pagedjs_page .figures-section h2 {
    font-size: 14pt;
    border-bottom: 1px solid var(--ds-line-strong);
    padding-bottom: 4pt;
    margin-bottom: 10pt;
  }
  .pagedjs_page .figure-item {
    margin: 0 0 14pt 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pagedjs_page .figure-item figcaption {
    font-family: var(--font-serif);
    font-size: 11pt;
    margin-bottom: 4pt;
    color: var(--ds-ink);
  }
  .pagedjs_page .figure-item img {
    max-width: 100%;
    max-height: 5in;
    border: 1px solid var(--ds-line);
    border-radius: 3px;
    page-break-inside: avoid;
  }
  .pagedjs_page .figure-body {
    font-size: 10.5pt;
    color: var(--ds-body);
    white-space: pre-wrap;
    background: var(--ds-surface-2);
    padding: 6pt 8pt;
    border-radius: 3px;
  }

  /* Force a page break before these blocks so exhibits / attachments
   * start on their own page — tribunal-bundle convention. */
  .pagedjs_page .page-break-before { page-break-before: always; break-before: page; }

  /* Disclaimer at bottom of last letter page. */
  .pagedjs_page .letter-disclaimer { font-size: 9.5pt; color: var(--ds-muted); }
`;

export function pagedPreviewStylesheet(): Record<string, string> {
  const href =
    typeof window !== "undefined"
      ? `${window.location.origin}/drafthr-letter-print.css`
      : "drafthr-letter-print.css";
  return { [href]: LETTER_PRINT_CSS };
}

export function pagedPageScaleForWidth(widthPx: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 1;
  const available = Math.max(0, widthPx - SCREEN_PAGE_GUTTER_PX);
  return Math.min(1, Math.max(MIN_SCREEN_PAGE_SCALE, available / PAGE_WIDTH_PX));
}

export function applyResponsivePageScale(container: HTMLElement | null): number {
  if (!container) return 1;
  const scale = pagedPageScaleForWidth(container.getBoundingClientRect().width);
  container.style.setProperty("--paged-page-scale", formatPageScale(scale));
  return scale;
}

export function observeResponsivePageScale(container: HTMLElement): () => void {
  let frame: number | null = null;
  const update = () => {
    frame = null;
    applyResponsivePageScale(container);
  };
  const schedule = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(update);
  };

  update();

  const resizeObserver =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  resizeObserver?.observe(container);
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);

  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    window.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
  };
}

function formatPageScale(scale: number): string {
  return Number(scale.toFixed(4)).toString();
}
