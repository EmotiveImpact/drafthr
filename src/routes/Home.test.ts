import { describe, expect, it } from "vitest";
import { deriveComplianceSummary, emptyTodayAction } from "./Home";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";

function completeDraft(letterType: Draft["letterType"]): Draft {
  const meta = getLetterMeta(letterType);
  return {
    id: "draft_1",
    mode: "employer",
    letterType,
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType,
      effectiveDate: "",
      issueDate: "2026-09-14",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: meta.legalReviewRequired,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "1 High Street",
      signatoryName: "Alex Manager",
      signatoryTitle: "HR Director",
      hasLetterhead: false,
    },
    employee: {
      legalName: "Jamie Worker",
      jobTitle: "Analyst",
      address: "2 Low Street",
      startDate: "2024-01-01",
      serviceMonths: 24,
    },
    answers: {},
    sections: meta.defaultSections.map((section, index) => ({
      id: `section_${index}`,
      sectionId: section.id,
      title: section.title,
      required: section.required,
      html: `<p>Completed ${section.title} text.</p>`,
      status: "edited",
      versions: [],
    })),
    evidence: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("Home workflow truth", () => {
  it("offers Continue, not a first-letter action, when a draft exists", () => {
    expect(emptyTodayAction({ id: "draft_1" }, "/hr")).toEqual({
      label: "Continue your latest letter",
      href: "/editor/draft_1",
    });
  });

  it("does not report a blocked high-risk letter as compliant", () => {
    const draft = completeDraft("termination");
    const summary = deriveComplianceSummary({ [draft.id]: draft }, "employer");

    expect(summary).toMatchObject({
      totalDrafts: 1,
      strongDrafts: 0,
      needsReview: 1,
      percent: 0,
    });
  });
});
