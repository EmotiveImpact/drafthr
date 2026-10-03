import type { Draft, Employee, Matter, Task } from "./letters/types";
import type { WorkspaceEntity, WorkspaceKind } from "./workspace-documents";
import type { SyncDocument } from "./workspace-sync-engine";
import { recordsEqual } from "./record-equality";
import { toServerUuid } from "./remote-ids";

type ParentKind = "employees" | "matters";
export type RecoveryLink = { key: string; kind: ParentKind; id: string; label: string; required: boolean };
export type RecoveryLinkIssue = RecoveryLink & { candidates: Array<{ id: string; label: string; revision: number }> };
export type RecoveryLinkChoices = Record<string, string | null>;
type ParentRows = Partial<Record<ParentKind, SyncDocument<WorkspaceEntity>[]>>;

export function recoveryLinks(kind: WorkspaceKind, source: WorkspaceEntity): RecoveryLink[] {
  const result: RecoveryLink[] = [];
  const add = (parent: ParentKind, id: string | undefined | null, label: string, required = false) => {
    if (!id) return;
    const canonical = toServerUuid(id), key = `${parent}:${canonical}`;
    if (!result.some(link => link.key === key)) result.push({ key, kind: parent, id: canonical, label, required });
  };
  if (kind === "drafts") {
    add("employees", (source as Draft).employeeId, "Letter employee");
    add("matters", (source as Draft).matterId, "Letter matter");
  } else if (kind === "matters") {
    for (const p of (source as Matter).participants ?? []) add("employees", p.employeeId, `Participant: ${p.name}`);
  } else if (kind === "tasks" || kind === "events") add("matters", (source as Task).matterId, "Parent matter", true);
  return result;
}

export function missingRecoveryLinks(kind: WorkspaceKind, source: WorkspaceEntity, rows: ParentRows): RecoveryLinkIssue[] {
  return recoveryLinks(kind, source).filter(link => !(rows[link.kind] ?? []).some(row => row.id === link.id && !row.deletedAt && row.snapshot))
    .map(link => ({ ...link, candidates: (rows[link.kind] ?? []).filter(row => !row.deletedAt && row.snapshot).map(row => ({
      id: row.id, revision: row.revision,
      label: link.kind === "employees" ? (row.snapshot as Employee).legalName : (row.snapshot as Matter).name,
    })) }));
}

/** Only unavailable links may be changed, only after an explicit choice. Never
 * rewrite the copied letter text or participant names to match another person. */
export function applyRecoveryLinks(kind: WorkspaceKind, source: WorkspaceEntity, rows: ParentRows,
  review?: { issues: RecoveryLinkIssue[]; choices: RecoveryLinkChoices }): WorkspaceEntity {
  const issues = missingRecoveryLinks(kind, source, rows);
  if (!review) {
    if (issues.length) throw new Error("A linked record is unavailable. Check linked records and choose how to recover them first. Your original edit is preserved.");
    return source;
  }
  const describe = (items: RecoveryLinkIssue[]) => items.map(({ candidates: _c, ...link }) => link);
  if (!recordsEqual(describe(issues), describe(review.issues))) throw new Error("Linked records changed. Check linked records again; your original edit is preserved.");
  if (Object.keys(review.choices).some(key => !issues.some(issue => issue.key === key))) throw new Error("Invalid recovery link choice.");
  for (const issue of issues) {
    const choice = review.choices[issue.key];
    if (choice === undefined || (choice === null && issue.required)) throw new Error(`Choose an existing ${issue.kind === "matters" ? "matter" : "employee"} for ${issue.label}.`);
    if (choice !== null) {
      const seen = review.issues.find(link => link.key === issue.key)?.candidates.find(row => row.id === choice);
      const now = issue.candidates.find(row => row.id === choice);
      if (!seen || !now || seen.revision !== now.revision) throw new Error("The selected linked record changed or is unavailable. Check linked records again.");
    }
  }
  const copy = structuredClone(source);
  const remap = (parent: ParentKind, id?: string | null) => {
    if (!id) return id;
    const key = `${parent}:${toServerUuid(id)}`;
    return Object.prototype.hasOwnProperty.call(review.choices, key) ? review.choices[key] : id;
  };
  if (kind === "drafts") {
    const draft = copy as Draft;
    const employee = remap("employees", draft.employeeId), matter = remap("matters", draft.matterId);
    if (employee) draft.employeeId = employee; else delete draft.employeeId;
    if (matter) draft.matterId = matter; else delete draft.matterId;
  } else if (kind === "matters") {
    const matter = copy as Matter;
    matter.participants = matter.participants?.map(p => ({ ...p, employeeId: remap("employees", p.employeeId) ?? null }));
  } else if (kind === "tasks" || kind === "events") (copy as Task).matterId = remap("matters", (copy as Task).matterId)!;
  return copy;
}
