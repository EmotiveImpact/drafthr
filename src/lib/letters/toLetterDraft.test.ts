import { describe, it, expect } from "vitest";
import { toLetterDraft } from "./toLetterDraft";
import type { Draft } from "./types";

// The mapper only reads a subset of Draft, so a partial fixture cast to Draft
// is sufficient and keeps the test focused on the projection.
const base = {
  id: "d1",
  mode: "employer",
  letterType: "warning",
  employer: {
    legalName: "Acme Ltd",
    address: "1 High St",
    hasLetterhead: true,
    letterheadDataUrl: "data:image/png;base64,AAA",
    signatureDataUrl: "data:image/png;base64,BBB",
    signatoryName: "Jo Bloggs",
    signatoryTitle: "HR Director",
  },
  sections: [
    { id: "s1", sectionId: "opening", title: "Opening", html: "<p>Hi</p>", required: true, versions: [], status: "ready" },
  ],
  evidence: [
    { id: "e1", kind: "document", content: "x", uploadedAt: 0, includeVerbatim: false, displayMode: "figure" },
  ],
} as unknown as Draft;

describe("toLetterDraft (app Draft → pagedly LetterDraft)", () => {
  it("projects ids, mode, letterType, sections and employer", () => {
    const ld = toLetterDraft(base);
    expect(ld.id).toBe("d1");
    expect(ld.mode).toBe("employer");
    expect(ld.letterType).toBe("warning");
    expect(ld.sections).toEqual([
      { id: "s1", sectionId: "opening", title: "Opening", html: "<p>Hi</p>" },
    ]);
    expect(ld.employer?.legalName).toBe("Acme Ltd");
    expect(ld.employer?.letterheadDataUrl).toBe("data:image/png;base64,AAA");
    expect(ld.employer?.signatoryName).toBe("Jo Bloggs");
  });

  it("drops the letterhead when the draft has hasLetterhead=false", () => {
    const ld = toLetterDraft({
      ...base,
      employer: { ...base.employer, hasLetterhead: false },
    } as unknown as Draft);
    expect(ld.employer?.letterheadDataUrl).toBeUndefined();
  });

  it("maps the app-only 'figure' evidence mode to inline (pagedly has no figure mode)", () => {
    expect(toLetterDraft(base).evidence?.[0]?.displayMode).toBe("inline");
  });

  it("handles a draft with no evidence", () => {
    const ld = toLetterDraft({ ...base, evidence: undefined } as unknown as Draft);
    expect(ld.evidence).toEqual([]);
  });
});
