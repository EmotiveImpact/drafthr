import { describe, expect, it } from "vitest";
import type { Draft } from "@/lib/letters/types";
import { letterBodyHtml } from "./pdf";
import { buildExhibitsAppendixHtml } from "./exhibits";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "d1",
    mode: "employer",
    letterType: "promotion",
    context: {
      mode: "employer",
      jurisdiction: "UK",
      workerClass: "employee",
      letterType: "promotion",
      effectiveDate: "2026-10-13",
      issueDate: "2026-10-13",
      deliveryMethod: "hand-delivery",
      tone: "formal",
      confidentiality: "private_and_confidential",
      counselReviewRequired: false,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: {
      legalName: "Harbour Foods Ltd",
      address: "Unit 4, Quayside Park, Bristol BS1 6XN",
      hasLetterhead: false,
      signatoryName: "Alex Morgan",
      signatoryTitle: "HR Manager",
    },
    employee: { legalName: "Chris Doyle", jobTitle: "Operative", address: "", startDate: "2022-01-01", serviceMonths: 40 },
    answers: {},
    sections: [
      { id: "r", sectionId: "recipient_block", title: "To", required: true, status: "ready", versions: [], html: "<p>Chris Doyle<br>9 Church Road</p>" },
      { id: "o", sectionId: "opening", title: "Opening", required: true, status: "ready", versions: [], html: "<p>Dear Chris,</p>" },
    ],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Draft;
}

describe("the exported letter's top matches the letter page", () => {
  it("prints the company name and address, the confidentiality line and the issue date under the recipient", () => {
    const html = letterBodyHtml(makeDraft());
    expect(html).toContain("Harbour Foods Ltd");
    expect(html).toContain("Quayside Park");
    expect(html).toContain("Private and confidential");
    const recipient = html.indexOf("9 Church Road");
    const date = html.indexOf("13 October 2026");
    const opening = html.indexOf("Dear Chris,");
    expect(recipient).toBeGreaterThan(-1);
    expect(date).toBeGreaterThan(recipient);
    expect(opening).toBeGreaterThan(date);
  });

  it("does not add a second date when the recipient block has one", () => {
    const d = makeDraft();
    d.sections[0].html = "<p>Chris Doyle<br>13 October 2026</p>";
    const html = letterBodyHtml(d);
    expect(html.split("13 October 2026").length - 1).toBe(1);
  });

  it("uses the uploaded letterhead instead of the text one when the letter goes out on it", () => {
    const html = letterBodyHtml(
      makeDraft({ employer: { ...makeDraft().employer, hasLetterhead: true, letterheadDataUrl: PNG } })
    );
    expect(html).toContain(`src="${PNG}"`);
    expect(html).not.toContain("Quayside Park");
  });
});

describe("exhibits caption", () => {
  it("puts the image under the caption and uses no em dash", () => {
    const html = buildExhibitsAppendixHtml({
      evidence: [
        { id: "e1", kind: "screenshot", filename: "test.png", mimeType: "image/png", fileDataUrl: PNG, displayMode: "figure", uploadedAt: 1 },
      ] as Draft["evidence"],
    });
    expect(html).toContain("Fig 1</strong>: test.png");
    expect(html).not.toMatch(/&mdash;|—/);
    expect(html).toMatch(/<img [^>]*style="display:block;/);
  });
});
