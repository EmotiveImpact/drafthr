import { describe, it, expect } from "vitest";
import { buildExportPackHtml } from "@/lib/export/pack";
import type { Draft } from "@/lib/letters/types";

function makeDraft(): Draft {
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
        html: '<p>We confirm <del data-suggestion-id="s1" data-author="Reviewer Rae" data-status="pending">the old wording</del><ins data-suggestion-id="s2" data-author="Reviewer Rae" data-body="softer please" data-status="pending">a proposed change</ins> and <mark data-comment-id="c1">this point</mark>.</p>',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Draft;
}

describe("buildExportPackHtml — letter section", () => {
  it("ships the clean letter, without reviewer track changes or comment marks", () => {
    const html = buildExportPackHtml(makeDraft());
    expect(html).toContain("We confirm");
    // A pending insertion is a reviewer proposal, not the letter.
    expect(html).not.toContain("a proposed change");
    expect(html).not.toMatch(/<(ins|del|mark)\b/);
    expect(html).not.toContain("Reviewer Rae");
    expect(html).not.toContain("softer please");
    expect(html).not.toContain("data-comment-id");
  });
});

describe("packDateTime", () => {
  it("uses the letter's jurisdiction, not the browser locale, with a month name", async () => {
    const { packDateTime } = await import("@/lib/export/pack");
    const at = Date.UTC(2026, 8, 10, 12, 0);
    const uk = packDateTime({ context: { jurisdiction: "UK" } } as Draft, at);
    const us = packDateTime({ context: { jurisdiction: "US" } } as Draft, at);
    expect(uk).toMatch(/^10 Sept? 2026/);
    expect(us).toMatch(/^Sep 10, 2026/);
  });
});
