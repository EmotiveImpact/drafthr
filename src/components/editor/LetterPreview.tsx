import { useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { Pencil } from "lucide-react";
import { PaginatedLetter } from "./PaginatedLetter";
import { PaginatedEditableLetter } from "./PaginatedEditableLetter";

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
 * Letter preview rendered as an A4-styled page card. A "Edit on page"
 * toggle swaps the static rendering for inline TipTap section editors
 * so the user can type/format/insert evidence right on the page — the
 * Word/Pages way — rather than going back to Edit mode.
 *
 * Pagination today is single-page (visible page chrome around the whole
 * letter). Real multi-page splitting is queued for a follow-up; the
 * @page CSS rule below makes the printed/PDF output paginate naturally.
 */
export function LetterPreview({ draft }: LetterPreviewProps) {
  const [editable, setEditable] = useState(false);

  const empty = draft.sections.every((s) => !s.html?.trim());

  if (empty) {
    return (
      <div className="text-xs text-[var(--ds-muted)] italic px-6 py-12 text-center">
        Generated content will appear here as a continuous letter.
      </div>
    );
  }

  // Read-only path: hand off to paged.js for real multi-page A4 rendering.
  // Edit-on-page path: keep the inline TipTap render below (paged.js
  // can't compose with a live editor — measurement loop fights the editor).
  if (!editable) {
    return (
      <div className="letter-preview-shell">
        <div className="flex items-center justify-end gap-2 max-w-[8.27in] mx-auto mb-3 px-1">
          <button
            type="button"
            onClick={() => setEditable(true)}
            className="inline-flex items-center gap-1.5 text-[11.5px] px-2.5 h-7 rounded-md border bg-[var(--ds-surface)] text-[var(--ds-body)] border-[var(--ds-line)] hover:bg-[var(--ds-line-2)] transition"
            title="Edit directly on the page (rich text, paste images, insert evidence)"
          >
            <Pencil className="size-3.5" />
            Edit on page
          </button>
        </div>
        <PaginatedLetter draft={draft} />
      </div>
    );
  }

  // Edit-on-page: real paginated multi-page A4 cards via paged.js, with
  // each page rendered as contenteditable for inline editing. This is
  // the "real pages" mode the user asked for. See PaginatedEditableLetter
  // for the trade-offs (execCommand-based formatting; re-paginate-on-demand
  // rather than per-keystroke).
  return (
    <PaginatedEditableLetter
      draft={draft}
      onDone={() => setEditable(false)}
    />
  );
}
