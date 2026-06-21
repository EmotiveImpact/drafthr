import type { Draft } from "@/lib/letters/types";
import { disclaimerHtmlFor } from "@/lib/letters/disclaimers";
import {
  brandedExportFooterHtml,
  resolveClientEnvFlag,
} from "@/lib/branding/export-footer";
import { sanitizeLetterHtml, sanitizeLetterHtmlForExport } from "@/lib/sanitize";
import { mergeAcceptedSuggestionsHtml } from "@/lib/tiptap/suggestion-merge";
import { resolveFigureRefsInHtml } from "@/lib/evidence";
import { isSafeImageRef } from "@/lib/safe-data-url";
import { inlineImagesForExport } from "@/lib/storage/inlineImagesForExport";

type InlineStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fontSizeHalfPoints?: number;
  monospace?: boolean;
  verticalAlign?: "subscript" | "superscript";
};

type ParagraphOptions = {
  styleId?: "Heading1" | "Heading2" | "Heading3" | "ListParagraph";
  alignment?: "left" | "center" | "right" | "both";
  spacingAfter?: number;
  indentLeft?: number;
  hanging?: number;
  borderBottom?: boolean;
};

type DocxImage = {
  relId: string;
  docPrId: number;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  widthEmu: number;
  heightEmu: number;
};

type RenderContext = {
  images: DocxImage[];
  nextRelId: number;
  nextDocPrId: number;
  listDepth: number;
};

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/**
 * Render the letter as a DOCX Blob. Pure: does not trigger a download.
 * Reused by both exportLetterToDocx (single-file flow) and the ZIP pack.
 */
export async function renderLetterDocxBlob(draft: Draft): Promise<Blob> {
  const rawBodyHtml = buildDocxBodyHtml(draft);
  // DOCX needs image bytes (binary embed) — fetch any https:// blob URLs and
  // inline them as data: URLs before the parser walks the tree, otherwise
  // they'd degrade to "[Image: alt]" text fallback.
  const bodyHtml = await inlineImagesForExport(rawBodyHtml);
  const body = parseBodyHtml(bodyHtml);
  const ctx: RenderContext = {
    images: [],
    nextRelId: 1,
    nextDocPrId: 1,
    listDepth: 0,
  };
  const documentBody = renderNodesAsBlocks(Array.from(body.childNodes), ctx);
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  zip.file("[Content_Types].xml", buildContentTypesXml(ctx.images));
  zip.folder("_rels")!.file(".rels", buildRootRelsXml());
  zip.folder("word")!.file("document.xml", buildDocumentXml(documentBody));
  zip.folder("word")!.file("styles.xml", buildStylesXml());
  zip.folder("word")!.folder("_rels")!.file(
    "document.xml.rels",
    buildDocumentRelsXml(ctx.images)
  );

  const media = zip.folder("word")!.folder("media")!;
  for (const image of ctx.images) {
    media.file(image.filename, image.bytes, { binary: true });
  }

  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
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

function buildDocxBodyHtml(draft: Draft): string {
  const evidence = draft.evidence ?? [];
  const sectionsHtml = draft.sections
    .map((s) => injectSignatureIntoSignatureSection(s, signatureHtml(draft)))
    .join("\n");
  const resolved =
    evidence.length > 0 ? resolveFigureRefsInHtml(sectionsHtml, evidence) : sectionsHtml;
  const attached = evidence.filter((e) => (e.displayMode ?? "figure") === "attached");
  const attachmentsBlock =
    attached.length === 0
      ? ""
      : `<div><h3>Attachments</h3><ol>${attached
          .map(
            (e) =>
              `<li><strong>${escapeHtmlD(e.filename || `${e.kind} item`)}</strong>${
                e.content ? ` - ${escapeHtmlD(e.content)}` : ""
              }</li>`
          )
          .join("")}</ol></div>`;

  return [
    letterheadHtml(draft),
    resolved,
    attachmentsBlock,
    "<hr />",
    sanitizeLetterHtml(disclaimerHtmlFor(draft)),
    // Branded export footer — same toggle as PDF. See src/lib/branding/export-footer.ts.
    brandedExportFooterHtml({ envEnabled: resolveClientEnvFlag() }),
  ]
    .filter(Boolean)
    .join("\n");
}

function parseBodyHtml(html: string): HTMLElement {
  const parser = new DOMParser();
  return parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html")
    .body;
}

function renderNodesAsBlocks(
  nodes: Node[],
  ctx: RenderContext,
  baseInlineStyle: InlineStyle = {}
): string {
  const blocks: string[] = [];
  const inlineBuffer: Node[] = [];

  const flushInline = () => {
    if (inlineBuffer.length === 0) return;
    const runs = inlineBuffer.map((node) => renderInlineNode(node, ctx, baseInlineStyle)).join("");
    if (runs.trim()) {
      blocks.push(paragraph(runs, { spacingAfter: 160 }));
    }
    inlineBuffer.length = 0;
  };

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? "").trim()) inlineBuffer.push(node);
      continue;
    }

    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (isIgnorableElement(node)) {
      continue;
    }

    if (isBlockElement(node)) {
      flushInline();
      blocks.push(renderBlockElement(node, ctx, baseInlineStyle));
    } else {
      inlineBuffer.push(node);
    }
  }

  flushInline();
  return blocks.join("");
}

