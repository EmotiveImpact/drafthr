import type { Draft, EvidenceItem } from "../letters/types";
import { toServerUuid } from "../remote-ids";
import { EVIDENCE_MIME, MAX_EVIDENCE_BYTES, workspaceFileUrl, parseWorkspaceFileUrl, type WorkspaceFile } from "./workspace-file-types";
import { isTenantPrivateImagePath, parsePrivateImageUrl } from "./privateImageUrl";
import { rateLimitedRequest, StorageRateLimitError } from "./rate-limited-request";

export type ImportFile = { id: string; draftId: string; importToken: string; filename: string; contentType: string; size: number; sha256: string; bytes: Uint8Array<ArrayBuffer> };
type StageFile = (file: ImportFile) => Promise<WorkspaceFile>;

/** Decode only supported legacy data URLs. Invalid/oversized bytes stop the
 * import; never strip a file and then claim the source was safely migrated. */
export function decodeLegacyFile(value: string) {
  const match = /^data:([\w.+-]+\/[\w.+-]+)(?:;charset=[^;,]+)?;base64,([\s\S]*)$/i.exec(value);
  if (!match) throw new Error("A legacy file is not a valid base64 data URL. The browser original is preserved.");
  const contentType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  if (!EVIDENCE_MIME.has(contentType)) throw new Error(`Legacy file type ${contentType} is unsupported. Download the browser recovery copy before continuing.`);
  const encoded = match[2].replace(/\s/g, "");
  if (!encoded || encoded.length > Math.ceil(MAX_EVIDENCE_BYTES / 3) * 4) throw new Error("Legacy files must contain between 1 byte and 10 MB. The browser original is preserved.");
  let binary: string;
  try { binary = atob(encoded); } catch { throw new Error("A legacy file has invalid base64. The browser original is preserved."); }
  if (btoa(binary).replace(/=+$/, "") !== encoded.replace(/=+$/, "") || binary.length > MAX_EVIDENCE_BYTES) throw new Error("A legacy file is corrupt or too large. The browser original is preserved.");
  return { contentType, bytes: Uint8Array.from(binary, character => character.charCodeAt(0)) };
}
export async function sha256Bytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Rewrite a copy, including version history and pending edits. Staged files
 * remain invisible to normal workspace reads until the draft transaction links
 * them. The caller retains the complete browser source until graph verification. */
export async function importLegacyDraftFiles(draft: Draft, tenantId: string, importToken: string, stage: StageFile, assertCurrent: () => void, persistAsset?: (reference: string, filename: string) => Promise<string>): Promise<Draft> {
  const copy = structuredClone(draft);
  const assets = new Map<string, { filename: string; decoded: ReturnType<typeof decodeLegacyFile>; stored?: WorkspaceFile }>();
  const add = (url: string, filename?: string) => {
    if (assets.has(url)) return;
    const decoded = decodeLegacyFile(url);
    const extension = decoded.contentType.startsWith("image/") ? decoded.contentType.split("/")[1] : "bin";
    const safeName = (filename || `Imported image ${assets.size + 1}.${extension}`).split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200) || `Imported file.${extension}`;
    assets.set(url, { filename: safeName, decoded });
  };
  for (const item of copy.evidence ?? []) if (item.fileDataUrl) add(item.fileDataUrl, item.filename);
  const htmlFields: Array<{ owner: Record<string, unknown>; key: string; root: HTMLTemplateElement }> = [];
  const reusableImages: Element[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && /html$/i.test(key) && /<img\b/i.test(child)) {
        // Template content is inert: inspecting legacy markup must not start
        // image requests or run event handlers before references are checked.
        const root = document.createElement("template"); root.innerHTML = child;
        let changed = false;
        for (const image of root.content.querySelectorAll("img[src]")) {
          const src = image.getAttribute("src")!;
          if (src.toLowerCase().startsWith("data:")) {
            if (!/^data:image\/(?:png|jpeg|jpg|webp|gif);/i.test(src)) throw new Error("A legacy inline image has an unsupported image type. The browser original is preserved.");
            add(src); changed = true;
          }
          else {
            const asset = parsePrivateImageUrl(src);
            if (asset && isTenantPrivateImagePath(asset, tenantId) && persistAsset) {
              reusableImages.push(image); changed = true; continue;
            }
            const privateRef = parseWorkspaceFileUrl(src);
            if (!privateRef || privateRef.tenantId !== tenantId) throw new Error("A legacy inline image is not available in this workspace. The browser original is preserved.");
          }
        }
        if (changed) htmlFields.push({ owner: value as Record<string, unknown>, key, root });
      } else if (child && typeof child === "object") visit(child);
    }
  };
  visit(copy.sections);
  for (const image of reusableImages) {
    assertCurrent(); image.setAttribute("src", await persistAsset!(image.getAttribute("src")!, image.getAttribute("alt") || "Imported image")); assertCurrent();
  }
  if (!assets.size) {
    for (const { owner, key, root } of htmlFields) owner[key] = root.innerHTML;
    return copy;
  }
  for (const asset of assets.values()) {
    assertCurrent();
    const sha256 = await sha256Bytes(asset.decoded.bytes);
    const id = toServerUuid(`import-file:${tenantId}:${importToken}:${copy.id}:${asset.filename}:${asset.decoded.contentType}:${sha256}`);
    assertCurrent();
    const stored = await stage({ id, draftId: copy.id, importToken, filename: asset.filename,
      contentType: asset.decoded.contentType, size: asset.decoded.bytes.byteLength, sha256, bytes: asset.decoded.bytes });
    assertCurrent();
    if (!stored || stored.id !== id || stored.draftId !== copy.id || stored.sha256 !== sha256 || stored.size !== asset.decoded.bytes.byteLength || stored.contentType !== asset.decoded.contentType) throw new Error("The imported file confirmation did not match its original bytes.");
    asset.stored = stored;
  }
  const fields = (stored: WorkspaceFile) => ({ fileId: stored.id, fileSize: stored.size, fileSha256: stored.sha256, mimeType: stored.contentType });
  copy.evidence = (copy.evidence ?? []).map(item => {
    if (!item.fileDataUrl) return item;
    const stored = assets.get(item.fileDataUrl)!.stored!;
    const { fileDataUrl: _bytes, ...metadata } = item;
    return { ...metadata, ...fields(stored) };
  });
  for (const { owner, key, root } of htmlFields) {
    for (const image of root.content.querySelectorAll("img[src]")) {
      const stored = assets.get(image.getAttribute("src")!)?.stored;
      if (!stored) continue;
      image.setAttribute("src", workspaceFileUrl(stored.id, tenantId));
      if (!copy.evidence.some(item => item.fileId === stored.id)) {
        const item: EvidenceItem = { id: toServerUuid(`import-evidence:${stored.id}`), kind: "screenshot", filename: stored.filename,
          content: "", uploadedAt: draft.updatedAt, includeVerbatim: false, displayMode: "inline", ...fields(stored) };
        copy.evidence.push(item);
      }
    }
    owner[key] = root.innerHTML;
  }
  if (copy.evidence.length > 200) throw new Error("This draft has more than 200 evidence files after migration. The browser original is preserved.");
  return copy;
}

