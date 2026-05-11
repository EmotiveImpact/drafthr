import { useEffect, useRef, useState } from "react";
import type { Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { Pencil, PencilOff } from "lucide-react";
import { PaginatedLetter } from "./PaginatedLetter";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
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
  onFocusSection,
}: LetterPreviewProps) {
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

  return (
    <EditableLetter
      draft={draft}
      onDone={() => setEditable(false)}
      onFocusSection={onFocusSection}
    />
  );
}

/* ============================================================================
 * Edit-on-page mode — single sticky toolbar + page-break visualisation
 * ==========================================================================*/

// A4 inner page height in CSS pixels at 96 dpi (the browser default).
// 11.69in × 96 px/in = 1122 px outer page; subtract top + bottom 1in
// margins (96 + 96) and we get ~930 px of writable area per page. We use
// this to draw "Page N starts here" markers at the right vertical offset
// so the user gets a visual sense of where the print pagination falls.
const A4_INNER_HEIGHT_PX = 930;

/**
 * Edit-on-page surface. ONE shared toolbar at the top of the page tracks
 * the most-recently-focused section editor — clicking a formatting button
 * applies it to the cursor's section regardless of where you click on
 * the toolbar. Below it, the letter renders inside an A4-width card with
 * visible "Page 2", "Page 3" markers computed via ResizeObserver so the
 * user can see how their content paginates as they type.
 */
function EditableLetter({
  draft,
  onDone,
  onFocusSection,
}: {
  draft: Draft;
  onDone: () => void;
  onFocusSection?: (sectionId: string) => void;
}) {
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [breaks, setBreaks] = useState<number[]>([]);

  // Measure content height and recompute page-break offsets whenever
  // anything inside the editable area changes height (typing, image insert,
  // window resize…).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const recompute = () => {
      const h = el.scrollHeight;
      const n = Math.max(0, Math.ceil(h / A4_INNER_HEIGHT_PX) - 1);
      setBreaks(Array.from({ length: n }, (_, i) => (i + 1) * A4_INNER_HEIGHT_PX));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [draft.sections]);

  return (
    <div className="letter-preview-shell">
      {/* Sticky top bar — Done editing on the right, the formatting
       * toolbar in the middle. The toolbar uses the most recently
       * focused section editor, so clicking a button always operates
       * on whatever paragraph the cursor was in.
       *
       * onMouseDown.preventDefault keeps the click from blurring the
       * editor before the command runs — without this, the cursor
       * jumps and the user's selection is lost. */}
      <div
        className="sticky top-0 z-30 bg-white border border-[var(--ds-line)] rounded-md mx-auto mb-3 shadow-sm"
        style={{ width: "min(8.27in, 100%)" }}
        onMouseDown={(e) => {
          // Don't let toolbar clicks blur the editor.
          const target = e.target as HTMLElement;
          if (target.closest("button, input")) return;
          e.preventDefault();
        }}
      >
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="flex-1 min-w-0 overflow-x-auto">
            {activeEditor ? (
              <EditorToolbar editor={activeEditor} draft={draft} />
            ) : (
              <div className="text-[11px] text-[var(--ds-muted)] px-2 py-1.5">
                Click anywhere in the letter to start editing.
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onDone}
            className="shrink-0 inline-flex items-center gap-1.5 text-[11.5px] px-2.5 h-7 rounded-md border bg-[var(--ds-ink)] text-white border-[var(--ds-ink)] transition"
            title="Done editing — switch back to paginated read-only preview"
          >
            <PencilOff className="size-3.5" />
            Done
          </button>
        </div>
      </div>

      {/* A4 page card. Content flows downward; visible page-break markers
       * overlay at the calculated A4 boundaries to show pagination. */}
      <div className="relative mx-auto" style={{ width: "min(8.27in, 100%)" }}>
        <article
          ref={contentRef}
          className="letter-page-card relative bg-white text-[var(--ds-ink)] border border-[var(--ds-line)] rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.06)]"
          style={{
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
            .map((s) => (
              <PageSectionEditor
                key={s.id}
                draft={draft}
                section={s}
                onFocus={() => onFocusSection?.(s.id)}
                onActivate={setActiveEditor}
              />
            ))}

          {/* Page-break markers overlaid at A4 boundaries. Positioned
           * absolute relative to the article. Pointer-events none so they
           * don't intercept editor clicks. The +96px adjusts for the 1in
           * top padding (96 px at 96 dpi). */}
          {breaks.map((y, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 pointer-events-none flex items-center gap-2"
              style={{ top: y + 96 }}
            >
              <div className="flex-1 border-t-2 border-dashed border-[var(--ds-line)]" />
              <span className="text-[10px] font-medium text-[var(--ds-muted)] bg-white px-2 py-0.5 rounded-full border border-[var(--ds-line)]">
                Page {i + 2}
              </span>
              <div className="flex-1 border-t-2 border-dashed border-[var(--ds-line)]" />
            </div>
          ))}
        </article>
      </div>

      <div className="max-w-[8.27in] mx-auto mt-3 text-center text-[11px] text-[var(--ds-muted)] tabular-nums">
        {breaks.length + 1} page{breaks.length === 0 ? "" : "s"} approx · live edit
      </div>
    </div>
  );
}

/**
 * Inline section editor for the Edit-on-page mode. Uses the same TipTap
 * extension stack as the main SectionEditor (so the EditorToolbar's
 * image / alignment / evidence picker all work), but renders without the
 * card chrome — just text flowing on the page.
 *
 * Each section has its own editor instance. The parent (LetterPreview's
 * edit mode) keeps a reference to the most-recently-focused editor and
 * renders ONE global toolbar at the top that targets it — that's the
 * pattern from Word/Pages/Google Docs and it avoids the per-section
 * toolbar-collapses-on-click bug.
 */
function PageSectionEditor({
  draft,
  section,
  onFocus,
  onActivate,
}: {
  draft: Draft;
  section: Section;
  onFocus: () => void;
  /** Tell the parent which editor instance currently owns the cursor so
   * the global toolbar at the top of the page can target it. */
  onActivate: (editor: import("@tiptap/react").Editor) => void;
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
    onFocus: ({ editor: ed }) => {
      setIsFocused(true);
      onFocus();
      onActivate(ed);
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
      <div
        className={
          "px-2 py-0.5 rounded-md transition " +
          (isFocused ? "ring-1 ring-[var(--ds-line)] bg-white" : "")
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

// (Selection-based "+ Comment" + apply-mark-by-string helper retired
//  with the static read-only render. The paged.js Preview is now read-only
//  for selection. Commenting still works from the Edit mode and from the
//  section cards in the Edit route.)
