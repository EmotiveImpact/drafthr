import { describe, expect, it } from "vitest";
import { deriveEmployeesFromDrafts, matchEmployeeForDraft } from "./employees";
import type { Draft, Employee } from "./letters/types";

/* ----------------------------------------------------------------------------
 * Test fixtures
 *
 * Minimal mock Drafts — only the fields the helpers actually read
 * (mode, employee.*, context.workerClass, updatedAt). Everything else is
 * cast through `unknown` to satisfy the structural Draft type without
 * pulling the whole letter machinery into the test.
 * --------------------------------------------------------------------------*/

function mockDraft(overrides: {
  id: string;
  mode: "employer" | "employee";
  legalName?: string;
  jobTitle?: string;
  email?: string;
  department?: string;
  startDate?: string;
  workerClass?: Draft["context"]["workerClass"];
  updatedAt: number;
}): Draft {
  return {
    id: overrides.id,
    mode: overrides.mode,
    letterType: "offer",
    context: {
      mode: overrides.mode,
      jurisdiction: "UK",
      workerClass: overrides.workerClass ?? "employee",
      letterType: "offer",
      effectiveDate: "",
      issueDate: "",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: {
        protectedStatus: false,
        grievanceLast90Days: false,
        collectiveConsultation: false,
      },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "",
      hasLetterhead: false,
      signatoryName: "",
      signatoryTitle: "",
    },
    employee: {
      legalName: overrides.legalName ?? "",
      jobTitle: overrides.jobTitle ?? "",
      department: overrides.department,
      email: overrides.email,
      address: "",
      startDate: overrides.startDate ?? "",
      serviceMonths: 0,
    },
    answers: {},
    sections: [],
    createdAt: overrides.updatedAt,
    updatedAt: overrides.updatedAt,
  } as Draft;
}

function makeEmployee(legalName: string, idSuffix = "x"): Employee {
  return {
    id: `emp_${idSuffix}`,
    legalName,
    status: "active",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("deriveEmployeesFromDrafts", () => {
  it("returns [] for empty input", () => {
    expect(deriveEmployeesFromDrafts({})).toEqual([]);
  });

  it("collapses 3 drafts referencing 2 unique employees into 2 suggestions", () => {
    const drafts: Record<string, Draft> = {
      d1: mockDraft({ id: "d1", mode: "employer", legalName: "Jane Patel", updatedAt: 100 }),
      d2: mockDraft({ id: "d2", mode: "employer", legalName: "Jane Patel", updatedAt: 200 }),
      d3: mockDraft({ id: "d3", mode: "employer", legalName: "Marcus Lin", updatedAt: 150 }),
    };
    const out = deriveEmployeesFromDrafts(drafts);
    expect(out).toHaveLength(2);
    const jane = out.find((s) => s.legalName === "Jane Patel");
    expect(jane?.draftCount).toBe(2);
    const marcus = out.find((s) => s.legalName === "Marcus Lin");
    expect(marcus?.draftCount).toBe(1);
  });

  it("deduplicates whitespace + case variants ('Jane  Patel ' vs 'jane patel')", () => {
    const drafts: Record<string, Draft> = {
      d1: mockDraft({ id: "d1", mode: "employer", legalName: "Jane  Patel ", updatedAt: 100 }),
      d2: mockDraft({ id: "d2", mode: "employer", legalName: "jane patel", updatedAt: 200 }),
    };
    const out = deriveEmployeesFromDrafts(drafts);
    expect(out).toHaveLength(1);
    expect(out[0].draftCount).toBe(2);
  });

  it("ignores employee-mode drafts (mode !== 'employer')", () => {
    const drafts: Record<string, Draft> = {
      d1: mockDraft({ id: "d1", mode: "employee", legalName: "Jane Patel", updatedAt: 100 }),
      d2: mockDraft({ id: "d2", mode: "employer", legalName: "Marcus Lin", updatedAt: 200 }),
    };
    const out = deriveEmployeesFromDrafts(drafts);
    expect(out).toHaveLength(1);
    expect(out[0].legalName).toBe("Marcus Lin");
  });

  it("picks the most recent draft's jobTitle when drafts disagree", () => {
    const drafts: Record<string, Draft> = {
      old: mockDraft({
        id: "old",
        mode: "employer",
        legalName: "Jane Patel",
        jobTitle: "Engineer",
        updatedAt: 100,
      }),
      newer: mockDraft({
        id: "newer",
        mode: "employer",
        legalName: "Jane Patel",
        jobTitle: "Senior Engineer",
        updatedAt: 500,
      }),
    };
    const out = deriveEmployeesFromDrafts(drafts);
    expect(out).toHaveLength(1);
    expect(out[0].jobTitle).toBe("Senior Engineer");
  });

  it("skips drafts with no employee.legalName", () => {
    const drafts: Record<string, Draft> = {
      empty: mockDraft({ id: "empty", mode: "employer", legalName: "", updatedAt: 100 }),
      whitespace: mockDraft({ id: "whitespace", mode: "employer", legalName: "   ", updatedAt: 200 }),
      real: mockDraft({ id: "real", mode: "employer", legalName: "Jane Patel", updatedAt: 300 }),
    };
    const out = deriveEmployeesFromDrafts(drafts);
    expect(out).toHaveLength(1);
    expect(out[0].legalName).toBe("Jane Patel");
  });
});

describe("matchEmployeeForDraft", () => {
  it("returns null when no employees exist", () => {
    const draft = mockDraft({ id: "d1", mode: "employer", legalName: "Jane Patel", updatedAt: 100 });
    expect(matchEmployeeForDraft(draft, {})).toBeNull();
  });

  it("returns the matching id on exact normalized match", () => {
    const draft = mockDraft({ id: "d1", mode: "employer", legalName: "  Jane   Patel ", updatedAt: 100 });
    const employees: Record<string, Employee> = {
      a: makeEmployee("Marcus Lin", "a"),
      b: makeEmployee("Jane Patel", "b"),
    };
    expect(matchEmployeeForDraft(draft, employees)).toBe("emp_b");
  });

  it("returns null when the draft has no employee.legalName", () => {
    const draft = mockDraft({ id: "d1", mode: "employer", legalName: "", updatedAt: 100 });
    const employees: Record<string, Employee> = {
      a: makeEmployee("Jane Patel", "a"),
    };
    expect(matchEmployeeForDraft(draft, employees)).toBeNull();
  });
});
