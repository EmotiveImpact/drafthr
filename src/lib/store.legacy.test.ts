import { afterEach, describe, expect, it, vi } from "vitest";

describe("legacy persisted drafts", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("hydrates drafts saved before employeeId, matterId, and evidence were added", async () => {
    window.localStorage.setItem(
      "scribehr-store-v1",
      JSON.stringify({
        state: {
          drafts: {
            legacy: {
              id: "legacy",
              mode: "employer",
              letterType: "reference",
              context: {
                mode: "employer",
                jurisdiction: "UK",
                workerClass: "employee",
                letterType: "reference",
                effectiveDate: "",
                issueDate: "2025-01-01",
                deliveryMethod: "email",
                tone: "formal",
                confidentiality: "public",
                counselReviewRequired: false,
                riskFlags: {},
              },
              employer: {
                legalName: "Legacy Ltd",
                address: "",
                hasLetterhead: false,
                signatoryName: "Legacy Manager",
                signatoryTitle: "HR",
              },
              employee: {
                legalName: "Legacy Worker",
                jobTitle: "",
                address: "",
                startDate: "",
                serviceMonths: 0,
              },
              answers: {},
              sections: [],
              createdAt: 1,
              updatedAt: 1,
            },
          },
          matters: {},
          employees: {},
          tasks: {},
          events: {},
          customTemplates: {},
        },
        version: 0,
      }),
    );
    vi.resetModules();

    const { useDraftStore } = await import("./store");
    const draft = useDraftStore.getState().drafts.legacy;

    expect(draft).toBeDefined();
    expect(draft.employeeId).toBeUndefined();
    expect(draft.matterId).toBeUndefined();
    expect(draft.evidence).toBeUndefined();
  });
});
