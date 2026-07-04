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
      `${file.name} is larger than 5 MB. Add it as evidence via the 📎 button instead — that path stores the original file at full quality and references it from the section.`
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
import { FileText, Loader2, History, Trash2, MessageSquarePlus, Sparkles, Check, X } from "lucide-react";
import { EditorToolbar } from "./EditorToolbar";
import { CommentMark } from "@/lib/tiptap/comment-mark";
import { SuggestionMark } from "@/lib/tiptap/suggestion-mark";
import { EvidenceSuggestion } from "@/lib/tiptap/evidence-suggestion";
import { FigureRef, AttachmentRef } from "@/lib/tiptap/evidence-refs";
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
}: Props) {
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
      data-streaming={isStreaming || undefined}
      className={cn(
        // Mobile: strip the card chrome so text gets full viewport width
        // — section title becomes a top divider only. Card returns at md:+.
        "section-node bg-white transition-shadow",
        "md:rounded-md md:border",
        active
          ? "md:border-foreground/20 md:shadow-sm"
          : "md:border-letter-rule",
        isStreaming && "md:border-primary/40",
        // On mobile, draw a subtle top divider between stacked sections
        // (except the first — visual handled by sibling spacing).
        "[&:not(:first-child)]:border-t [&:not(:first-child)]:border-letter-rule md:[&:not(:first-child)]:border-t-0"
      )}
      onClick={onFocus}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2 md:border-b md:border-letter-rule">
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
                  title="No evidence yet — click to open Evidence & Attachments"
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
                className="size-7 relative"
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
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center size-3.5 text-[9px] font-bold rounded-full bg-[var(--accent-9)] text-[var(--accent-contrast)]">
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

      {/* Pending AI change for this section. Two render modes:
       *   - "card" (legacy): Cursor-style before/after card above the editor.
       *   - "inline" (default): the diff lives inside section.html as
       *     <ins>/<del> marks rendered by the editor; the card is skipped
       *     and per-suggestion accept/reject runs from the floating bubble. */}
      {section.pendingChange && (section.pendingChange.diffViewMode ?? "inline") === "card" && (
        <div className="px-7 pt-4">
          <PendingChangeCard
            section={section}
            canResolve={editable}
            onAccept={() => onAcceptPending?.()}
            onReject={() => onRejectPending?.()}
          />
        </div>
      )}

      <div className="px-3 py-3 md:px-7 md:py-5">
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
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md shadow-sm bg-[var(--ds-ink)] text-white hover:opacity-90"
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
          className="prose prose-sm max-w-none focus:outline-none [&_p]:my-2 [&_p]:leading-relaxed [&_strong]:font-semibold [&_a]:underline [&_table]:border [&_table]:border-letter-rule [&_th]:border [&_th]:border-letter-rule [&_td]:border [&_td]:border-letter-rule [&_th]:bg-muted/40 [&_th]:text-left [&_th]:p-2 [&_td]:p-2"
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
      {pendingSuggestion && (
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
      aria-label={`${kind === "insertion" ? "Proposed insertion" : "Proposed deletion"} — accept or reject`}
      className="fixed z-50 inline-flex items-center gap-1 rounded-md shadow-md bg-[var(--ds-ink)] text-white px-1.5 py-1 text-[11.5px]"
      style={{ top, left }}
    >
      <span
        className={
          "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-[0.06em] " +
          (kind === "insertion"
            ? "bg-[var(--ds-green-fg)]/30"
            : "bg-[var(--ds-red-fg)]/40")
        }
        title={body ?? undefined}
      >
        {kind === "insertion" ? "Insert" : "Delete"}
      </span>
      <button
        type="button"
        onClick={onAccept}
        className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-[var(--ds-green-fg)] text-white hover:brightness-110 font-medium"
        title="Accept this suggestion"
      >
        <Check className="size-3" />
        Accept
      </button>
      <button
        type="button"
        onClick={onReject}
        className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-white/15 text-white hover:bg-white/25"
        title="Reject this suggestion"
      >
        <X className="size-3" />
        Reject
      </button>
    </div>
  );
}
