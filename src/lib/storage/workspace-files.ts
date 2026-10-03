import type { Draft, EvidenceItem } from "../letters/types";
import { savedWorkspaceDraft, workspaceFileContext } from "../database-workspace";
import { isDatabaseWorkspaceEnabled } from "../workspace-flags";
import { toServerUuid } from "../remote-ids";
import { useDraftStore } from "../store";
import { isSafeImageDataUrl } from "../safe-data-url";
import { isTenantPrivateImagePath, parsePrivateImageUrl } from "./privateImageUrl";
import { EVIDENCE_MIME, EXPORT_MIME, MAX_EVIDENCE_BYTES, MAX_EXPORT_BYTES, workspaceFileUrl, parseWorkspaceFileUrl, type ArtifactFormat, type WorkspaceFile } from "./workspace-file-types";

async function checked(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `File request failed (${res.status})`);
  }
  return res;
}
export async function saveWorkspaceFile(draft: Draft, blob: Blob, filename: string, purpose: "evidence" | "export", format?: ArtifactFormat): Promise<WorkspaceFile> {
  const scope = workspaceFileContext();
  const assertCurrent = () => { if (!scope.isCurrent()) throw new Error("Workspace changed. The file remains in its original workspace; reload it to continue."); };
  const context = await savedWorkspaceDraft(draft);
  assertCurrent();
  const contentType = format ? EXPORT_MIME[format] : blob.type.split(";")[0];
  if (!blob.size || blob.size > (purpose === "evidence" ? MAX_EVIDENCE_BYTES : MAX_EXPORT_BYTES)) throw new Error(`File must be between 1 byte and ${purpose === "evidence" ? 10 : 25} MB.`);
  if (purpose === "evidence" && !EVIDENCE_MIME.has(contentType)) throw new Error("Unsupported evidence type. Use PDF, DOCX, text, email, calendar, or a PNG/JPEG/WebP/GIF image.");
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
  const headers = { "Content-Type": "application/json", "X-Workspace-ID": context.tenantId };
  const request = async (body: unknown) => {
    assertCurrent();
    const result = await (await checked(await fetch("/api/store/files", {
      method: "POST", credentials: "same-origin", headers, body: JSON.stringify(body),
    }))).json();
    assertCurrent();
    return result;
  };
  const id = crypto.randomUUID();
  const prepared = await request({ action: "prepare", id, draftId: toServerUuid(draft.id), purpose,
    format, filename, contentType, size: blob.size, sha256, draftRevision: context.revision });
  if (!prepared.ready) {
    if (prepared.provider === "local") {
      await checked(await fetch(`/api/store/files?id=${id}`, { method: "PATCH", credentials: "same-origin",
        headers: { "X-Workspace-ID": context.tenantId, "Content-Type": contentType }, body: blob }));
    } else if (prepared.provider === "vercel" && typeof prepared.token === "string") {
      const { put } = await import("@vercel/blob/client");
      assertCurrent();
      await put(prepared.pathname, blob, { access: "private", token: prepared.token, contentType, multipart: blob.size > 4 * 1024 * 1024 });
    } else throw new Error("Invalid private storage response");
  }
  const result = prepared.ready ? prepared : await request({ action: "complete", id });
  assertCurrent();
  if (!result.file || result.file.id !== id || result.file.sha256 !== sha256) throw new Error("File confirmation did not match the upload");
  return result.file as WorkspaceFile;
}

/** All evidence entry points share this; browser data URLs remain a legacy-only
 * path while the coordinated database workspace flag is disabled. */
