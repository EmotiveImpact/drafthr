import type { Draft } from "@/lib/letters/types";
import { getEvidenceTier, getTemplateMetadata } from "@/lib/letters/templates";

/** The letter's evidence tier: set on the draft, else its template's, else
 *  derived from the letter type (one answer for the panel, the Draft step
 *  and the review handoff). */
export function letterEvidenceTier(draft: Draft): "light" | "medium" | "heavy" {
  return (
    draft.evidenceTier ??
    getEvidenceTier({
      letterType: draft.letterType,
      evidenceTier: getTemplateMetadata(draft.letterType, draft.context.jurisdiction)?.evidenceTier,
    })
  );
}

/** How many evidence items a heavy-tier letter should have before review
 *  (the review handoff asks for at least this many). */
export const HEAVY_EVIDENCE_MIN = 2;
