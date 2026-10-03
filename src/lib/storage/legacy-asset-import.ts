import type { CustomTemplate } from "../letters/types";
import { decodeLegacyFile, sha256Bytes } from "./legacy-file-import";
import { isTenantPrivateImagePath, parsePrivateImageUrl } from "./privateImageUrl";
import { parseWorkspaceFileUrl } from "./workspace-file-types";
import { uploadImage, type ImageUploadScope } from "./uploadImage";
import { rateLimitedRequest } from "./rate-limited-request";

const MAX = 2 * 1024 * 1024;
const raster = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
type Branding = { letterheadDataUrl?: string; signatureDataUrl?: string };
type Persist = (reference: string, filename: string) => Promise<string>;

/** One cache per explicit import, never across users or workspaces. Both old
 * authenticated image routes and copied draft-file images become reusable
 * workspace assets. Arbitrary remote URLs are never fetched. */
export function legacyAssetUploader(scope: ImageUploadScope): Persist {
  const cache = new Map<string, Promise<string>>();
  const assertCurrent = () => { if (!scope.isCurrent()) throw new Error("Workspace or browser source changed. Original images are preserved."); };
  const read = async (url: string) => {
    assertCurrent();
    const response = await rateLimitedRequest(() => fetch(url, { credentials: "same-origin", cache: "no-store", headers: { "X-Workspace-ID": scope.tenantId } }), assertCurrent);
    assertCurrent();
    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
    if (!response.ok || !raster.has(contentType) || Number(response.headers.get("content-length")) > MAX || !response.body) throw new Error("An original image could not be read safely. The browser copy is preserved.");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); assertCurrent(); if (done) break;
        size += value.byteLength;
        if (size > MAX) throw new Error("Branding and template images must be 2 MB or smaller. The original is preserved.");
        chunks.push(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    if (!size) throw new Error("An original image was empty. The browser copy is preserved.");
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { bytes, contentType };
  };
  const persist: Persist = async (reference, filename) => {
    assertCurrent();
    let decoded: ReturnType<typeof decodeLegacyFile>;
    if (reference.startsWith("data:")) decoded = decodeLegacyFile(reference);
    else {
      const assetPath = parsePrivateImageUrl(reference), file = parseWorkspaceFileUrl(reference);
      if (!(assetPath && isTenantPrivateImagePath(assetPath, scope.tenantId)) && file?.tenantId !== scope.tenantId) throw new Error("An image is external or belongs to another workspace. The browser original is preserved.");
      decoded = await read(reference);
    }
    if (!raster.has(decoded.contentType) || decoded.bytes.length > MAX) throw new Error("Branding and template images must be PNG, JPEG, WebP or GIF up to 2 MB. Original preserved.");
    const sha = await sha256Bytes(decoded.bytes); assertCurrent();
    let binary = "";
    for (const byte of decoded.bytes) binary += String.fromCharCode(byte);
    const url = await uploadImage({ dataUrl: `data:${decoded.contentType};base64,${btoa(binary)}`, filename }, scope);
    assertCurrent();
    const path = parsePrivateImageUrl(url);
    if (!path || !isTenantPrivateImagePath(path, scope.tenantId) || path.split("/").at(-1)!.split(".")[0] !== sha) throw new Error("The saved image did not match its original bytes.");
    const verified = await read(url);
    if (verified.contentType !== decoded.contentType || await sha256Bytes(verified.bytes) !== sha) throw new Error("Image verification failed. The browser original is preserved.");
    assertCurrent(); return url;
  };
  return (reference, filename) => {
    assertCurrent();
    let pending = cache.get(reference);
    if (!pending) { pending = persist(reference, filename); cache.set(reference, pending); }
    return pending;
  };
}

export async function importEmployerAssets<T extends Branding>(employer: T, persist: Persist): Promise<T> {
  const copy = { ...employer };
  for (const key of ["letterheadDataUrl", "signatureDataUrl"] as const) {
    if (copy[key]) copy[key] = await persist(copy[key]!, key === "letterheadDataUrl" ? "Letterhead" : "Signature");
  }
  return copy;
}

export async function importTemplateAssets(template: CustomTemplate, persist: Persist): Promise<CustomTemplate> {
  const copy = structuredClone(template);
  for (const [key, html] of Object.entries(copy.sectionHtml)) {
    if (!html || !/<img\b/i.test(html)) continue;
    const root = document.createElement("template"); root.innerHTML = html;
    for (const image of root.content.querySelectorAll("img")) {
      const src = image.getAttribute("src");
      if (!src) throw new Error("A template image has no source. The browser original is preserved.");
      image.setAttribute("src", await persist(src, image.getAttribute("alt") || "Template image"));
    }
    copy.sectionHtml[key as keyof typeof copy.sectionHtml] = root.innerHTML;
  }
  return copy;
}
