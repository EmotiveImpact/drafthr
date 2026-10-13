import type { LetterTypeId, Mode, RiskClass, SectionId } from "./types";
import { EMPLOYER_CATALOG } from "./catalog/employer";
import { EMPLOYEE_CATALOG } from "./catalog/employee";

/**
 * Categories group letter types in the template browser. Order here is
 * the order categories appear on the page.
 */
export type LetterCategoryId =
  | "onboarding"
  | "performance_conduct"
  | "departure"
  | "leave"
  | "compensation"
  | "dispute"
  | "tribunal_legal";

export const LETTER_CATEGORIES: { id: LetterCategoryId; label: string; description: string }[] = [
  { id: "onboarding", label: "Onboarding", description: "Joining, offers, references, right to work." },
  { id: "performance_conduct", label: "Performance and conduct", description: "Probation, warnings, performance plans, terminations." },
  { id: "departure", label: "Departure", description: "Resignations, redundancies, references, settlements." },
  { id: "leave", label: "Leave and sickness", description: "Holiday, sickness, family, return to work, accommodation." },
  { id: "compensation", label: "Pay and terms", description: "Salary changes, contract amendments, promotions, pay disputes." },
  { id: "dispute", label: "Grievance and dispute", description: "Grievances, appeals, complaints, whistleblowing, flexible working." },
  { id: "tribunal_legal", label: "Tribunal and legal", description: "ACAS EC, tribunal covers, subject-access requests, settlement counters." },
];

export type LetterTypeMeta = {
  id: LetterTypeId;
  /** Mode this letter belongs to. */
  mode: Mode;
  title: string;
  shortTitle: string;
  description: string;
  riskClass: RiskClass;
  jurisdictionScope: "shared" | "uk_only" | "us_only";
  /** Browser category grouping. Letters without a category fall under "Other". */
  category?: LetterCategoryId;
  defaultSections: { id: SectionId; title: string; required: boolean }[];
  wordRange: [number, number];
  ukOnly?: boolean;
  usOnly?: boolean;
  flagshipV1: boolean;
  legalReviewRequired: boolean;
  badge?: string;
  /** Employee-mode only — letter may be disclosed in tribunal/court proceedings. */
  tribunalBound?: boolean;
  /** Employee-mode only — defaults to "Without Prejudice & Subject to Contract" header. */
  withoutPrejudiceDefault?: boolean;
};

/**
 * Category assignment lives here (rather than spread across 30+ catalog
 * files) so future re-grouping is one diff. If a letter id isn't in the
 * map, it lands under "other" in the browser.
 */
const CATEGORY_OF: Partial<Record<LetterTypeId, LetterCategoryId>> = {
  // Onboarding
  offer: "onboarding",
  reference: "onboarding",
  right_to_work: "onboarding",

  // Performance & conduct
  probation_outcome: "performance_conduct",
  warning: "performance_conduct",
  termination: "performance_conduct",
  pip_response: "performance_conduct",

  // Departure
  redundancy: "departure",
  resignation_acceptance: "departure",
  resignation_clean: "departure",
  resignation_constructive: "departure",
  resignation_with_grievance: "departure",
  resignation_withdrawal: "departure",
  redundancy_consultation_response: "departure",
  reference_dispute: "departure",
  settlement_cover: "departure",
  settlement_counter_offer: "departure",
  constructive_dismissal_warning: "departure",

  // Leave & sickness
  leave_approval: "leave",
  return_to_work: "leave",
  holiday_request: "leave",
  sickness_notification: "leave",
  accommodation_request: "leave",
  right_to_disconnect: "leave",

  // Pay & terms
  salary_increase: "compensation",
  promotion: "compensation",
  contract_amendment: "compensation",
  pay_dispute: "compensation",

  // Grievance & dispute
  grievance: "dispute",
  appeal: "dispute",
  whistleblowing: "dispute",
  flexible_working_request: "dispute",

  // Tribunal & legal
  acas_ec_notification: "tribunal_legal",
  tribunal_cover: "tribunal_legal",
  subject_access_request: "tribunal_legal",
};

export function categoryOf(id: LetterTypeId): LetterCategoryId | undefined {
  return CATEGORY_OF[id];
}

// Decorate every catalog entry with its category at module load.
const decorate = (m: LetterTypeMeta): LetterTypeMeta => ({
  ...m,
  category: m.category ?? CATEGORY_OF[m.id],
});

export const LETTER_CATALOG: LetterTypeMeta[] = [
  ...EMPLOYER_CATALOG.map(decorate),
  ...EMPLOYEE_CATALOG.map(decorate),
];

export function getLetterMeta(id: LetterTypeId): LetterTypeMeta {
  const meta = LETTER_CATALOG.find((l) => l.id === id);
  if (!meta) throw new Error(`Unknown letter type: ${id}`);
  return meta;
}

export function letterCatalogByMode(mode: Mode): LetterTypeMeta[] {
  return LETTER_CATALOG.filter((l) => l.mode === mode);
}
