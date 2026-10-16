import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { resolveFigureRefsInHtml, displayModeOf } from "@/lib/evidence";
import { buildExhibitsAppendixHtml } from "@/lib/export/exhibits";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { isSafeImageRef } from "@/lib/safe-data-url";

export function buildPreviewSourceHtml(
  draft: Draft,
  options: { letterBodyHtml?: string } = {},
): string {
  const letterhead = letterheadHtml(draft);
  const evidence = draft.evidence ?? [];
  const body = options.letterBodyHtml ?? buildStoredSectionsBodyHtml(draft);
  const resolved = evidence.length > 0 ? resolveFigureRefsInHtml(body, evidence) : body;
  const attachments = buildAttachmentsBlock(draft);
  const figures = buildExhibitsAppendixHtml(draft);
  const disclaimer = sanitizeLetterHtml(disclaimerHtmlFor(draft));

  return `
    ${letterhead}
    <div class="letter-body">${resolved}</div>
    ${attachments}
    <hr class="letter-rule" />
    <div class="letter-disclaimer">${disclaimer}</div>
    ${figures}
  `;
}

function buildStoredSectionsBodyHtml(draft: Draft): string {
  const signature = signatureImageHtml(draft);
  return draft.sections
    .map((s) => {
      const inner =
        s.sectionId === "signature" && signature
          ? signature + sanitizeLetterHtml(s.html)
          : sanitizeLetterHtml(s.html);
      // Per-section anchor wrapper. PaginatedLetter's selection-bubble and
      // comment-focus logic, the Review rail's jump-to-section, and
      // printCss's `div:not([data-section-anchor])` exemption all expect this
      // marker — without it, "+ Comment" mis-anchored every selection to the
      // FIRST section and jump-to-section silently no-oped on the Review step.
      return `<div data-section-anchor="${escAttr(s.id)}">${inner}</div>`;
    })
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
