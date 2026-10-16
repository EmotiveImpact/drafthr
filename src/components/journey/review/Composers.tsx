import { useEffect, useState } from "react";
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
import type { Node as PMNode } from "@tiptap/pm/model";
import { CommentMark } from "@/lib/tiptap/comment-mark";
import { SuggestionMark } from "@/lib/tiptap/suggestion-mark";
import { FigureRef, AttachmentRef } from "@/lib/tiptap/evidence-refs";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * The reviewer's two composers: suggest new wording for part of a section
 * (a copy of the section to edit; only the words that change become a
 * suggestion) and leave a comment on some words. Neither touches the letter:
 * the person who asked accepts or rejects.
 */

export function SuggestComposer({
  open,
  onOpenChange,
  sectionTitle,
  html,
  quote,
  initialNote,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionTitle: string;
  /** The section as it reads now (or the reviewer's earlier suggestion, when editing it). */
  html: string;
  quote?: string;
  initialNote?: string;
  onSubmit: (proposedHtml: string, note?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState(false);
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
      TextAlign.configure({ types: ["paragraph", "heading"], alignments: ["left", "center", "right", "justify"], defaultAlignment: "left" }),
    ],
    content: html || "",
    editorProps: {
      attributes: {
        "aria-label": `Suggested wording for ${sectionTitle}`,
        class:
          "min-h-[180px] max-h-[48vh] overflow-y-auto rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 font-serif text-[14.5px] leading-[1.6] text-[var(--ds-ink)] outline-none focus:border-[var(--ds-line-strong)] [&_p]:my-0 [&_p+p]:mt-2",
      },
    },
  });

  useEffect(() => {
    if (!open || !editor) return;
    editor.commands.setContent(html || "");
    setNote(initialNote ?? "");
    setSelected(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const trySelect = (attempt: number) => {
      if (editor.isDestroyed) return;
      const range = quote ? findUnique(editor.state.doc, quote) : null;
      if (!range) {
        editor.commands.focus("end");
        return;
      }
      editor.commands.setTextSelection(range);
      const dom = editor.view.dom as HTMLElement;
      dom.focus();
      try {
        const a = editor.view.domAtPos(range.from);
        const b = editor.view.domAtPos(range.to);
        const r = document.createRange();
        r.setStart(a.node, a.offset);
        r.setEnd(b.node, b.offset);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      } catch {
        // The view is still settling; try again below.
      }
      if (dom.contains(document.activeElement) || document.activeElement === dom) setSelected(true);
      else if (attempt < 4) timers.push(setTimeout(() => trySelect(attempt + 1), 120 * (attempt + 1)));
    };
    timers.push(setTimeout(() => trySelect(0), 60));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editor, html]);

  const submit = () => {
    if (!editor) return;
    const next = sanitizeLetterHtml(editor.getHTML());
    if (!next.trim() || next === sanitizeLetterHtml(html || "")) {
      onOpenChange(false);
      return;
    }
    onSubmit(next, note.trim() || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[600px] max-w-[calc(100vw-32px)] gap-0 rounded-[16px] p-5 sm:max-w-[600px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-[22px]">Suggest a change</DialogTitle>
        <DialogDescription className="mt-1 mb-3 text-[13px] leading-[1.45]">
          {selected
            ? `The words you picked in ${sectionTitle} are selected. Type to replace them. Only what you change becomes a suggestion.`
            : `Change the wording of ${sectionTitle} below. Only what you change becomes a suggestion, and nothing changes in the letter until it's accepted.`}
        </DialogDescription>
        <EditorContent editor={editor} />
        <label className="mt-3 block text-[13px] font-medium text-[var(--ds-ink)]" htmlFor="suggest-note">
          Why? <span className="font-normal text-[var(--ds-subtle)]">(optional)</span>
        </label>
        <input
          id="suggest-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example: naming the policy makes it easier to stand behind at an appeal"
          className="mt-1.5 h-10 w-full rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13.5px] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)] focus-visible:shadow-[var(--ds-focus-ring)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Suggest this change</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommentComposer({
  open,
  onOpenChange,
  sectionTitle,
  quote,
  initialBody,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionTitle: string;
  quote?: string;
  initialBody?: string;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  useEffect(() => {
    if (open) setBody(initialBody ?? "");
  }, [open, initialBody]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[calc(100vw-32px)] gap-0 rounded-[16px] p-5 sm:max-w-[480px]">
        <DialogTitle className="text-[22px]">Comment</DialogTitle>
        <DialogDescription className="mt-1 mb-3 text-[13px]">On {sectionTitle}</DialogDescription>
        {quote && (
          <blockquote className="m-0 mb-3 border-l-2 border-[var(--ds-amber-bd)] bg-[var(--ds-amber-soft)] py-1.5 pr-2 pl-2.5 font-serif text-[13.5px] leading-[1.5] text-[var(--ds-body)]">
            {quote}
          </blockquote>
        )}
        <textarea
          autoFocus
          aria-label="Your comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="What should they check or change?"
          className="block min-h-[96px] w-full resize-y rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2.5 text-[13.5px] leading-[1.5] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)] focus-visible:shadow-[var(--ds-focus-ring)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!body.trim()}
            onClick={() => {
              onSubmit(body.trim());
              onOpenChange(false);
            }}
          >
            Add comment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Where a quote sits in the copy, when it appears exactly once. */
function findUnique(doc: PMNode, quote: string): { from: number; to: number } | null {
  const needle = quote.replace(/\s+/g, " ").trim();
  if (!needle) return null;
  const pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  const found: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (found.length > 1) return false;
    if (!node.isTextblock) return true;
    let text = "";
    const map: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          text += child.text[i];
          map.push(pos + 1 + offset + i);
        }
      }
    });
    const re = new RegExp(pattern, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const end = m.index + m[0].length;
      if (map[m.index] != null && map[end - 1] != null) found.push({ from: map[m.index], to: map[end - 1] + 1 });
      if (found.length > 1) return false;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return true;
  });
  return found.length === 1 ? found[0] : null;
}
