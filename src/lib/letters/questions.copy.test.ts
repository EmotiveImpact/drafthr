import { describe, expect, it } from "vitest";
import { UNIVERSAL_STEPS } from "./questions";

/**
 * The Risk flags step speaks plain English to an HR manager (CREATE-X32):
 * no legal shorthand, and no promise of a gate the app does not add.
 */
describe("Risk flags step copy", () => {
  const step = UNIVERSAL_STEPS.find((s) => s.id === "risk_flags")!;
  const words = [step.description ?? "", ...step.questions.flatMap((q) => [q.label, q.help ?? ""])].join("\n");

  it("has no legal shorthand or export-gate promise", () => {
    expect(words).not.toMatch(/legal-review|counsel|gate before export/i);
  });

  it("keeps the house rules: no em dashes or exclamation marks", () => {
    expect(words).not.toMatch(/[—!]/);
  });
});
