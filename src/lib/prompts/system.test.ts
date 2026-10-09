import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./system";
import type { Draft } from "@/lib/letters/types";

function makeDraft(overrides: Partial<Draft["context"]>): Draft {
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
      ...overrides,
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
        html: "<p>Body</p>",
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}

describe("buildSystemPrompt — jurisdiction", () => {
  it("keeps UK-only citations and audiences out of a US prompt's quality bar", () => {
    const prompt = buildSystemPrompt(makeDraft({ jurisdiction: "US", usState: "CA" }));
    expect(prompt).not.toContain("Section 86 ERA 1996");
    expect(prompt).not.toContain("Western Excavating");
    expect(prompt).not.toContain("ACAS conciliators");
    expect(prompt).toContain("McDonnell Douglas");
  });

  it("keeps the UK examples for a UK prompt", () => {
    const prompt = buildSystemPrompt(makeDraft({ jurisdiction: "UK" }));
    expect(prompt).toContain("Section 86 ERA 1996");
    expect(prompt).not.toContain("NORTHERN IRELAND");
  });

  it("adds the Northern Ireland override for an NI letter", () => {
    const prompt = buildSystemPrompt(makeDraft({ jurisdiction: "UK", ukRegion: "Northern Ireland" }));
    expect(prompt).toContain("Employment Rights (Northern Ireland) Order 1996");
    expect(prompt).toContain("Labour Relations Agency");
  });
});
