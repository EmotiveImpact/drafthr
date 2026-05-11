import { useEffect, useRef, useState } from "react";
import type { Draft, Section } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { useDraftStore } from "@/lib/store";
import { MessageSquarePlus, Sparkles, History, Pencil, PencilOff } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { CommentMark } from "@/lib/tiptap/comment-mark";
import { EditorToolbar } from "./EditorToolbar";

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
export function LetterPreview({
  draft,
  activeSectionId,
  onFocusSection,
  onRefineSection,
  onShowSectionHistory,
  onAddComment,
  onFocusComment,
}: LetterPreviewProps) {
  const updateSection = useDraftStore((s) => s.updateSection);
  const articleRef = useRef<HTMLDivElement>(null);
  const [editable, setEditable] = useState(false);
  const [selection, setSelection] = useState<{
    sectionId: string;
    quote: string;
    rect: DOMRect;
  } | null>(null);

  // Track text selection inside the article. When the user selects a span,
  // surface a floating "+ Comment" button anchored above the selection.
  // Only active in read-only (non-editable) mode — when the page is editable
  // we don't want the comment popper fighting with text-editing UX.
  useEffect(() => {
    if (editable) {
      setSelection(null);
      return;
    }
    const article = articleRef.current;
    if (!article) return;

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
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
      if (!sectionId) {
        setSelection(null);
        return;
      }
      const quote = sel.toString().trim();
      if (!quote) {
        setSelection(null);
        return;
      }
      setSelection({ sectionId, quote, rect: range.getBoundingClientRect() });
    };

    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [editable]);

  // Click an existing <mark data-comment-id> in the read-only article to
  // focus its thread in the right rail.
  useEffect(() => {
    if (editable) return;
    const article = articleRef.current;
    if (!article || !onFocusComment) return;
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const mark = target?.closest?.("mark[data-comment-id]") as HTMLElement | null;
      if (!mark) return;
      const commentId = mark.getAttribute("data-comment-id");
      if (commentId) onFocusComment(commentId);
    };
    article.addEventListener("click", onClick);
    return () => article.removeEventListener("click", onClick);
  }, [onFocusComment, editable]);

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
      applyMark: (commentId: string) =>
        applyMarkByString(draft, sectionId, quote, commentId, updateSection),
    });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  return (
    <div className="letter-preview-shell">
      {/* Toggle strip — single sticky control above the page. */}
      <div className="flex items-center justify-end gap-2 max-w-[760px] mx-auto mb-3 px-1">
        <button
          type="button"
          onClick={() => setEditable((v) => !v)}
          className={
            "inline-flex items-center gap-1.5 text-[11.5px] px-2.5 h-7 rounded-md border transition " +
            (editable
              ? "bg-[var(--ds-ink)] text-white border-[var(--ds-ink)]"
              : "bg-[var(--ds-surface)] text-[var(--ds-body)] border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]")
          }
          title={
            editable
              ? "Done editing — switch back to read-only preview"
              : "Edit directly on the page (rich text, paste images, insert evidence)"
          }
        >
          {editable ? <PencilOff className="size-3.5" /> : <Pencil className="size-3.5" />}
          {editable ? "Done editing" : "Edit on page"}
        </button>
      </div>

      {/* A4 page card. Sized to ISO A4 (8.27in × 11.69in) — enough to look
       * like a printed page. Visible boundaries via shadow + rounded
       * corners. Real multi-page splitting is a follow-up; right now if
       * content overflows the letter grows beyond one page-height. The
       * @page rule on print + html2pdf still paginates the export correctly. */}
      <article
        ref={articleRef}
        className="letter-page-card relative bg-white text-[var(--ds-ink)] border border-[var(--ds-line)] rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.06)] mx-auto"
        style={{
          width: "min(8.27in, 100%)",
          minHeight: "11.69in",
          padding: "1in 1.1in",
          fontFamily: "var(--font-serif)",
          fontSize: "15px",
          lineHeight: 1.7,
        }}
      >
        {draft.employer.letterheadDataUrl && (
          <div className="text-center mb-6">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img
              src={draft.employer.letterheadDataUrl}
              className="inline-block max-w-full"
              style={{ maxHeight: 120 }}
            />
          </div>
        )}

        {draft.sections
          .filter((s) => s.html && s.html.trim())
          .map((s) => {
            const isActive = activeSectionId === s.id;
            if (editable) {
              return (
                <PageSectionEditor
                  key={s.id}
                  draft={draft}
                  section={s}
                  onFocus={() => onFocusSection?.(s.id)}
                />
              );
            }
            return (
              <div
                key={s.id}
                className="relative group/sec"
                onClick={() => onFocusSection?.(s.id)}
              >
                <section
                  data-section-id={s.id}
                  className="prose prose-sm max-w-none [&_p]:my-3 [&_p]:leading-relaxed [&_strong]:font-semibold [&_table]:my-4 [&_table_td]:px-3 [&_table_td]:py-1 [&_table_th]:px-3 [&_table_th]:py-1 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:my-2"
                  dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(s.html) }}
                />
                {(onRefineSection || onShowSectionHistory || onAddComment) && (
                  <div
                    className={
                      "absolute -top-3 right-0 transition-opacity z-20 flex items-center gap-0.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-sm px-1 py-0.5 " +
                      (isActive
                        ? "opacity-100"
                        : "opacity-0 group-hover/sec:opacity-100 focus-within:opacity-100")
                    }
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onRefineSection && (
                      <button
                        type="button"
                        title="Refine this section with AI"
                        onClick={() => onRefineSection(s.id)}
                        className="size-6 grid place-items-center rounded-sm text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                      >
                        <Sparkles className="size-3.5" />
                      </button>
                    )}
                    {onShowSectionHistory && (
                      <button
                        type="button"
                        title="Version history"
                        onClick={() => onShowSectionHistory(s.id)}
                        className="size-6 grid place-items-center rounded-sm text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                      >
                        <History className="size-3.5" />
                      </button>
                    )}
                    {onAddComment && (
                      <button
                        type="button"
                        title="Comment on this section"
                        onClick={() => onAddComment(s.id)}
                        className="size-6 grid place-items-center rounded-sm text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                      >
                        <MessageSquarePlus className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {selection && onAddComment && !editable && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onCommentClick();
            }}
            className="fixed z-50 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md shadow-md bg-[var(--ds-ink)] text-white hover:bg-[var(--gray-11)]"
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

      {/* Page chrome footer — page-count placeholder. Real multi-page split
       * is the next iteration; for now it just confirms the page boundary. */}
      <div className="max-w-[760px] mx-auto mt-3 text-center text-[11px] text-[var(--ds-muted)] tabular-nums">
        Page 1 · {pageCountHint(draft)} page approx
      </div>
    </div>
  );
}

/**
 * Rough page-count hint based on word count. ~300 words per A4 at our
 * font size + leading. Cheap and good enough for a visual cue; we don't
 * promise precision.
 */
function pageCountHint(draft: Draft): number {
  const text = draft.sections.map((s) => s.html.replace(/<[^>]+>/g, " ")).join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 300));
}

/**
 * Inline section editor for the Edit-on-page mode. Uses the same TipTap
 * extension stack as the main SectionEditor (so the EditorToolbar's
 * image / alignment / evidence picker all work), but renders without the
 * card chrome — just text flowing on the page.
 *
 * Each section has its own editor instance. The toolbar follows the
 * focused editor (we mount it inside this component, sticky at the top
 * of the section, only when that editor is focused).
 */
function PageSectionEditor({
  draft,
  section,
  onFocus,
}: {
  draft: Draft;
  section: Section;
  onFocus: () => void;
}) {
  const updateSection = useDraftStore((s) => s.updateSection);
  const lastWritten = useRef<string>(section.html);
  const [isFocused, setIsFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, code: false }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      CommentMark,
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: "section-image",
          style: "max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;",
        },
      }),
      TextAlign.configure({
        types: ["paragraph", "heading"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
    ],
    content: section.html || "",
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      if (html !== lastWritten.current) {
        lastWritten.current = html;
        updateSection(draft.id, section.id, html);
      }
    },
    onFocus: () => {
      setIsFocused(true);
      onFocus();
    },
    onBlur: () => setIsFocused(false),
    editorProps: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.kind === "file" && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            void readImageAsDataUrl(file).then((src) => {
              if (src)
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src, alt: file.name })
                  )
                );
            });
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const file = files[0];
        if (!file.type.startsWith("image/")) return false;
        event.preventDefault();
        const coords = { left: event.clientX, top: event.clientY };
        const pos = view.posAtCoords(coords);
        void readImageAsDataUrl(file).then((src) => {
          if (!src) return;
          const node = view.state.schema.nodes.image.create({ src, alt: file.name });
          const tr = pos
            ? view.state.tr.insert(pos.pos, node)
            : view.state.tr.replaceSelectionWith(node);
          view.dispatch(tr);
        });
        return true;
      },
    },
  });

  return (
    <div data-section-id={section.id} className="relative -mx-2 my-1">
      {/* Toolbar appears only when this section's editor is focused.
       * The shared design lets the user click anywhere on the page and
       * get the relevant formatting tools floating above. */}
      {isFocused && editor && (
        <div className="sticky top-0 z-20 -mx-2 px-2 bg-white/95 backdrop-blur-sm border-b border-[var(--ds-line)] rounded-t-md">
          <EditorToolbar editor={editor} draft={draft} />
        </div>
      )}
      <div
        className={
          "px-2 py-0.5 rounded-md transition " +
          (isFocused ? "bg-[var(--ds-line-2)]/30" : "hover:bg-[var(--ds-line-2)]/20")
        }
      >
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none [&_p]:my-3 [&_p]:leading-relaxed [&_strong]:font-semibold [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:my-2 [&_table]:my-4 [&_table_td]:px-3 [&_table_td]:py-1 [&_table_th]:px-3 [&_table_th]:py-1 focus:outline-none"
        />
      </div>
    </div>
  );
}

const MAX_EMBED_BYTES = 5 * 1024 * 1024;
async function readImageAsDataUrl(file: File): Promise<string | null> {
  if (file.size > MAX_EMBED_BYTES) {
    alert(
      `${file.name} is larger than 5 MB. Add it via the Evidence step — that path keeps the original at full quality.`
    );
    return null;
  }
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Wrap the first plain-text occurrence of `quote` inside section.html with a
 * comment mark and persist via the store. Used by the read-only preview's
 * "+ Comment" affordance.
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
  const esc = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<!<[^>]*)${esc}(?![^<]*>)`);
  const next = html.replace(
    re,
    `<mark data-comment-id="${commentId}" data-comment-resolved="false">$&</mark>`
  );
  if (next === html) return;
  updateSection(draft.id, sectionId, next);
}
