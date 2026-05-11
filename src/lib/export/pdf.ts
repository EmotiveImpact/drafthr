import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { resolveFigureRefsInHtml } from "@/lib/evidence";

type Html2PdfModule = {
  default: () => Html2PdfChain;
};

type Html2PdfChain = {
  set: (opts: Record<string, unknown>) => Html2PdfChain;
  from: (el: HTMLElement) => Html2PdfChain;
  save: () => Promise<void>;
  output: (type: "blob") => Promise<Blob>;
};

/**
 * Exports the letter as a PDF.
 *
 * Strategy:
 *   1. Try the server-side endpoint /api/export/pdf (Puppeteer + Chromium).
 *      This produces high-fidelity PDFs that match a real letter.
 *   2. If the server endpoint is unavailable (404 / 500 / dev with no chromium
 *      pack configured), fall back to the client-side html2pdf.js renderer.
 *      Lower fidelity, but works offline.
 */
/**
 * Render the letter as a PDF Blob (no download). Used by the ZIP pack
 * to bundle the PDF alongside DOCX + evidence. The auto-download flow
 * is in exportLetterToPdf() below.
 */
export async function renderLetterPdfBlob(draft: Draft): Promise<Blob> {
  const filename = filenameFor(draft);
  const body = letterBodyHtml(draft);

  // 1) Try server-side render
  try {
    const res = await fetch("/api/export/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: body, filename }),
    });
    if (res.ok) {
      return await res.blob();
    }
  } catch {
    // Fall through to client-side
  }

  // 2) Client-side fallback
  return await clientSidePdfBlob(body, filename);
}

function letterBodyHtml(draft: Draft): string {
  const letterhead = letterheadHtml(draft);
  const signature = signatureHtml(draft);
  const evidence = draft.evidence ?? [];
  const sectionsHtml = draft.sections
    .map((s) => injectSignatureIntoSignatureSection(s, signature))
    .join("\n");
  // Re-resolve figure references to their current label (handles re-ordering).
  const resolved = evidence.length > 0
    ? resolveFigureRefsInHtml(sectionsHtml, evidence)
    : sectionsHtml;
  const attachments = buildAttachmentsListHtml(draft);
  return (
    letterhead +
    resolved +
    attachments +
    "<hr />" +
    sanitizeLetterHtml(disclaimerHtmlFor(draft))
  );
}

/** Auto-generated "Attachments" block — only rendered when there are
 * evidence items in displayMode=attached. Lists them numbered. */
function buildAttachmentsListHtml(draft: Draft): string {
  const attached = (draft.evidence ?? []).filter(
    (e) => (e.displayMode ?? "figure") === "attached"
  );
  if (attached.length === 0) return "";
  const items = attached
    .map((e, i) => {
      const num = `${i + 1}.`;
      const name = e.filename || `${e.kind} item`;
      const note = e.content ? ` — ${e.content}` : "";
      return `<li>${num} <strong>${escapeHtml(name)}</strong>${escapeHtml(note)}</li>`;
    })
    .join("\n");
  return `<div class="attachments-block">
    <h3 style="margin-top:24px;font-size:13pt;">Attachments</h3>
    <ol style="padding-left:1.2em;margin:6pt 0;">${items}</ol>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function exportLetterToPdf(draft: Draft): Promise<void> {
  const filename = filenameFor(draft);
  const body = letterBodyHtml(draft);

  // 1) Try server-side render
  try {
    const res = await fetch("/api/export/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: body, filename }),
    });
    if (res.ok) {
      const blob = await res.blob();
      triggerDownload(blob, filename);
      return;
    }
    // 404 in dev (no serverless function), 500 on prod misconfig — fall through
  } catch {
    // Network error / dev-server fallthrough — silently fall back
  }

  // 2) Client-side fallback (html2pdf)
  await clientSidePdf(body, filename);
}

async function clientSidePdfBlob(bodyHtml: string, _filename: string): Promise<Blob> {
  const mod = (await import("html2pdf.js")) as unknown as Html2PdfModule;
  const html2pdf =
    typeof mod.default === "function"
      ? (mod.default as unknown as () => Html2PdfChain)
      : (mod as unknown as () => Html2PdfChain);

  const doc = buildPdfDoc(bodyHtml);
  document.body.appendChild(doc);
  try {
    return await html2pdf()
      .set({
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
      })
      .from(doc)
      .output("blob");
  } finally {
    doc.remove();
  }
}

function buildPdfDoc(bodyHtml: string): HTMLElement {
  const doc = document.createElement("div");
  doc.className = "letter-page";
  doc.style.width = "8.27in";
  doc.style.minHeight = "11.69in";
  doc.style.background = "white";
  doc.style.color = "#0f172a";
  doc.style.fontFamily = "Iowan Old Style, Georgia, Times New Roman, serif";
  doc.style.padding = "1.2in";
  doc.style.fontSize = "11pt";
  doc.style.lineHeight = "1.55";
  doc.innerHTML = bodyHtml;
  return doc;
}

async function clientSidePdf(bodyHtml: string, filename: string) {
  const mod = (await import("html2pdf.js")) as unknown as Html2PdfModule;
  const html2pdf =
    typeof mod.default === "function"
      ? (mod.default as unknown as () => Html2PdfChain)
      : (mod as unknown as () => Html2PdfChain);

  const doc = buildPdfDoc(bodyHtml);
  document.body.appendChild(doc);

  try {
    await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
      })
      .from(doc)
      .save();
  } finally {
    doc.remove();
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function filenameFor(draft: Draft): string {
  const safe = (draft.employee.legalName || "letter").replace(/[^a-z0-9]+/gi, "-");
  return `${draft.letterType}-${safe}-${draft.context.issueDate}.pdf`;
}

/** Render the letterhead image (if any) as the first block of the export. */
function letterheadHtml(draft: Draft): string {
  const url = draft.employer.letterheadDataUrl;
  if (!url) return "";
  return `<div style="margin:0 0 24px 0;text-align:center;"><img src="${url}" style="max-width:100%;max-height:120px;display:inline-block;" alt="" /></div>`;
}

/** Render the signature image (if any) inline. */
function signatureHtml(draft: Draft): string {
  const url = draft.employer.signatureDataUrl;
  if (!url) return "";
  return `<div style="margin:8px 0 4px 0;"><img src="${url}" style="max-height:60px;display:inline-block;" alt="" /></div>`;
}

/**
 * Insert the signature image directly above the typed signatory name in
 * the signature section. We look for a "signature" sectionId; if absent
 * (employee letters often have none), inject before the closing tag of
 * the closing/signature paragraph.
 */
function injectSignatureIntoSignatureSection(
  section: { sectionId?: string; html: string },
  signature: string
): string {
  const html = sanitizeLetterHtml(section.html);
  if (!signature) return html;
  if (section.sectionId === "signature") {
    // Prepend the signature image at the top of the signature block.
    return signature + html;
  }
  return html;
}
