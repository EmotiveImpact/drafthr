import { beforeEach, describe, expect, it } from "vitest";
import { useDraftStore } from "@/lib/store";
import type { Draft, Section } from "@/lib/letters/types";
import { getTemplate } from "@/lib/letters/templates";
import { rulesFor, ruleMatches } from "@/lib/letters/compliance";
import { buildEmployeeRightsBlock, FILING_DEADLINE_SAFETY } from "./employee/rights-preservation";
import { buildSystemPrompt } from "./system";
import { buildSectionPrompt } from "./sections";

beforeEach(() => useDraftStore.setState({ drafts: {}, matters: {}, employees: {} }));
function makeDraft(jurisdiction: "UK" | "US", letterType: Draft["letterType"] = "acas_ec_notification") {
  const id = useDraftStore.getState().createDraft(letterType, { jurisdiction, actDate: "2026-10-01" }, "employee");
  const draft = useDraftStore.getState().drafts[id];
  draft.context.protectedDeadline = { iso: "2040-12-31", basis: "Unverified legacy formula sentinel" };
  return draft;
}
const section: Section = { id: "deadline", sectionId: "deadline", title: "Rights and time limits", required: true, status: "empty", html: "", versions: [] };
const unsafeWindow = /\b(?:3 months less one day|three months less one day|180\/300|300 days|6 weeks|42 days)\b/;

describe("filing-deadline drafting safety", () => {
  it.each(["UK", "US"] as const)("never injects an unverified %s date/basis into system or section prompts, including claim covers", (jurisdiction) => {
    const draft = makeDraft(jurisdiction);
    for (const prompt of [buildEmployeeRightsBlock(draft), buildSystemPrompt(draft), buildSectionPrompt(draft, section, [])]) {
      expect(prompt).toContain(FILING_DEADLINE_SAFETY);
      expect(prompt).not.toContain("2040-12-31");
      expect(prompt).not.toContain("Unverified legacy formula sentinel");
      expect(prompt).not.toMatch(unsafeWindow);
    }
    // Chronology remains usable without being converted into a filing deadline.
    expect(buildSectionPrompt(draft, section, [])).toContain("actDate: 2026-10-01");
  });

  it("applies the same safety constraint to generic fallback sections and ignores imported reminder metadata in answers", () => {
    const draft = makeDraft("US", "holiday_request");
    draft.answers.protectedDeadline = "2040-12-31 — Unverified legacy formula sentinel";
    const prompt = buildSectionPrompt(draft, section, []);
    expect(prompt).toContain(FILING_DEADLINE_SAFETY);
    expect(prompt).not.toContain("2040-12-31");
    expect(prompt).not.toContain("Unverified legacy formula sentinel");
    expect(prompt).not.toMatch(unsafeWindow);
  });

  it.each(["UK", "US"] as const)("keeps directly related %s templates and their generated prompts free of blanket claim windows", (jurisdiction) => {
    for (const letterType of ["acas_ec_notification", "pay_dispute", "resignation_constructive"] as const) {
      const draft = makeDraft(jurisdiction, letterType);
      const template = getTemplate(letterType, jurisdiction)!;
      expect(template).toBeDefined();
      expect(JSON.stringify(template)).not.toMatch(unsafeWindow);
      expect(buildSystemPrompt(draft)).toContain(FILING_DEADLINE_SAFETY);
      for (const part of template.sections) {
        const prompt = buildSectionPrompt(draft, { ...section, sectionId: part.sectionId, title: part.title }, []);
        expect(prompt).toContain(FILING_DEADLINE_SAFETY);
        expect(prompt).not.toContain("2040-12-31");
        expect(prompt).not.toMatch(unsafeWindow);
      }
    }
  });

  it("does not autofix Acas correspondence by asserting that a claim is timely", () => {
    const rule = rulesFor("acas_ec_notification", "UK").find(r => r.id === "emp_uk_acas_limitation")!;
    expect(rule.label).toBe("Filing rights reserved");
    expect(rule.recommendation).not.toMatch(unsafeWindow);
    expect(ruleMatches(rule, "I am notifying ACAS within the s.111 ERA 1996 limitation period (3 months less one day).")).toBe(false);
    expect(ruleMatches(rule, "I reserve all rights to pursue any available claims, subject to the applicable time limits.")).toBe(true);
  });
});
