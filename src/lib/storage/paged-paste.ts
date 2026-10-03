import type { EditorHandle } from "pagedly";
import { workspaceFileContext } from "../database-workspace";
import { isDatabaseWorkspaceEnabled } from "../workspace-flags";
import { normalizePastedImages } from "./pasted-images";
import { imageClipboardSource, readClipboardImages, type ImageClipboardSource } from "./clipboard-image-files";

type PasteOptions = { wrapper: HTMLElement; editor: EditorHandle | null; isCurrent: () => boolean };

/** Capture before Pagedly's native bubbling paste listener. Use its public
 * insertion API so section reconstruction, undo and change notifications remain
 * owned by the editor, not hand-written DOM mutations. */
export function handlePagedImagePaste(event: ClipboardEvent, options: PasteOptions, report: (pending: Promise<void>) => void): boolean {
  if (!isDatabaseWorkspaceEnabled()) return false;
  const source = imageClipboardSource(event.clipboardData);
  if (!source) return false;
  event.preventDefault(); event.stopPropagation();
  report(paste(source, options));
  return true;
}

async function paste(source: ImageClipboardSource, { wrapper, editor, isCurrent }: PasteOptions): Promise<void> {
  const selection = window.getSelection();
  if (!editor || !selection || selection.rangeCount !== 1) throw new Error("Select a position in the letter before pasting.");
  const range = selection.getRangeAt(0).cloneRange();
  const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
  const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement;
  const root = anchor?.closest<HTMLElement>(".pagedly-ce-content");
  if (!root || !wrapper.contains(root) || !root.contains(range.endContainer) || root.getAttribute("contenteditable") !== "true" ||
      anchor?.closest('[contenteditable]')?.getAttribute("contenteditable") === "false" || end?.closest('[contenteditable]')?.getAttribute("contenteditable") === "false" ||
      Array.from(root.querySelectorAll('[contenteditable="false"]')).some(element => range.intersectsNode(element))) {
    throw new Error("Paste inside an editable letter section.");
  }
  const content = root.innerHTML, context = workspaceFileContext();
  const current = () => {
    if (!isCurrent() || !context.isCurrent() || !root.isConnected || root.getAttribute("contenteditable") !== "true" || root.innerHTML !== content) return false;
    const live = window.getSelection();
    if (!live || live.rangeCount !== 1) return false;
    const now = live.getRangeAt(0);
    return now.startContainer === range.startContainer && now.startOffset === range.startOffset && now.endContainer === range.endContainer && now.endOffset === range.endOffset;
  };
  const html = await readClipboardImages(source, current);
  const normalized = await normalizePastedImages(html, { tenantId: context.tenantId, isCurrent: current });
  if (!current()) throw new Error("The page, selection or workspace changed. Paste again when ready.");
  editor.insertHtml(normalized);
  // Flush through the vendor contract; the app's ordinary revisioned write path
  // still decides whether the changed sections can be saved.
  try { await editor.flush(); }
  catch { throw new Error("Pasted content was inserted, but the editor could not flush it. Keep this page open and check the workspace save status."); }
}
