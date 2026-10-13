import { describe, expect, it } from "vitest";
import { sentenceCaseTitle } from "./display";

describe("sentenceCaseTitle", () => {
  it("lowercases every word after the first", () => {
    expect(sentenceCaseTitle("Offer of Employment")).toBe("Offer of employment");
    expect(sentenceCaseTitle("Reference / Employment Verification")).toBe("Reference / employment verification");
    expect(sentenceCaseTitle("Sickness Notification / Fit-Note Response")).toBe("Sickness notification / fit-note response");
  });

  it("keeps acronyms", () => {
    expect(sentenceCaseTitle("Performance Improvement Plan (PIP) Response")).toBe("Performance improvement plan (PIP) response");
    expect(sentenceCaseTitle("ACAS Early Conciliation Notification (UK) / EEOC Charge Cover (US)")).toBe(
      "ACAS early conciliation notification (UK) / EEOC charge cover (US)"
    );
  });
});
