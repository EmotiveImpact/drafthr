import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import LinkExt from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { PaginationPlus } from "tiptap-pagination-plus";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  FileText,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";

import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { sanitizeLetterHtml } from "@/lib/sanitize";

import { EvidencePickerPopover } from "./EvidencePickerPopover";

/**
 * Editable letter using `tiptap-pagination-plus` for real ProseMirror-level
 * page breaks (https://github.com/RomikMakavana/tiptap-pagination-plus, MIT).
 *
 * Architecture:
 *   - ONE TipTap editor holds the whole letter. Sections are preserved
 *     across the edit by inserting an invisible `sectionAnchor` Node
 *     before each section's content. The anchors survive the
 *     ProseMirror round-trip; on save we walk the doc, group children
 *     by which anchor preceded them, and emit per-section updates.
 *   - PaginationPlus paints the page chrome (white card, gap between
 *     pages, footer with "Page n of N").
 *   - Our scoped <style> block overrides the extension's default look
 *     so it matches the read-only PaginatedLetter (Iowan Old Style
 *     11pt, slate-100 page gap, no card border, drop shadow).
 *
 * A4 geometry (matches wrapInPrintHtml @page in PaginatedLetter):
 *   pageHeight 1122 (11.69in × 96)   pageWidth 794 (8.27in × 96)
 *   margin top 96 (1in)              bottom 115 (1.2in)
 *   margin sides 106 (1.1in each)
 *   gap 24px between pages
 */

const SAVE_DELAY_MS = 500;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const PAGE_HEIGHT_PX = Math.round(11.69 * 96); // 1122
const PAGE_WIDTH_PX = Math.round(8.27 * 96);   // 794
const MARGIN_TOP_PX = Math.round(1.0 * 96);    // 96
const MARGIN_BOTTOM_PX = Math.round(1.2 * 96); // 115
const MARGIN_SIDE_PX = Math.round(1.1 * 96);   // 106
const PAGE_GAP_PX = 24;

/**
 * Invisible block node inserted before each section's content. Carries
 * the section id as a data attribute so we can split content back into
 * the right sections on save. atom + display:none so it never
 * contributes height or shows in the rendered letter.
 */
const SectionAnchor = Node.create({
  name: "sectionAnchor",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      sectionId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-section-id"),
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-section-id": attrs.sectionId,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-section-anchor]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-section-anchor": "",
        style: "display:none;height:0;line-height:0;margin:0;padding:0;",
      },
    ];
  },
});

function buildMergedHtml(draft: Draft): string {
  return draft.sections
    .map(
      (s) =>
        `<div data-section-anchor data-section-id="${s.id}"></div>` +
        sanitizeLetterHtml(s.html || ""),
    )
    .join("");
}

/**
 * Walk the editor's serialised HTML and split it into a {sectionId: html}
 * map by accumulating siblings between each <div data-section-anchor> marker.
 * Content before the first anchor is dropped (shouldn't happen in normal
 * use — the editor always starts with an anchor).
 */
function splitHtmlBySection(fullHtml: string): Record<string, string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${fullHtml}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const result: Record<string, string> = {};
  if (!root) return result;

  let currentId: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (currentId != null) {
      result[currentId] = buf.join("");
    }
    buf = [];
  };

  // 1 = ELEMENT_NODE, 3 = TEXT_NODE (using numeric constants because
  // the TipTap `Node` import shadows the global DOM `Node` namespace).
  for (const node of Array.from(root.childNodes)) {
    if (
      node.nodeType === 1 &&
      (node as HTMLElement).getAttribute("data-section-anchor") !== null
    ) {
      flush();
      currentId = (node as HTMLElement).getAttribute("data-section-id");
      continue;
    }
    if (node.nodeType === 1) {
      buf.push((node as HTMLElement).outerHTML);
    } else if (node.nodeType === 3) {
      buf.push(node.textContent ?? "");
    }
  }
  flush();
  return result;
}

