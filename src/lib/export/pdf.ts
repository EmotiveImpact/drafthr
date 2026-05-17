import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { sanitizeLetterHtml, sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import { resolveFigureRefsInHtml } from "@/lib/evidence";
import { isSafeImageRef } from "@/lib/safe-data-url";
import {
  brandedExportFooterHtml,
  resolveClientEnvFlag,
} from "@/lib/branding/export-footer";

type Html2Canvas = (
  element: HTMLElement,
  options: {
    backgroundColor: string;
    logging: boolean;
    scale: number;
    useCORS: boolean;
    windowHeight: number;
    windowWidth: number;
  }
) => Promise<HTMLCanvasElement>;

type JsPdfConstructor = new (options: {
  unit: "in";
  format: "a4";
  orientation: "portrait";
}) => JsPdfDocument;

type JsPdfDocument = {
  addImage: (
    imageData: string,
    format: "JPEG",
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  addPage: (format?: "a4", orientation?: "portrait") => void;
  output: (type: "blob") => Blob;
  save: (filename: string) => void;
};

/**
 * Exports the letter as a PDF.
 *
 * Strategy:
 *   1. Try the server-side endpoint /api/export/pdf (Puppeteer + Chromium).
 *      This produces high-fidelity PDFs that match a real letter.
 *   2. If the server endpoint is unavailable (404 / 500 / dev with no chromium
 *      pack configured), fall back to a client-side html2canvas + jsPDF render.
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
  if (shouldTryServerPdf()) {
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: body, filename, draftId: draft.id }),
      });
      if (res.ok) {
        return await res.blob();
      }
    } catch {
      // Fall through to client-side
    }
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
    sanitizeLetterHtml(disclaimerHtmlFor(draft)) +
    // Branded export footer — toggle-aware. tenantPlan/userOptOut wiring lands
    // when billing ships; for now everyone's on free, so this renders for all
    // unless VITE_DRAFTHR_EXPORT_FOOTER=false. See src/lib/branding/export-footer.ts.
    brandedExportFooterHtml({ envEnabled: resolveClientEnvFlag() })
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
  if (shouldTryServerPdf()) {
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: body, filename, draftId: draft.id }),
      });
      if (res.ok) {
        const blob = await res.blob();
        triggerDownload(blob, filename);
        return;
      }
      // 404 / 500 on prod misconfig: fall through.
    } catch {
      // Network error: silently fall back.
    }
  }

  // 2) Client-side fallback
  await clientSidePdf(body, filename);
}

async function clientSidePdfBlob(bodyHtml: string, _filename: string): Promise<Blob> {
  const host = await createPdfHost(bodyHtml);
  try {
    return await renderClientSidePdf(host.doc);
  } finally {
    host.dispose();
  }
}

function buildPdfDoc(bodyHtml: string, ownerDocument: Document = document): HTMLElement {
  const doc = ownerDocument.createElement("div");
  doc.className = "letter-export-page";
  doc.style.boxSizing = "border-box";
  doc.style.width = "8.27in";
  doc.style.minHeight = "11.69in";
  doc.style.margin = "0";
  doc.style.backgroundColor = "#ffffff";
  doc.style.color = "#0f172a";
  doc.style.fontFamily = "Iowan Old Style, Georgia, Times New Roman, serif";
  doc.style.padding = "1.2in";
  doc.style.fontSize = "11pt";
  doc.style.lineHeight = "1.55";
  doc.style.border = "0";
  doc.style.boxShadow = "none";
  doc.innerHTML = bodyHtml;
  applyPdfExportStyles(doc);
  return doc;
}

async function clientSidePdf(bodyHtml: string, filename: string) {
  const host = await createPdfHost(bodyHtml);

  try {
    const blob = await renderClientSidePdf(host.doc);
    triggerDownload(blob, filename);
  } finally {
    host.dispose();
  }
}

async function renderClientSidePdf(doc: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, jsPdfModule] = await Promise.all([
    import("html2canvas") as Promise<{ default: Html2Canvas }>,
    import("jspdf") as Promise<{ jsPDF?: JsPdfConstructor; default?: JsPdfConstructor }>,
  ]);
  const JsPDF = jsPdfModule.jsPDF ?? jsPdfModule.default;
  if (!JsPDF) throw new Error("PDF renderer failed to load.");

  const canvas = await html2canvas(doc, {
    backgroundColor: "#ffffff",
    logging: false,
    scale: 2,
    useCORS: true,
    windowHeight: Math.ceil(doc.scrollHeight),
    windowWidth: Math.ceil(doc.scrollWidth),
  });
  return canvasToA4PdfBlob(canvas, JsPDF);
}

function canvasToA4PdfBlob(canvas: HTMLCanvasElement, JsPDF: JsPdfConstructor): Blob {
  const pageWidth = 8.27;
  const pageHeight = 11.69;
  const imageHeight = (canvas.height * pageWidth) / canvas.width;
  const imageData = canvas.toDataURL("image/jpeg", 0.98);
  const pdf = new JsPDF({ unit: "in", format: "a4", orientation: "portrait" });

  let pageTop = 0;
  while (pageTop < imageHeight) {
    if (pageTop > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(imageData, "JPEG", 0, -pageTop, pageWidth, imageHeight);
    pageTop += pageHeight;
  }

  return pdf.output("blob");
}

async function createPdfHost(
  bodyHtml: string
): Promise<{ doc: HTMLElement; dispose: () => void }> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "8.27in";
  iframe.style.height = "11.69in";
  iframe.style.border = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    iframe.remove();
    throw new Error("Unable to initialise PDF export frame.");
  }

  frameDocument.open();
  frameDocument.write(
    '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#ffffff;color:#0f172a;}</style></head><body></body></html>'
  );
  frameDocument.close();

  const doc = buildPdfDoc(bodyHtml, frameDocument);
  frameDocument.body.appendChild(doc);
  await waitForImages(doc);

  return {
    doc,
    dispose: () => iframe.remove(),
  };
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
}

function applyPdfExportStyles(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((el) => {
    el.style.fontFamily = "inherit";
    el.style.fontWeight = "600";
    el.style.lineHeight = "1.2";
    el.style.margin = "0 0 8pt 0";
    if (el.tagName.toLowerCase() === "h1") el.style.fontSize = "16pt";
    if (el.tagName.toLowerCase() === "h2") el.style.fontSize = "15pt";
    if (el.tagName.toLowerCase() === "h3") el.style.fontSize = "13pt";
  });
  root.querySelectorAll<HTMLElement>("p").forEach((el) => {
    el.style.margin = "0 0 8pt 0";
  });
  root.querySelectorAll<HTMLElement>("table").forEach((el) => {
    el.style.width = "100%";
    el.style.borderCollapse = "collapse";
    el.style.margin = "6pt 0";
  });
  root.querySelectorAll<HTMLElement>("th, td").forEach((el) => {
    el.style.border = "1px solid #cbd5e1";
    el.style.padding = "4pt 8pt";
    el.style.textAlign = "left";
  });
  root.querySelectorAll<HTMLElement>("hr").forEach((el) => {
    el.style.border = "0";
    el.style.borderTop = "1px solid #cbd5e1";
    el.style.margin = "12pt 0";
  });
  root.querySelectorAll<HTMLImageElement>("img").forEach((el) => {
    el.style.maxWidth = "100%";
    el.style.height = "auto";
  });
  root.querySelectorAll<HTMLElement>("a").forEach((el) => {
    el.style.color = "inherit";
    el.style.textDecoration = "underline";
  });
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

function shouldTryServerPdf(): boolean {
  return !import.meta.env.DEV;
}

export function filenameFor(draft: Draft): string {
  const safe = (draft.employee.legalName || "letter").replace(/[^a-z0-9]+/gi, "-");
  return `${draft.letterType}-${safe}-${draft.context.issueDate}.pdf`;
}

/** Render the letterhead image (if any) as the first block of the export. */
function letterheadHtml(draft: Draft): string {
  const url = draft.employer.letterheadDataUrl;
  if (!isSafeImageRef(url)) return "";
  return `<div style="margin:0 0 24px 0;text-align:center;"><img src="${url}" style="max-width:100%;max-height:120px;display:inline-block;" alt="" /></div>`;
}

/** Render the signature image (if any) inline. */
function signatureHtml(draft: Draft): string {
  const url = draft.employer.signatureDataUrl;
  if (!isSafeImageRef(url)) return "";
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
  // Merge any accepted suggestions, then run the export-flavour sanitiser
  // which strips any remaining <ins>/<del> wrappers so reviewer track-changes
  // never leak into the rendered document.
  const merged = mergeAcceptedSuggestionsHtml(section.html);
  const html = sanitizeLetterHtmlForExport(merged);
  if (!signature) return html;
  if (section.sectionId === "signature") {
    // Prepend the signature image at the top of the signature block.
    return signature + html;
  }
  return html;
}