export function stagedFileUploader(tenantId: string, assertCurrent: () => void): StageFile {
  const headers = { "Content-Type": "application/json", "X-Workspace-ID": tenantId };
  const checked = async (response: Response) => {
    if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error || `File import failed (${response.status})`); }
    return response;
  };
  const request = async (body: unknown) => {
    assertCurrent();
    const response = await checked(await rateLimitedRequest(() => fetch("/api/store/files", { method: "POST", credentials: "same-origin", headers, body: JSON.stringify(body) }), assertCurrent));
    assertCurrent(); return response.json();
  };
  return async file => {
    const { bytes, ...metadata } = file;
    const prepared = await request({ ...metadata, action: "prepare-import", purpose: "evidence", draftRevision: 0 });
    let result = prepared;
    if (!prepared.ready) {
      // A previous attempt may have uploaded bytes but lost its completion
      // acknowledgement. Verify those bytes first; never overwrite an object.
      try { result = await request({ action: "complete", id: file.id }); }
      catch (error) {
        if (error instanceof StorageRateLimitError) throw error;
        assertCurrent();
        const blob = new Blob([bytes], { type: file.contentType });
        if (prepared.provider === "local") {
          await checked(await rateLimitedRequest(() => fetch(`/api/store/files?id=${file.id}`, { method: "PATCH", credentials: "same-origin", headers: { "X-Workspace-ID": tenantId, "Content-Type": file.contentType }, body: blob }), assertCurrent));
        } else if (prepared.provider === "vercel" && typeof prepared.token === "string") {
          const { put } = await import("@vercel/blob/client");
          assertCurrent();
          try { await put(prepared.pathname, blob, { access: "private", token: prepared.token, contentType: file.contentType, multipart: blob.size > 4 * 1024 * 1024 }); }
          catch { /* An immutable object may already exist; completion verifies it. */ }
        } else throw new Error("Invalid private import storage response");
        result = await request({ action: "complete", id: file.id });
      }
    }
    assertCurrent();
    // Round-trip the private bytes, not just the metadata receipt. The token
    // permits only this importer to read an otherwise invisible staged object.
    const downloaded = new Uint8Array(file.size);
    // Small authenticated ranges also work when a host caps buffered function
    // responses. Never depend on a public Blob URL to verify a large import.
    const chunkSize = 1024 * 1024;
    for (let start = 0; start < file.size; start += chunkSize) {
      assertCurrent();
      const end = Math.min(start + chunkSize, file.size) - 1;
      const response = await checked(await rateLimitedRequest(() => fetch(`${workspaceFileUrl(file.id, tenantId)}&importToken=${encodeURIComponent(file.importToken)}`, {
        credentials: "same-origin", cache: "no-store", headers: { Range: `bytes=${start}-${end}` },
      }), assertCurrent));
      if (response.status !== 206 || response.headers.get("Content-Range") !== `bytes ${start}-${end}/${file.size}`) throw new Error("The private file range could not be verified. The browser original is preserved.");
      const chunk = new Uint8Array(await response.arrayBuffer());
      if (chunk.byteLength !== end - start + 1) throw new Error("An imported file range was incomplete. The browser original is preserved.");
      downloaded.set(chunk, start);
    }
    assertCurrent();
    if (downloaded.byteLength !== file.size || await sha256Bytes(downloaded) !== file.sha256) throw new Error("Imported file bytes failed verification. The browser original is preserved.");
    assertCurrent();
    return result.file;
  };
}
