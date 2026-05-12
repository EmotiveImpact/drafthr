import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
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

import type { Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { cn } from "@/lib/utils";

import { EvidencePickerPopover } from "./EvidencePickerPopover";

/**
 * Editable letter — pixel-perfect match to the read-only PaginatedLetter
 * visual (paged.js output), but the content is fully editable via TipTap.
 *
 * Architecture:
 *   - ChromeStack: a column of decorative A4 page cards (white bg, slate
 *     border, drop shadow, 24px gaps, footer with "Page n of N"). These
 *     are *visual only* — they don't contain editable content. Their
 *     count is computed from the editor's content height.
 *   - ContentLayer: the actual TipTap editors, one per draft.section,
 *     fused into a continuous flow. Positioned over the chrome stack
 *     with margins matching paged.js's @page rule (1in top, 1.1in sides,
 *     1.2in bottom).
 *
 * Pixel-perfect details (matching PaginatedLetter):
 *   - A4 page card: 8.27in × 11.69in, slate-200 border, 4px radius
 *   - Drop shadow: 0 2px 8px / 0 6px 24px rgba(black, 0.04 / 0.06)
 *   - Inter-page gap: 24px
 *   - Margins: 1in top, 1.1in left/right, 1.2in bottom
 *   - Page footer: "Page n of N" in Geist 9pt slate-400, centred
 *   - Typography: Iowan Old Style / Georgia 11pt 1.55 line-height
 *
 * Save: each section's editor → 500ms debounced → updateSection(...).
 */

const SAVE_DELAY_MS = 500;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// A4 dimensions matching paged.js's @page rule.
const PAGE_W_IN = 8.27;
const PAGE_H_IN = 11.69;
const PAGE_GAP_PX = 24;
// Margins in inches — must match wrapInPrintHtml @page values exactly.
const MARGIN_TOP_IN = 1.0;
const MARGIN_SIDE_IN = 1.1;
const MARGIN_BOTTOM_IN = 1.2;
// Content area per page = page height − top − bottom margins.
const CONTENT_PER_PAGE_IN = PAGE_H_IN - MARGIN_TOP_IN - MARGIN_BOTTOM_IN; // 9.49in

const EDITOR_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true }),
  Placeholder.configure({
    placeholder: "Continue writing this section…",
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
];

export function PaginatedEditableLetter({
  draft,
  onDone,
}: {
  draft: Draft;
  onDone: () => void;
}) {
  const updateSection = useDraftStore((state) => state.updateSection);
  const editorsRef = useRef<Map<string, Editor>>(new Map());
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    draft.sections[0]?.id ?? null,
  );
  const [registeredVersion, setRegisteredVersion] = useState(0);
  const [dirtySections, setDirtySections] = useState<Set<string>>(() => new Set());

  // Page count is computed from the content layer's measured height.
  // Recomputed on every editor update via the dirty handler.
  const contentLayerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);

  const recomputePageCount = useCallback(() => {
    const layer = contentLayerRef.current;
    if (!layer) return;
    // Convert px → in using 96px/in (the standard CSS conversion). The
    // editor padding equals top + bottom margins, so content height is
    // total layer height minus those.
    const layerPx = layer.scrollHeight;
    const contentPx = Math.max(0, layerPx - (MARGIN_TOP_IN + MARGIN_BOTTOM_IN) * 96);
    const contentIn = contentPx / 96;
    const pages = Math.max(1, Math.ceil(contentIn / CONTENT_PER_PAGE_IN));
    setPageCount((prev) => (prev === pages ? prev : pages));
  }, []);

  // Re-measure on mount and whenever any section's editor reports
  // dirty state — covers typing, paste, image insert, etc.
  useLayoutEffect(() => {
    recomputePageCount();
  }, [recomputePageCount, registeredVersion, dirtySections]);

  // Also re-measure on window resize (rare, but A4 width is fixed so
  // wrapping changes can shift the height).
  useEffect(() => {
    const onResize = () => recomputePageCount();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recomputePageCount]);

  const activeEditor = useMemo(() => {
    if (activeSectionId) {
      const editor = editorsRef.current.get(activeSectionId);
      if (editor) return editor;
    }
    return editorsRef.current.values().next().value ?? null;
  }, [activeSectionId, registeredVersion]);

  const handleRegister = useCallback((sectionId: string, editor: Editor | null) => {
    if (editor) editorsRef.current.set(sectionId, editor);
    else editorsRef.current.delete(sectionId);
    setRegisteredVersion((v) => v + 1);
  }, []);

  const handleDirtyChange = useCallback(
    (sectionId: string, dirty: boolean) => {
      setDirtySections((curr) => {
        const next = new Set(curr);
        if (dirty) next.add(sectionId);
        else next.delete(sectionId);
        return next;
      });
      // Re-measure on every keystroke so the chrome stack grows with content.
      requestAnimationFrame(recomputePageCount);
    },
    [recomputePageCount],
  );

  const flushAllSections = useCallback(() => {
    draft.sections.forEach((section) => {
      const editor = editorsRef.current.get(section.id);
      if (!editor) return;
      const html = editor.getHTML();
      if (html !== section.html) updateSection(draft.id, section.id, html);
      handleDirtyChange(section.id, false);
    });
  }, [draft.id, draft.sections, handleDirtyChange, updateSection]);

  const handleDone = useCallback(() => {
    flushAllSections();
    onDone();
  }, [flushAllSections, onDone]);

  const styleScope = `paginated-editable-${draft.id.slice(0, 8)}`;

  // Each chrome card sits at top: (i * (pageHeight + pageGap)) from the
  // top of the chrome layer. Using `top` rather than flex so the cards
  // align to predictable Y offsets the content can reason about.
  const pages = Array.from({ length: pageCount }, (_, i) => i);

  return (
    <div className="paginated-editable-shell">
      <PagedEditToolbar
        editor={activeEditor}
        draft={draft}
        dirtyCount={dirtySections.size}
        pageCount={pageCount}
        onDone={handleDone}
      />

      <style>{`
        .${styleScope} .pe-stage {
          position: relative;
          width: ${PAGE_W_IN}in;
          max-width: 100%;
          margin: 0 auto;
          /* Stage tall enough for every chrome card + the gaps between
           * them. Content is positioned on top via the content layer. */
          min-height: calc(${PAGE_H_IN}in * var(--pe-pages) + ${PAGE_GAP_PX}px * (var(--pe-pages) - 1));
        }
        .${styleScope} .pe-chrome-stack {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .${styleScope} .pe-page-card {
          position: absolute;
          left: 0;
          width: 100%;
          height: ${PAGE_H_IN}in;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.04),
            0 6px 24px rgba(0, 0, 0, 0.06);
        }
        .${styleScope} .pe-page-footer {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0.4in;
          text-align: center;
          font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 9pt;
          color: #94a3b8;
          pointer-events: none;
        }
        .${styleScope} .pe-content {
          position: relative;
          padding: ${MARGIN_TOP_IN}in ${MARGIN_SIDE_IN}in ${MARGIN_BOTTOM_IN}in ${MARGIN_SIDE_IN}in;
          font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.55;
          color: #0f172a;
        }
        .${styleScope} .pe-letterhead {
          text-align: center;
          margin-bottom: 18pt;
        }
        .${styleScope} .pe-letterhead img {
          max-height: 120px;
          max-width: 100%;
        }
        .${styleScope} .pe-signature-image {
          margin: 6pt 0 4pt;
        }
        .${styleScope} .pe-signature-image img {
          max-height: 54px;
        }
        .${styleScope} .ProseMirror {
          outline: none;
          min-height: 1.5em;
        }
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

      <div className={cn("pe-bg bg-slate-100 px-4 py-5 min-h-full", styleScope)}>
        <div
          className="pe-stage"
          style={{ ["--pe-pages" as string]: String(pageCount) }}
        >
          {/* Decorative chrome layer — N page cards stacked with 24px gaps,
           * each with its own "Page n of N" footer. Pointer-events:none so
           * the content layer's editor remains clickable. */}
          <div className="pe-chrome-stack" aria-hidden>
            {pages.map((i) => (
              <div
                key={i}
                className="pe-page-card"
                style={{ top: `calc(${i} * (${PAGE_H_IN}in + ${PAGE_GAP_PX}px))` }}
              >
                <div className="pe-page-footer">Page {i + 1} of {pageCount}</div>
              </div>
            ))}
          </div>

          {/* Content layer — the editable letter sits here, with margins
           * matching @page so the text aligns inside the first page card.
           * As the content grows past one page worth, the chrome layer
           * adds another card behind it, then another, etc. */}
          <div className="pe-content" ref={contentLayerRef}>
            {draft.employer.letterheadDataUrl ? (
              <div className="pe-letterhead">
                <img src={draft.employer.letterheadDataUrl} alt="Letterhead" />
              </div>
            ) : null}

            {draft.sections.map((section) => (
              <EditableSection
                key={section.id}
                draftId={draft.id}
                section={section}
                signatureDataUrl={draft.employer.signatureDataUrl}
                onActivate={setActiveSectionId}
                onDirtyChange={handleDirtyChange}
                onRegister={handleRegister}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * Per-section TipTap editor
 * ==========================================================================*/

type EditableSectionProps = {
  draftId: string;
  section: Section;
  signatureDataUrl?: string;
  onActivate: (sectionId: string) => void;
  onDirtyChange: (sectionId: string, dirty: boolean) => void;
  onRegister: (sectionId: string, editor: Editor | null) => void;
};

function EditableSection({
  draftId,
  section,
  signatureDataUrl,
  onActivate,
  onDirtyChange,
  onRegister,
}: EditableSectionProps) {
  const updateSection = useDraftStore((state) => state.updateSection);
  const timerRef = useRef<number | null>(null);
  const latestHtmlRef = useRef(section.html || "");
  const savedHtmlRef = useRef(section.html || "");

  const saveNow = useCallback(
    (html: string) => {
      if (html === savedHtmlRef.current) {
        onDirtyChange(section.id, false);
        return;
      }
      updateSection(draftId, section.id, html);
      savedHtmlRef.current = html;
      onDirtyChange(section.id, false);
    },
    [draftId, onDirtyChange, section.id, updateSection],
  );

  const editor = useEditor(
    {
      extensions: EDITOR_EXTENSIONS,
      content: section.html || "",
      editorProps: {
        attributes: { class: "outline-none" },
      },
      onFocus: () => onActivate(section.id),
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        latestHtmlRef.current = html;
        onDirtyChange(section.id, true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          saveNow(latestHtmlRef.current);
          timerRef.current = null;
        }, SAVE_DELAY_MS);
      },
    },
    [draftId, section.id],
  );

  useEffect(() => {
    onRegister(section.id, editor);
    return () => onRegister(section.id, null);
  }, [editor, onRegister, section.id]);

  useEffect(() => {
    if (!editor) return;
    const nextHtml = section.html || "";
    const currentHtml = editor.getHTML();
    const hasLocalChanges = latestHtmlRef.current !== savedHtmlRef.current;
    if (!hasLocalChanges && nextHtml !== savedHtmlRef.current && nextHtml !== currentHtml) {
      editor.commands.setContent(nextHtml, false);
      latestHtmlRef.current = nextHtml;
      savedHtmlRef.current = nextHtml;
      onDirtyChange(section.id, false);
    }
  }, [editor, onDirtyChange, section.html, section.id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      saveNow(latestHtmlRef.current);
    };
  }, [saveNow]);

  return (
    <div className="pe-section" data-section-id={section.id}>
      {section.sectionId === "signature" && signatureDataUrl ? (
        <div className="pe-signature-image">
          <img src={signatureDataUrl} alt="Signature" />
        </div>
      ) : null}
      <EditorContent editor={editor} />
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
  dirtyCount,
  pageCount,
  onDone,
}: {
  draft: Draft;
  editor: Editor | null;
  dirtyCount: number;
  pageCount: number;
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
        <ToolbarButton
          label="Bold"
          active={editor?.isActive("bold")}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor?.isActive("italic")}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor?.isActive("underline")}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
      </div>

      <ToolbarDivider />

      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Heading 2"
          active={editor?.isActive("heading", { level: 2 })}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={editor?.isActive("heading", { level: 3 })}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="size-3.5" />
        </ToolbarButton>
      </div>

      <ToolbarDivider />

      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Bullet list"
          active={editor?.isActive("bulletList")}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor?.isActive("orderedList")}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
      </div>

      <ToolbarDivider />

      <div className="flex items-center gap-0.5">
        <ToolbarButton
          label="Align left"
          active={editor?.isActive({ textAlign: "left" })}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Align center"
          active={editor?.isActive({ textAlign: "center" })}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          active={editor?.isActive({ textAlign: "right" })}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Justify"
          active={editor?.isActive({ textAlign: "justify" })}
          disabled={!canEdit}
          onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
        >
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
        <ToolbarButton
          label="Insert image"
          disabled={!canEdit}
          onClick={() => imageInputRef.current?.click()}
        >
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
          {pageCount} {pageCount === 1 ? "page" : "pages"} · {dirtyCount > 0 ? "Saving…" : "Saved"}
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
