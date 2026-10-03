import { expect, it } from "vitest";
import { applyRecoveryLinks, missingRecoveryLinks, recoveryLinks } from "./workspace-recovery-links";
import type { Draft, Matter, Task } from "./letters/types";
import { toServerUuid } from "./remote-ids";
const old = toServerUuid("old-parent"), replacement = toServerUuid("replacement");
const rows = { matters: [{ id: replacement, revision: 3, snapshot: { id: replacement, name: "Correct matter" } as Matter }] };
const task = { id: "task", matterId: old, label: "Keep task text" } as Task;
it("requires an explicit existing matter for tasks and events", () => {
  for (const kind of ["tasks", "events"] as const) {
    const issues = missingRecoveryLinks(kind, task, rows), key = issues[0].key;
    expect(() => applyRecoveryLinks(kind, task, rows)).toThrow("linked record is unavailable");
    expect(() => applyRecoveryLinks(kind, task, rows, { issues, choices: { [key]: null } })).toThrow("Choose an existing matter");
    expect(applyRecoveryLinks(kind, task, rows, { issues, choices: { [key]: replacement } })).toEqual({ ...task, matterId: replacement });
    expect(task.matterId).toBe(old);
  }
});
it("allows explicit optional unlinking without rewriting copied content", () => {
  const draft = { id: "draft", matterId: old, sections: [{ html: "Original recipient" }] } as unknown as Draft;
  const issues = missingRecoveryLinks("drafts", draft, rows);
  const copy = applyRecoveryLinks("drafts", draft, rows, { issues, choices: { [issues[0].key]: null } }) as Draft;
  expect(copy.matterId).toBeUndefined(); expect(copy.sections).toEqual(draft.sections); expect(draft.matterId).toBe(old);
});
it("deduplicates a missing participant employee and retains names on unlink", () => {
  const matter = { id: "matter", participants: [{ name: "First role", employeeId: old }, { name: "Second role", employeeId: old }] } as Matter;
  const issues = missingRecoveryLinks("matters", matter, {});
  expect(issues).toHaveLength(1);
  const copy = applyRecoveryLinks("matters", matter, {}, { issues, choices: { [issues[0].key]: null } }) as Matter;
  expect(copy.participants?.map(p => p.employeeId)).toEqual([null, null]);
  expect(copy.participants?.map(p => p.name)).toEqual(["First role", "Second role"]);
});
it("rejects unreviewed, deleted, changed and no-longer-missing replacements", () => {
  const issues = missingRecoveryLinks("tasks", task, rows), choices = { [issues[0].key]: replacement };
  expect(() => applyRecoveryLinks("tasks", task, {}, { issues, choices })).toThrow("changed or is unavailable");
  expect(() => applyRecoveryLinks("tasks", task, { matters: [{ ...rows.matters[0], revision: 4 }] }, { issues, choices })).toThrow("changed or is unavailable");
  expect(() => applyRecoveryLinks("tasks", task, rows, { issues, choices: { [issues[0].key]: "unseen" } })).toThrow("changed or is unavailable");
  expect(() => applyRecoveryLinks("tasks", task, { matters: [...rows.matters, { id: old, revision: 1, snapshot: { id: old } as Matter }] }, { issues, choices })).toThrow("Linked records changed");
  expect(() => applyRecoveryLinks("tasks", task, rows, { issues, choices: { ...choices, arbitrary: null } })).toThrow("Invalid recovery link choice");
});
it("retains available relationships and canonicalizes only for lookup", () => {
  const source = { ...task, matterId: "replacement" };
  expect(missingRecoveryLinks("tasks", source, rows)).toEqual([]);
  expect(applyRecoveryLinks("tasks", source, rows)).toBe(source);
  expect(recoveryLinks("employees", source)).toEqual([]);
});
