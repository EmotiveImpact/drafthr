import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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
import { SuggestionMark } from "@/lib/tiptap/suggestion-mark";
import { FigureRef, AttachmentRef } from "@/lib/tiptap/evidence-refs";
import { Lightbulb, X } from "lucide-react";
import type { Section } from "@/lib/letters/types";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";

/**
 * Reviewer "Suggest an edit" composer. Mounts a SEPARATE, minimal Tiptap
 * instance seeded with a copy of the section — it deliberately does NOT touch
 * the main canvas editor, so a reviewer proposing a change can't disturb the
 * author's live text or the data-loss-sensitive persist path. On submit the
 * edited HTML is sanitised and handed back to stage a pendingChange authored
 * by the reviewer (the author then Accepts/Rejects the attributed diff).
 */
export function SuggestEditDialog({
  open,
  onOpenChange,
  section,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  section: Section;
  /** Called with the reviewer's sanitised proposed HTML. */
  onSubmit: (proposedHtml: string) => void;
}) {
  // Schema MUST be a superset of what SectionEditor can hold, or Tiptap drops
  // unknown nodes/marks (tables, images, figure refs, comment/suggestion marks)
  // when it parses the seed HTML — and the no-op guard would then let a reviewer
  // stage a proposal that silently strips them. Mirror the section editor's set
  // (minus the authoring-only Placeholder + slash-command picker).
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
      SuggestionMark,
      FigureRef,
      AttachmentRef,
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({
        types: ["paragraph", "heading"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
    ],
    content: section.html || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[220px] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 text-[13.5px] leading-relaxed text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]",
      },
    },
  });

  // Re-seed when the dialog (re)opens for a section so a stale buffer from a
  // previous open never leaks into a different section's suggestion.
  useEffect(() => {
    if (open && editor) {
      editor.commands.setContent(section.html || "");
      // Defer focus so the dialog is mounted first.
      const t = setTimeout(() => editor.commands.focus("end"), 30);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section.id, editor]);

  const submit = () => {
    if (!editor) return;
    const html = sanitizeLetterHtml(editor.getHTML());
    const original = sanitizeLetterHtml(section.html || "");
    // No change → just close; don't stage an empty suggestion.
    if (!html.trim() || html === original) {
      onOpenChange(false);
      return;
    }
    onSubmit(html);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-[var(--ds-muted)]" />
              <Dialog.Title className="text-[14px] font-semibold text-[var(--ds-ink)] m-0">
                Suggest an edit
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-[12.5px] text-[var(--ds-muted)] mb-3 leading-snug">
            Edit the text below. Your version is proposed to the author as a
            suggestion — it doesn't change the letter until they accept it.
          </Dialog.Description>

          <EditorContent editor={editor} />

          <div className="mt-4 flex items-center justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </Dialog.Close>
            <Button size="sm" onClick={submit}>
              Suggest this change
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
