import type { Jurisdiction, LetterTypeId, SectionId } from "../types";
import type { EvidenceTier, LetterTemplate, SectionTemplate } from "./types";
import { templateKey } from "./types";
import { getLetterMeta } from "../catalog";

/**
 * Central registry. Templates contributed by:
 *  - employer/index.ts  (14 employer letters x UK/US)
 *  - employee/index.ts  (21 employee letters x UK/US)
 *
 * The two index modules each export a Map keyed by templateKey(letterType, j).
 * We merge both into one registry. If a template isn't found for a given
 * (letterType x jurisdiction), the prompt builder falls back to the generic
 * SECTION_INSTRUCTIONS pipeline at src/lib/prompts/sections.ts.
 */

import { EMPLOYER_TEMPLATES } from "./employer";
import { EMPLOYEE_TEMPLATES } from "./employee";

const REGISTRY: Map<string, LetterTemplate> = new Map([
  ...EMPLOYER_TEMPLATES,
  ...EMPLOYEE_TEMPLATES,
]);

export function getTemplate(
  letterType: LetterTypeId,
  jurisdiction: Jurisdiction
): LetterTemplate | undefined {
  return REGISTRY.get(templateKey(letterType, jurisdiction));
}

export function getSectionTemplate(
  letterType: LetterTypeId,
  jurisdiction: Jurisdiction,
  sectionId: SectionId
): SectionTemplate | undefined {
  return getTemplate(letterType, jurisdiction)?.sections.find(
    (s) => s.sectionId === sectionId
  );
}

export function hasTemplate(
  letterType: LetterTypeId,
  jurisdiction: Jurisdiction
): boolean {
  return REGISTRY.has(templateKey(letterType, jurisdiction));
}

/**
 * Resolve the evidence tier for a template. Returns the explicit
 * `evidenceTier` set on the template when present; otherwise derives a
 * sensible default from the letter's category and risk profile per the
 * product rules:
 *
 *  1. Risk-based override (wins over category):
 *     - riskClass === "high" OR legalReviewRequired === true → "heavy"
 *  2. Category-based default:
 *     - "tribunal_legal"     → "heavy"
 *     - "dispute"            → "medium"
 *     - "departure"          → "medium"
 *     - "performance_conduct" → "medium"
 *     - "leave"              → "light"
 *     - "compensation"       → "light"
 *     - "onboarding" / unknown → "light"
 *
 * The Edit page calls this on draft mount to decide whether to auto-pin
 * the evidence drawer ("heavy"), show a subtle prompt ("medium"), or
 * stay out of the way ("light").
 */
export function getEvidenceTier(template: LetterTemplate): EvidenceTier {
  if (template.evidenceTier) return template.evidenceTier;
  return deriveEvidenceTier(template.letterType);
}

/**
 * Derivation logic exposed for callers that have a letter type but no
 * resolved template (e.g. when there's no template registered for a
 * given jurisdiction and the prompt builder falls back). The rules
 * mirror `getEvidenceTier`'s default branch.
 */
export function deriveEvidenceTier(letterType: LetterTypeId): EvidenceTier {
  const meta = getLetterMeta(letterType);
  if (meta.riskClass === "high" || meta.legalReviewRequired) return "heavy";
  switch (meta.category) {
    case "tribunal_legal":
      return "heavy";
    case "dispute":
    case "departure":
    case "performance_conduct":
      return "medium";
    case "leave":
    case "compensation":
    case "onboarding":
      return "light";
    default:
      return "light";
  }
}

export type { EvidenceTier, LetterTemplate, SectionTemplate } from "./types";