const EDITOR_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Underline,
  LinkExt.configure({ openOnClick: false, autolink: true }),
  Placeholder.configure({
    placeholder: "Continue writing this letter…",
    showOnlyWhenEditable: true,
    showOnlyCurrent: true,
  }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Image.configure({
    inline: false,
    allowBase64: true,
    HTMLAttributes: { class: "letter-inline-image" },
  }),
  TextAlign.configure({
    types: ["heading", "paragraph"],
    alignments: ["left", "center", "right", "justify"],
    defaultAlignment: "left",
  }),
  SectionAnchor,
  PaginationPlus.configure({
    pageHeight: PAGE_HEIGHT_PX,
    pageWidth: PAGE_WIDTH_PX,
    marginTop: MARGIN_TOP_PX,
    marginBottom: MARGIN_BOTTOM_PX,
    marginLeft: MARGIN_SIDE_PX,
    marginRight: MARGIN_SIDE_PX,
    pageGap: PAGE_GAP_PX,
    // The extension paints the inter-page gap with this background — we
    // want it to match the outer slate-100 background so the white pages
    // sit cleanly with a visible break between them.
    pageBreakBackground: "#f1f5f9",
    pageGapBorderSize: 0,
    pageGapBorderColor: "transparent",
    contentMarginTop: 0,
    contentMarginBottom: 0,
    headerLeft: "",
    headerRight: "",
    footerLeft: "",
    footerRight: "Page {page}",
    customHeader: {},
    customFooter: {},
  }),
];