function renderBlockElement(
  element: HTMLElement,
  ctx: RenderContext,
  baseInlineStyle: InlineStyle
): string {
  const tag = element.tagName.toLowerCase();

  if (tag === "br") {
    return paragraph("");
  }

  if (tag === "hr") {
    return paragraph("", { borderBottom: true, spacingAfter: 160 });
  }

  if (tag === "img") {
    return paragraph(renderImageRun(element as HTMLImageElement, ctx), {
      alignment: alignmentFromElement(element),
    });
  }

  if (tag === "h1" || tag === "h2" || tag === "h3") {
    const level = tag === "h1" ? 1 : tag === "h2" ? 2 : 3;
    const size = level === 1 ? 32 : level === 2 ? 28 : 24;
    return paragraph(
      renderInlineChildren(element, ctx, {
        ...baseInlineStyle,
        bold: true,
        fontSizeHalfPoints: size,
      }),
      {
        styleId: level === 1 ? "Heading1" : level === 2 ? "Heading2" : "Heading3",
        alignment: alignmentFromElement(element),
        spacingAfter: level === 1 ? 180 : 140,
      }
    );
  }

  if (tag === "ul" || tag === "ol") {
    return renderList(element, ctx, tag === "ol");
  }

  if (tag === "table") {
    return renderTable(element as HTMLTableElement, ctx);
  }

  if (tag === "blockquote") {
    const runs = renderInlineChildren(element, ctx, {
      ...baseInlineStyle,
      italic: true,
      color: "475569",
    });
    return paragraph(runs, {
      indentLeft: 360,
      spacingAfter: 180,
    });
  }

  if (tag === "pre") {
    return paragraph(renderInlineChildren(element, ctx, { ...baseInlineStyle, monospace: true }), {
      spacingAfter: 180,
    });
  }

  if (tag === "p") {
    return paragraph(renderInlineChildren(element, ctx, baseInlineStyle), {
      alignment: alignmentFromElement(element),
      spacingAfter: 160,
    });
  }

  if (hasDirectBlockChildren(element)) {
    return renderNodesAsBlocks(Array.from(element.childNodes), ctx, baseInlineStyle);
  }

  const runs = renderInlineChildren(element, ctx, baseInlineStyle);
  return runs.trim() ? paragraph(runs, { spacingAfter: 160 }) : "";
}

function renderInlineChildren(
  element: HTMLElement,
  ctx: RenderContext,
  style: InlineStyle = {}
): string {
  return Array.from(element.childNodes)
    .map((node) => renderInlineNode(node, ctx, style))
    .join("");
}

function renderInlineNode(node: Node, ctx: RenderContext, style: InlineStyle): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizeText(node.textContent ?? "");
    return text.trim() ? textRun(text, style) : "";
  }

  if (!(node instanceof HTMLElement) || isIgnorableElement(node)) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return `<w:r><w:br/></w:r>`;
  if (tag === "img") return renderImageRun(node as HTMLImageElement, ctx);
  if (tag === "hr") return `<w:r><w:br/></w:r>`;

  const nextStyle = styleFromElement(node, style);
  if (isBlockElement(node) && tag !== "span") {
    return renderInlineChildren(node, ctx, nextStyle);
  }
  return renderInlineChildren(node, ctx, nextStyle);
}

