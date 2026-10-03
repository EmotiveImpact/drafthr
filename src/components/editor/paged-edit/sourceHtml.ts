import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { resolveFigureRefsInHtml } from "@/lib/evidence";
import { attachmentsHtml, figuresHtml } from "@/lib/evidence-html";
import { sanitizeLetterHtml, sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import { brandedExportFooterHtml, resolveClientEnvFlag } from "@/lib/branding/export-footer";
import { isSafeImageRef } from "@/lib/safe-data-url";

export function buildPreviewSourceHtml(
  draft: Draft,
  options: { letterBodyHtml?: string; forExport?: boolean } = {},
): string {
  const letterhead = letterheadHtml(draft);
  const evidence = draft.evidence ?? [];
  const body = options.letterBodyHtml ?? buildStoredSectionsBodyHtml(draft, options.forExport);
  const resolved = evidence.length > 0 ? resolveFigureRefsInHtml(body, evidence) : body;
  const attachments = attachmentsHtml(evidence);
  const figures = figuresHtml(evidence);
  const disclaimer = sanitizeLetterHtml(disclaimerHtmlFor(draft));

  return `
    ${letterhead}
    <div class="letter-body">${resolved}</div>
    ${attachments}
    ${figures}
    <hr class="letter-rule" />
    <div class="letter-disclaimer">${disclaimer}</div>
    ${options.forExport ? brandedExportFooterHtml({ envEnabled: resolveClientEnvFlag() }) : ""}
  `;
}

function buildStoredSectionsBodyHtml(draft: Draft, forExport = false): string {
  const signature = signatureImageHtml(draft);
  return draft.sections
    .map((s) => {
      const sectionHtml = forExport
        ? sanitizeLetterHtmlForExport(mergeAcceptedSuggestionsHtml(s.html, { forExport: true }))
        : sanitizeLetterHtml(s.html);
      const inner =
        s.sectionId === "signature" && signature
          ? signature + sectionHtml
          : sectionHtml;
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
