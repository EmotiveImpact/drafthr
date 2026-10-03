import type { Draft } from "@/lib/letters/types";
import { PaginatedLetter } from "./PaginatedLetter";

type AddCommentOpts = {
  quote?: string;
  applyMark?: (commentId: string) => void;
};

export type LetterPreviewProps = {
  draft: Draft;
  exportMode?: boolean;
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
 * Letter preview rendered as A4 page cards — STRICTLY read-only.
 *
 * The old `editable` branch (which mounted PagedlyDocEditor) was removed: its
 * only caller was the read-only ReviewStep, and mounting the Page editor here
 * bypassed the review-lock (`canEditDraft`) that Editor.tsx enforces on its
 * own PagedlyDocEditor mount. Page editing lives in Editor.tsx only, where the
 * lock, streaming read-only, and persist guards are all wired. (Audit IMP-01.)
 */
export function LetterPreview({ draft, onAddComment, onFocusComment, exportMode }: LetterPreviewProps) {
  const empty = draft.sections.every((s) => !s.html?.trim());

  if (empty) {
    return (
      <div className="text-xs text-[var(--ds-muted)] italic px-6 py-12 text-center">
        Generated content will appear here as a continuous letter.
      </div>
    );
  }

  // Hand off to paged.js for real multi-page A4 rendering. Comment handlers
  // thread through so the paged page surface can host a selection-bubble
  // "+ Comment" affordance and route mark clicks back to the parent's panel.
  return (
    <div className="letter-preview-shell">
      <PaginatedLetter draft={draft} onAddComment={onAddComment} onFocusComment={onFocusComment} exportMode={exportMode} />
    </div>
  );
}
