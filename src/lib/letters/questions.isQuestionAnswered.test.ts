import { describe, it, expect } from "vitest";
import { isQuestionAnswered, type Question } from "./questions";

/* ============================================================================
 * isQuestionAnswered — the wizard's required-field gate.
 *
 * Regression focus: a required repeater with defaultItems >= 1 auto-hydrates to
 * an array of EMPTY objects ([{}, {}]). The old gate (`Array.isArray(v) &&
 * v.length > 0`) treated that as answered, letting "Generate draft" enable with
 * completely blank findings on tribunal-grade letters. It must NOT.
 * ==========================================================================*/

const textQ = (id: string, required = true): Question => ({
  id,
  type: "text",
  label: id,
  required,
});

// Mirrors e.g. `factualFindings`: required repeater, minItems 1, with a
// required sub-field.
const findingsRepeater: Question = {
  id: "factualFindings",
  type: "repeater",
  label: "Factual findings",
  required: true,
  repeater: {
    itemLabel: "Finding",
    minItems: 1,
    defaultItems: 2,
    fields: [textQ("finding"), textQ("evidence", false)],
  },
};

describe("isQuestionAnswered — scalar & select_multi", () => {
  it("treats empty/undefined text as unanswered", () => {
    expect(isQuestionAnswered(textQ("x"), undefined)).toBe(false);
    expect(isQuestionAnswered(textQ("x"), "")).toBe(false);
    expect(isQuestionAnswered(textQ("x"), null)).toBe(false);
  });

  it("treats non-empty text as answered", () => {
    expect(isQuestionAnswered(textQ("x"), "hello")).toBe(true);
  });

  it("treats a select_multi array as answered iff non-empty", () => {
    const q: Question = { id: "cats", type: "select_multi", label: "Cats", required: true };
    expect(isQuestionAnswered(q, [])).toBe(false);
    expect(isQuestionAnswered(q, ["a"])).toBe(true);
  });
});

describe("isQuestionAnswered — repeater (the bug)", () => {
  it("does NOT count an auto-hydrated array of empty items as answered", () => {
    expect(isQuestionAnswered(findingsRepeater, [{}, {}])).toBe(false);
    expect(isQuestionAnswered(findingsRepeater, [{}])).toBe(false);
  });

  it("is unanswered when the required sub-field is blank", () => {
    expect(isQuestionAnswered(findingsRepeater, [{ evidence: "photo" }])).toBe(false);
    expect(isQuestionAnswered(findingsRepeater, [{ finding: "" }])).toBe(false);
  });

  it("is answered once at least one item has its required sub-field filled", () => {
    expect(isQuestionAnswered(findingsRepeater, [{ finding: "Late 5 times" }])).toBe(true);
    // One complete + one blank still satisfies minItems: 1.
    expect(
      isQuestionAnswered(findingsRepeater, [{ finding: "Late 5 times" }, {}])
    ).toBe(true);
  });

  it("is unanswered when the value is not an array at all", () => {
    expect(isQuestionAnswered(findingsRepeater, undefined)).toBe(false);
  });

  it("with no required sub-fields, still rejects an array of bare {} items", () => {
    const q: Question = {
      id: "notes",
      type: "repeater",
      label: "Notes",
      required: true,
      repeater: {
        itemLabel: "Note",
        minItems: 1,
        defaultItems: 1,
        fields: [textQ("note", false)],
      },
    };
    expect(isQuestionAnswered(q, [{}])).toBe(false);
    expect(isQuestionAnswered(q, [{ note: "something" }])).toBe(true);
  });
});
