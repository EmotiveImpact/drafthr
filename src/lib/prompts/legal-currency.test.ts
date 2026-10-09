import { describe, it, expect, beforeAll } from "vitest";
import { buildSystemPrompt } from "./system";
import { buildSectionPrompt } from "./sections";
import { loadAllTemplates } from "@/lib/letters/templates";
import { EMPLOYEE_LETTER_QUESTIONS, EMPLOYEE_UNIVERSAL_STEPS } from "@/lib/letters/questions/employee";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft, Section } from "@/lib/letters/types";

/**
 * Pins statements of law that changed in 2026 so a later edit can't quietly
 * reintroduce the old rule: the six-month tribunal time limit (including
 * deductions from wages) from 1 October 2026, the sexual harassment
 * whistleblowing category from 6 April 2026, and the 30 + 14 day COBRA
 * notice sequence.
 */

function makeDraft(
  letterType: string,
  jurisdiction: "UK" | "US",
  mode: "employer" | "employee",
  ukRegion?: "England & Wales" | "Scotland" | "Northern Ireland",
): Draft {
  return {
    id: "d1",
    mode,
    letterType,
    context: {
      mode,
      jurisdiction,
      ...(jurisdiction === "US" ? { usState: "TX" } : {}),
      ...(ukRegion ? { ukRegion } : {}),
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

function fullPrompt(
  letterType: string,
  jurisdiction: "UK" | "US",
  mode: "employer" | "employee",
  sectionId: string,
  ukRegion?: "England & Wales" | "Scotland" | "Northern Ireland",
) {
  const draft = makeDraft(letterType, jurisdiction, mode, ukRegion);
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

  it("gives the six-month tribunal limit for acts from 1 October 2026 in the ACAS EC prompts", () => {
    for (const sectionId of ["deadline", "body"]) {
      const prompt = fullPrompt("acas_ec_notification", "UK", "employee", sectionId);
      expect(prompt, sectionId).toContain("6 months less one day");
      expect(prompt, sectionId).toContain("1 October 2026");
      expect(prompt, sectionId).not.toMatch(/\(3 months less one day\)/);
      expect(prompt, sectionId).not.toMatch(/\(3 months less one day from the relevant act\)/);
    }
    const constructive = fullPrompt("resignation_constructive", "UK", "employee", "reservation_of_rights");
    expect(constructive).not.toMatch(/limitation period of 3 months less one day from the effective date of termination \(/);
    expect(constructive).toContain("6 months less one day from the effective date of termination");
  });

  it("keeps Northern Ireland tribunal claims at 3 months less one day", () => {
    const prompt = fullPrompt("acas_ec_notification", "UK", "employee", "deadline", "Northern Ireland");
    expect(prompt).toContain("NORTHERN IRELAND");
    expect(prompt).toContain("Article 145 of the Employment Rights (Northern Ireland) Order 1996");
    expect(prompt).toMatch(/Northern Ireland must still be presented within 3 months less one day/);
  });

  it("states the dated tribunal limit in the wizard help and catalogue", () => {
    const actDate = EMPLOYEE_UNIVERSAL_STEPS.flatMap((g) => g.questions).find((q) => q.id === "actDate");
    expect(actDate?.help).toContain("6 months less one day");
    expect(actDate?.help).toContain("1 October 2026");
    expect(actDate?.help).toContain("Northern Ireland");
    expect(getLetterMeta("pay_dispute").description).not.toContain("3-month limit");
    expect(getLetterMeta("pay_dispute").description).toContain("6-month limit");
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