function renderList(list: HTMLElement, ctx: RenderContext, ordered: boolean): string {
  const previousDepth = ctx.listDepth;
  ctx.listDepth = previousDepth + 1;

  let index = 1;
  const items = Array.from(list.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .filter((child) => child.tagName.toLowerCase() === "li")
    .map((li) => renderListItem(li, ctx, ordered, index++))
    .join("");

  ctx.listDepth = previousDepth;
  return items;
}

function renderListItem(
  li: HTMLElement,
  ctx: RenderContext,
  ordered: boolean,
  index: number
): string {
  const prefix = ordered ? `${index}. ` : "\u2022 ";
  const contentRuns = renderListItemInlineContent(li, ctx);
  const indentLeft = Math.max(360, ctx.listDepth * 360);
  const firstParagraph = paragraph(textRun(prefix, {}) + contentRuns, {
    styleId: "ListParagraph",
    indentLeft,
    hanging: 240,
    spacingAfter: 80,
  });

  const nestedBlocks = Array.from(li.childNodes)
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .filter((child) => {
      const tag = child.tagName.toLowerCase();
      return tag === "ul" || tag === "ol" || tag === "table";
    })
    .map((child) => renderBlockElement(child, ctx, {}))
    .join("");

  return firstParagraph + nestedBlocks;
}

function renderListItemInlineContent(li: HTMLElement, ctx: RenderContext): string {
  return Array.from(li.childNodes)
    .map((node) => {
      if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol" || tag === "table") return "";
        if (tag === "p" || tag === "div") return renderInlineChildren(node, ctx, {});
      }
      return renderInlineNode(node, ctx, {});
    })
    .join("");
}

function renderTable(table: HTMLTableElement, ctx: RenderContext): string {
  const rows = collectTableRows(table);
  if (rows.length === 0) return "";

  const renderedRows = rows.map((row) => renderTableRow(row, ctx)).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>${renderedRows}</w:tbl>`;
}

function collectTableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = [];
  const visit = (element: Element) => {
    for (const child of Array.from(element.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "tr" && child instanceof HTMLTableRowElement) rows.push(child);
      if (tag === "thead" || tag === "tbody" || tag === "tfoot") visit(child);
    }
  };
  visit(table);
  return rows;
}

function renderTableRow(row: HTMLTableRowElement, ctx: RenderContext): string {
  const cells = Array.from(row.children)
    .filter(
      (cell): cell is HTMLTableCellElement =>
        cell instanceof HTMLTableCellElement &&
        ["td", "th"].includes(cell.tagName.toLowerCase())
    )
    .map((cell) => renderTableCell(cell, ctx))
    .join("");
  return `<w:tr>${cells}</w:tr>`;
}

function renderTableCell(cell: HTMLTableCellElement, ctx: RenderContext): string {
  const isHeader = cell.tagName.toLowerCase() === "th";
  const cellStyle: InlineStyle = isHeader ? { bold: true } : {};
  const content = hasDirectBlockChildren(cell)
    ? renderNodesAsBlocks(Array.from(cell.childNodes), ctx, cellStyle)
    : paragraph(renderInlineChildren(cell, ctx, cellStyle), { spacingAfter: 0 });
  const shading = isHeader ? `<w:shd w:fill="F8FAFC"/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shading}</w:tcPr>${
    content || paragraph("")
  }</w:tc>`;
}

function textRun(text: string, style: InlineStyle): string {
  if (!text) return "";
  const preserve = /^\s|\s$|\s{2,}/.test(text) ? ` xml:space="preserve"` : "";
  return `<w:r>${runProperties(style)}<w:t${preserve}>${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(runs: string, options: ParagraphOptions = {}): string {
  const props = paragraphProperties(options);
  return `<w:p>${props}${runs}</w:p>`;
}

function paragraphProperties(options: ParagraphOptions): string {
  const props: string[] = [];
  if (options.styleId) props.push(`<w:pStyle w:val="${options.styleId}"/>`);
  if (options.alignment && options.alignment !== "left") {
    props.push(`<w:jc w:val="${options.alignment}"/>`);
  }
  if (options.spacingAfter !== undefined) {
    props.push(`<w:spacing w:after="${options.spacingAfter}"/>`);
  }
  if (options.indentLeft !== undefined || options.hanging !== undefined) {
    props.push(
      `<w:ind${options.indentLeft !== undefined ? ` w:left="${options.indentLeft}"` : ""}${
        options.hanging !== undefined ? ` w:hanging="${options.hanging}"` : ""
      }/>`
    );
  }
  if (options.borderBottom) {
    props.push(
      `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CBD5E1"/></w:pBdr>`
    );
  }
  return props.length > 0 ? `<w:pPr>${props.join("")}</w:pPr>` : "";
}

function runProperties(style: InlineStyle): string {
  const props: string[] = [];
  if (style.bold) props.push("<w:b/>");
  if (style.italic) props.push("<w:i/>");
  if (style.underline) props.push(`<w:u w:val="single"/>`);
  if (style.strike) props.push("<w:strike/>");
  if (style.color) props.push(`<w:color w:val="${escapeXmlAttr(style.color)}"/>`);
  if (style.fontSizeHalfPoints) props.push(`<w:sz w:val="${style.fontSizeHalfPoints}"/>`);
  if (style.monospace) {
    props.push(`<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>`);
  }
  if (style.verticalAlign) props.push(`<w:vertAlign w:val="${style.verticalAlign}"/>`);
  return props.length > 0 ? `<w:rPr>${props.join("")}</w:rPr>` : "";
}

function styleFromElement(element: HTMLElement, style: InlineStyle): InlineStyle {
  const tag = element.tagName.toLowerCase();
  const next: InlineStyle = { ...style };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "del") next.strike = true;
  if (tag === "code" || tag === "kbd") next.monospace = true;
  if (tag === "sub") next.verticalAlign = "subscript";
  if (tag === "sup") next.verticalAlign = "superscript";
  if (tag === "a") {
    next.underline = true;
    next.color = "1D4ED8";
  }

  const inline = parseStyleAttribute(element.getAttribute("style"));
  if (inline["font-weight"] === "bold" || Number(inline["font-weight"]) >= 600) next.bold = true;
  if (inline["font-style"] === "italic") next.italic = true;
  if (inline["text-decoration"]?.includes("underline")) next.underline = true;
  if (inline["text-decoration"]?.includes("line-through")) next.strike = true;
  const color = normalizeHexColor(inline.color);
  if (color) next.color = color;

  return next;
}

