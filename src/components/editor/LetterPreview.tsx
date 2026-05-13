import type { Draft } from "@/lib/letters/types";
import { getFlag } from "@/lib/flags";
import { PaginatedLetter } from "./PaginatedLetter";
import { PaginatedEditableLetter } from "./PaginatedEditableLetter";
import { PaginatedEditableLetterV2 } from "./paged-edit/PaginatedEditableLetterV2";

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
 * Letter preview rendered as an A4-styled page card. When `editable`
 * is true the static rendering is swapped for inline TipTap section
 * editors so the user can type/format/insert evidence right on the
 * page — Word/Pages style. The toggle for this lives on the topbar.
 *
 * Pagination today is single-page (visible page chrome around the whole
 * letter). Real multi-page splitting is queued for a follow-up; the
 * @page CSS rule below makes the printed/PDF output paginate naturally.
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

  // Edit-on-page: feature flag chooses between V1 (single continuous
  // contenteditable, ships today) and V2 (pixel-perfect paged.js break
  // detection, dogfooding). Default is V1; flip the flag via
  // VITE_FEATURE_PIXEL_PERFECT_EDIT or window.__drafthr.setFlag(...).
  if (getFlag("pixelPerfectEdit")) {
    return (
      <PaginatedEditableLetterV2
        draft={draft}
        onDone={() => onEditableDone?.()}
      />
    );
  }
  return (
    <PaginatedEditableLetter
      draft={draft}
      onDone={() => onEditableDone?.()}
    />
  );
}
