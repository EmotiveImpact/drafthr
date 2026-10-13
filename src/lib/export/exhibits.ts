import type { Draft } from "@/lib/letters/types";
import { displayModeOf, figureLabelFor } from "@/lib/evidence";
import { isSafeImageDataUrl } from "@/lib/safe-data-url";

/**
 * The "Exhibits" appendix: every evidence item in figure mode, numbered with
 * the same labels the letter body cites ("[See Fig 2]").
 *
 * One builder for every renderer. The Finalize / page preview showed this
 * appendix while the PDF and DOCX left it out, so a letter citing "Fig 2"
 * shipped without Fig 2. Inline styles carry the essentials (page break,
 * image size) for surfaces without the preview's print CSS, such as the
 * server PDF renderer; the class names keep the preview's styling.
 */
export function buildExhibitsAppendixHtml(draft: Pick<Draft, "evidence">): string {
  const all = draft.evidence ?? [];
  const figs = all.filter((e) => displayModeOf(e) === "figure");
  if (figs.length === 0) return "";
  return `<section class="figures-section page-break-before" style="break-before:page;page-break-before:always;">
    <h2>Exhibits</h2>
    ${figs
      .map((item) => {
        const label = figureLabelFor(item, all);
        const isImage = item.mimeType?.startsWith("image/");
        const imageUrl = isImage && isSafeImageDataUrl(item.fileDataUrl) ? item.fileDataUrl : undefined;
        return `<figure class="figure-item" style="margin:0 0 14pt 0;break-inside:avoid;page-break-inside:avoid;">
          <figcaption style="display:block;margin:0 0 6pt 0;"><strong>${escHtml(label)}</strong>${
            item.filename ? `: ${escHtml(item.filename)}` : ""
          }</figcaption>
          ${
            // A block image under its caption: an inline one sat on the
            // caption's baseline and covered it in the PDF (FEAT-X11).
            imageUrl
              ? `<img src="${escHtml(imageUrl)}" alt="${escHtml(item.filename || "")}" style="display:block;max-width:100%;max-height:5in;height:auto;" />`
              : ""
          }
          ${item.content ? `<p class="figure-body" style="white-space:pre-wrap;">${escHtml(item.content)}</p>` : ""}
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
