import { toast } from "sonner";
import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import { sanitizeLetterHtml, sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import { resolveFigureRefsInHtml } from "@/lib/evidence";
import { isSafeImageRef } from "@/lib/safe-data-url";
import { markUnembeddedImagesHtml } from "@/lib/storage/embedRemoteImages";
import { buildExhibitsAppendixHtml } from "./exhibits";
import { confidentialLineHtml, issueDateLineHtml, letterheadBlockHtml } from "./letterTop";
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
export async function renderLetterPdfBlob(
  draft: Draft,
  attestation?: PdfAttestation,
): Promise<Blob> {
  const filename = filenameFor(draft);
  const body = letterBodyHtml(draft);
  const server = await tryServerPdf(body, filename, draft.id, attestation);
  if (server) return server;
  return await clientSidePdfBlob(body, filename);
}

export type PdfAttestation = { reviewedBy: string; reviewedOn: string };

/** Server responses that mean "don't paper over this with the basic renderer". */
const NO_FALLBACK_STATUSES: Record<number, string> = {
  401: "Your session has expired. Sign in again to export.",
  429: "Too many exports in a short time. Wait a minute and try again.",
};

const FALLBACK_REASON_UNAVAILABLE = "The server renderer was unavailable";
// 413 falls back rather than blocking: the request carries every embedded
// image, including the Exhibits appendix (every evidence item is a figure by
// default), so a couple of phone photos exceed the platform's 4.5 MB request
// limit. The in-browser renderer has no such limit.
const FALLBACK_REASON_TOO_LARGE =
  "This letter is too large for the server renderer (usually large images or exhibits)";

/**
 * Ask the server to render the PDF (real text, audit record, timestamp).
 * Returns null when the caller should fall back to the in-browser renderer,
 * and tells the user that happened: the fallback is a picture of the letter
 * with no selectable text and no audit record, so it must never be silent.
 * Throws for statuses where falling back would hide a real problem.
 * Exported for unit testing.
 */
export async function tryServerPdf(
  body: string,
  filename: string,
  draftId: string,
  attestation?: PdfAttestation,
): Promise<Blob | null> {
  if (!shouldTryServerPdf()) return null;
  let reason = FALLBACK_REASON_UNAVAILABLE;
  try {
    const res = await fetch("/api/export/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: body,
        filename,
        draftId,
        reviewedBy: attestation?.reviewedBy,
        reviewedOn: attestation?.reviewedOn,
      }),
    });
    if (res.ok) return await res.blob();
    const blocking = NO_FALLBACK_STATUSES[res.status];
    if (blocking) throw new Error(blocking);
    if (res.status === 413) reason = FALLBACK_REASON_TOO_LARGE;
  } catch (err) {
    if (err instanceof Error && Object.values(NO_FALLBACK_STATUSES).includes(err.message)) throw err;
    // Network error: fall back below.
  }
  toast.warning("Exported with the basic PDF renderer", {
    description: `${reason}, so this PDF is an image of the letter without selectable text or an export record.`,
  });
  return null;
}

/**
 * Render the letter body as a single HTML string. Used by:
 *  - PDF export (server + client fallback)
 *  - DOCX export
 *  - The mobile read-only view (`/m/:draftId`)
 *
 * Output is sanitised (sanitizeLetterHtmlForExport per section + sanitizeLetterHtml
 * for the disclaimer) and stitched into one HTML blob; consumers wrap it
 * in their own layout (A4 page for PDF, scrolling column for mobile).
 */