export async function storeEvidenceFile(draftId: string, file: File): Promise<Pick<EvidenceItem, "fileId" | "fileSize" | "fileSha256" | "fileDataUrl" | "mimeType">> {
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error("Evidence files must be 10 MB or smaller.");
  if (!isDatabaseWorkspaceEnabled()) return { fileDataUrl: await blobAsDataUrl(file), mimeType: file.type || undefined };
  const draft = useDraftStore.getState().drafts[draftId];
  if (!draft) throw new Error("Draft not found");
  const stored = await saveWorkspaceFile(draft, file, file.name, "evidence");
  return { fileId: stored.id, fileSize: stored.size, fileSha256: stored.sha256, mimeType: stored.contentType };
}
export async function listWorkspaceFiles(tenantId: string, purpose: "export" | "evidence" = "export", draftId?: string): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ purpose });
    if (draftId) query.set("draftId", toServerUuid(draftId));
    if (cursor) query.set("cursor", cursor);
    const result = await (await checked(await fetch(`/api/store/files?${query}`, { credentials: "same-origin", cache: "no-store", headers: { "X-Workspace-ID": tenantId } }))).json();
    if (!Array.isArray(result.files)) throw new Error("Invalid file list");
    files.push(...result.files); cursor = result.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("File pagination did not advance");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return files;
}
export async function resolveEvidenceFiles(draft: Draft, tenantId: string, options: { imagesOnly?: boolean; signal?: AbortSignal } = {}): Promise<Draft> {
  const evidence: EvidenceItem[] = [];
  // Bounded sequential reads avoid buffering many 10 MB attachments at once.
  for (const item of draft.evidence ?? []) {
    if (!item.fileId || (options.imagesOnly && !item.mimeType?.startsWith("image/"))) { evidence.push(item); continue; }
    options.signal?.throwIfAborted();
    const res = await checked(await fetch(workspaceFileUrl(item.fileId, tenantId), { credentials: "same-origin", cache: "no-store", signal: options.signal }));
    evidence.push({ ...item, fileDataUrl: await blobAsDataUrl(await res.blob()) });
  }
  const images = new Map(evidence.filter(item => item.fileId && isSafeImageDataUrl(item.fileDataUrl)).map(item => [item.fileId!, item.fileDataUrl!]));
  const assets = new Map<string, string>();
  const resolveAsset = async (src: string) => {
    const path = parsePrivateImageUrl(src);
    if (!path || !isTenantPrivateImagePath(path, tenantId)) throw new Error("An image does not belong to this workspace. Reattach it before exporting.");
    if (assets.has(src)) return assets.get(src)!;
    options.signal?.throwIfAborted();
    const response = await checked(await fetch(src, { credentials: "same-origin", cache: "no-store", signal: options.signal, headers: { "X-Workspace-ID": tenantId } }));
    const blob = await response.blob();
    if (!blob.size || blob.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(blob.type)) throw new Error("A workspace image could not be verified. Try again before exporting.");
    const data = await blobAsDataUrl(blob); options.signal?.throwIfAborted(); assets.set(src, data); return data;
  };
  const sections: Draft["sections"] = [];
  for (const section of draft.sections ?? []) {
    const root = document.createElement("template");
    root.innerHTML = section.html || "";
    let changed = false;
    for (const image of root.content.querySelectorAll("img[src]")) {
      const src = image.getAttribute("src")!;
      if (isSafeImageDataUrl(src)) continue;
      if (parsePrivateImageUrl(src)) {
        image.setAttribute("src", await resolveAsset(src)); changed = true; continue;
      }
      const ref = parseWorkspaceFileUrl(src);
      if (!ref || ref.tenantId !== tenantId || !images.has(ref.id)) throw new Error("An inline image is not linked to this draft and workspace. Reattach it before exporting.");
      image.setAttribute("src", images.get(ref.id)!);
      changed = true;
    }
    sections.push(changed ? { ...section, html: root.innerHTML } : section);
  }
  const employer = draft.employer ? { ...draft.employer } : undefined;
  for (const field of ["letterheadDataUrl", "signatureDataUrl"] as const) {
    const src = employer?.[field];
    if (src && parsePrivateImageUrl(src)) employer![field] = await resolveAsset(src);
  }
  return { ...draft, evidence, ...(draft.sections ? { sections } : {}), ...(employer ? { employer } : {}) };
}
function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the file"));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(blob);
  });
}