export function PaginatedEditableLetter({
  draft,
  onDone,
}: {
  draft: Draft;
  onDone: () => void;
}) {
  const updateSection = useDraftStore((state) => state.updateSection);

  const initialHtml = useMemo(() => buildMergedHtml(draft), [
    // Only build once per Edit-on-page session — we use draft.id as the
    // memo key so the merged content is rebuilt if the user switches drafts.
    draft.id,
  ]);

  // Snapshot of last-saved HTML per section. Initialised once on mount
  // from the draft's stored section HTML; updated on every successful save.
  const savedHtmlByIdRef = useRef<Record<string, string> | null>(null);
  if (savedHtmlByIdRef.current === null) {
    const seed: Record<string, string> = {};
    for (const s of draft.sections) seed[s.id] = s.html || "";
    savedHtmlByIdRef.current = seed;
  }

  const [dirty, setDirty] = useState(false);
  const saveTimerRef = useRef<number | null>(null);

  const editor = useEditor(
    {
      extensions: EDITOR_EXTENSIONS,
      content: initialHtml,
      editorProps: {
        attributes: { class: "outline-none" },
      },
      onUpdate: ({ editor }) => {
        setDirty(true);
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          const fullHtml = editor.getHTML();
          const splits = splitHtmlBySection(fullHtml);
          const saved = savedHtmlByIdRef.current as Record<string, string>;
          for (const section of draft.sections) {
            const next = splits[section.id] ?? "";
            if (next !== saved[section.id]) {
              updateSection(draft.id, section.id, next);
              saved[section.id] = next;
            }
          }
          setDirty(false);
          saveTimerRef.current = null;
        }, SAVE_DELAY_MS);
      },
    },
    // Re-create when the draft id changes (rare, but covers the case of
    // switching draft while Edit-on-page is mounted).
    [draft.id],
  );

  // Flush any pending save on unmount so nothing is lost.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        // Best-effort sync flush.
        if (editor) {
          const splits = splitHtmlBySection(editor.getHTML());
          const saved = savedHtmlByIdRef.current as Record<string, string>;
          for (const section of draft.sections) {
            const next = splits[section.id] ?? "";
            if (next !== saved[section.id]) {
              updateSection(draft.id, section.id, next);
            }
          }
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const flushAndDone = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (editor) {
      const splits = splitHtmlBySection(editor.getHTML());
      const saved = savedHtmlByIdRef.current as Record<string, string>;
      for (const section of draft.sections) {
        const next = splits[section.id] ?? "";
        if (next !== saved[section.id]) {
          updateSection(draft.id, section.id, next);
          saved[section.id] = next;
        }
      }
    }
    setDirty(false);
    onDone();
  }, [draft.id, draft.sections, editor, onDone, updateSection]);

  const styleScope = `pe-${draft.id.slice(0, 8)}`;

  return (
    <div className="paginated-editable-shell">
      <PagedEditToolbar
        editor={editor}
        draft={draft}
        dirty={dirty}
        onDone={flushAndDone}
      />

      {/* Scoped CSS — matches PaginatedLetter (paged.js read-only output)
       * visually. The extension produces ONE tall ProseMirror container
       * with internal page-break strips, so we style:
       *   - container: white paper card (radius + shadow)
       *   - page-break strips: subtle slate cuts that read as page seams
       *   - footer: Geist 9pt slate-400 centred
       *   - body type: Iowan Old Style 11pt 1.55 line-height */}
      <style>{`
        .${styleScope} {
          display: flex;
          justify-content: center;
          padding: 20px 0 32px;
          min-height: 100%;
        }

        /* The ProseMirror container IS the paper. White, rounded, slate-200
         * 1px border + soft drop shadow — matches PaginatedLetter's
         * .pagedjs_page rule exactly so Edit-on-page and Preview look
         * identical. */
        .${styleScope} .ProseMirror {
          background: #ffffff !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 4px;
          box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.04),
            0 6px 24px rgba(0, 0, 0, 0.06);
          font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.55;
          color: #0f172a;
          outline: none;
          overflow: hidden;
        }

        /* Page-break strip — the visual seam between pages. Soft slate
         * fill with a 1px slate-200 hairline above and below so it reads
         * as the cut between two sheets of paper. */
        .${styleScope} .rm-page-break {
          background: transparent !important;
        }
        .${styleScope} .rm-page-break .breaker {
          background-color: #f1f5f9 !important;
          border-top: 1px solid #e2e8f0 !important;
          border-bottom: 1px solid #e2e8f0 !important;
        }

        /* Header / footer wrappers inside each page break. */
        .${styleScope} .rm-page-header,
        .${styleScope} .rm-page-footer {
          background: transparent !important;
          font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .${styleScope} .rm-page-footer-content,
        .${styleScope} .rm-page-header-content {
          font-size: 9pt !important;
          color: #94a3b8 !important;
        }
        /* "Page n" is rendered into footerRight by config. Centre it. */
        .${styleScope} .rm-page-footer-left { flex: 1; }
        .${styleScope} .rm-page-footer-right {
          flex: 1;
          text-align: center !important;
        }

        /* Hide section anchors entirely — they're invariant atoms used
         * only for save-time section reconstruction. */
        .${styleScope} .ProseMirror div[data-section-anchor] {
          display: none !important;
          height: 0 !important;
          margin: 0 !important;
        }

        /* Typography matches PaginatedLetter's wrapInPrintHtml block. */
        .${styleScope} .ProseMirror > *:first-child { margin-top: 0; }
        .${styleScope} .ProseMirror > *:last-child { margin-bottom: 0; }
        .${styleScope} .ProseMirror p { margin: 0 0 8pt 0; }
        .${styleScope} .ProseMirror h1,
        .${styleScope} .ProseMirror h2,
        .${styleScope} .ProseMirror h3 {
          margin: 14pt 0 6pt;
          line-height: 1.25;
        }
        .${styleScope} .ProseMirror h2 { font-size: 14pt; font-weight: 600; }
        .${styleScope} .ProseMirror h3 { font-size: 12pt; font-weight: 600; }
        .${styleScope} .ProseMirror strong { font-weight: 600; }
        .${styleScope} .ProseMirror em { color: #475569; font-style: italic; }
        .${styleScope} .ProseMirror ul { list-style: disc; padding-left: 1.5em; margin: 6pt 0; }
        .${styleScope} .ProseMirror ol { list-style: decimal; padding-left: 1.5em; margin: 6pt 0; }
        .${styleScope} .ProseMirror li { margin: 2pt 0; }
        .${styleScope} .ProseMirror blockquote {
          margin: 8pt 0;
          padding-left: 1em;
          border-left: 2px solid #cbd5e1;
          color: #334155;
          font-style: italic;
        }
        .${styleScope} .ProseMirror hr {
          border: 0;
          border-top: 1px solid #cbd5e1;
          margin: 14pt 0;
        }
        .${styleScope} .ProseMirror table {
          width: 100%;
          border-collapse: collapse;
          margin: 6pt 0;
        }
        .${styleScope} .ProseMirror th,
        .${styleScope} .ProseMirror td {
          border: 1px solid #cbd5e1;
          padding: 4pt 8pt;
          text-align: left;
        }
        .${styleScope} .ProseMirror img {
          max-width: 100%;
          height: auto;
          margin: 6pt 0;
          border-radius: 3px;
        }
        .${styleScope} .ProseMirror .figure-ref,
        .${styleScope} .ProseMirror .attachment-ref {
          font-style: italic;
          color: #475569;
        }
        .${styleScope} .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>

      <div className={styleScope}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/* ============================================================================
 * Toolbar
 * ==========================================================================*/

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
};

function ToolbarButton({ label, active, disabled, children, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition",
        "text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-[var(--ds-ink)] text-white hover:bg-[var(--ds-ink)] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[var(--ds-line)]" />;
}

function insertImage(editor: Editor | null, event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!editor || !file) return;
  if (!file.type.startsWith("image/")) return;
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    alert("Image larger than 5 MB — use the Evidence step for full-quality originals.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result ?? "");
    if (!dataUrl) return;
    editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run();
  };
  reader.readAsDataURL(file);
}

function PagedEditToolbar({
  draft,
  editor,
  dirty,
  onDone,
}: {
  draft: Draft;
  editor: Editor | null;
  dirty: boolean;
  onDone: () => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const canEdit = Boolean(editor);

  return (
    <div
      className="sticky top-0 z-30 mx-auto mb-3 flex w-[min(8.27in,100%)] items-center gap-1 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-1.5 shadow-sm"
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, input")) return;
        e.preventDefault();
      }}
    >
      <div className="flex items-center gap-0.5">
        <ToolbarButton label="Bold" active={editor?.isActive("bold")} disabled={!canEdit} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor?.isActive("italic")} disabled={!canEdit} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Underline" active={editor?.isActive("underline")} disabled={!canEdit} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
      </div>
      <ToolbarDivider />
      <div className="flex items-center gap-0.5">
        <ToolbarButton label="Heading 2" active={editor?.isActive("heading", { level: 2 })} disabled={!canEdit} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Heading 3" active={editor?.isActive("heading", { level: 3 })} disabled={!canEdit} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="size-3.5" />
        </ToolbarButton>
      </div>
      <ToolbarDivider />
      <div className="flex items-center gap-0.5">
        <ToolbarButton label="Bullet list" active={editor?.isActive("bulletList")} disabled={!canEdit} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor?.isActive("orderedList")} disabled={!canEdit} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
      </div>
      <ToolbarDivider />
      <div className="flex items-center gap-0.5">
        <ToolbarButton label="Align left" active={editor?.isActive({ textAlign: "left" })} disabled={!canEdit} onClick={() => editor?.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Align center" active={editor?.isActive({ textAlign: "center" })} disabled={!canEdit} onClick={() => editor?.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Align right" active={editor?.isActive({ textAlign: "right" })} disabled={!canEdit} onClick={() => editor?.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Justify" active={editor?.isActive({ textAlign: "justify" })} disabled={!canEdit} onClick={() => editor?.chain().focus().setTextAlign("justify").run()}>
          <AlignJustify className="size-3.5" />
        </ToolbarButton>
      </div>
      <ToolbarDivider />
      <div className="flex items-center gap-0.5">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => insertImage(editor, e)}
        />
        <ToolbarButton label="Insert image" disabled={!canEdit} onClick={() => imageInputRef.current?.click()}>
          <ImageIcon className="size-3.5" />
        </ToolbarButton>
        {editor ? (
          <EvidencePickerPopover
            draft={draft}
            editor={editor}
            open={evidenceOpen}
            onOpenChange={setEvidenceOpen}
            trigger={
              <ToolbarButton label="Insert evidence" onClick={() => setEvidenceOpen(true)}>
                <FileText className="size-3.5" />
              </ToolbarButton>
            }
          />
        ) : (
          <ToolbarButton label="Insert evidence" disabled onClick={() => undefined}>
            <FileText className="size-3.5" />
          </ToolbarButton>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] text-[var(--ds-muted)] tabular-nums" aria-live="polite">
          {dirty ? "Saving…" : "Saved"}
        </span>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--ds-ink)] px-2.5 text-[11px] font-medium text-white transition hover:opacity-90"
        >
          <Check className="size-3.5" />
          Done
        </button>
      </div>
    </div>
  );
}
