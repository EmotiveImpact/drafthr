import type { Jurisdiction, LetterTypeId, SectionId } from "../types";
import type { LetterTemplate, SectionTemplate } from "./types";
import { templateKey } from "./types";

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

export type { LetterTemplate, SectionTemplate } from "./types";