export function letterBodyHtml(draft: Draft): string {
  // The top of the page as the editor shows it: the letterhead (image, or
  // the company name and address), the confidentiality line, and the issue
  // date under the recipient's address (FEAT-X10).
  const letterhead = letterheadBlockHtml(draft) + confidentialLineHtml(draft);
  const signature = signatureHtml(draft);
  const evidence = draft.evidence ?? [];
  const dateLine = issueDateLineHtml(draft);
  const sectionHtml = draft.sections.map((s) => {
    const html = injectSignatureIntoSignatureSection(s, signature);
    return s.sectionId === "recipient_block" && dateLine ? html + dateLine : html;
  });
  // Re-resolve figure references to their current label (handles re-ordering).
  const resolve = (html: string) =>
    evidence.length > 0 ? resolveFigureRefsInHtml(html, evidence) : html;
  const signoffStart = signoffStartIndex(draft.sections);
  // The sign-off starts at the closing section's last line ("Yours
  // sincerely,"), and the paragraph just before it goes with it, so a page
  // never starts cold on the sign-off. Earlier closing paragraphs are the
  // letter's own text and flow as usual, so the end of the letter stays small.
  const [closingLead, carried, closingLast] =
    draft.sections[signoffStart]?.sectionId === "closing"
      ? splitClosing(sectionHtml[signoffStart])
      : ["", "", sectionHtml[signoffStart] ?? ""];
  const bodyHtml = resolve([...sectionHtml.slice(0, signoffStart), closingLead].filter(Boolean).join("\n"));
  const signoffHtml = resolve([closingLast, ...sectionHtml.slice(signoffStart + 1)].filter(Boolean).join("\n"));
  const attachments = buildAttachmentsListHtml(draft);
  return (
    letterhead +
    bodyHtml +
    // The end of the letter: the last line of the letter and the sign-off,
    // the Attachments list, then the notice and disclaimer (which belong to
    // the letter, so they close it before the Exhibits appendix starts its
    // own page, SEND-X32). It is one
    // keep-together group, so the sign-off is never split across pages and
    // the small print never sits alone on a page away from the letter: when
    // the group does not fit under the body it goes over whole, in the
    // server renderer (break-inside) and in paginateForPdf alike (SEND-X36).
    endOfLetterHtml(
      resolve(carried),
      signoffHtml,
      attachments,
      closingBlockHtml(sanitizeLetterHtml(disclaimerHtmlFor(draft))),
    ) +
    // Exhibits appendix: same builder as the page preview and the DOCX.
    buildExhibitsAppendixHtml(draft) +
    // Branded export footer — toggle-aware. tenantPlan/userOptOut wiring lands
    // when billing ships; for now everyone's on free, so this renders for all
    // unless VITE_DRAFTHR_EXPORT_FOOTER=false. See src/lib/branding/export-footer.ts.
    brandedExportFooterHtml({ envEnabled: resolveClientEnvFlag() })
  );
}

/** Class of the closing block (the notice and disclaimer under the letter). */
const CLOSING_CLASS = "letter-closing";
/** Class of the sign-off ("Yours sincerely," through the signatory's name and title). */
export const SIGNOFF_CLASS = "letter-signoff";
/** Class of the end of the letter (sign-off, Attachments list, closing) kept together. */
export const LETTER_END_CLASS = "letter-end";

const KEEP_TOGETHER = "break-inside:avoid;page-break-inside:avoid;";

/**
 * Where the sign-off starts: the "closing" section ("Yours sincerely,") when
 * it comes straight before the "signature" section, else the signature or
 * closing section on its own. A letter with neither keeps its last section
 * with the end of the letter, so the small print still has company (unless
 * that section is the whole letter, which then flows as usual).
 */
function signoffStartIndex(sections: ReadonlyArray<{ sectionId?: string }>): number {
  let signature = -1;
  let closing = -1;
  sections.forEach((s, i) => {
    if (s.sectionId === "signature") signature = i;
    if (s.sectionId === "closing") closing = i;
  });
  if (signature >= 0) return closing === signature - 1 ? closing : signature;
  if (closing >= 0) return closing;
  return sections.length > 1 ? sections.length - 1 : sections.length;
}

/**
 * Split the closing section's HTML into its top-level blocks: all but the
 * last two, the one before the last, and the last ("Yours sincerely,").
 * Without a DOM, or with a single block, the whole section is the last.
 */
