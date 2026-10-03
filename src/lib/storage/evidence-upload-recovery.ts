import { savedWorkspaceDraft, workspaceFileContext } from "../database-workspace";
import type { EvidenceItem } from "../letters/types";
import { toServerUuid } from "../remote-ids";
import { useDraftStore } from "../store";
import type { WorkspaceFile } from "./workspace-file-types";

export type EvidenceUpload = Omit<WorkspaceFile, "completedAt"> & { status: "ready" | "pending"; completedAt: number | null };
export type EvidenceRecovery = Awaited<ReturnType<typeof findEvidenceUploads>>;

/** A recovery receipt is scoped to this coordinator and session-transition epoch,
 * not just a tenant ID. No persistent browser upload queue is needed. */
export async function findEvidenceUploads(draftId: string, isActive: () => boolean = () => true) {
  const scope = workspaceFileContext();
  const isCurrent = () => scope.isCurrent() && isActive();
  const assertCurrent = () => { if (!isCurrent()) throw new Error("Workspace or letter changed. Check uploaded files again."); };
  const headers = { "X-Workspace-ID": scope.tenantId, "Content-Type": "application/json" };
  const request = async (url: string, init?: RequestInit) => {
    assertCurrent();
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init, headers });
    const body = await response.json().catch(() => null);
    assertCurrent();
    if (!response.ok) throw new Error(body?.error ?? "Could not check private uploads. Try again.");
    return body;
  };
  const files: EvidenceUpload[] = [], cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ purpose: "evidence", draftId: toServerUuid(draftId), recovery: "true" });
    if (cursor) query.set("cursor", cursor);
    const body = await request(`/api/store/files?${query}`);
    if (!Array.isArray(body?.files) || body.files.some((file: EvidenceUpload) => file.purpose !== "evidence" || file.draftId !== toServerUuid(draftId) || !["ready", "pending"].includes(file.status))) {
      throw new Error("Invalid evidence upload list");
    }
    files.push(...body.files);
    cursor = body.nextCursor;
    if (cursor && (typeof cursor !== "string" || cursors.has(cursor))) throw new Error("Upload pagination did not advance");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const draft = useDraftStore.getState().drafts[draftId];
  if (!draft) throw new Error("The draft is no longer available");
  const attached = new Set(draft.evidence?.map(item => item.fileId));
  return {
    files: files.filter(file => !attached.has(file.id)), isCurrent,
    async attach(fileId: string) {
      assertCurrent();
      const upload = files.find(file => file.id === fileId);
      if (!upload) throw new Error("Check uploaded files again before attaching this file.");
      let file = upload;
      if (upload.status === "pending") {
        // Only the original uploader can complete a pending file. The existing
        // endpoint verifies actual bytes and atomically records readiness/audit.
        const body = await request("/api/store/files", { method: "POST", body: JSON.stringify({ action: "complete", id: fileId }) });
        const ready = body?.file as WorkspaceFile | undefined;
        if (!ready || ready.id !== fileId || ready.draftId !== upload.draftId || ready.purpose !== "evidence" || ready.sha256 !== upload.sha256 || ready.size !== upload.size || ready.contentType !== upload.contentType || !ready.completedAt) {
          throw new Error("Private upload verification did not match this file.");
        }
        file = { ...ready, status: "ready" };
      }
      assertCurrent();
      const store = useDraftStore.getState(), latest = store.drafts[draftId];
      if (!latest) throw new Error("The draft is no longer available");
      if (!latest.evidence?.some(item => item.fileId === fileId)) {
        const kind: EvidenceItem["kind"] = file.contentType.startsWith("image/") ? "screenshot"
          : file.contentType === "text/calendar" ? "calendar" : file.contentType === "message/rfc822" ? "email" : "document";
        store.setEvidence(draftId, [...(latest.evidence ?? []), {
          id: `ev_file_${file.id}`, kind, filename: file.filename, content: "", sectionIds: [], includeVerbatim: false,
          uploadedAt: file.createdAt, fileId: file.id, fileSize: file.size, fileSha256: file.sha256, mimeType: file.contentType,
        }]);
      }
      // A retry uses the existing reference. A conflict/offline save leaves it
      // pending and must never produce a false "saved" acknowledgement.
      const updated = useDraftStore.getState().drafts[draftId];
      await savedWorkspaceDraft(updated);
      assertCurrent();
    },
  };
}
