import { useEditor, EditorContent, BubbleMenu, type Editor } from "@tiptap/react";
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
import { isAllowedEmbeddedImageFile, isSafeImageDataUrl } from "@/lib/safe-data-url";

/**
 * Read an image file into a base64 data URL. Bounded at ~5MB raw to stop
 * users blowing the localStorage budget on a single huge screenshot. Above
 * that, the export pack should carry the original file in /evidence/ and the
 * letter body should reference it instead of embedding.
 */
const MAX_EMBED_BYTES = 5 * 1024 * 1024;
async function readImageAsDataUrl(file: File): Promise<string | null> {
  if (!isAllowedEmbeddedImageFile(file)) {
    alert("Please use a PNG, JPEG, WEBP, or GIF image.");
    return null;
  }
  if (file.size > MAX_EMBED_BYTES) {
    alert(
      `${file.name} is larger than 5 MB. Add it as evidence with the paperclip button instead. That path stores the original file at full quality and references it from the section.`
    );
    return null;
  }
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      resolve(isSafeImageDataUrl(result) ? result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
import { useEffect, useRef, useState } from "react";
import type { Draft, Section } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileText, FolderOpen, Loader2, History, Trash2, MessageSquarePlus, Sparkles, Check, X } from "lucide-react";
import { EditorToolbar } from "./EditorToolbar";
import { CommentMark } from "@/lib/tiptap/comment-mark";
import { SuggestionMark } from "@/lib/tiptap/suggestion-mark";
import { EvidenceSuggestion } from "@/lib/tiptap/evidence-suggestion";
import { FigureRef, AttachmentRef } from "@/lib/tiptap/evidence-refs";
import { RemoteImageEmbed } from "@/lib/tiptap/remote-image-embed";
import { RefinePopover } from "./RefinePopover";
import { CommentPopover } from "./CommentPopover";
import { EvidencePickerPopover } from "./EvidencePickerPopover";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { linkedEvidenceForSection } from "@/lib/evidence";
import { Paperclip } from "lucide-react";
import { PendingChangeCard } from "./PendingChangeCard";
import { useDraftStore } from "@/lib/store";

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
  /** Accept the AI's pending proposal for this section. */
  onAcceptPending?: () => void;
  /** Reject the AI's pending proposal for this section. */
  onRejectPending?: () => void;
  isStreaming: boolean;
  active: boolean;
  onFocus: () => void;
  /** When false (e.g. draft is awaiting review and viewer is a reviewer,
   * or status is "approved"), Tiptap blocks edits. Defaults to true. */
  editable?: boolean;
  /**
   * "card" (default): the bordered section card used by the Evidence step.
   * "paper": the 14B letter workspace, where sections sit on one white page
   * with quiet titles and hover-only section actions.
   */
  variant?: "card" | "paper";
  /** Hide the per-section format toolbar (the document bar's format row
   * drives the focused section instead). */
  hideToolbar?: boolean;
  /** Reports this section's editor when it gains focus, so the document
   * bar can drive formatting for whichever section is being edited. */
  onEditorFocus?: (editor: Editor) => void;
  /** Called once the section's editor exists, so the toolbar has a target before anything is focused. */
  onEditorReady?: (editor: Editor) => void;
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
  onAcceptPending,
  onRejectPending,
  onOpenEvidenceBinder,
  isStreaming,
  active,
  onFocus,
  editable = true,
  variant = "card",
  hideToolbar = false,
  onEditorFocus,
  onEditorReady,
}: Props) {
  const paper = variant === "paper";
  const onEditorFocusRef = useRef(onEditorFocus);
  onEditorFocusRef.current = onEditorFocus;
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const lastWrittenContent = useRef<string>(section.html);
  const linkedEvidence = linkedEvidenceForSection(draft, section.id);

  // Keep a live ref to the draft so the slash-command extension always
  // sees the latest evidence list. useEditor only runs its extensions
  // factory once, so we can't pass `draft.evidence` directly — by the
  // time the user opens the menu, that array would be stale.
  const draftRef = useRef(draft);
  draftRef.current = draft;

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
      // Track-changes primitive — see src/lib/tiptap/suggestion-mark.ts. Marks
      // proposed reviewer / AI / consultant edits as <ins>/<del> with status
      // attributes; merge helpers fold accepted edits into canonical text.
      SuggestionMark,
      // Evidence reference tokens — render the [See Fig N] / [See Attachments]
      // spans inserted by the picker / slash command as atomic inline nodes
      // instead of letting Tiptap drop them on the floor as unknown HTML
      // (which is what produced the "literal HTML appears in the editor"
      // bug). Round-trips the existing `<span class="figure-ref" …>` and
      // `<span class="attachment-ref" …>` HTML shape so the export pipeline
      // (sourceHtml.ts → buildFiguresAppendix) and the figure-renumber pass
      // (resolveFigureRefsInHtml) keep working unchanged.
      FigureRef,
      AttachmentRef,
      // Pattern C: type "/" in the editor body → inline picker for
      // evidence references. Filters draft.evidence by name/content,
      // inserts "[See Fig N]" on Enter. The getItems closure reads
      // from a ref so the menu reflects the current draft, not the
      // draft snapshot at editor-mount time.
      EvidenceSuggestion.configure({
        getItems: () => draftRef.current.evidence ?? [],
      }),
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
      // Images pasted or dropped from a web page arrive with a remote src,
      // which the export sanitiser drops. Embed them as data URLs right away
      // (or leave a visible "[image not embedded]" note when the fetch fails).
      RemoteImageEmbed,
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
    editable: !isStreaming && editable,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      if (html !== lastWrittenContent.current) {
        lastWrittenContent.current = html;
        onChange(html);
      }
    },
    onFocus: ({ editor: ed }) => {
      onFocus();
      onEditorFocusRef.current?.(ed as Editor);
    },
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
        // Click inside a pending <ins>/<del> → surface a small floating
        // accept/reject bubble for THAT suggestion only. The "Accept all"
        // affordance lives in the canvas banner; this bubble is the
        // per-pill control. Anchored at the element's bounding rect so
        // the bubble follows the suggestion regardless of selection state.
        const sugEl = target?.closest?.(
          "ins[data-suggestion-id], del[data-suggestion-id]",
        ) as HTMLElement | null;
        if (sugEl) {
          const status = sugEl.getAttribute("data-status") ?? "pending";
          if (status === "pending") {
            const id = sugEl.getAttribute("data-suggestion-id");
            const kindAttr = sugEl.getAttribute("data-suggestion-kind");
            const kind: "insertion" | "deletion" =
              kindAttr === "deletion" ? "deletion" : "insertion";
            if (id) {
              setPendingSuggestion({
                id,
                kind,
                body: sugEl.getAttribute("data-body"),
                rect: sugEl.getBoundingClientRect(),
              });
              return true;
            }
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

  // Inline track-changes accept/reject — when the user clicks inside a
  // pending <ins>/<del> mark, we capture which suggestion to act on +
  // anchor the floating bubble at the click point.
  const setSuggestionStatusAction = useDraftStore((s) => s.setSuggestionStatus);
  const [pendingSuggestion, setPendingSuggestion] = useState<{
    id: string;
    kind: "insertion" | "deletion";
    body?: string | null;
    rect: DOMRect;
  } | null>(null);

  // Evidence picker (Pattern A) + drawer (Pattern D) state for the section-
  // header paperclip. Clicking the paperclip on this section's header focuses
  // the editor at the cursor's last position and opens the inline picker so
  // the user can insert a [See Fig N] reference. The drawer is the overflow
  // path when there are 5+ evidence items, triggered from the popover's
  // "See all evidence →" link.
  const [evidencePopoverOpen, setEvidencePopoverOpen] = useState(false);
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);

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
  // While streaming, throttle setContent to ~60ms — without this, each
  // streamed token triggers a full reparse + reflow, causing visible
  // jitter where text appears to wrap mid-line as the doc rebuilds.
  // 60ms is faster than the eye can perceive (~16 fps still feels smooth)
  // but lets the browser settle between updates.
  // Give the toolbar a target once the editor exists (after mount).
  useEffect(() => {
    if (editor && !editor.isDestroyed) onEditorReadyRef.current?.(editor as Editor);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (section.html === editor.getHTML()) return;
    if (section.html === lastWrittenContent.current) return;

    if (!isStreaming) {
      // Final sync (or non-streaming change) — apply immediately.
      editor.commands.setContent(section.html || "", false);
      lastWrittenContent.current = section.html;
      return;
    }

    const handle = setTimeout(() => {
      // Re-check inside the timeout — the editor may have been replaced
      // and section.html may have changed again. Re-read the latest.
      if (!editor || editor.isDestroyed) return;
      if (section.html === editor.getHTML()) return;
      editor.commands.setContent(section.html || "", false);
      lastWrittenContent.current = section.html;
    }, 60);
    return () => clearTimeout(handle);
  }, [section.html, editor, isStreaming]);

  // Toggle editability when streaming starts/stops OR when the parent
  // flips the editable prop (e.g. draft enters review with reviewer role).
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isStreaming && editable);
  }, [editor, isStreaming, editable]);

  return (
    <section
      data-section-id={section.id}
      data-section-kind={section.sectionId}
      data-streaming={isStreaming || undefined}
      className={cn(
        paper
          ? // Paper: no card chrome. Sections flow down one white page; a
            // faint wash marks the section being edited.
            // The hover menu floats above the text (no reserved height), so
            // the page reads as one letter and nothing jumps on hover.
            "section-node lw-section group/sec relative"
          : [
              // Mobile: strip the card chrome so text gets full viewport width
              // and the section title becomes a top divider only. Card returns at md:+.
              "section-node bg-white transition-shadow",
              "md:rounded-md md:border",
              active
                ? "md:border-foreground/20 md:shadow-sm"
                : "md:border-letter-rule",
              isStreaming && "md:border-primary/40",
              // On mobile, draw a subtle top divider between stacked sections
              // (except the first; visual handled by sibling spacing).
              "[&:not(:first-child)]:border-t [&:not(:first-child)]:border-letter-rule md:[&:not(:first-child)]:border-t-0",
            ],
      )}
      onClick={onFocus}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-2",
          paper
            ? "pointer-events-none absolute -top-9 right-0 z-20 font-sans"
            : "px-3 py-2 md:border-b md:border-letter-rule",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={
              paper
                ? "sr-only"
                : "text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate"
            }
          >
            {section.title}
          </span>
          {isStreaming && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] text-[var(--ds-blue-fg)]",
                paper && "rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-1 text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)]",
              )}
            >
              <Loader2 className="size-3 animate-spin" />
              Drafting
            </span>
          )}
          {section.status === "edited" && !paper && (
            <span className="inline-flex items-center text-[11px] text-[var(--ds-amber-fg)]">Edited</span>
          )}
          {section.status === "ready" && !paper && (
            <span className="inline-flex items-center text-[11px] text-[var(--ds-green-fg)]">Ready</span>
          )}
        </div>
        <div
          className={cn(
            "flex items-center gap-0.5",
            // Paper: a small floating menu over the section's top right,
            // shown when the section is hovered, focused or being edited.
            paper &&
              "pointer-events-auto rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-0.5 shadow-[var(--ds-shadow-m)] transition-[opacity,visibility] duration-[120ms] md:invisible md:opacity-0 md:group-hover/sec:visible md:group-hover/sec:opacity-100 md:group-focus-within/sec:visible md:group-focus-within/sec:opacity-100",
            // Phones: only the section being edited shows its actions.
            paper && !active && "max-md:hidden",
            paper && active && "md:visible md:opacity-100",
          )}
        >
          {/* Section-header paperclip — the primary "insert evidence" affordance.
           *
           * Behaviour:
           *   - 0 evidence items on the draft → click navigates to the Evidence
           *     step (legacy path; user needs to add their first item before
           *     they can reference it).
           *   - 1+ evidence items → click opens the EvidencePickerPopover with
           *     this section's editor as the insertion target. Picking an item
           *     inserts a [See Fig N] reference at the cursor. At 5+ items the
           *     popover footer offers "See all evidence →" which switches to
           *     the full drawer (Pattern D).
           *
           * Visible in both employee AND employer modes — evidence is a
           * universal HR-letter concern, not employee-specific. */}
          {(() => {
            const evidenceCount = (draft.evidence ?? []).length;
            const hasEvidence = evidenceCount > 0;

            // EMPTY STATE — no Radix wrapper. onClick navigates to the
            // Evidence step (legacy fallback so the user can add their
            // first item before they can reference anything).
            if (!hasEvidence || !editor) {
              return (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEvidenceBinder?.();
                  }}
                  aria-label="Open Evidence & Attachments — add evidence first"
                  title="No evidence yet. Click to open Evidence & Attachments"
                >
                  <Paperclip className="size-3.5" />
                </Button>
              );
            }

            // POPULATED STATE — wrap in EvidencePickerPopover. Radix's
            // PopoverTrigger owns the open/close toggle on click; we MUST
            // NOT also toggle state ourselves or the two cancel out and
            // the popover flashes open then immediately closed.
            //
            // We use onMouseDown (fires BEFORE Radix's click handler) to
            // pre-focus the section editor at end of content so [See Fig N]
            // insertion has a valid cursor target. The popover's
            // onOpenAutoFocus is already prevented, so the editor keeps
            // focus while the popover is open.
            const paperclipBtn = (
              <Button
                size="icon"
                variant="ghost"
                className="size-7 relative text-[var(--ds-muted)]"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (editor && !editor.isFocused) {
                    editor.commands.focus("end");
                  }
                }}
                onClick={(e) => {
                  // Don't toggle state — Radix's PopoverTrigger does it.
                  // We only stop propagation so the parent section card's
                  // onClick=onFocus doesn't double-fire.
                  e.stopPropagation();
                }}
                aria-label={
                  linkedEvidence.length > 0
                    ? `${linkedEvidence.length} linked — insert evidence at cursor`
                    : "Insert evidence at cursor"
                }
                title={
                  linkedEvidence.length > 0
                    ? `${linkedEvidence.length} linked · click to insert at cursor`
                    : "Insert evidence at cursor"
                }
              >
                <Paperclip className="size-3.5" />
                {linkedEvidence.length > 0 && (
                  <span className="ds-mono absolute -top-1 -right-1 inline-flex items-center justify-center size-3.5 text-[9px] font-semibold rounded-full bg-[var(--ds-accent)] text-[var(--ds-on-accent)]">
                    {linkedEvidence.length}
                  </span>
                )}
              </Button>
            );

            return (
              <EvidencePickerPopover
                draft={draft}
                editor={editor}
                open={evidencePopoverOpen}
                onOpenChange={setEvidencePopoverOpen}
                onOpenDrawer={() => {
                  setEvidencePopoverOpen(false);
                  setEvidenceDrawerOpen(true);
                }}
                trigger={paperclipBtn}
              />
            );
          })()}
          {paper && onOpenEvidenceBinder && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEvidenceBinder();
              }}
              aria-label="Evidence for this section"
              title="Evidence for this section"
            >
              <FolderOpen className="size-3.5" />
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
                  <span className="ds-mono absolute -top-1 -right-1 inline-flex items-center justify-center size-3.5 text-[9px] font-semibold rounded-full bg-[var(--ds-accent)] text-[var(--ds-on-accent)]">
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
            disabled={isStreaming || !editable}
            aria-label="Clear section"
          >
            <Trash2 className="size-3.5" />
          </Button>
          <RefinePopover
            disabled={isStreaming || !editable}
            onRefineRegenerate={(instruction) => onRegenerate(instruction)}
            onPlainRegenerate={() => onRegenerate()}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                disabled={isStreaming || !editable}
                className="h-7 px-2 text-xs"
                onClick={(e) => e.stopPropagation()}
                aria-label={paper ? "Refine this section" : undefined}
              >
                <Sparkles className="size-3 mr-1" />
                {paper ? "Refine" : "Regenerate"}
              </Button>
            }
          />
        </div>
      </header>
      {linkedEvidence.length > 0 && !paper && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--ds-muted)]",
            paper
              ? "mb-1 rounded-[var(--ds-r-s)] bg-[var(--ds-surface-2)] font-sans md:hidden md:group-hover/sec:flex md:group-focus-within/sec:flex"
              : "border-b border-letter-rule bg-[var(--ds-surface-2)]",
            paper && active && "md:flex",
          )}
        >
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
      {active && !hideToolbar && (
        <div className={cn(paper && "mb-2 overflow-hidden rounded-[var(--ds-r-s)] border border-[var(--ds-line)]")}>
          <EditorToolbar editor={editor} draft={draft} />
        </div>
      )}

      {/* Pending AI change for this section. Two render modes:
       *   - "card" (legacy): Cursor-style before/after card above the editor.
       *   - "inline" (default): the diff lives inside section.html as
       *     <ins>/<del> marks rendered by the editor; the card is skipped
       *     and per-suggestion accept/reject runs from the floating bubble. */}
      {section.pendingChange && (section.pendingChange.diffViewMode ?? "inline") === "card" && (
        <div className={paper ? "pb-2 pt-1 font-sans" : "px-7 pt-4"}>
          <PendingChangeCard
            section={section}
            canResolve={editable}
            onAccept={() => onAcceptPending?.()}
            onReject={() => onRejectPending?.()}
          />
        </div>
      )}

      <div className={paper ? "pb-3" : "px-3 py-3 md:px-7 md:py-5"}>
        {editor && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{
              duration: 80,
              placement: "top",
              // Keep the bubble inside the viewport — without this it
              // clips off the right edge on mobile when the selection
              // is near the page-margin boundary.
              popperOptions: {
                modifiers: [
                  {
                    name: "preventOverflow",
                    options: { boundary: "viewport", padding: 8 },
                  },
                  {
                    name: "flip",
                    options: { fallbackPlacements: ["bottom", "right", "left"] },
                  },
                ],
              },
            }}
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
              className="inline-flex items-center gap-1 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2 py-1 font-sans text-xs font-medium text-[var(--ds-on-accent)] shadow-[var(--ds-shadow-m)] hover:bg-[var(--ds-accent-hover)]"
            >
              <MessageSquarePlus className="size-3" />
              Comment
            </button>
          </BubbleMenu>
        )}
        {/* Edit mode uses Tailwind Typography's prose-sm — sans-serif
         * (Geist, inherited from body), comfortable line-height, designed
         * for writing. The serif look of the export render lives in
         * Preview (paged.js) and Edit-on-page (single-page contenteditable
         * — both use Iowan Old Style). Two intentional fonts: one for
         * writing, one for proofing. */}
        <EditorContent
          editor={editor}
          className={cn(
            "prose max-w-none focus:outline-none [&_strong]:font-semibold [&_a]:underline [&_table]:border [&_table]:border-letter-rule [&_th]:border [&_th]:border-letter-rule [&_td]:border [&_td]:border-letter-rule [&_th]:bg-muted/40 [&_th]:text-left [&_th]:p-2 [&_td]:p-2",
            paper ? "prose-base" : "prose-sm [&_p]:my-2 [&_p]:leading-relaxed",
          )}
        />
      </div>
      {/* Pattern D — Evidence drawer. Mounted once per section, opens when
       * the popover's "See all evidence →" overflow is clicked (5+ items).
       * Renders via Sheet's own portal so position doesn't matter. */}
      <EvidenceDrawer
        draft={draft}
        editor={editor}
        open={evidenceDrawerOpen}
        onOpenChange={setEvidenceDrawerOpen}
      />

      {/* Per-suggestion accept/reject bubble — floats over the editor at the
       * clicked <ins>/<del> mark. Single-suggestion target (vs the
       * canvas-level "Accept all" banner). Closes on outside click via the
       * useEffect below. */}
      {/* Locked drafts (approved, viewer, reviewer in review) can't accept or
       * reject suggestions; the bubble only appears where editing is allowed. */}
      {pendingSuggestion && editable && (
        <SuggestionAcceptBubble
          rect={pendingSuggestion.rect}
          kind={pendingSuggestion.kind}
          body={pendingSuggestion.body}
          onAccept={() => {
            setSuggestionStatusAction(draft.id, pendingSuggestion.id, "accepted");
            setPendingSuggestion(null);
          }}
          onReject={() => {
            setSuggestionStatusAction(draft.id, pendingSuggestion.id, "rejected");
            setPendingSuggestion(null);
          }}
          onDismiss={() => setPendingSuggestion(null)}
        />
      )}
    </section>
  );
}