function splitClosing(html: string): [string, string, string] {
  if (typeof document === "undefined") return ["", "", html];
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const blocks = Array.from(tpl.content.childNodes).filter((n) => !isBlank(n));
  if (blocks.length <= 1) return ["", "", html];
  const outer = (node: ChildNode) => {
    const wrap = document.createElement("div");
    wrap.appendChild(node);
    return wrap.innerHTML;
  };
  const last = outer(blocks[blocks.length - 1]);
  const carried = outer(blocks[blocks.length - 2]);
  return [tpl.innerHTML.trim(), carried, last];
}

/** The end of the letter as one keep-together group, with the sign-off whole inside it. */
function endOfLetterHtml(carried: string, signoff: string, attachments: string, closing: string): string {
  const signoffBlock = signoff.trim()
    ? `<div class="${SIGNOFF_CLASS}" style="${KEEP_TOGETHER}">${signoff}</div>`
    : "";
  return (
    `<div class="${LETTER_END_CLASS}" style="${KEEP_TOGETHER}">` +
    carried +
    signoffBlock +
    attachments +
    closing +
    "</div>"
  );
}

/**
 * The rule and the notice and disclaimer under it, as one block: small print
 * (like the page footer, so it reads as the letter's fine print, not part of
 * what the letter says) that the server renderer keeps on one page too.
 */
