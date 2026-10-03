import type { EditorView } from "@tiptap/pm/view";
import { workspaceFileContext } from "../database-workspace";
import { isDatabaseWorkspaceEnabled } from "../workspace-flags";
import { isAllowedEmbeddedImageFile, isSafeImageDataUrl } from "../safe-data-url";
import { useDraftStore } from "../store";
import { storeEvidenceFile } from "./workspace-files";
import { workspaceFileUrl } from "./workspace-file-types";
import { inlineEvidenceHtml } from "../evidence-html";
import type { EvidenceItem } from "../letters/types";

export function evidenceInsertionHtml(item: EvidenceItem): string {
  return inlineEvidenceHtml(item, item.fileId ? workspaceFileContext().tenantId : undefined);
}

/** Files are saved before insertion, and remain in the evidence drawer if the
 * editor closes or its content changes while the upload is in progress. */
export async function insertInlineEvidenceImage(view: EditorView, draftId: string, file: File, position?: number): Promise<void> {
  if (view.isDestroyed || !view.editable) return;
  if (!isAllowedEmbeddedImageFile(file)) throw new Error("Please use a PNG, JPEG, WEBP, or GIF image.");
  const context = isDatabaseWorkspaceEnabled() ? workspaceFileContext() : null;
  const originalDoc = view.state.doc, selection = view.state.selection;
  const stored = await storeEvidenceFile(draftId, file);
  if (context && !context.isCurrent()) throw new Error("Workspace changed. The upload remains in its original workspace.");
  const state = useDraftStore.getState(), latest = state.drafts[draftId];
  if (!latest) throw new Error("The draft is no longer available.");
  const src = stored.fileId && context ? workspaceFileUrl(stored.fileId, context.tenantId) : stored.fileDataUrl;
  if (!src || (!stored.fileId && !isSafeImageDataUrl(src))) throw new Error("The image could not be read.");
  state.setEvidence(draftId, [...(latest.evidence ?? []), {
    id: crypto.randomUUID(), kind: "screenshot", filename: file.name, content: "",
    uploadedAt: Date.now(), includeVerbatim: false, displayMode: "inline", ...stored,
  }]);
  if (view.isDestroyed || !view.editable || view.state.doc !== originalDoc) {
    throw new Error("Image saved to evidence. The editor changed during upload; insert it from the evidence drawer when ready.");
  }
  const node = view.state.schema.nodes.image.create({ src, alt: file.name });
  const tr = position === undefined
    ? view.state.tr.setSelection(selection).replaceSelectionWith(node)
    : view.state.tr.insert(position, node);
  view.dispatch(tr);
}
