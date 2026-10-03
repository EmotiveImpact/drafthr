import type { EvidenceItem } from "./letters/types";
import { displayModeOf, figureLabelFor } from "./evidence";
import { isSafeImageDataUrl } from "./safe-data-url";
import { parseWorkspaceFileUrl, workspaceFileUrl } from "./storage/workspace-file-types";

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function inlineEvidenceHtml(item: EvidenceItem, tenantId?: string): string {
  if (item.kind === "screenshot") {
    const src = item.fileId && tenantId ? workspaceFileUrl(item.fileId, tenantId) : item.fileDataUrl;
    if (item.fileId && (!tenantId || !src || !parseWorkspaceFileUrl(src))) throw new Error("Reload the workspace before inserting this private image.");
    if (src && (parseWorkspaceFileUrl(src) || isSafeImageDataUrl(src))) {
      // Tiptap's image schema does not preserve figure/figcaption wrappers.
      const caption = item.content || item.filename;
      return `<img src="${escape(src)}" alt="${escape(item.filename || "Evidence image")}" />${caption ? `<p><em>${escape(caption)}</em></p>` : ""}`;
    }
    throw new Error("This image is unavailable. Upload it again before inserting it.");
  }
  const caption = item.filename ? ` (${escape(item.filename)})` : "";
  if (item.kind === "note" || item.kind === "email" || item.kind === "calendar") {
    const label = item.kind === "email" ? "Email" : item.kind === "calendar" ? "Calendar entry" : "Note";
    return `<blockquote>${escape(item.content || item.filename || "Evidence")}<br/><em>— ${label}${caption}</em></blockquote>`;
  }
  return `<p>I refer to the document <em>${escape(item.filename || "(unnamed)")}</em>${item.content ? `, summarised: ${escape(item.content)}` : ""}.</p>`;
}

/** Shared letter content, not an evidence-file bundle. Original non-image
 * documents remain separate files in the ZIP; never imply they are embedded. */
export function attachmentsHtml(evidence: EvidenceItem[] = []): string {
  const attached = evidence.filter(item => displayModeOf(item) === "attached");
  if (!attached.length) return "";
  return `<section class="attachments-section page-break-before">
    <h2>Attachments</h2><ol class="attachments-list" style="list-style:decimal;padding-left:1.2em;">${attached.map(item =>
      `<li><strong>${escape(item.filename || `${item.kind} item`)}</strong>${item.content ? ` — ${escape(item.content)}` : ""}</li>`
    ).join("\n")}</ol></section>`;
}

export function figuresHtml(evidence: EvidenceItem[] = [], options: { requireResolvedImages?: boolean } = {}): string {
  const figures = evidence.filter(item => displayModeOf(item) === "figure");
  if (!figures.length) return "";
  return `<section class="figures-section page-break-before"><h2>Exhibits</h2>${figures.map(item => {
    const image = isSafeImageDataUrl(item.fileDataUrl) ? item.fileDataUrl : undefined;
    if (options.requireResolvedImages && item.fileId && item.mimeType?.startsWith("image/") && !image) {
      throw new Error(`Load the private exhibit before exporting: ${item.filename || item.id}`);
    }
    const fileNotice = !image && (item.fileId || item.fileDataUrl)
      ? "<p class=\"figure-file-note\">Original file supplied separately in the export pack.</p>" : "";
    return `<figure class="figure-item"><figcaption><strong>${escape(figureLabelFor(item, evidence))}</strong>${
      item.filename ? ` — ${escape(item.filename)}` : ""
    }</figcaption>${image ? `<img src="${escape(image)}" alt="${escape(item.filename || "Evidence image")}" style="max-width:100%;max-height:600px;object-fit:contain;" />` : ""}${
      item.content ? `<p class="figure-body">${escape(item.content)}</p>` : ""
    }${fileNotice}</figure>`;
  }).join("\n")}</section>`;
}
