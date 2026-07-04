import type { Draft, Section } from "@/lib/letters/types";
import { getSectionTemplate, getTemplate } from "@/lib/letters/templates";
import { rulesFor, ruleSatisfied, type ComplianceRule } from "@/lib/letters/compliance";

export type TemplateRequirementStatus = "covered" | "missing" | "needs_review" | "guardrail";

export type TemplateRequirement = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  status: TemplateRequirementStatus;
};

export type SectionQuality = {
  section: Section;
  requirements: TemplateRequirement[];
};

export type QualityReport = {
  sections: SectionQuality[];
  compliance: { rule: ComplianceRule; present: boolean }[];
  summary: {
    covered: number;
    missing: number;
    needsReview: number;
    guardrails: number;
    complianceMissing: number;
  };
};

export function buildTemplateQualityReport(draft: Draft): QualityReport {
  const fullHtml = draft.sections.map((section) => section.html ?? "").join("\n");
  const compliance = rulesFor(
    draft.letterType,
    draft.context.jurisdiction,
    draft.context.usState
    // `present` here means "requirement satisfied / compliant" — ruleSatisfied
    // inverts the warn rules so their problem-detecting matches aren't counted
    // as satisfied. Consumers read `!present` as "flagged / missing".
  ).map((rule) => ({ rule, present: ruleSatisfied(rule, fullHtml) }));

  const sections = draft.sections.map((section) => {
    const tpl = getSectionTemplate(
      draft.letterType,
      draft.context.jurisdiction,
      section.sectionId
    );
    const constraints = tpl?.constraints ?? fallbackConstraints(draft, section);
    const sectionText = stripHtml(section.html ?? "");
    return {
      section,
      requirements: constraints.map((constraint, index) => ({
        id: `${section.id}:${index}`,
        sectionId: section.id,
        sectionTitle: section.title,
        text: constraint,
        status: statusForRequirement(section, sectionText, constraint),
      })),
    };
  });

  const allRequirements = sections.flatMap((section) => section.requirements);
  return {
    sections,
    compliance,
    summary: {
      covered: allRequirements.filter((requirement) => requirement.status === "covered").length,
      missing: allRequirements.filter((requirement) => requirement.status === "missing").length,
      needsReview: allRequirements.filter((requirement) => requirement.status === "needs_review").length,
      guardrails: allRequirements.filter((requirement) => requirement.status === "guardrail").length,
      complianceMissing: compliance.filter((item) => !item.present).length,
    },
  };
}

export function hasTemplateQualityData(draft: Draft): boolean {
  return Boolean(getTemplate(draft.letterType, draft.context.jurisdiction));
}

function fallbackConstraints(draft: Draft, section: Section): string[] {
  const constraints: string[] = [];
  if (section.required) constraints.push("MUST complete this required section before export.");
  if (draft.context.counselReviewRequired) {
    constraints.push("MUST be reviewed by qualified counsel before final export.");
  }
  return constraints;
}

function statusForRequirement(
  section: Section,
  sectionText: string,
  requirement: string
): TemplateRequirementStatus {
  if (/MUST NOT/i.test(requirement)) return "guardrail";
  if (!sectionText.trim()) return section.required ? "missing" : "needs_review";
  if (!/^MUST\b/i.test(requirement)) return "needs_review";
  return matchesRequirement(sectionText, requirement) ? "covered" : "needs_review";
}

function matchesRequirement(sectionText: string, requirement: string): boolean {
  const haystack = sectionText.toLowerCase();
  const tokens = requirement
    .replace(/\bMUST\b/gi, "")
    .replace(/\bNOT\b/gi, "")
    // Split on periods too — keeping them glued a sentence-final word like
    // "days." to the token, so `haystack.includes("days.")` never matched the
    // bare "days" in the section text (a false "not covered"). Legal citations
    // like "s.95" are <=4 chars and dropped by the length filter anyway.
    .split(/[^a-zA-Z0-9§]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 4 && !COMMON_WORDS.has(token));

  if (tokens.length === 0) return false;
  const distinctive = tokens.slice(0, 6);
  return distinctive.some((token) => haystack.includes(token));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const COMMON_WORDS = new Set([
  "include",
  "identify",
  "reference",
  "state",
  "request",
  "confirm",
  "where",
  "should",
  "section",
  "paragraph",
  "letter",
  "expressly",
  "specific",
  "relevant",
  "required",
  "within",
  "period",
]);
