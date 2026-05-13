import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Node } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
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
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils";

import { EvidencePickerPopover } from "../EvidencePickerPopover";

/**
 * Shared building blocks for both PaginatedEditableLetter (V1, the
 * single-page scrolling editor we ship today) and
 * PaginatedEditableLetterV2 (the pixel-perfect paged.js-backed render
 * gated behind a feature flag).
 *
 * Anything that touches the TipTap document model (extensions, section
 * splitting, the section-anchor sentinel) needs to behave identically
 * across both surfaces so the user can flip between them and see the
 * same content split into the same sections on save.
 */

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Invisible block node inserted before each section's content. Carries
 * the section id as a data attribute so we can split content back into
 * the right sections on save. atom + display:none so it never
 * contributes height or shows in the rendered letter.
 */
export const SectionAnchor = Node.create({
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

export const EDITOR_EXTENSIONS = [
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
];

export function buildMergedHtml(draft: Draft): string {
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
 * map by accumulating siblings between each <div data-section-anchor>
 * marker. Content before the first anchor is dropped (shouldn't happen
 * in normal use — the editor always starts with an anchor).
 */
export function splitHtmlBySection(fullHtml: string): Record<string, string> {
  const doc = new DOMParser().parseFromString(`<div>${fullHtml}</div>`, "text/html");
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

/* ============================================================================
 * Toolbar — shared between V1 and V2.
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

export function PagedEditToolbar({
  draft,
  editor,
  dirty,
  onDone,
  rightSlot,
}: {
  draft: Draft;
  editor: Editor | null;
  dirty: boolean;
  onDone: () => void;
  /** Optional extra UI between the saved-state indicator and Done. */
  rightSlot?: ReactNode;
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
        {rightSlot}
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
