import type { Draft } from "@/lib/letters/types";
import { PaginatedLetter } from "./PaginatedLetter";
import { PagedEditor } from "./paged-edit/PagedEditor";

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
  /** Controlled edit-on-page toggle. The parent topbar owns this state
   * now so the affordance lives next to Edit/Preview rather than as
   * a floating button above the page. */
  editable?: boolean;
  /** Called when the editable on-page editor signals "done". */
  onEditableDone?: () => void;
};

/**
 * Letter preview rendered as A4 page cards. Read-only Preview and
 * edit-on-page both use paged.js, the same print CSS, and the same
 * source composition so page size, margins, and typography stay aligned.
 */
export function LetterPreview({ draft, editable = false, onEditableDone }: LetterPreviewProps) {
  const empty = draft.sections.every((s) => !s.html?.trim());

  if (empty) {
    return (
      <div className="text-xs text-[var(--ds-muted)] italic px-6 py-12 text-center">
        Generated content will appear here as a continuous letter.
      </div>
    );
  }

  // Read-only path: hand off to paged.js for real multi-page A4 rendering.
  if (!editable) {
    return (
      <div className="letter-preview-shell">
        <PaginatedLetter draft={draft} />
      </div>
    );
  }

  // Edit-on-page: the paged.js render IS the editor. The legacy one-long-page
  // TipTap surface is intentionally not used here; Preview and edit-preview
  // must be the same page model.
  return <PagedEditor draft={draft} onDone={() => onEditableDone?.()} />;
}
