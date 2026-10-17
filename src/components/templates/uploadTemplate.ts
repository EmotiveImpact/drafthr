/**
 * Reading an uploaded firm template in the browser. Plain text, Markdown,
 * HTML and Word (.docx, read with jszip, which the app already ships) become
 * letter HTML that a firm template can start from. Everything is sanitised
 * with the same rules as the editor.
 */
import { marked } from "marked";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import type { LetterTypeMeta } from "@/lib/letters/catalog";
import type { SectionId } from "@/lib/letters/types";

export const UPLOAD_MAX_BYTES = 1024 * 1024;
export const UPLOAD_EXTENSIONS = [".txt", ".md", ".html", ".htm", ".docx"] as const;
export const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.join(",");
export const UPLOAD_RULE = "Upload a .txt, .md, .html or .docx file up to 1 MB";

export type UploadKind = "text" | "markdown" | "html" | "docx";

export function uploadKind(fileName: string): UploadKind | null {
  const ext = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (ext === ".txt") return "text";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".html" || ext === ".htm") return "html";
  if (ext === ".docx") return "docx";
  return null;
}

/** Null when the file can be read, otherwise what to do about it. */
export function validateUpload(file: { name: string; size: number }): string | null {
  if (!uploadKind(file.name)) return `${UPLOAD_RULE}. This file type can't be read.`;
  if (file.size > UPLOAD_MAX_BYTES)
    return `This file is ${overLimitSize(file.size)}, over the 1 MB limit. Remove images or extra pages, or save the wording as a .txt file, then choose it again.`;
  if (file.size === 0) return `${UPLOAD_RULE}. This file is empty.`;
  return null;
}

/** The file name without its extension, as a starting template name. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** A size just over the limit in whole KB rounded up ("1,025 KB"), so it
 * never reads as the limit itself; larger files in MB. */
function overLimitSize(n: number): string {
  if (n < 10 * 1024 * 1024) return `${Math.ceil(n / 1024).toLocaleString("en-GB")} KB`;
  return formatBytes(n);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text to paragraphs: blank lines split paragraphs, single line
 * breaks stay as <br>. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** The paragraphs of a Word document's main part, as plain text. */
export function docxXmlToParagraphs(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paras = Array.from(doc.getElementsByTagNameNS(W, "p"));
  return paras.map((p) => {
    let out = "";
    const walk = (node: Element) => {
      for (const child of Array.from(node.children)) {
        if (child.namespaceURI === W && child.localName === "t") out += child.textContent ?? "";
        else if (child.namespaceURI === W && child.localName === "tab") out += " ";
        else if (child.namespaceURI === W && (child.localName === "br" || child.localName === "cr")) out += "\n";
        else walk(child);
      }
    };
    walk(p);
    return out;
  });
}

async function readDocx(file: Blob): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const part = zip.file("word/document.xml");
  if (!part) throw new Error("This Word file has no document text.");
  const paragraphs = docxXmlToParagraphs(await part.async("string"));
  return paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Read a validated file into sanitised letter HTML. */
export async function readTemplateFile(file: File): Promise<string> {
  const kind = uploadKind(file.name);
  let html = "";
  if (kind === "docx") html = await readDocx(file);
  else {
    const text = await file.text();
    if (kind === "markdown") html = await marked.parse(text, { async: false });
    else if (kind === "html") {
      const doc = new DOMParser().parseFromString(text, "text/html");
      html = doc.body?.innerHTML ?? text;
    } else html = textToHtml(text);
  }
  const clean = sanitizeLetterHtml(html).trim();
  if (!clean.replace(/<[^>]+>/g, "").trim()) throw new Error("We couldn't find any text in this file.");
  return clean;
}

/** Where uploaded text goes in the base letter: its body section, or the
 * first section that carries the letter's wording. */
export function uploadTargetSection(meta: Pick<LetterTypeMeta, "defaultSections">): SectionId {
  const ids = meta.defaultSections.map((s) => s.id);
  if (ids.includes("body")) return "body";
  const skip = new Set<SectionId>(["header", "recipient_block", "subject", "salutation", "signature", "closing"]);
  return ids.find((id) => !skip.has(id)) ?? ids[0] ?? "body";
}
