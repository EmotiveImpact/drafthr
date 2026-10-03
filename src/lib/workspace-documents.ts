import type { Draft } from "./letters/types";
import type { WorkspaceRecord, WorkspaceRecordKind } from "./workspace-records";
import { toServerUuid } from "./remote-ids";
import type { WorkspacePreferences } from "./workspace-preferences";

export const WORKSPACE_SAVE_ORDER = ["preferences", "employees", "templates", "matters", "tasks", "events", "drafts"] as const;
export type WorkspaceKind = typeof WORKSPACE_SAVE_ORDER[number];
export type WorkspaceEntity = WorkspaceRecord | Draft | WorkspacePreferences;
export type WorkspaceBundle = Record<WorkspaceKind, Record<string, WorkspaceEntity>>;
export const emptyWorkspaceBundle = (): WorkspaceBundle => ({ preferences: {}, employees: {}, templates: {}, matters: {}, tasks: {}, events: {}, drafts: {} });

/** Canonicalize the whole graph, not just its row IDs. */
export function mapWorkspaceEntity(kind: WorkspaceKind, value: WorkspaceEntity, mapId: (kind: WorkspaceKind, id: string) => string = (_, id) => toServerUuid(id)): WorkspaceEntity {
  const record = { ...value, id: mapId(kind, value.id) };
  if (kind === "drafts") {
    const draft = record as Draft;
    if (draft.employeeId) draft.employeeId = mapId("employees", draft.employeeId);
    if (draft.matterId) draft.matterId = mapId("matters", draft.matterId);
    if (draft.templateSourceId) draft.templateSourceId = mapId("templates", draft.templateSourceId);
  } else if (kind === "matters") {
    const matter = record as import("./letters/types").Matter;
    if (matter.participants) matter.participants = matter.participants.map(p => ({ ...p, employeeId: p.employeeId ? mapId("employees", p.employeeId) : null }));
  } else if (kind === "tasks" || kind === "events") {
    const child = record as import("./letters/types").Task;
    child.matterId = mapId("matters", child.matterId);
  }
  return record;
}

/** Explicit import always creates a separate, repeatable graph. It never
 * overwrites an existing server record or silently adopts another tenant's IDs.
 * A stable import token is persisted before the first request, allowing retries.
 */
export function planWorkspaceImport(source: WorkspaceBundle, tenantId: string, importToken: string): WorkspaceBundle {
  const result = emptyWorkspaceBundle();
  const known = new Set(WORKSPACE_SAVE_ORDER.flatMap(kind => Object.values(source[kind]).map(r => `${kind}:${toServerUuid(r.id)}`)));
  const mapId = (kind: WorkspaceKind, id: string) => {
    if (!known.has(`${kind}:${toServerUuid(id)}`)) throw new Error(`Cannot import: a linked ${kind} record is missing. The original browser data has been preserved.`);
    return toServerUuid(`import:${tenantId}:${importToken}:${kind}:${toServerUuid(id)}`);
  };
  for (const kind of WORKSPACE_SAVE_ORDER) {
    for (const entity of Object.values(source[kind])) {
      const mapped = mapWorkspaceEntity(kind, entity, mapId);
      result[kind][mapped.id] = mapped;
    }
  }
  return result;
}

export function recordKind(kind: WorkspaceKind): WorkspaceRecordKind | null { return kind === "drafts" || kind === "preferences" ? null : kind; }