/**
 * Floating accept/reject bubble for a single inline suggestion mark.
 * Positioned absolutely against the viewport at the clicked mark's
 * bounding rect — anchored on top by default, flipped to bottom when
 * we'd otherwise clip off-screen. Outside click dismisses.
 */
function SuggestionAcceptBubble({
  rect,
  kind,
  body,
  onAccept,
  onReject,
  onDismiss,
}: {
  rect: DOMRect;
  kind: "insertion" | "deletion";
  body?: string | null;
  onAccept: () => void;
  onReject: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Outside-click dismissal — listens at document level so it catches
  // clicks anywhere outside the bubble (toolbar, other sections, the
  // canvas). Mousedown (not click) so we beat any other handler that
  // might re-target focus.
  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (el.contains(event.target as Node)) return;
      onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  // Place above the mark. Flip to below when the top edge would land
  // off-screen. Centered horizontally on the mark's midpoint.
  const top = rect.top - 44 < 8 ? rect.bottom + 6 : rect.top - 38;
  const left = Math.max(8, rect.left + rect.width / 2 - 90);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${kind === "insertion" ? "Proposed insertion" : "Proposed deletion"}: accept or reject`}
      className="fixed z-50 inline-flex items-center gap-1 rounded-[var(--ds-r-m)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-1.5 py-1 font-sans text-[12px] text-[var(--ds-ink)] shadow-[var(--ds-shadow-m)]"
      style={{ top, left }}
    >
      <span
        className={
          "rounded-[var(--ds-r-s)] px-1.5 py-0.5 text-[11px] font-medium " +
          (kind === "insertion"
            ? "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]"
            : "bg-[var(--ds-surface-2)] text-[var(--ds-muted)]")
        }
        title={body ?? undefined}
      >
        {kind === "insertion" ? "Insert" : "Delete"}
      </span>
      <button
        type="button"
        onClick={onAccept}
        className="inline-flex h-6 items-center gap-1 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-2 font-medium text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]"
        title="Accept this suggestion"
      >
        <Check className="size-3" />
        Accept
      </button>
      <button
        type="button"
        onClick={onReject}
        className="inline-flex h-6 items-center gap-1 rounded-[var(--ds-r-s)] px-2 text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
        title="Reject this suggestion"
      >
        <X className="size-3" />
        Reject
      </button>
    </div>
  );
}