function closingBlockHtml(disclaimer: string): string {
  return (
    `<div class="${CLOSING_CLASS}" style="${KEEP_TOGETHER}font-size:9.5pt;line-height:1.45;color:#334155;">` +
    "<hr />" +
    disclaimer +
    "</div>"
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
    .map((e) => {
      // No literal "N." prefix — the <ol> numbers the items. Prefixing here
      // AND using a decimal <ol> double-numbered ("1. 1.") on PDF surfaces,
      // which (unlike the mobile view) have no Tailwind Preflight to strip the
      // marker (bug #9). Matches the DOCX exporter, which never prefixes.
      const name = e.filename || `${e.kind} item`;
      const note = e.content ? `: ${e.content}` : "";
      return `<li><strong>${escapeHtml(name)}</strong>${escapeHtml(note)}</li>`;
    })
    .join("\n");
  // Explicit list-style:decimal so the numbering survives on surfaces with no
  // Tailwind Preflight (server Puppeteer PDF + client iframe fallback).
  return `<div class="attachments-block">
    <h3 style="margin-top:24px;font-size:13pt;">Attachments</h3>
    <ol style="list-style:decimal;padding-left:1.2em;margin:6pt 0;">${items}</ol>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function exportLetterToPdf(
  draft: Draft,
  attestation?: PdfAttestation,
): Promise<void> {
  const filename = filenameFor(draft);
  const body = letterBodyHtml(draft);
  const server = await tryServerPdf(body, filename, draft.id, attestation);
  if (server) {
    triggerDownload(server, filename);
    return;
  }
  await clientSidePdf(body, filename);
}

async function clientSidePdfBlob(bodyHtml: string, _filename: string): Promise<Blob> {
  const host = await createPdfHost(bodyHtml);
  try {
    return await renderClientSidePdf(host.pages);
  } finally {
    host.dispose();
  }
}

/** A4, in inches, and the page margins of the in-browser renderer. */
const PAGE_W_IN = 8.27;
const PAGE_H_IN = 11.69;
const MARGIN_Y_IN = 1;
const MARGIN_X_IN = 1.1;

function applyLetterTypography(el: HTMLElement): void {
  el.style.boxSizing = "border-box";
  el.style.margin = "0";
  el.style.backgroundColor = "#ffffff";
  el.style.color = "#0f172a";
  el.style.fontFamily = "Iowan Old Style, Georgia, Times New Roman, serif";
  el.style.fontSize = "11pt";
  el.style.lineHeight = "1.55";
  el.style.border = "0";
  el.style.boxShadow = "none";
}

/** The letter as one long column (the source the pages are cut from). */
function buildPdfDoc(bodyHtml: string, ownerDocument: Document = document): HTMLElement {
  const doc = ownerDocument.createElement("div");
  doc.className = "letter-export-source";
  applyLetterTypography(doc);
  doc.style.width = `${PAGE_W_IN - 2 * MARGIN_X_IN}in`;
  doc.innerHTML = bodyHtml;
  applyPdfExportStyles(doc);
  return doc;
}

async function clientSidePdf(bodyHtml: string, filename: string) {
  const host = await createPdfHost(bodyHtml);

  try {
    const blob = await renderClientSidePdf(host.pages);
    triggerDownload(blob, filename);
  } finally {
    host.dispose();
  }
}

async function renderClientSidePdf(pages: HTMLElement[]): Promise<Blob> {
  const [{ default: html2canvas }, jsPdfModule] = await Promise.all([
    import("html2canvas") as Promise<{ default: Html2Canvas }>,
    import("jspdf") as Promise<{ jsPDF?: JsPdfConstructor; default?: JsPdfConstructor }>,
  ]);
  const JsPDF = jsPdfModule.jsPDF ?? jsPdfModule.default;
  if (!JsPDF) throw new Error("PDF renderer failed to load.");

  const pdf = new JsPDF({ unit: "in", format: "a4", orientation: "portrait" });
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const canvas = await html2canvas(page, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 2,
      useCORS: true,
      windowHeight: Math.ceil(page.scrollHeight),
      windowWidth: Math.ceil(page.scrollWidth),
    });
    if (i > 0) pdf.addPage("a4", "portrait");
    // A zero-size canvas (a hidden host) still gives a blank page, never a hang.
    if (canvas.width > 0 && canvas.height > 0) {
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, PAGE_W_IN, PAGE_H_IN);
    }
  }
  return pdf.output("blob");
}

/** The block starts a new page (the Exhibits and Attachments appendices). */
function breaksBefore(el: Element): boolean {
  if (el.classList.contains("page-break-before")) return true;
  const style = (el as HTMLElement).style;
  return style?.breakBefore === "page" || style?.pageBreakBefore === "always";
}

function isBlank(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim();
}

/**
 * Lay the letter out on A4 pages (FEAT-X12): each top-level block goes on
 * the current page if it fits, otherwise on the next; a block that would
 * not fit on an empty page either is split into its children (the Exhibits
 * section, a long list); "page-break-before" blocks start a new page. So no
 * line is cut in half across pages and no page holds only the overflow of
 * the one before.
 */
export function paginateForPdf(source: HTMLElement, ownerDocument: Document): HTMLElement[] {
  const pages: HTMLElement[] = [];
  // The current page's content box, then the shells of split blocks inside it.
  let stack: HTMLElement[] = [];
  // The split blocks being continued, outermost first (shallow clones are
  // made of these on each new page).
  const shells: HTMLElement[] = [];
  let placed = 0;
  const host = source.parentElement ?? ownerDocument.body;

  const newPage = () => {
    const page = ownerDocument.createElement("div");
    page.className = "letter-export-page";
    applyLetterTypography(page);
    page.style.width = `${PAGE_W_IN}in`;
    page.style.height = `${PAGE_H_IN}in`;
    page.style.padding = `${MARGIN_Y_IN}in ${MARGIN_X_IN}in`;
    page.style.overflow = "hidden";
    const content = ownerDocument.createElement("div");
    content.style.height = `${PAGE_H_IN - 2 * MARGIN_Y_IN}in`;
    content.style.overflow = "hidden";
    // A new block formatting context, so a last child's margin counts.
    content.style.display = "flow-root";
    page.appendChild(content);
    host.appendChild(page);
    pages.push(page);
    stack = [content];
    for (const shell of shells) {
      const copy = shell.cloneNode(false) as HTMLElement;
      // The continuation does not break again.
      copy.classList.remove("page-break-before");
      copy.style.breakBefore = "";
      copy.style.pageBreakBefore = "";
      stack[stack.length - 1].appendChild(copy);
      stack.push(copy);
    }
    placed = 0;
  };

  const overflows = () => {
    const content = stack[0];
    return content.scrollHeight > content.clientHeight + 1;
  };

  const place = (node: Node) => {
    if (isBlank(node)) return;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null;
    if (el && breaksBefore(el) && placed > 0) newPage();
    const target = () => stack[stack.length - 1];
    target().appendChild(node);
    if (!overflows()) {
      placed += 1;
      return;
    }
    target().removeChild(node);
    // A block that does not fit goes over whole. The end of the letter (the
    // sign-off, Attachments list and closing small print) is one such block,
    // so the sign-off is never split and the small print never sits alone.
    const children = el ? Array.from(el.childNodes).filter((c) => !isBlank(c)) : [];
    if (placed > 0) {
      const before = { stack, placed };
      newPage();
      target().appendChild(node);
      if (!overflows()) {
        placed += 1;
        return;
      }
      target().removeChild(node);
      // Taller than a whole page and about to be split: drop the empty page
      // and let it flow on from where it was, so a long ending (the sign-off
      // then many attachments) does not leave a gap under the letter.
      if (el && children.length > 1) {
        pages.pop()?.remove();
        stack = before.stack;
        placed = before.placed;
      }
    }
    // Taller than a whole page: split it into its children when it has
    // several; a single tall item (one big image) stays on its own page.
    if (el && children.length > 1) {
      const shell = el.cloneNode(false) as HTMLElement;
      target().appendChild(shell);
      stack.push(shell);
      shells.push(el.cloneNode(false) as HTMLElement);
      for (const child of children) place(child);
      shells.pop();
      // The shell may sit on a later page now; leave whatever page we are on.
      stack = stack.slice(0, stack.length - 1);
      return;
    }
    target().appendChild(node);
    placed += 1;
  };

  // The "Drafted with DraftHR" line is a page footer: it sits in the bottom
  // margin of every page instead of flowing on to a page of its own.
  const footer = source.querySelector<HTMLElement>(":scope > .drafthr-export-footer");
  footer?.remove();

  newPage();
  for (const node of Array.from(source.childNodes)) place(node);

  if (footer) {
    for (const page of pages) {
      const copy = footer.cloneNode(true) as HTMLElement;
      copy.style.position = "absolute";
      copy.style.left = `${MARGIN_X_IN}in`;
      copy.style.right = `${MARGIN_X_IN}in`;
      copy.style.bottom = "0.45in";
      copy.style.marginTop = "0";
      page.style.position = "relative";
      page.appendChild(copy);
    }
  }
  return pages;
}

async function createPdfHost(
  bodyHtml: string
): Promise<{ pages: HTMLElement[]; dispose: () => void }> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${PAGE_W_IN}in`;
  iframe.style.height = `${PAGE_H_IN}in`;
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

  const source = buildPdfDoc(bodyHtml, frameDocument);
  frameDocument.body.appendChild(source);
  await waitForImages(source);
  const pages = paginateForPdf(source, frameDocument);
  source.remove();

  return {
    pages,
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

/** Render the signature image (if any) inline. */
function signatureHtml(draft: Draft): string {
  const url = draft.employer.signatureDataUrl;
  if (!isSafeImageRef(url)) return "";
  return `<div style="margin:8px 0 4px 0;"><img src="${escapeHtml(url)}" style="max-height:60px;display:inline-block;" alt="" /></div>`;
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
  const merged = mergeAcceptedSuggestionsHtml(section.html, { forExport: true });
  // Images that never got embedded (remote src) become a visible note
  // instead of being dropped silently by the sanitiser.
  const html = sanitizeLetterHtmlForExport(markUnembeddedImagesHtml(merged));
  if (!signature) return html;
  if (section.sectionId === "signature") {
    // Prepend the signature image at the top of the signature block.
    return signature + html;
  }
  return html;
}
