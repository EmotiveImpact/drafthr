import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * deleteMatter cleanup: removing a matter must also unfile its drafts AND
 * drop its tasks/events — otherwise those records leak in the store forever
 * (invisible, and would re-surface if a new matter reused the id).
 */
describe("deleteMatter orphan cleanup", () => {
  beforeEach(() => installMemoryLocalStorage());
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("removes the matter, unfiles its drafts, and drops its tasks/events", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();

    const matterId = store.createMatter({ name: "Acme grievance", mode: "employer", color: "red" });
    const otherMatterId = store.createMatter({ name: "Other", mode: "employer", color: "blue" });

    // A task + event on the matter being deleted, and one on another matter.
    const taskId = store.createTask({ matterId, label: "Investigate", status: "open" });
    const keepTaskId = store.createTask({ matterId: otherMatterId, label: "Keep", status: "open" });
    const eventId = store.createEvent({
      matterId,
      kind: "meeting",
      label: "Hearing",
      whenISO: "2026-06-01",
    });
    const keepEventId = store.createEvent({
      matterId: otherMatterId,
      kind: "meeting",
      label: "Keep",
      whenISO: "2026-06-02",
    });

    // A draft filed under the matter.
    useDraftStore.setState((s) => ({
      drafts: {
        ...s.drafts,
        draft_x: { id: "draft_x", matterId, sections: [] } as never,
      },
    }));

    useDraftStore.getState().deleteMatter(matterId);
    const next = useDraftStore.getState();

    // Matter gone; other matter intact.
    expect(next.matters[matterId]).toBeUndefined();
    expect(next.matters[otherMatterId]).toBeDefined();
    // Draft unfiled, not deleted.
    expect(next.drafts.draft_x).toBeDefined();
    expect(next.drafts.draft_x.matterId).toBeUndefined();
    // Task/event for the deleted matter gone; the other matter's kept.
    expect(next.tasks[taskId]).toBeUndefined();
    expect(next.tasks[keepTaskId]).toBeDefined();
    expect(next.events[eventId]).toBeUndefined();
    expect(next.events[keepEventId]).toBeDefined();
  });
});

describe("matter participants add/remove", () => {
  beforeEach(() => installMemoryLocalStorage());
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("adds employee + external participants, de-dupes employees, and removes by index", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();
    const matterId = store.createMatter({ name: "Grievance", mode: "employer", color: "red" });
    const empId = store.createEmployee({
      legalName: "Jamie Worker",
      jobTitle: "Analyst",
      address: "",
      startDate: "2025-01-01",
      serviceMonths: 12,
      status: "active",
    } as never);

    store.addMatterParticipant(matterId, { employeeId: empId, name: "Jamie Worker", role: "subject" });
    store.addMatterParticipant(matterId, { employeeId: null, name: "Outside Witness", role: "witness" });
    // Duplicate employee — must be ignored.
    store.addMatterParticipant(matterId, { employeeId: empId, name: "Jamie Worker", role: "manager" });

    let parts = useDraftStore.getState().matters[matterId].participants ?? [];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ employeeId: empId, role: "subject" });
    expect(parts[1]).toMatchObject({ employeeId: null, name: "Outside Witness" });

    // Remove the first (employee) participant.
    store.removeMatterParticipant(matterId, 0);
    parts = useDraftStore.getState().matters[matterId].participants ?? [];
    expect(parts).toHaveLength(1);
    expect(parts[0].name).toBe("Outside Witness");

    // Out-of-range index is a no-op.
    store.removeMatterParticipant(matterId, 5);
    expect(useDraftStore.getState().matters[matterId].participants).toHaveLength(1);
  });
});

