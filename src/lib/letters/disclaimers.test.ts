import { describe, it, expect } from "vitest";
import { disclaimerHtmlFor } from "./disclaimers";
import type { Draft } from "./types";

function makeDraft(letterType: Draft["letterType"], jurisdiction: "UK" | "US" = "UK"): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType,
    context: {
      mode: "employer",
      jurisdiction,
      workerClass: "employee",
      letterType,
      effectiveDate: "2026-01-01",
      issueDate: "2026-01-01",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: { legalName: "X", address: "", hasLetterhead: false, signatoryName: "Y", signatoryTitle: "HR" },
    employee: { legalName: "Z", jobTitle: "T", address: "", startDate: "2025-01-01", serviceMonths: 12 },
    answers: {},
    sections: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("disclaimerHtmlFor", () => {
  it("emits Tier 3 + Tier 1 for high-risk letters (termination)", () => {
    const html = disclaimerHtmlFor(makeDraft("termination"));
    expect(html).toContain("IMPORTANT");
    expect(html).toContain("template-assisted");
  });

  it("emits Tier 2 + Tier 1 for medium-risk letters (offer)", () => {
    const html = disclaimerHtmlFor(makeDraft("offer", "US"));
    expect(html).toContain("general legal frameworks");
    expect(html).toContain("template-assisted");
    expect(html).not.toContain("IMPORTANT");
  });

  it("emits only Tier 1 for low-risk letters (reference)", () => {
    const html = disclaimerHtmlFor(makeDraft("reference"));
    expect(html).toContain("template-assisted");
    expect(html).not.toContain("IMPORTANT");
    expect(html).not.toContain("general legal frameworks");
  });
});
