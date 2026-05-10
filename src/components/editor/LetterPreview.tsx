import { useEffect, useRef, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { useDraftStore } from "@/lib/store";
import { MessageSquarePlus } from "lucide-react";

type AddCommentOpts = {
  quote?: string;
  applyMark?: (commentId: string) => void;
};

export type LetterPreviewProps = {
  draft: Draft;
  /** Called when the user picks a text range and clicks "+ Comment". */
  onAddComment?: (sectionId: string, opts?: AddCommentOpts) => void;
  /** Called when the user clicks an existing inline-anchored comment highlight. */
  onFocusComment?: (commentId: string) => void;
};

/**
 * Continuous, paper-styled preview of the assembled letter. Sections are
 * concatenated with a `<section data-section-id>` wrapper so we can resolve
 * which section a text selection belongs to. Clicking a `<mark>` highlight
 * lifts the comment id up to the right rail; selecting plain text reveals
 * a floating "+ Comment" button that opens the composer with the quote.
 */
export function LetterPreview({ draft, onAddComment, onFocusComment }: LetterPreviewProps) {
  const updateSection = useDraftStore((s) => s.updateSection);
  const articleRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    sectionId: string;
    quote: string;
    rect: DOMRect;
  } | null>(null);

  // Track text selection inside the article. When the user selects a span,
  // surface a floating button anchored above the selection.
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Only track selections that begin and end inside the article.
      if (
        !article.contains(range.startContainer) ||
        !article.contains(range.endContainer)
      ) {
        setSelection(null);
        return;
      }
      const startEl: Element | null =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement;
      const sectionEl = startEl?.closest?.("[data-section-id]") as HTMLElement | null;
      if (!sectionEl) {
        setSelection(null);
        return;
      }
      const sectionId = sectionEl.getAttribute("data-section-id");
      const quote = sel.toString().trim();
      if (!sectionId || !quote) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const articleRect = article.getBoundingClientRect();
      // Position relative to article (which is positioned: relative below).
      setSelection({
        sectionId,
        quote,
        rect: new DOMRect(
          rect.left - articleRect.left,
          rect.top - articleRect.top,
          rect.width,
          rect.height
        ),
      });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  // Click on an existing highlight inside the preview → focus that comment in the rail.
  useEffect(() => {
    const article = articleRef.current;
    if (!article || !onFocusComment) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const mark = target?.closest?.("mark[data-comment-id]") as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute("data-comment-id");
      if (id) onFocusComment(id);
    };
    article.addEventListener("click", onClick);
    return () => article.removeEventListener("click", onClick);
  }, [onFocusComment]);

  const empty = draft.sections.every((s) => !s.html?.trim());

  if (empty) {
    return (
      <div className="text-xs text-[var(--ds-muted)] italic px-6 py-12 text-center">
        Generated content will appear here as a continuous letter.
      </div>
    );
  }

  const onCommentClick = () => {
    if (!selection || !onAddComment) return;
    const { sectionId, quote } = selection;
    onAddComment(sectionId, {
      quote,
      // The preview isn't a Tiptap surface — to anchor the highlight we
      // string-find the quoted text in the section's saved HTML and wrap
      // the first occurrence with a comment mark. Fragile if the text
      // appears multiple times, but works for the common case.
      applyMark: (commentId: string) => applyMarkByString(draft, sectionId, quote, commentId, updateSection),
    });
    // Clear the visible selection — the user has acted on it.
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  return (
    <article
      ref={articleRef}
      className="letter-preview-paper relative mx-auto max-w-[760px] bg-[var(--ds-surface)] text-[var(--ds-ink)] border border-[var(--ds-line)] rounded-lg shadow-sm"
      style={{
        padding: "56px 64px",
        fontFamily: "var(--font-serif)",
        fontSize: "15px",
        lineHeight: 1.7,
      }}
    >
      {draft.sections
        .filter((s) => s.html && s.html.trim())
        .map((s) => (
          <section
            key={s.id}
            data-section-id={s.id}
            className="prose prose-sm max-w-none [&_p]:my-3 [&_p]:leading-relaxed [&_strong]:font-semibold [&_table]:my-4 [&_table_td]:px-3 [&_table_td]:py-1 [&_table_th]:px-3 [&_table_th]:py-1"
            dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(s.html) }}
          />
        ))}

      {selection && onAddComment && (
        <button
          type="button"
          onMouseDown={(e) => {
            // Prevent selection collapse on click.
            e.preventDefault();
            onCommentClick();
          }}
          className="absolute z-10 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md shadow-md bg-[var(--ds-ink)] text-white hover:bg-[var(--gray-11)]"
          style={{
            top: Math.max(0, selection.rect.top - 36),
            left: selection.rect.left + selection.rect.width / 2,
            transform: "translateX(-50%)",
          }}
        >
          <MessageSquarePlus className="size-3" /> Comment
        </button>
      )}
    </article>
  );
}

/**
 * Wrap the first plain-text occurrence of `quote` inside section.html with a
 * comment mark and persist via the store. Does NOT touch text inside an
 * existing tag (we only string-find, so HTML attribute values aren't matched
 * unless the quote happens to look identical — extremely unlikely for letter
 * prose). Skips if the quote can't be located.
 */
function applyMarkByString(
  draft: Draft,
  sectionId: string,
  quote: string,
  commentId: string,
  updateSection: (draftId: string, sectionId: string, html: string) => void
): void {
  const section = draft.sections.find((s) => s.id === sectionId);
  if (!section?.html) return;
  const html = section.html;
  // Escape special regex chars in the quote.
  const esc = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match the quote that lies entirely inside text nodes — i.e. not crossing
  // tag boundaries. A loose heuristic: match if the surrounding chars on
  // both sides aren't part of a tag bracket.
  const re = new RegExp(`(?<!<[^>]*)${esc}(?![^<]*>)`);
  const next = html.replace(
    re,
    `<mark data-comment-id="${commentId}" data-comment-resolved="false">$&</mark>`
  );
  if (next === html) return; // didn't match — abort, comment exists with quote only.
  updateSection(draft.id, sectionId, next);
}
