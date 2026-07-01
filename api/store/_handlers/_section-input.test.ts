import { describe, it, expect } from "vitest";
import { isValidSectionInput } from "./_section-input.js";

/* ============================================================================
 * isValidSectionInput — guards the store section-sync handlers so a malformed
 * section returns 400 instead of tripping a DB NOT NULL constraint (→ 500).
 * ==========================================================================*/

const valid = {
  sectionId: "sec_1",
  title: "Opening",
  html: "<p>Hi</p>",
  status: "ready",
  position: 0,
};

describe("isValidSectionInput", () => {
  it("accepts a well-formed section row", () => {
    expect(isValidSectionInput(valid)).toBe(true);
  });

  it("accepts empty title/html (a legitimately empty section)", () => {
    expect(isValidSectionInput({ ...valid, title: "", html: "", status: "empty" })).toBe(true);
  });

  it("rejects missing required fields (the 500-causing case)", () => {
    expect(isValidSectionInput({ sectionId: "sec_1" })).toBe(false); // no title/html/status/position
    expect(isValidSectionInput({ ...valid, title: undefined })).toBe(false);
    expect(isValidSectionInput({ ...valid, html: undefined })).toBe(false);
    expect(isValidSectionInput({ ...valid, position: undefined })).toBe(false);
  });

  it("rejects wrong types", () => {
    expect(isValidSectionInput({ ...valid, position: "0" })).toBe(false);
    expect(isValidSectionInput({ ...valid, position: NaN })).toBe(false);
    expect(isValidSectionInput({ ...valid, title: 5 })).toBe(false);
    expect(isValidSectionInput({ ...valid, sectionId: "" })).toBe(false);
    expect(isValidSectionInput({ ...valid, sectionId: "   " })).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(isValidSectionInput({ ...valid, status: "bogus" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidSectionInput(null)).toBe(false);
    expect(isValidSectionInput(undefined)).toBe(false);
    expect(isValidSectionInput("sec")).toBe(false);
    expect(isValidSectionInput(42)).toBe(false);
  });
});