function renderImageRun(img: HTMLImageElement, ctx: RenderContext): string {
  const src = img.getAttribute("src") ?? "";
  const parsed = parseDataImage(src);
  if (!parsed) {
    const alt = img.getAttribute("alt")?.trim();
    if (alt) return textRun(`[Image: ${alt}]`, { italic: true, color: "64748B" });
    // A data: image in a format Word can't embed (e.g. webp) with no alt
    // must NOT silently vanish — emit a visible placeholder so the user
    // notices the letterhead/signature didn't render rather than losing it
    // without a trace. (https images already got inlined upstream; a
    // remaining data: URL we can't parse is an unsupported format.)
    const unsupported = /^data:(image\/[a-z0-9.+-]+)/i.exec(src);
    if (unsupported) {
      return textRun(`[Image omitted — ${unsupported[1]} not supported in Word export]`, {
        italic: true,
        color: "64748B",
      });
    }
    return "";
  }

  const intrinsic = intrinsicImageSize(parsed.bytes);
  const size = imageSizeFromElement(img, intrinsic);
  const image: DocxImage = {
    relId: `rId${ctx.nextRelId++}`,
    docPrId: ctx.nextDocPrId++,
    filename: `image${ctx.images.length + 1}.${parsed.extension}`,
    contentType: parsed.mime,
    bytes: parsed.bytes,
    widthEmu: pxToEmu(size.widthPx),
    heightEmu: pxToEmu(size.heightPx),
  };
  ctx.images.push(image);

  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${image.widthEmu}" cy="${image.heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${image.docPrId}" name="${escapeXmlAttr(
    image.filename
  )}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${image.docPrId}" name="${escapeXmlAttr(
    image.filename
  )}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${
    image.relId
  }"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${
    image.widthEmu
  }" cy="${image.heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function parseDataImage(src: string):
  | { mime: "image/png" | "image/jpeg" | "image/gif"; extension: "png" | "jpg" | "gif"; bytes: Uint8Array }
  | null {
  const match = /^data:(image\/(?:png|jpeg|jpg|gif));base64,(.*)$/i.exec(src);
  if (!match) return null;
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const extension = mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : "jpg";
  const bytes = base64ToBytes(match[2]);
  return { mime: mime as "image/png" | "image/jpeg" | "image/gif", extension, bytes };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode the intrinsic pixel dimensions from raw image bytes — PNG (IHDR),
 * JPEG (first SOF marker), and GIF (logical screen descriptor). Returns null
 * for formats we can't cheaply parse. Used to preserve aspect ratio when the
 * markup only specifies one CSS dimension (the common letterhead/signature
 * case), instead of fabricating the other with a fixed multiplier.
 */
export function intrinsicImageSize(bytes: Uint8Array): { w: number; h: number } | null {
  // PNG: 8-byte signature, then IHDR (width/height as big-endian uint32 at 16/20).
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    if (w > 0 && h > 0) return { w, h };
    return null;
  }
  // GIF: width/height little-endian uint16 at offset 6/8.
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
  ) {
    const w = bytes[6] | (bytes[7] << 8);
    const h = bytes[8] | (bytes[9] << 8);
    if (w > 0 && h > 0) return { w, h };
    return null;
  }
  // JPEG: scan markers for the first SOF (0xC0–0xCF except C4/C8/CC).
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xc4 || marker === 0xc8 || marker === 0xcc) {
        // Not a frame header — skip by segment length.
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        i += 2 + len;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        if (w > 0 && h > 0) return { w, h };
        return null;
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2; // standalone markers, no length
        continue;
      }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Final size caps for an exported image. When the intrinsic aspect ratio is
 * known, both axes must be scaled together so clamping one doesn't squash the
 * image — the earlier bug clamped width and height independently, distorting
 * any image larger than the page-width or max-height cap. With no known ratio
 * we keep the old independent clamps (best effort for unparseable formats).
 *
 * Exported for unit testing.
 */
export function clampImageSizePx(
  widthPx: number | undefined,
  heightPx: number | undefined,
  ratio: number | null,
  opts?: { maxWidthPx?: number; maxHeightPx?: number; minPx?: number },
): { widthPx: number; heightPx: number } {
  const maxWidthPx = opts?.maxWidthPx ?? 6.0 * 96;
  const maxHeightPx = opts?.maxHeightPx ?? 2.5 * 96;
  const minPx = opts?.minPx ?? 24;

  let w = widthPx ?? maxWidthPx;
  let h = heightPx ?? 96;

  if (ratio && ratio > 0) {
    // Shrink uniformly to fit BOTH caps, preserving the aspect ratio.
    const scale = Math.min(1, maxWidthPx / w, maxHeightPx / h);
    w *= scale;
    h *= scale;
  } else {
    w = Math.min(w, maxWidthPx);
    h = Math.min(h, maxHeightPx);
  }
  return { widthPx: Math.max(w, minPx), heightPx: Math.max(h, minPx) };
}

function imageSizeFromElement(
  img: HTMLImageElement,
  intrinsic?: { w: number; h: number } | null,
): { widthPx: number; heightPx: number } {
  const inline = parseStyleAttribute(img.getAttribute("style"));
  const attrWidth = cssLengthToPx(img.getAttribute("width"));
  const attrHeight = cssLengthToPx(img.getAttribute("height"));
  const styleWidth = cssLengthToPx(inline.width) ?? cssLengthToPx(inline["max-width"]);
  const styleHeight = cssLengthToPx(inline.height) ?? cssLengthToPx(inline["max-height"]);
  const maxWidthPx = 6.0 * 96;

  let widthPx = attrWidth ?? styleWidth;
  let heightPx = attrHeight ?? styleHeight;

  // Preserve the TRUE aspect ratio from the image bytes when we know it and
  // only one dimension is specified. Falls back to the old heuristics only
  // when the intrinsic size is unavailable (unparseable format).
  const ratio = intrinsic && intrinsic.w > 0 && intrinsic.h > 0 ? intrinsic.w / intrinsic.h : null;

  if (!widthPx && !heightPx) {
    if (ratio) {
      // Default the height to ~1.1in and derive width from the real ratio,
      // clamped to the page width.
      heightPx = 1.1 * 96;
      widthPx = Math.min(heightPx * ratio, maxWidthPx);
    } else {
      widthPx = 3.2 * 96;
      heightPx = 1.1 * 96;
    }
  } else if (!widthPx && heightPx) {
    widthPx = ratio ? Math.min(heightPx * ratio, maxWidthPx) : Math.min(heightPx * 4, maxWidthPx);
  } else if (widthPx && !heightPx) {
    heightPx = ratio ? widthPx / ratio : Math.max(widthPx * 0.25, 0.45 * 96);
  }

  return clampImageSizePx(widthPx, heightPx, ratio, { maxWidthPx });
}

function cssLengthToPx(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "auto" || trimmed.endsWith("%")) return undefined;
  const match = /^([0-9]*\.?[0-9]+)(px|pt|in|cm|mm)?$/.exec(trimmed);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  const unit = match[2] ?? "px";
  if (!Number.isFinite(numeric)) return undefined;
  if (unit === "pt") return numeric * (96 / 72);
  if (unit === "in") return numeric * 96;
  if (unit === "cm") return numeric * (96 / 2.54);
  if (unit === "mm") return numeric * (96 / 25.4);
  return numeric;
}

