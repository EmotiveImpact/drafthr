import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { resolveFigureRefsInHtml, displayModeOf, figureLabelFor } from "@/lib/evidence";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { isSafeImageDataUrl, isSafeImageRef } from "@/lib/safe-data-url";

export function buildPreviewSourceHtml(
  draft: Draft,
  options: { letterBodyHtml?: string } = {},
): string {
  const letterhead = letterheadHtml(draft);
  const evidence = draft.evidence ?? [];
  const body = options.letterBodyHtml ?? buildStoredSectionsBodyHtml(draft);
  const resolved = evidence.length > 0 ? resolveFigureRefsInHtml(body, evidence) : body;
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

function buildStoredSectionsBodyHtml(draft: Draft): string {
  const signature = signatureImageHtml(draft);
  return draft.sections
    .map((s) =>
      s.sectionId === "signature" && signature
        ? signature + sanitizeLetterHtml(s.html)
        : sanitizeLetterHtml(s.html),
    )
    .join("\n");
}

function letterheadHtml(draft: Draft): string {
  // Gate on the hasLetterhead switch as well as URL presence — matches the
  // Page editor + PDF/DOCX so every renderer ships the same first page. (BUG-08.)
  if (!draft.employer.hasLetterhead) return "";
  const url = draft.employer.letterheadDataUrl;
  if (!isSafeImageRef(url)) return "";
  return `<div class="letterhead"><img src="${escAttr(url)}" alt="" /></div>`;
}

export function signatureImageHtml(draft: Draft, extraAttrs = ""): string {
  const url = draft.employer.signatureDataUrl;
  if (!isSafeImageRef(url)) return "";
  return `<div class="signature-image"${extraAttrs}><img src="${escAttr(url)}" alt="" /></div>`;
}

function buildAttachmentsBlock(draft: Draft): string {
  const attached = (draft.evidence ?? []).filter((e) => displayModeOf(e) === "attached");
  if (attached.length === 0) return "";
  const items = attached
    .map(
      (e, i) =>
        `<li><strong>${escHtml(e.filename || `${e.kind} item`)}</strong>${
          e.content ? ` &mdash; ${escHtml(e.content)}` : ""
        }<span class="att-num">[Attachment ${i + 1}]</span></li>`,
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
        const imageUrl = isImage && isSafeImageDataUrl(item.fileDataUrl)
          ? item.fileDataUrl
          : undefined;
        return `<figure class="figure-item">
          <figcaption><strong>${escHtml(label)}</strong>${
          item.filename ? ` &mdash; ${escHtml(item.filename)}` : ""
        }</figcaption>
          ${
            imageUrl
              ? `<img src="${escAttr(imageUrl)}" alt="${escAttr(item.filename || "")}" />`
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s: string): string {
  return escHtml(s);
}
