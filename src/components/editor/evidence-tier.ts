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

/** The ids of evidence a section of the letter uses: cited in its text (a
 *  figure or an attachment reference) or linked to it on the item. */
export function usedEvidenceIds(draft: Pick<Draft, "sections" | "evidence">): Set<string> {
  const used = new Set<string>();
  const sectionIds = new Set(draft.sections.map((s) => s.id));
  for (const section of draft.sections) {
    const html = section.html ?? "";
    for (const m of html.matchAll(/data-(?:fig|att)-id="([^"]+)"/g)) used.add(m[1]);
  }
  for (const e of draft.evidence ?? []) {
    if ((e.sectionIds ?? []).some((id) => sectionIds.has(id))) used.add(e.id);
  }
  return used;
}

/** The letter's evidence split into the items the letter uses and the ones
 *  it does not (the same split the Progress checklist and the evidence
 *  check before review show, LETTER-X46). */
export function evidenceUsage(draft: Pick<Draft, "sections" | "evidence">): {
  used: NonNullable<Draft["evidence"]>;
  unused: NonNullable<Draft["evidence"]>;
} {
  const ids = usedEvidenceIds(draft);
  const used: NonNullable<Draft["evidence"]> = [];
  const unused: NonNullable<Draft["evidence"]> = [];
  for (const e of draft.evidence ?? []) (ids.has(e.id) ? used : unused).push(e);
  return { used, unused };
}
