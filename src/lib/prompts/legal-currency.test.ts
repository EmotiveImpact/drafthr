import { describe, it, expect, beforeAll } from "vitest";
import { buildSystemPrompt } from "./system";
import { buildSectionPrompt } from "./sections";
import { loadAllTemplates } from "@/lib/letters/templates";
import { EMPLOYEE_LETTER_QUESTIONS } from "@/lib/letters/questions/employee";
import type { Draft, Section } from "@/lib/letters/types";

/**
 * Pins statements of law that changed in 2026 so a later edit can't quietly
 * reintroduce the old rule: the six-month time limit for deductions from
 * wages from 1 October 2026, the sexual harassment whistleblowing category
 * from 6 April 2026, and the 30 + 14 day COBRA notice sequence.
 */

function makeDraft(
  letterType: string,
  jurisdiction: "UK" | "US",
  mode: "employer" | "employee",
): Draft {
  return {
    id: "d1",
    mode,
    letterType,
    context: {
      mode,
      jurisdiction,
      ...(jurisdiction === "US" ? { usState: "TX" } : {}),
      workerClass: "employee",
      letterType,
      effectiveDate: "2026-10-01",
      issueDate: "2026-10-09",
      deliveryMethod: "email",
      tone: "formal",
      confidentiality: "public",
      counselReviewRequired: false,
      riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false },
    },
    employer: {
      legalName: "Acme Ltd",
      address: "",
      hasLetterhead: true,
      signatoryName: "Alex HR",
      signatoryTitle: "People Lead",
    },
    employee: { legalName: "Jamie Worker", jobTitle: "Analyst", address: "", startDate: "2025-01-01", serviceMonths: 12 },
    answers: {},
    sections: [],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Draft;
}

function section(sectionId: string): Section {
  return { id: "s1", sectionId, title: sectionId, required: true, status: "empty", versions: [], html: "" } as unknown as Section;
}

function fullPrompt(letterType: string, jurisdiction: "UK" | "US", mode: "employer" | "employee", sectionId: string) {
  const draft = makeDraft(letterType, jurisdiction, mode);
  return `${buildSystemPrompt(draft)}\n\n${buildSectionPrompt(draft, section(sectionId), [])}`;
}

beforeAll(async () => {
  await loadAllTemplates();
});

describe("statements of law current at October 2026", () => {
  it("gives the six-month s.23 limit for deductions from 1 October 2026", () => {
    const prompt = fullPrompt("pay_dispute", "UK", "employee", "next_steps");
    expect(prompt).toContain("6 months less one day");
    expect(prompt).toContain("1 October 2026");
    expect(prompt).not.toMatch(/Limitation 3 months less one day, running from/);
  });

  it("includes the sexual harassment category in the UK whistleblowing prompt and wizard", () => {
    const prompt = fullPrompt("whistleblowing", "UK", "employee", "statutory_basis");
    expect(prompt).toContain("sexual harassment");
    expect(prompt).not.toContain("one of six categories");
    const category = EMPLOYEE_LETTER_QUESTIONS.whistleblowing
      ?.flatMap((g) => g.questions)
      .find((q) => q.id === "category");
    expect(category?.options?.map((o) => o.value)).toContain("sexual_harassment");
  });

  it("states COBRA timing as 30 + 14 days, never 14 days from the qualifying event", () => {
    for (const letterType of ["termination", "redundancy", "resignation_acceptance", "probation_outcome"]) {
      const prompt = fullPrompt(letterType, "US", "employer", "terms");
      expect(prompt, letterType).not.toMatch(/within 14 days of the qualifying event/);
      expect(prompt, letterType).not.toMatch(/election notice within 14 days under/);
      expect(prompt, letterType).toContain("within 30 days");
    }
  });

  it("gives the Texas discharge rule, not the resignation rule, for a termination", () => {
    const prompt = fullPrompt("termination", "US", "employer", "terms");
    expect(prompt).toContain("61.014(a)(1)");
    expect(prompt).not.toMatch(/Texas: next regular payday/);
  });
});
