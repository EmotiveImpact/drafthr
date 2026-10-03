import { describe, expect, it } from "vitest";
import { emptyWorkspaceBundle, mapWorkspaceEntity, planWorkspaceImport } from "./workspace-documents";
import type { Draft, Employee, Matter, Task } from "./letters/types";
import { toServerUuid } from "./remote-ids";

describe("workspace relationship migration", () => {
  const employee = { id: "emp_old", legalName: "Alex", status: "active", createdAt: 1, updatedAt: 2 } as Employee;
  const matter = { id: "matter_old", name: "Case", participants: [{ employeeId: employee.id, name: "Alex", role: "subject" }] } as Matter;
  const draft = { id: "draft_old", employeeId: employee.id, matterId: matter.id } as Draft;
  it("canonicalizes every relationship without mutating the browser original", () => {
    expect(mapWorkspaceEntity("drafts", draft)).toMatchObject({ id: toServerUuid(draft.id), employeeId: toServerUuid(employee.id), matterId: toServerUuid(matter.id) });
    expect(mapWorkspaceEntity("matters", matter)).toMatchObject({ participants: [{ employeeId: toServerUuid(employee.id) }] });
    expect(matter.participants?.[0].employeeId).toBe("emp_old");
  });
  it("creates a repeatable isolated graph for explicit import", () => {
    const source = emptyWorkspaceBundle();
    source.employees[employee.id] = employee; source.matters[matter.id] = matter; source.drafts[draft.id] = draft;
    source.tasks.task_old = { id: "task_old", matterId: matter.id } as Task;
    const first = planWorkspaceImport(source, "tenantA", "token1");
    expect(planWorkspaceImport(source, "tenantA", "token1")).toEqual(first);
    const e = Object.values(first.employees)[0], m = Object.values(first.matters)[0] as Matter;
    expect(m.participants?.[0].employeeId).toBe(e.id);
    expect(Object.values(first.drafts)[0]).toMatchObject({ employeeId: e.id, matterId: m.id });
    expect(Object.values(first.tasks)[0]).toMatchObject({ matterId: m.id });
    expect(Object.keys(planWorkspaceImport(source, "tenantB", "token1").employees)).not.toEqual(Object.keys(first.employees));
  });
  it("stops on missing dependencies without dropping links", () => {
    const source = emptyWorkspaceBundle(); source.drafts[draft.id] = draft;
    expect(() => planWorkspaceImport(source, "tenantA", "token1")).toThrow("linked employees record is missing");
    expect(source.drafts[draft.id]).toEqual(draft);
  });
});
