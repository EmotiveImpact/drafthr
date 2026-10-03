import { recordsEqual } from "./record-equality";
import { WORKSPACE_SAVE_ORDER, type WorkspaceBundle, type WorkspaceKind } from "./workspace-documents";
import type { createWorkspaceTransport, WorkspaceServerDocument } from "./workspace-transport";

export type ImportDocuments = Record<WorkspaceKind, WorkspaceServerDocument[]>;
type Transport = ReturnType<typeof createWorkspaceTransport>;

export async function readImportDocuments(transport: Transport, assertCurrent: () => void): Promise<ImportDocuments> {
  assertCurrent();
  const entries = await Promise.all(WORKSPACE_SAVE_ORDER.map(async kind => [kind, await transport.read(kind)] as const));
  assertCurrent();
  return Object.fromEntries(entries) as ImportDocuments;
}

/** Preflight the entire graph before writing any row. Import retries are based
 * on fresh durable state, never the editing coordinator's pending queue. An
 * ambiguous successful write is recognized by exact snapshot equality. */
export async function saveWorkspaceImport(bundle: WorkspaceBundle, documents: ImportDocuments, transport: Transport, assertCurrent: () => void): Promise<ImportDocuments> {
  const writes = WORKSPACE_SAVE_ORDER.flatMap(kind => Object.values(bundle[kind]).flatMap(entity => {
    const existing = documents[kind].find(row => row.id === entity.id);
    if (existing && recordsEqual(existing.snapshot, entity) && !existing.deletedAt) return [];
    if (existing && !(kind === "preferences" && existing.revision === 0 && !existing.deletedAt)) {
      throw new Error("An earlier import was edited or deleted in the database. No workspace-record writes were started. Your browser copy is preserved; resolve the import conflict before continuing.");
    }
    return [{ kind, id: entity.id, snapshot: entity, baseRevision: existing?.revision ?? 0, legacyUpdatedAt: existing?.legacyUpdatedAt }];
  }));
  for (const operation of writes) {
    assertCurrent();
    const result = await transport.write(operation);
    assertCurrent();
    if (!Number.isSafeInteger(result.revision) || result.revision <= operation.baseRevision) throw new Error("The import save acknowledgement was invalid. Your browser copy is preserved.");
  }
  const verified = await readImportDocuments(transport, assertCurrent);
  for (const kind of WORKSPACE_SAVE_ORDER) for (const entity of Object.values(bundle[kind])) {
    if (!verified[kind].some(row => row.id === entity.id && !row.deletedAt && recordsEqual(row.snapshot, entity))) {
      throw new Error("The import verification did not match. The browser source has been preserved.");
    }
  }
  return verified;
}
