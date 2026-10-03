import type { Draft } from "./letters/types";
import { mergeRemoteDrafts, type RemoteDraft } from "./remote-pull";
import { mapWorkspaceEntity, type WorkspaceEntity, type WorkspaceKind } from "./workspace-documents";
import { toServerUuid } from "./remote-ids";
import { SyncRequestError, type SyncDocument, type SyncOperation } from "./workspace-sync-engine";

export type WorkspaceServerDocument = SyncDocument<WorkspaceEntity>;

/** Captures identity once. A request queued in workspace A must never be sent
 * with workspace B's header after another tab switches the active session. */
export function createWorkspaceTransport(tenantId: string, transport: typeof fetch = fetch) {
  const headers = { "Content-Type": "application/json", Accept: "application/json", "X-Workspace-ID": tenantId };
  async function request(url: string, init: RequestInit = {}) {
    const response = await transport(url, { ...init, credentials: "same-origin", headers, cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new SyncRequestError(body?.code ?? (response.status === 409 ? "revision_conflict" : "unavailable"), body?.error ?? `Workspace request failed (${response.status})`);
    if (!body || typeof body !== "object") throw new SyncRequestError("invalid_response", "Invalid workspace response");
    return body;
  }
  return {
    async read(kind: WorkspaceKind): Promise<WorkspaceServerDocument[]> {
      const documents: WorkspaceServerDocument[] = [];
      const cursors = new Set<string>(), ids = new Set<string>();
      let cursor: string | null = null;
      do {
        const base = kind === "drafts" ? "/api/store/drafts?format=documents" : kind === "preferences" ? "/api/store/preferences?format=documents" : `/api/store/workspace-records?kind=${kind}`;
        const page = await request(`${base}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        if (!Array.isArray(page.documents)) throw new SyncRequestError("invalid_response", "Missing workspace records");
        for (const raw of page.documents) {
          if (!raw || typeof raw.id !== "string" || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || ids.has(raw.id)) throw new SyncRequestError("invalid_response", "Invalid workspace record");
          ids.add(raw.id);
          const legacy = raw.legacy as RemoteDraft | undefined;
          const snapshot = raw.deletedAt ? null : raw.snapshot ?? (kind === "drafts" && legacy ? mergeRemoteDrafts({}, [legacy])[raw.id] : null);
          if (!snapshot && !raw.deletedAt) throw new SyncRequestError("invalid_response", "Workspace record has no content");
          documents.push({ id: raw.id, revision: raw.revision, snapshot: snapshot ? mapWorkspaceEntity(kind, snapshot) : null,
            deletedAt: raw.deletedAt ?? null, legacyUpdatedAt: raw.revision === 0 ? legacy?.updatedAt ?? raw.updatedAt : undefined });
        }
        cursor = page.nextCursor ?? null;
        if (cursor && (typeof cursor !== "string" || cursors.has(cursor))) throw new SyncRequestError("invalid_response", "Workspace pagination did not advance");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return documents;
    },
    async write(operation: SyncOperation<WorkspaceKind, WorkspaceEntity>): Promise<{ revision: number; deletedAt?: number | null }> {
      const { kind, baseRevision, legacyUpdatedAt } = operation;
      const snapshot = operation.snapshot ? mapWorkspaceEntity(kind, operation.snapshot) : null;
      const id = toServerUuid(operation.id);
      const draft = kind === "drafts" ? snapshot as Draft | null : null;
      return request(kind === "drafts" ? "/api/store/drafts" : kind === "preferences" ? "/api/store/preferences" : "/api/store/workspace-records", {
        method: snapshot ? "POST" : "DELETE",
        body: JSON.stringify({ kind, id, baseRevision, legacyUpdatedAt, ...(snapshot ? { snapshot } : {}),
          ...(draft ? { matterId: draft.matterId ?? null, templateSourceId: draft.templateSourceId ?? null } : {}) }),
      });
    },
  };
}
