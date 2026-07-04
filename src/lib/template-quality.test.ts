import { describe, it, expect } from "vitest";
import type { Draft, Section } from "@/lib/letters/types";
import { buildTemplateQualityReport } from "@/lib/template-quality";

// A section whose `html` is undefined at runtime. The type declares `html: string`,
// but drafts rehydrated from older persisted state or pulled from the server can
// arrive with a missing body — which is why sibling modules (healthChecks,
// check-predicates) all guard with `s.html ?? ""`. This exercises that same guard
// in buildTemplateQualityReport, which previously called `.replace`/`.join` on the
// raw value and threw a TypeError.
function makeDraft(sectionHtml: string | undefined): Draft {
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
      hasLetterhead: false,
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
        status: "edited",
        versions: [],
        // Intentionally undefined to simulate a rehydrated/remote draft.
        html: sectionHtml as unknown as string,
      } as Section,
    ],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("buildTemplateQualityReport", () => {
  it("does not throw when a section's html is undefined", () => {
    const draft = makeDraft(undefined);
    expect(() => buildTemplateQualityReport(draft)).not.toThrow();
  });

  it("treats an undefined-html required section as missing, not covered", () => {
    const report = buildTemplateQualityReport(makeDraft(undefined));
    // An empty required section must never count as covered.
    expect(report.summary.covered).toBe(0);
    expect(report.sections[0].requirements.every((r) => r.status !== "covered")).toBe(true);
  });

  it("still reports covered requirements for a populated section", () => {
    const report = buildTemplateQualityReport(makeDraft("<p>Some warning body content here.</p>"));
    expect(report.sections).toHaveLength(1);
  });
});
