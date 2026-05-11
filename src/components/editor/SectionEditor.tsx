import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";

/**
 * Read an image file into a base64 data URL. Bounded at ~5MB raw to stop
 * users blowing the localStorage budget on a single huge screenshot. Above
 * that, the export pack should carry the original file in /evidence/ and the
 * letter body should reference it instead of embedding.
 */
const MAX_EMBED_BYTES = 5 * 1024 * 1024;
async function readImageAsDataUrl(file: File): Promise<string | null> {
  if (file.size > MAX_EMBED_BYTES) {
    alert(
      `${file.name} is larger than 5 MB. Add it as evidence via the 📎 button instead — that path stores the original file at full quality and references it from the section.`
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
import { useEffect, useRef, useState } from "react";
import type { Draft, Section } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, History, Trash2, MessageSquarePlus, Sparkles } from "lucide-react";
import { EditorToolbar } from "./EditorToolbar";
import { CommentMark } from "@/lib/tiptap/comment-mark";
import { RefinePopover } from "./RefinePopover";
import { CommentPopover } from "./CommentPopover";
import { linkedEvidenceForSection } from "@/lib/evidence";
import { Paperclip } from "lucide-react";

type Props = {
  /** Parent draft — needed for the inline CommentPopover. */
  draft: Draft;
  section: Section;
  onChange: (html: string) => void;
  onRegenerate: (refineInstruction?: string) => void;
  onClear: () => void;
  onShowHistory: () => void;
  /**
   * Open the right-rail Comments tab focused on this section. Used for the
   * "Open thread" link inside the inline CommentPopover. (The inline
   * popover handles the actual comment post itself.)
   */
  onOpenCommentsThread?: () => void;
  /** Bring an existing inline-anchored comment into focus in the right rail. */
  onFocusComment?: (commentId: string) => void;
  /** Number of unresolved comments on this section (badge count). */
  commentCount?: number;
  /** Open the evidence and attachments step with this section preselected. */
  onOpenEvidenceBinder?: () => void;
  isStreaming: boolean;
  active: boolean;
  onFocus: () => void;
};

export function SectionEditor({
  draft,
  section,
  onChange,
  onRegenerate,
  onClear,
  onShowHistory,
  onOpenCommentsThread,
  onFocusComment,
  commentCount = 0,
  onOpenEvidenceBinder,
  isStreaming,
  active,
  onFocus,
}: Props) {
  const lastWrittenContent = useRef<string>(section.html);
  const linkedEvidence = linkedEvidenceForSection(draft, section.id);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, code: false }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Placeholder.configure({ placeholder: `Write the ${section.title.toLowerCase()}…` }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      CommentMark,
      // Inline images — paste/drop a screenshot or click the toolbar 🖼 button
      // to embed it directly into the section. Stored as base64 in the section
      // HTML so it travels through PDF + DOCX export untouched. Best-fit for
      // evidence sections (witnesses, evidence_attached, chronology) where you
      // need a screenshot or page-clip inline rather than as a separate file.
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: "section-image",
          style: "max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0;",
        },
      }),
      // Word-doc-style alignment (left / center / right / justify) on
      // paragraphs + headings. Applied via a data-text-align attribute
      // that the sanitiser already preserves on <p>/<h*>.
      TextAlign.configure({
        types: ["paragraph", "heading"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
    ],
    content: section.html || "",
    editable: !isStreaming,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      if (html !== lastWrittenContent.current) {
        lastWrittenContent.current = html;
        onChange(html);
      }
    },
    onFocus,
    editorProps: {
      handleClickOn(_view, _pos, _node, _nodePos, event) {
        const target = event.target as HTMLElement | null;
        const mark = target?.closest?.("mark[data-comment-id]") as HTMLElement | null;
        if (mark && onFocusComment) {
          const id = mark.getAttribute("data-comment-id");
          if (id) {
            onFocusComment(id);
            return true;
          }
        }
        return false;
      },
      // Paste an image straight from the clipboard (cmd+V after a screenshot)
      // or drop an image file onto the section. Both flow into the same
      // base64-embed path that the toolbar button uses.
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.kind === "file" && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            void readImageAsDataUrl(file).then((src) => {
              if (src) view.dispatch(view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src, alt: file.name })
              ));
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

  // Captured at the moment the comment popover opens — the editor's
  // selection range, the quoted text, and the mark-applier. Cleared when
  // the popover closes.
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{
    quote?: string;
    applyMark?: (commentId: string) => void;
  }>({});

  /**
   * Open the inline CommentPopover. If text is selected we anchor the
   * future comment to it (quote + mark); otherwise it becomes a
   * section-level comment.
   */
  const openCommentPopover = () => {
    if (!editor) {
      setCommentTarget({});
      setCommentOpen(true);
      return;
    }
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setCommentTarget({});
    } else {
      const quote = editor.state.doc.textBetween(from, to, " ").trim();
      setCommentTarget({
        quote: quote || undefined,
        applyMark: (commentId: string) => {
          editor
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .setCommentMark(commentId)
            .run();
        },
      });
    }
    setCommentOpen(true);
  };

  // Re-sync when the section html changes externally (streaming or regen).
  useEffect(() => {
    if (!editor) return;
    if (section.html === editor.getHTML()) return;
    if (section.html === lastWrittenContent.current) return;
    editor.commands.setContent(section.html || "", false);
    lastWrittenContent.current = section.html;
  }, [section.html, editor]);

  // Toggle editability when streaming starts/stops.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isStreaming);
  }, [editor, isStreaming]);

  return (
    <section
      data-section-id={section.id}
      data-streaming={isStreaming || undefined}
      className={cn(
        "section-node rounded-md border bg-white transition-shadow",
        active ? "border-foreground/20 shadow-sm" : "border-letter-rule",
        isStreaming && "border-primary/40"
      )}
      onClick={onFocus}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-letter-rule">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
            {section.title}
          </span>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-[10px] text-primary">
              <Loader2 className="size-3 animate-spin" />
              drafting
            </span>
          )}
          {section.status === "edited" && (
            <span className="inline-flex items-center text-[10px] text-amber-700">edited</span>
          )}
          {section.status === "ready" && (
            <span className="inline-flex items-center text-[10px] text-green-700">ready</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {draft.mode === "employee" && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 relative"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEvidenceBinder?.();
              }}
              aria-label={
                linkedEvidence.length > 0
                  ? `${linkedEvidence.length} linked evidence items — open Evidence & Attachments`
                  : "Open Evidence & Attachments for this section"
              }
              title={
                linkedEvidence.length > 0
                  ? `${linkedEvidence.length} linked · click to open Evidence & Attachments`
                  : "Open Evidence & Attachments"
              }
            >
              <Paperclip className="size-3.5" />
              {linkedEvidence.length > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center size-3.5 text-[9px] font-bold rounded-full bg-[var(--accent-9)] text-[var(--accent-contrast)]">
                  {linkedEvidence.length}
                </span>
              )}
            </Button>
          )}
          <CommentPopover
            draft={draft}
            sectionId={section.id}
            quote={commentTarget.quote}
            applyMark={commentTarget.applyMark}
            onOpenThread={() => onOpenCommentsThread?.()}
            open={commentOpen}
            onOpenChange={(next) => {
              setCommentOpen(next);
              if (!next) setCommentTarget({});
            }}
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="size-7 relative"
                onClick={(e) => { e.stopPropagation(); openCommentPopover(); }}
                aria-label={commentCount > 0 ? `${commentCount} comments` : "Add comment"}
              >
                <MessageSquarePlus className="size-3.5" />
                {commentCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center size-3.5 text-[9px] font-bold rounded-full bg-[var(--accent-9)] text-[var(--accent-contrast)]">
                    {commentCount}
                  </span>
                )}
              </Button>
            }
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={(e) => { e.stopPropagation(); onShowHistory(); }}
            disabled={section.versions.length === 0}
            aria-label="Version history"
          >
            <History className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            disabled={isStreaming}
            aria-label="Clear section"
          >
            <Trash2 className="size-3.5" />
          </Button>
          <RefinePopover
            disabled={isStreaming}
            onRefineRegenerate={(instruction) => onRegenerate(instruction)}
            onPlainRegenerate={() => onRegenerate()}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                disabled={isStreaming}
                className="h-7 px-2 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <Sparkles className="size-3 mr-1" />
                Regenerate
              </Button>
            }
          />
        </div>
      </header>
      {linkedEvidence.length > 0 && (
        <div className="flex items-center gap-2 border-b border-letter-rule bg-[var(--ds-surface-2)] px-3 py-1.5 text-[11px] text-[var(--ds-muted)]">
          <FileText className="size-3.5 shrink-0" />
          <span className="shrink-0 font-medium text-[var(--ds-body)]">Evidence</span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {linkedEvidence.slice(0, 3).map((item) => (
              <span
                key={item.id}
                title={item.parsedSummary || item.content || item.filename}
                className="max-w-[160px] truncate rounded-full bg-[var(--ds-line-2)] px-2 py-0.5"
              >
                {item.filename || item.kind}
              </span>
            ))}
            {linkedEvidence.length > 3 && (
              <span className="shrink-0">+{linkedEvidence.length - 3}</span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenEvidenceBinder?.();
            }}
            className="shrink-0 text-[var(--ds-ink)] hover:underline"
          >
            Manage
          </button>
        </div>
      )}
      {active && <EditorToolbar editor={editor} draft={draft} />}
      <div className="px-7 py-5">
        {editor && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{ duration: 80, placement: "top" }}
            shouldShow={({ editor: ed, from, to }) => {
              if (ed.isActive("commentMark")) return false;
              return from !== to;
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                openCommentPopover();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md shadow-sm bg-[var(--ds-ink)] text-white hover:opacity-90"
            >
              <MessageSquarePlus className="size-3" />
              Comment
            </button>
          </BubbleMenu>
        )}
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none focus:outline-none [&_p]:my-2 [&_p]:leading-relaxed [&_strong]:font-semibold [&_a]:underline [&_table]:border [&_table]:border-letter-rule [&_th]:border [&_th]:border-letter-rule [&_td]:border [&_td]:border-letter-rule [&_th]:bg-muted/40 [&_th]:text-left [&_th]:p-2 [&_td]:p-2"
        />
      </div>
    </section>
  );
}
