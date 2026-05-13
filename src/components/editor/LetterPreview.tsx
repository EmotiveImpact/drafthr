import type { Draft } from "@/lib/letters/types";
import { PaginatedLetter } from "./PaginatedLetter";

type AddCommentOpts = {
  quote?: string;
  applyMark?: (commentId: string) => void;
};

export type LetterPreviewProps = {
  draft: Draft;
  /** Currently focused section id (so we can highlight its hover overlay). */
  activeSectionId?: string | null;
  /** Click anywhere inside a section pings the parent so it can update activeSectionId. */
  onFocusSection?: (sectionId: string) => void;
  /** Trigger Refine for a specific section (Preview's Refine entry point). */
  onRefineSection?: (sectionId: string) => void;
  /** Open version history for a specific section. */
  onShowSectionHistory?: (sectionId: string) => void;
  /** Called when the user picks a text range and clicks "+ Comment". */
  onAddComment?: (sectionId: string, opts?: AddCommentOpts) => void;
  /** Called when the user clicks an existing inline-anchored comment highlight. */
  onFocusComment?: (commentId: string) => void;
};

/**
 * Letter preview rendered as A4 paper via paged.js — the canonical
 * source of truth for what the PDF export will look like. Pixel-match
 * to the print render. Read-only by design; editing happens in Edit
 * mode where the SectionEditor now uses the same Iowan Old Style 11pt
 * typography so the two surfaces feel like the same document.
 *
 * Edit-on-page (formerly a third toggleable mode using
 * tiptap-pagination-plus) was retired — see CHANGELOG 0.5.0.
 */
export function LetterPreview({ draft }: LetterPreviewProps) {
  const empty = draft.sections.every((s) => !s.html?.trim());

  if (empty) {
    return (
      <div className="text-xs text-[var(--ds-muted)] italic px-6 py-12 text-center">
        Generated content will appear here as a continuous letter.
      </div>
    );
  }

  return (
    <div className="letter-preview-shell">
      <PaginatedLetter draft={draft} />
    </div>
  );
}
