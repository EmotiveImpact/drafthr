import { recordsEqual } from "./record-equality";
import { toServerUuid } from "./remote-ids";
import { WORKSPACE_SAVE_ORDER, type WorkspaceEntity, type WorkspaceKind } from "./workspace-documents";
import type { SyncOperation } from "./workspace-sync-engine";

type Operation = SyncOperation<WorkspaceKind, WorkspaceEntity>;
export type RecoverySource = { key: string; raw: string };
export type RecoveryVariant = { source: string; label: string; operation: Operation };
export type RecoveryGroup = { key: string; variants: RecoveryVariant[] };
export type ClosedTabRecoveryReview = { identity: string; files: RecoverySource[]; pending: Operation[]; groups: RecoveryGroup[] };

export function reviewRecoverySources(identity: string, files: RecoverySource[], pending: Operation[]): ClosedTabRecoveryReview {
  const groups = new Map<string, RecoveryGroup>();
  const add = (operation: Operation, source: string, label: string) => {
    if (!operation || !WORKSPACE_SAVE_ORDER.includes(operation.kind) || typeof operation.id !== "string" || !Number.isSafeInteger(operation.baseRevision) || operation.baseRevision < 0 ||
      (operation.snapshot !== null && (!operation.snapshot || operation.snapshot.id !== operation.id))) throw new Error("A closed-tab recovery record is invalid. Its source has been preserved.");
    if (operation.kind === "preferences" && !operation.snapshot) throw new Error("A recovery copy contains invalid deleted settings. Its source has been preserved.");
    const key = `${operation.kind}:${toServerUuid(operation.id)}`;
    const group = groups.get(key) ?? { key, variants: [] };
    if (!group.variants.some(variant => recordsEqual(variant.operation, operation))) {
      if (group.variants.some(variant => variant.source === source)) throw new Error("A recovery source contains competing edits to one record. Download it for manual recovery.");
      group.variants.push({ source, label, operation });
    }
    groups.set(key, group);
  };
  pending.forEach(operation => add(operation, "current", "This tab"));
  [...files].sort((a, b) => a.key.localeCompare(b.key)).forEach((file, index) => {
    const operations: Operation[] = JSON.parse(file.raw);
    if (!Array.isArray(operations)) throw new Error("A closed-tab recovery file is invalid. Download it for manual recovery.");
    operations.forEach(operation => add(operation, file.key, `Older tab ${index + 1}`));
  });
  return structuredClone({ identity, files, pending, groups: [...groups.values()] });
}

export function chooseRecoveryOperations(review: ClosedTabRecoveryReview, choices: Record<string, string> = {}): Operation[] {
  return review.groups.map(group => {
    if (group.variants.length === 1) return group.variants[0].operation;
    const chosen = group.variants.find(variant => variant.source === choices[group.key]);
    if (!chosen) throw new Error("Choose a version for each conflicting record before recovering. All originals are preserved.");
    return chosen.operation;
  });
}
