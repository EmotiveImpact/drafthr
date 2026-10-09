import type { Jurisdiction, LetterTypeId } from "../types";
import type { EvidenceTier, ExpectedEvidence, LetterTemplate } from "./types";

/**
 * The light slice of a LetterTemplate that list / checklist surfaces need
 * without loading the full template (scaffolds, examples, constraints).
 */
export type TemplateMetadata = {
  letterType: LetterTypeId;
  jurisdiction: Jurisdiction;
  evidenceTier?: EvidenceTier;
  expectedEvidence?: ExpectedEvidence[];
};

export function toTemplateMetadata(tpl: LetterTemplate): TemplateMetadata {
  const meta: TemplateMetadata = {
    letterType: tpl.letterType,
    jurisdiction: tpl.jurisdiction,
  };
  if (tpl.evidenceTier) meta.evidenceTier = tpl.evidenceTier;
  if (tpl.expectedEvidence) meta.expectedEvidence = tpl.expectedEvidence;
  return meta;
}