describe("draft record linkage", () => {
  beforeEach(() => installMemoryLocalStorage());
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("fills the recipient and AI answers from a Matter's selected employee", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();
    const employeeId = store.createEmployee({
      legalName: "Jordan Example", preferredName: "Jordan", jobTitle: "Analyst",
      address: "2 Example Road", department: "Operations", email: "jordan@example.test",
      startDate: "2024-01-01", workerClass: "employee", status: "active",
    });
    const matterId = store.createMatter({ name: "Jordan case", mode: "employer", color: "red" });
    store.addMatterParticipant(matterId, { employeeId, name: "Jordan Example", role: "subject" });
    const id = store.createDraft("termination", {
      linkedEmployeeId: employeeId, linkedMatterId: matterId, jurisdiction: "UK",
      employerLegalName: "Example Ltd", signatoryName: "Manager",
    }, "employer");
    const draft = useDraftStore.getState().drafts[id];
    expect(draft).toMatchObject({ employeeId, matterId, employee: {
      legalName: "Jordan Example", preferredName: "Jordan", jobTitle: "Analyst",
      address: "2 Example Road", department: "Operations", email: "jordan@example.test",
      startDate: "2024-01-01",
    }, answers: { employeeLegalName: "Jordan Example", employeeAddress: "2 Example Road" } });
    expect(draft.employee.serviceMonths).toBeGreaterThan(0);
    expect(Object.keys(useDraftStore.getState().employees)).toHaveLength(1);
    expect(Object.keys(useDraftStore.getState().matters)).toHaveLength(1);
    expect(useDraftStore.getState().matters[matterId].participants).toHaveLength(1);
    const edited = store.createDraft("reference", {
      linkedEmployeeId: employeeId, employeeJobTitle: "Senior Analyst", employeeAddress: "",
    }, "employer");
    expect(useDraftStore.getState().drafts[edited].employee).toMatchObject({
      legalName: "Jordan Example", jobTitle: "Senior Analyst", address: "",
    });
    expect(useDraftStore.getState().employees[employeeId].jobTitle).toBe("Analyst");
  });

  it("retains a wizard employee's address for subsequent letters", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();
    const id = store.createDraft("reference", {
      employeeLegalName: "Jordan Example", employeeAddress: "2 Example Road",
    }, "employer");
    const employeeId = useDraftStore.getState().drafts[id].employeeId!;
    const next = store.createDraft("reference", { linkedEmployeeId: employeeId }, "employer");
    expect(useDraftStore.getState().drafts[next].employee.address).toBe("2 Example Road");
  });

  it("creates a high-risk template atomically without employees, matters or live-draft emissions", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();
    const snapshots: ReturnType<typeof useDraftStore.getState>[] = [];
    const unsubscribe = useDraftStore.subscribe((state) => snapshots.push(state));
    const id = store.createTemplateSourceDraft("termination", {
      jurisdiction: "UK", employeeLegalName: "Template Person", employeeAddress: "Template address",
    }, "employer", { templateName: "Reusable termination", templateDescription: "Example" });
    unsubscribe();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].drafts[id]).toMatchObject({
      isTemplateSource: true, answers: { _templateName: "Reusable termination" },
    });
    expect(snapshots[0].drafts[id].matterId).toBeUndefined();
    expect(snapshots[0].drafts[id].employeeId).toBeUndefined();
    expect(Object.keys(snapshots[0].matters)).toHaveLength(0);
    expect(Object.keys(snapshots[0].employees)).toHaveLength(0);
    const normalId = store.createDraft("termination", { employeeLegalName: "Real Person" }, "employer");
    expect(useDraftStore.getState().drafts[normalId].matterId).toBeTruthy();
    expect(useDraftStore.getState().drafts[normalId].employeeId).toBeTruthy();
  });

  it("does not attach a template to existing records even if source answers contain IDs", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();
    const employeeId = store.createEmployee({ legalName: "Jordan Example", status: "active" });
    const matterId = store.createMatter({ name: "Real case", mode: "employer", color: "red" });
    const id = store.createTemplateSourceDraft("termination", {
      linkedEmployeeId: employeeId, linkedMatterId: matterId, employeeLegalName: "Jordan Example",
    }, "employer", { templateName: "Template" });
    const draft = useDraftStore.getState().drafts[id];
    expect(draft.employeeId).toBeUndefined();
    expect(draft.matterId).toBeUndefined();
    expect(draft.answers.linkedMatterId).toBeUndefined();
    expect(useDraftStore.getState().matters[matterId].participants ?? []).toHaveLength(0);
  });

  it("creates a normalized employee and matter for a high-risk HR wizard draft", async () => {
    const { useDraftStore } = await import("./store");
    const draftId = useDraftStore.getState().createDraft(
      "termination",
      {
        jurisdiction: "UK",
        employeeLegalName: "Jamie Worker",
        employeeJobTitle: "Analyst",
        employeeStartDate: "2024-01-01",
        employerLegalName: "Acme Ltd",
        employerAddress: "1 High Street",
        signatoryName: "Alex Manager",
        signatoryTitle: "HR Director",
      },
      "employer",
    );

    const state = useDraftStore.getState();
    const draft = state.drafts[draftId];
    expect(draft.employeeId).toBeTruthy();
    expect(draft.matterId).toBeTruthy();
    expect(state.employees[draft.employeeId!]).toMatchObject({
      legalName: "Jamie Worker",
      jobTitle: "Analyst",
    });
    expect(state.matters[draft.matterId!].participants).toContainEqual(
      expect.objectContaining({ employeeId: draft.employeeId, role: "subject" }),
    );
  });

  it("uses an explicitly selected employee without silently merging by name", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();
    const employeeId = store.createEmployee({
      legalName: "Jamie Worker",
      jobTitle: "Analyst",
      status: "active",
    });
    const beforeCount = Object.keys(useDraftStore.getState().employees).length;

    const draftId = store.createDraft(
      "reference",
      {
        linkedEmployeeId: employeeId,
        employeeLegalName: "Jamie Worker",
        employerLegalName: "Acme Ltd",
        signatoryName: "Alex Manager",
      },
      "employer",
    );

    const state = useDraftStore.getState();
    expect(state.drafts[draftId].employeeId).toBe(employeeId);
    expect(Object.keys(state.employees)).toHaveLength(beforeCount);
    expect(state.drafts[draftId].matterId).toBeUndefined();
  });

  it("keeps a draft inside the matter it was created from", async () => {
    const { useDraftStore } = await import("./store");
    const store = useDraftStore.getState();
    const matterId = store.createMatter({
      name: "Existing matter",
      mode: "employer",
      color: "blue",
    });
    const draftId = store.createDraft(
      "termination",
      {
        linkedMatterId: matterId,
        employeeLegalName: "Jamie Worker",
        employerLegalName: "Acme Ltd",
        signatoryName: "Alex Manager",
      },
      "employer",
    );

    expect(useDraftStore.getState().drafts[draftId].matterId).toBe(matterId);
    expect(Object.keys(useDraftStore.getState().matters)).toHaveLength(1);
  });
});

function installMemoryLocalStorage() {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return [...entries.keys()][index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}
