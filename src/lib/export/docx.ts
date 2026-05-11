import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { resolveFigureRefsInHtml } from "@/lib/evidence";

type HtmlToDocx = (
  html: string,
  header?: string | null,
  options?: Record<string, unknown>
) => Promise<Blob>;

/**
 * Render the letter as a DOCX Blob. Pure — does not trigger a download.
 * Reused by both exportLetterToDocx (single-file flow) and the ZIP pack.
 */
export async function renderLetterDocxBlob(draft: Draft): Promise<Blob> {
  ensureHtmlToDocxBrowserGlobals();
  const mod = await import("html-to-docx");
  const htmlToDocx = (mod.default ?? mod) as unknown as HtmlToDocx;

  const evidence = draft.evidence ?? [];
  const sectionsHtml = draft.sections
    .map((s) => injectSignatureIntoSignatureSection(s, signatureHtml(draft)))
    .join("\n");
  const resolved = evidence.length > 0
    ? resolveFigureRefsInHtml(sectionsHtml, evidence)
    : sectionsHtml;
  const attached = evidence.filter((e) => (e.displayMode ?? "figure") === "attached");
  const attachmentsBlock = attached.length === 0
    ? ""
    : `<div><h3 style="margin-top:24pt;font-size:13pt;">Attachments</h3><ol style="padding-left:1.2em;margin:6pt 0;">${attached
        .map((e, i) => `<li>${i + 1}. <strong>${escapeHtmlD(e.filename || `${e.kind} item`)}</strong>${e.content ? ` — ${escapeHtmlD(e.content)}` : ""}</li>`)
        .join("")}</ol></div>`;

  const html = `
<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #0f172a; }
  p { margin: 0 0 8pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 8pt; text-align: left; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 12pt 0; }
  em { color: #475569; font-style: italic; }
  img { max-width: 100%; height: auto; }
  .figure-ref { font-style: italic; color: #475569; }
</style></head><body>
${letterheadHtml(draft)}
${resolved}
${attachmentsBlock}
<hr />
${sanitizeLetterHtml(disclaimerHtmlFor(draft))}
</body></html>`;

  return await htmlToDocx(html, undefined, {
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  });
}

export function docxFilenameFor(draft: Draft): string {
  const safe = (draft.employee.legalName || "letter").replace(/[^a-z0-9]+/gi, "-");
  return `${draft.letterType}-${safe}-${draft.context.issueDate}.docx`;
}

export async function exportLetterToDocx(draft: Draft): Promise<void> {
  const blob = await renderLetterDocxBlob(draft);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = docxFilenameFor(draft);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtmlD(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function letterheadHtml(draft: Draft): string {
  const url = draft.employer.letterheadDataUrl;
  if (!url) return "";
  return `<div style="text-align:center;margin-bottom:18pt;"><img src="${url}" style="max-width:100%;max-height:120px;" /></div>`;
}

function signatureHtml(draft: Draft): string {
  const url = draft.employer.signatureDataUrl;
  if (!url) return "";
  return `<div style="margin:6pt 0;"><img src="${url}" style="max-height:54px;" /></div>`;
}

function injectSignatureIntoSignatureSection(
  section: { sectionId?: string; html: string },
  signature: string
): string {
  const html = sanitizeLetterHtml(section.html);
  if (!signature) return html;
  if (section.sectionId === "signature") return signature + html;
  return html;
}

function ensureHtmlToDocxBrowserGlobals(): void {
  if (typeof globalThis === "undefined") return;
  const target = globalThis as typeof globalThis & { global?: typeof globalThis };
  if (!target.global) {
    Object.defineProperty(target, "global", {
      value: target,
      configurable: true,
    });
  }
}
