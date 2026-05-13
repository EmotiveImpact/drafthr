/**
 * Shared print CSS + page geometry for the letter render path.
 *
 * Both Preview (paged.js multi-page render) and Edit-on-page V2
 * (pixel-perfect editable mode, gated by a feature flag) need to know
 * the same A4 geometry and ship the same body typography rules so the
 * three letter surfaces — Edit / Edit-on-page / Preview / PDF — agree
 * on margins, fonts, list bullets and table borders down to the
 * fraction-of-a-point.
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
export const MARGIN_TOP_PX = Math.round(1.0 * 96); // 96
export const MARGIN_BOTTOM_PX = Math.round(1.2 * 96); // 115
export const MARGIN_SIDE_PX = Math.round(1.1 * 96); // 106

/* ----------------------------------------------------------------------------
 * Full <style> body used inside the paged.js print document. paged.js
 * mounts the rendered pages inside an iframe-like detached document, so
 * these rules don't escape into the host app. Bare selectors (p, h2, …)
 * are fine here because the iframe is the scope.
 * --------------------------------------------------------------------------*/
export const LETTER_PRINT_CSS = `
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
   * no negative-margin compensation needed. */
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
   * mounted. */
  body { margin: 0; }
  .pagedjs_page {
    font-family: "Geist Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
`;

/**
 * Wrap a fragment of letter HTML in a full HTML document with the print
 * CSS attached, ready to hand to paged.js (Previewer.preview() or
 * Chunker.flow()). The fragment is dropped verbatim into <body> — caller
 * is responsible for sanitisation.
 */
export function wrapInPrintHtml(bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>${LETTER_PRINT_CSS}</style></head>
<body>
${bodyHtml}
</body></html>`;
}
