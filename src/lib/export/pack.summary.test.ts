import { describe, it, expect } from "vitest";
import { buildEvidenceIndexHtml, buildExportPackHtml } from "@/lib/export/pack";
import { displayTitleFor } from "@/lib/letters/display";
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

describe("pack titles (SEND-X33)", () => {
  it("keep who the letter is for when the letter has its own title", () => {
    const draft = { ...makeDraft(), title: "Final written warning" };
    expect(buildExportPackHtml(draft)).toContain("<h1>Export pack: Final written warning · Jamie Worker</h1>");
    expect(buildEvidenceIndexHtml(draft)).toContain("<title>Exhibit index: Final written warning · Jamie Worker</title>");
  });

  it("name the letter as people read it, with no em dash or internal type id", () => {
    const draft = makeDraft();
    const name = displayTitleFor(draft);
    expect(name).not.toBe("warning");
    const summary = buildExportPackHtml(draft);
    expect(summary).toContain(`<title>Export pack: ${name}</title>`);
    expect(summary).toContain(`<h1>Export pack: ${name}</h1>`);
    expect(summary).not.toContain("warning export pack");
    const index = buildEvidenceIndexHtml(draft);
    expect(index).toContain(`<title>Exhibit index: ${name}</title>`);
    expect(index).toContain("<h1>Exhibit index</h1>");
    for (const html of [summary, index]) {
      const title = html.match(/<title>([^<]*)<\/title>/)![1];
      expect(title).not.toMatch(/\u2014/);
      expect(html).not.toMatch(/· warning ·/);
    }
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
