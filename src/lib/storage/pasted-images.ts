import { DOMParser as ProseMirrorParser } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { workspaceFileContext } from "../database-workspace";
import { sanitizeLetterHtml } from "../sanitize";
import { isSafeImageDataUrl } from "../safe-data-url";
import { isDatabaseWorkspaceEnabled } from "../workspace-flags";
import { legacyAssetUploader } from "./legacy-asset-import";
import { decodeLegacyFile } from "./legacy-file-import";
import { isTenantPrivateImagePath, parsePrivateImageUrl } from "./privateImageUrl";
import { parseWorkspaceFileUrl } from "./workspace-file-types";
import type { ImageUploadScope } from "./uploadImage";

/** Inspect inert HTML before sanitizing: dropping an unsupported image and then
 * reporting a successful paste would silently lose part of the user's content. */
export async function normalizePastedImages(html: string, scope: ImageUploadScope): Promise<string> {
  if (html.length > 12 * 1024 * 1024) throw new Error("Paste a smaller selection (up to 12 MB of HTML). Nothing was inserted.");
  const root = document.createElement("template"); root.innerHTML = html;
  const images = Array.from(root.content.querySelectorAll("img"));
  if (images.length > 20) throw new Error("Paste at most 20 images at a time. Nothing was inserted.");
  // Validate every source before beginning any upload. Never fetch an external
  // URL, file:, blob:, or another tenant's authenticated image endpoint.
  for (const image of images) {
    let src = image.getAttribute("src") ?? "";
    // Browsers can absolutize a relative image when copying rendered HTML.
    // Canonicalize only our own origin, then apply the same strict route and
    // tenant checks. Never follow another host or discard a URL fragment.
    if (/^https?:\/\//i.test(src)) {
      try {
        const url = new URL(src);
        if (url.origin === window.location.origin && !url.hash) src = `${url.pathname}${url.search}`;
      } catch { /* The source validation below rejects invalid URLs. */ }
    }
    if (isSafeImageDataUrl(src)) {
      if (decodeLegacyFile(src).bytes.byteLength > 2 * 1024 * 1024) throw new Error("Pasted images must be 2 MB or smaller each. Use Upload new for larger evidence files.");
    } else {
      const asset = parsePrivateImageUrl(src), file = parseWorkspaceFileUrl(src);
      if (!(asset && isTenantPrivateImagePath(asset, scope.tenantId)) && file?.tenantId !== scope.tenantId) {
        throw new Error("A pasted image is external, unsupported or from another workspace. Paste its original image file instead. Nothing was inserted.");
      }
    }
    image.setAttribute("src", src);
  }
  const persist = legacyAssetUploader(scope);
  for (const [index, image] of images.entries()) {
    if (!scope.isCurrent()) throw new Error("The editor or workspace changed. Paste again when ready.");
    const src = await persist(image.getAttribute("src")!, `Pasted image ${index + 1}`);
    if (!scope.isCurrent()) throw new Error("The editor or workspace changed. Paste again when ready.");
    image.setAttribute("src", src);
  }
  return sanitizeLetterHtml(root.innerHTML);
}

/** Keep the entire paste out of the editor until private images are verified.
 * A changed document, selection, edit permission or session cancels insertion;
 * the clipboard and existing text are untouched. */
export async function insertPastedHtmlImages(view: EditorView, html: string): Promise<void> {
  if (view.isDestroyed || !view.editable) throw new Error("This editor is not editable.");
  const context = workspaceFileContext(), doc = view.state.doc, selection = view.state.selection;
  const scope = { tenantId: context.tenantId, isCurrent: () => context.isCurrent() && !view.isDestroyed && view.editable && view.state.doc === doc && view.state.selection.eq(selection) };
  const normalized = await normalizePastedImages(html, scope);
  if (!scope.isCurrent()) throw new Error("The editor or workspace changed. Paste again when ready.");
  const root = document.createElement("template"); root.innerHTML = normalized;
  const slice = ProseMirrorParser.fromSchema(view.state.schema).parseSlice(root.content);
  view.dispatch(view.state.tr.setSelection(selection).replaceSelection(slice).scrollIntoView());
}

/** HTML takes precedence over a duplicate clipboard image-file representation,
 * otherwise copying an illustrated paragraph can discard all of its text. */
export function handleDatabaseImagePaste(view: EditorView, event: ClipboardEvent, report: (pending: Promise<void>) => void): boolean {
  if (!isDatabaseWorkspaceEnabled()) return false;
  const html = event.clipboardData?.getData("text/html");
  if (!html || !/<img\b/i.test(html)) return false;
  event.preventDefault();
  report(insertPastedHtmlImages(view, html));
  return true;
}