function pxToEmu(px: number): number {
  return Math.round((px / 96) * 914400);
}

function hasDirectBlockChildren(element: HTMLElement): boolean {
  return Array.from(element.children).some(
    (child) => child instanceof HTMLElement && isBlockElement(child)
  );
}

function isBlockElement(element: HTMLElement): boolean {
  return BLOCK_TAGS.has(element.tagName.toLowerCase());
}

function isIgnorableElement(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  return tag === "script" || tag === "style" || tag === "meta" || tag === "link";
}

function alignmentFromElement(element: HTMLElement): ParagraphOptions["alignment"] {
  const inline = parseStyleAttribute(element.getAttribute("style"));
  const value = (inline["text-align"] || element.getAttribute("align") || "").toLowerCase();
  if (value === "center" || value === "right" || value === "both") return value;
  if (value === "justify") return "both";
  return undefined;
}

function parseStyleAttribute(style: string | null): Record<string, string> {
  if (!style) return {};
  return Object.fromEntries(
    style
      .split(";")
      .map((part) => part.split(":"))
      .filter((pair): pair is [string, string] => pair.length >= 2)
      .map(([key, ...value]) => [key.trim().toLowerCase(), value.join(":").trim()])
      .filter(([key, value]) => Boolean(key && value))
  );
}

function normalizeHexColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (short) {
    return short[1]
      .split("")
      .map((char) => char + char)
      .join("")
      .toUpperCase();
  }
  const long = /^#([0-9a-f]{6})$/i.exec(trimmed);
  return long ? long[1].toUpperCase() : undefined;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ");
}

function buildDocumentXml(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14 wp14"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`;
}

function buildContentTypesXml(images: DocxImage[]): string {
  const imageDefaults = Array.from(new Set(images.map((image) => image.filename.split(".").pop())))
    .filter((extension): extension is string => Boolean(extension))
    .map((extension) => {
      const contentType =
        extension === "png" ? "image/png" : extension === "gif" ? "image/gif" : "image/jpeg";
      return `<Default Extension="${extension}" ContentType="${contentType}"/>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageDefaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
}

function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
}

function buildDocumentRelsXml(images: DocxImage[]): string {
  const imageRels = images
    .map(
      (image) =>
        `<Relationship Id="${image.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${escapeXmlAttr(
          image.filename
        )}"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imageRels}</Relationships>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="22"/><w:color w:val="0F172A"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="372" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="180"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="220" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="180" w:after="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr></w:style></w:styles>`;
}

function escapeHtmlD(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(s: string): string {
  return (
    s
      // XML 1.0 forbids most C0 control characters; DOMPurify leaves them in
      // (they're legal HTML text), so they would reach word/document.xml
      // verbatim and Word rejects the file as corrupt. Strip the illegal
      // range, keeping the only valid controls: tab, LF, CR.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  );
}

function escapeXmlAttr(s: string): string {
  return escapeXml(s).replace(/"/g, "&quot;");
}

function letterheadHtml(draft: Draft): string {
  const url = draft.employer.letterheadDataUrl;
  if (!isSafeImageRef(url)) return "";
  return `<div style="text-align:center;margin-bottom:18pt;"><img src="${url}" style="max-width:100%;max-height:120px;" /></div>`;
}

function signatureHtml(draft: Draft): string {
  const url = draft.employer.signatureDataUrl;
  if (!isSafeImageRef(url)) return "";
  return `<div style="margin:6pt 0;"><img src="${url}" style="max-height:54px;" /></div>`;
}

function injectSignatureIntoSignatureSection(
  section: { sectionId?: string; html: string },
  signature: string
): string {
  // Same export-time discipline as PDF: collapse accepted suggestions first,
  // strip the rest via the export sanitiser so track-changes never reaches
  // the .docx output.
  const merged = mergeAcceptedSuggestionsHtml(section.html, { forExport: true });
  const html = sanitizeLetterHtmlForExport(merged);
  if (!signature) return html;
  if (section.sectionId === "signature") return signature + html;
  return html;
}
