import type { LetterTypeId, Mode, RiskClass, SectionId } from "./types";
import { EMPLOYER_CATALOG } from "./catalog/employer";
import { EMPLOYEE_CATALOG } from "./catalog/employee";

export type LetterTypeMeta = {
  id: LetterTypeId;
  /** Mode this letter belongs to. */
  mode: Mode;
  title: string;
  shortTitle: string;
  description: string;
  riskClass: RiskClass;
  jurisdictionScope: "shared" | "uk_only" | "us_only";
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

export const LETTER_CATALOG: LetterTypeMeta[] = [...EMPLOYER_CATALOG, ...EMPLOYEE_CATALOG];

export function getLetterMeta(id: LetterTypeId): LetterTypeMeta {
  const meta = LETTER_CATALOG.find((l) => l.id === id);
  if (!meta) throw new Error(`Unknown letter type: ${id}`);
  return meta;
}

export function letterCatalogByMode(mode: Mode): LetterTypeMeta[] {
  return LETTER_CATALOG.filter((l) => l.mode === mode);
}
