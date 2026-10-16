import { useEffect, useState } from "react";
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
  quote,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  section: Section;
  /** Text the reviewer had selected on the page. When present, the composer
   *  pre-selects exactly this run inside the section copy, so typing replaces
   *  JUST the selected words — not the whole block. */
  quote?: string;
  /** Called with the reviewer's sanitised proposed HTML + optional rationale. */
  onSubmit: (proposedHtml: string, note?: string) => void;
}) {
  const [note, setNote] = useState("");
  // Whether the quoted text really is pre-selected in the composer — drives
  // the "type to replace just that part" hint so it never lies (ambiguous /
  // unfound quotes fall back to a plain cursor at the end).
  const [quoteSelected, setQuoteSelected] = useState(false);
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
  // previous open never leaks into a different section's suggestion. When the
  // reviewer arrived via an on-page text selection, pre-select that exact run
  // in the copy so typing replaces just it (the word-level diff then redlines
  // only what actually changed).
  useEffect(() => {
    if (open && editor) {
      editor.commands.setContent(section.html || "");
      setNote("");
      setQuoteSelected(false);
      // The dialog opens with Radix focus management + an animating overlay,
      // and Tiptap attaches its view a beat after mount — a single early
      // focus/select attempt can silently no-op. Verify and retry briefly.
      const timers: ReturnType<typeof setTimeout>[] = [];
      const trySelect = (attempt: number) => {
        if (editor.isDestroyed) return;
        // Only pre-select when the quote appears EXACTLY ONCE — HR letters
        // repeat short phrases (names, dates), and pre-selecting the wrong
        // occurrence while telling the user "type to replace it" would have
        // them overwrite the wrong text.
        const range = quote ? findTextRange(editor.state.doc, quote, { requireUnique: true }) : null;
        if (!range) {
          editor.commands.focus("end");
          return;
        }
        // Set the ProseMirror STATE selection (typing semantics), then mirror
        // it at the DOM level — tiptap's own focus() is unreliable inside the
        // just-opened Radix dialog, but a direct element focus + DOM Range
        // sticks, and PM adopts the DOM selection once the view has focus.
        editor.commands.setTextSelection(range);
        const dom = editor.view.dom as HTMLElement;
        dom.focus();
        try {
          const domSel = window.getSelection();
          const domRange = document.createRange();
          domRange.setStart(editor.view.domAtPos(range.from).node, editor.view.domAtPos(range.from).offset);
          domRange.setEnd(editor.view.domAtPos(range.to).node, editor.view.domAtPos(range.to).offset);
          domSel?.removeAllRanges();
          domSel?.addRange(domRange);
        } catch {
          /* domAtPos can throw during pagination churn — retry below */
        }
        const applied =
          dom.contains(document.activeElement) || document.activeElement === dom;
        if (applied) {
          setQuoteSelected(true);
        } else if (attempt < 4) {
          timers.push(setTimeout(() => trySelect(attempt + 1), 120 * (attempt + 1)));
        }
      };
      timers.push(setTimeout(() => trySelect(0), 60));
      return () => timers.forEach(clearTimeout);
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
    onSubmit(html, note.trim() || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          // We place focus ourselves (into the editor, selecting the quoted
          // text) — Radix's default autofocus would land elsewhere and
          // collapse that selection.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-w-[calc(100vw-2rem)] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_24px_48px_rgba(15,17,21,0.16)] p-4">
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
            {quote && quoteSelected
              ? "Your selected text is highlighted below. Type to replace just that part. Only what you change becomes a redline."
              : "Edit the text below. Only the words you change become a redline; the proposal doesn't touch the letter until the author accepts it."}
          </Dialog.Description>

          <EditorContent editor={editor} />

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why? (optional), for example 12 weeks from the outcome date lands on the 29th"
            className="mt-2.5 h-8 w-full rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] text-[var(--ds-ink)] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-ink)] focus:outline-none"
          />

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

/**
 * Locate `quote` inside a ProseMirror doc and return its absolute positions.
 * Searches each textblock's flattened text — a quote from a single on-page
 * selection normally lives within one paragraph. Returns null when not found
 * (e.g. quote spanned paragraphs, or the text changed since selection); the
 * caller then falls back to focusing the end.
 */
function findTextRange(
  doc: import("@tiptap/pm/model").Node,
  quote: string,
  opts?: { requireUnique?: boolean },
): { from: number; to: number } | null {
  const needle = quote.replace(/\s+/g, " ").trim();
  if (!needle) return null;
  // Whitespace-tolerant match: the on-page selection may normalise spaces
  // differently than the stored HTML, so spaces in the needle match any
  // whitespace run in the block text.
  const pattern = needle
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s+");
  const matches: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Build the block's text alongside a position map so whitespace
    // normalisation doesn't break the offset arithmetic.
    let text = "";
    const posMap: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          text += child.text[i];
          posMap.push(pos + 1 + offset + i);
        }
      }
    });
    // Collect ALL occurrences (uniqueness gate below) — a duplicated phrase
    // pre-selected at the wrong occurrence would make the reviewer overwrite
    // the wrong text.
    const re = new RegExp(pattern, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (posMap[start] != null && posMap[end - 1] != null) {
        matches.push({ from: posMap[start], to: posMap[end - 1] + 1 });
      }
      if (matches.length > 1) return false; // enough to know it's ambiguous
      if (m.index === re.lastIndex) re.lastIndex++; // zero-width safety
    }
    return matches.length <= 1;
  });
  if (matches.length === 0) return null;
  if (opts?.requireUnique && matches.length > 1) return null;
  return matches[0];
}
