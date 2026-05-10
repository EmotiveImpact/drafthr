import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useEffect, useRef } from "react";
import type { Section } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, History, Trash2, MessageSquarePlus, Sparkles } from "lucide-react";
import { EditorToolbar } from "./EditorToolbar";
import { CommentMark } from "@/lib/tiptap/comment-mark";
import { RefinePopover } from "./RefinePopover";

type Props = {
  section: Section;
  onChange: (html: string) => void;
  onRegenerate: (refineInstruction?: string) => void;
  onClear: () => void;
  onShowHistory: () => void;
  /**
   * Open the comment composer for this section.
   * If `quote` is given the composer prefills with the quoted text and
   * applies a CommentMark to the selection on post.
   */
  onAddComment?: (opts?: { quote?: string; applyMark?: (commentId: string) => void }) => void;
  /** Bring an existing inline-anchored comment into focus in the right rail. */
  onFocusComment?: (commentId: string) => void;
  /** Number of unresolved comments on this section (badge count). */
  commentCount?: number;
  isStreaming: boolean;
  active: boolean;
  onFocus: () => void;
};

export function SectionEditor({
  section,
  onChange,
  onRegenerate,
  onClear,
  onShowHistory,
  onAddComment,
  onFocusComment,
  commentCount = 0,
  isStreaming,
  active,
  onFocus,
}: Props) {
  const lastWrittenContent = useRef<string>(section.html);

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
    },
  });

  const onAddCommentForSelection = () => {
    if (!editor || !onAddComment) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      onAddComment();
      return;
    }
    const quote = editor.state.doc.textBetween(from, to, " ").trim();
    onAddComment({
      quote: quote || undefined,
      applyMark: (commentId: string) => {
        editor.chain().focus().setTextSelection({ from, to }).setCommentMark(commentId).run();
      },
    });
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
          {onAddComment && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 relative"
              onClick={(e) => { e.stopPropagation(); onAddCommentForSelection(); }}
              aria-label={commentCount > 0 ? `${commentCount} comments` : "Add comment"}
            >
              <MessageSquarePlus className="size-3.5" />
              {commentCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center size-3.5 text-[9px] font-bold rounded-full bg-[var(--accent-9)] text-[var(--accent-contrast)]">
                  {commentCount}
                </span>
              )}
            </Button>
          )}
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
      {active && <EditorToolbar editor={editor} />}
      <div className="px-7 py-5">
        {editor && onAddComment && (
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
              onMouseDown={(e) => { e.preventDefault(); onAddCommentForSelection(); }}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md shadow-sm bg-[var(--gray-12)] text-[var(--gray-1)] hover:bg-[var(--gray-11)]"
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
