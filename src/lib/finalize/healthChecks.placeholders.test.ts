import { describe, it, expect } from "vitest";
import { runHealthChecks } from "./healthChecks";
import type { Draft } from "@/lib/letters/types";

function makeDraft(html: string): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "warning",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "warning",
      effectiveDate: "2026-01-01",
      issueDate: "2026-01-02",
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
      hasLetterhead: true,
      letterheadDataUrl: undefined,
      signatureDataUrl: undefined,
      signatoryName: "Alex HR",
      signatoryTitle: "People Lead",
    },
    employee: {
      legalName: "Jamie Worker",
      jobTitle: "Analyst",
      address: "",
      startDate: "2025-01-01",
      serviceMonths: 12,
    },
    answers: {},
    sections: [
      {
        id: "s1",
        sectionId: "body",
        title: "Body",
        required: true,
        status: "ready",
        versions: [],
        html,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}

const placeholderCheck = (html: string) =>
  runHealthChecks(makeDraft(html)).find((c) => c.id === "placeholders")!;

describe("placeholder health check", () => {
  it("fails on the bracketed gaps the drafting prompt itself inserts", () => {
    const check = placeholderCheck("<p>Dear [employee name], at [employee address], by [TBD: confirm date].</p>");
    expect(check.severity).toBe("fail");
    expect(check.detail).toContain("employee name");
    expect(check.detail).toContain("employee address");
  });

  it("catches leftover {{tokens}} and mail merge gaps", () => {
    expect(placeholderCheck("<p>Notice of {{notice_period}}.</p>").severity).toBe("fail");
    expect(placeholderCheck("<p>Notice of [notice_period not set].</p>").severity).toBe("fail");
  });

  it("ignores case citations and [sic]", () => {
    const check = placeholderCheck("<p>See Agnew [2023] UKSC 33, and the words 'recieved' [sic].</p>");
    expect(check.severity).toBe("pass");
  });
});
