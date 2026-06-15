import type { Draft } from "./types";
import type { LetterDraft, LetterEvidenceDisplayMode } from "pagedly";

/**
 * Map the app's rich `Draft` onto pagedly's `LetterDraft` — the subset the
 * pagedly editor needs (per-section HTML + letterhead/signature + evidence).
 *
 * The app's model is a superset (AI chat, comments, approvals, timeline, …);
 * pagedly only cares about what it renders/prints, so this is a lossy-by-design
 * projection. The reverse direction (persisting edits back) is handled per
 * section via the store's `updateSection`, not by reconstructing a whole Draft.
 */

/** pagedly has no "figure" exhibit mode; the closest on-page rendering is inline. */
function mapEvidenceMode(m: string | undefined): LetterEvidenceDisplayMode | undefined {
  if (m === "inline" || m === "attached" || m === "pack_only") return m;
  if (m === "figure") return "inline";
  return undefined;
}

export function toLetterDraft(draft: Draft): LetterDraft {
  const emp = draft.employer;
  return {
    id: draft.id,
    mode: draft.mode === "employee" ? "employee" : "employer",
    letterType: draft.letterType,
    employer: {
      legalName: emp?.legalName,
      address: emp?.address,
      // Only forward the letterhead when the draft actually opts into one.
      letterheadDataUrl: emp?.hasLetterhead ? emp?.letterheadDataUrl : undefined,
      signatureDataUrl: emp?.signatureDataUrl,
      signatoryName: emp?.signatoryName,
      signatoryTitle: emp?.signatoryTitle,
    },
    sections: draft.sections.map((s) => ({
      id: s.id,
      sectionId: s.sectionId,
      title: s.title,
      html: s.html,
    })),
    evidence: (draft.evidence ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      filename: e.filename,
      mimeType: e.mimeType,
      fileDataUrl: e.fileDataUrl,
      content: e.content,
      displayMode: mapEvidenceMode(e.displayMode),
    })),
  };
}
