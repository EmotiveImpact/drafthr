import { describe, it, expect } from "vitest";
import {
  isQuestionAnswered,
  isQuestionVisible,
  letterStepsFor,
  type Question,
} from "./questions";

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

  it("gates the accommodation_request impairment field once disclosure is chosen", () => {
    // Regression: the impairment field is shown when the user opts to disclose,
    // and must be `required` so the wizard blocks a blank submission (otherwise
    // an unfilled impairment leaks into the generated letter).
    const steps = letterStepsFor("accommodation_request");
    const impairment = steps
      .flatMap((s) => s.questions)
      .find((q) => q.id === "impairment");
    expect(impairment).toBeDefined();
    expect(impairment!.required).toBe(true);
    // Only surfaces when the user chose to disclose.
    expect(impairment!.showIf?.({ discloseDiagnosis: "yes" })).toBe(true);
    expect(impairment!.showIf?.({ discloseDiagnosis: "no" })).toBe(false);
    // And when visible + required, a blank value is unanswered.
    expect(isQuestionAnswered(impairment!, "")).toBe(false);
    expect(isQuestionAnswered(impairment!, "Chronic migraine")).toBe(true);
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

describe("isQuestionVisible — jurisdiction + showIf gating", () => {
  const ukQ: Question = { id: "hd", type: "date", label: "Hearing (UK)", jurisdiction: "UK" };
  const usQ: Question = { id: "flsa", type: "boolean", label: "FLSA (US)", jurisdiction: "US" };
  const plainQ: Question = { id: "x", type: "text", label: "x" };
  const showIfQ: Question = { id: "y", type: "text", label: "y", showIf: (a) => a.foo === "bar" };

  it("hides a jurisdiction-tagged question for the other jurisdiction", () => {
    expect(isQuestionVisible(ukQ, { jurisdiction: "US" })).toBe(false);
    expect(isQuestionVisible(ukQ, { jurisdiction: "UK" })).toBe(true);
    expect(isQuestionVisible(usQ, { jurisdiction: "UK" })).toBe(false);
    expect(isQuestionVisible(usQ, { jurisdiction: "US" })).toBe(true);
  });

  it("hides a jurisdiction-tagged question until jurisdiction is answered", () => {
    expect(isQuestionVisible(ukQ, {})).toBe(false);
  });

  it("shows an untagged question in any jurisdiction and still honors showIf", () => {
    expect(isQuestionVisible(plainQ, {})).toBe(true);
    expect(isQuestionVisible(plainQ, { jurisdiction: "US" })).toBe(true);
    expect(isQuestionVisible(showIfQ, { foo: "bar" })).toBe(true);
    expect(isQuestionVisible(showIfQ, { foo: "no" })).toBe(false);
  });

  it("requires BOTH gates when a question carries jurisdiction + showIf", () => {
    const both: Question = {
      id: "z", type: "text", label: "z", jurisdiction: "UK",
      showIf: (a) => a.foo === "bar",
    };
    expect(isQuestionVisible(both, { jurisdiction: "UK", foo: "bar" })).toBe(true);
    expect(isQuestionVisible(both, { jurisdiction: "US", foo: "bar" })).toBe(false);
    expect(isQuestionVisible(both, { jurisdiction: "UK", foo: "no" })).toBe(false);
  });

  it("hides the UK-only termination fields for a US termination letter", () => {
    const qs = letterStepsFor("termination").flatMap((s) => s.questions);
    const hearing = qs.find((q) => q.id === "hearingDate");
    const appeal = qs.find((q) => q.id === "appealOfficer");
    expect(hearing).toBeDefined();
    expect(appeal).toBeDefined();
    expect(isQuestionVisible(hearing!, { jurisdiction: "US" })).toBe(false);
    expect(isQuestionVisible(hearing!, { jurisdiction: "UK" })).toBe(true);
    expect(isQuestionVisible(appeal!, { jurisdiction: "US" })).toBe(false);
  });

  it("gates conditional employer fields on their controlling answer", () => {
    const findQ = (letterType: string, id: string) =>
      letterStepsFor(letterType as Parameters<typeof letterStepsFor>[0])
        .flatMap((s) => s.questions)
        .find((q) => q.id === id);

    // "(for character reference)" — only shown for a character reference.
    const responsibilities = findQ("reference", "responsibilities");
    expect(responsibilities).toBeDefined();
    expect(isQuestionVisible(responsibilities!, { referenceType: "character" })).toBe(true);
    expect(isQuestionVisible(responsibilities!, { referenceType: "factual" })).toBe(false);

    // "(if applicable)" phased schedule — only for a phased return.
    const phasedSchedule = findQ("return_to_work", "phasedSchedule");
    expect(phasedSchedule).toBeDefined();
    expect(isQuestionVisible(phasedSchedule!, { phasedReturn: true })).toBe(true);
    expect(isQuestionVisible(phasedSchedule!, { phasedReturn: false })).toBe(false);

    // "(if extending)" fields — only on the extend outcome.
    const newEndDate = findQ("probation_outcome", "newEndDate");
    const objectives = findQ("probation_outcome", "objectivesIfExtending");
    expect(newEndDate).toBeDefined();
    expect(objectives).toBeDefined();
    expect(isQuestionVisible(newEndDate!, { probationOutcome: "extend" })).toBe(true);
    expect(isQuestionVisible(newEndDate!, { probationOutcome: "pass" })).toBe(false);
    expect(isQuestionVisible(objectives!, { probationOutcome: "extend" })).toBe(true);
    expect(isQuestionVisible(objectives!, { probationOutcome: "fail" })).toBe(false);
  });
});
