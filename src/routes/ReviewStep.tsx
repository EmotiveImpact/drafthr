import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, MessageSquarePlus, PenLine } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/ds";
import { Wordmark } from "@/components/ds/Wordmark";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { PagedlyDocEditor } from "@/components/editor/paged-edit/PagedlyDocEditor";
import { ReviewRail } from "@/components/editor/ReviewRail";
import { CollabReviewRail } from "@/components/editor/CollabReviewRail";
import { ReviewDialog, type ReviewDialogKind } from "@/components/editor/ReviewDialog";
import { canEditDraft } from "@/lib/permissions";
import { notifyReviewRequested } from "@/lib/collab-notify";
import { Button } from "@/components/ui/button";
import { getLetterMeta } from "@/lib/letters/catalog";
import { WizardChrome } from "@/components/editor/WizardChrome";
import { counselAttestationForDraft } from "@/lib/finalize/readiness";

type PendingComment = {
  sectionId: string;
  quote?: string;
  applyMark?: (commentId: string) => void;
  /** Pre-assigned id when pagedly already wrote the highlight span. */
  commentId?: string;
};

/**
 * Review step — the assessment page between Edit and Finalise. This is the
 * home of the COLLABORATIVE REVIEW surface (reviewers, suggestions, comments,
 * approval), sitting alongside the read-only letter preview.
 *
 *   [ 300px  Health sidebar ] [ letter preview ] [ 340px collaborative Review rail ]
 *
 *   Edit → REVIEW → Finalise (ship gate lives there)
 *
 * Health/Improve audit lives in the left sidebar's second tab; the right rail
 * is the review workspace (comment / suggest / approve). Evidence is a drawer
 * accessible from Edit; it is no longer a wizard step.
 */
export function ReviewStep() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const role = useProfileStore((s) => s.profile.workspaceRole);

  const [reviewDialogKind, setReviewDialogKind] = useState<ReviewDialogKind | null>(null);
  const [pendingComment, setPendingComment] = useState<PendingComment | null>(null);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  // "Suggest edit" chosen from an on-page selection → the rail opens its dialog.
  const [suggestFor, setSuggestFor] = useState<{ sectionId: string; quote?: string } | null>(
    null,
  );

  // On-page selection popover: select any text in the letter → Comment / Suggest.
  // This is the app's own affordance (not pagedly's toolbar) so it is discoverable
  // and works for EVERYONE — a reviewer on a read-only page can still select text
  // and comment/suggest, and the author gets the same one-click bubble.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selBubble, setSelBubble] = useState<{
    top: number;
    left: number;
    sectionId: string;
    quote: string;
  } | null>(null);

  useEffect(() => {
    const onSelectionChange = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelBubble(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = (node.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
      // Selection must sit inside the letter canvas — ignore stray page selections.
      if (!el || !canvas.contains(el)) {
        setSelBubble(null);
        return;
      }
      // pagedly stamps data-section-id on each block; the read-only preview uses
      // data-section-anchor. Anchor the new comment/suggestion to whichever we hit.
      const sectionEl = el.closest<HTMLElement>("[data-section-id],[data-section-anchor]");
      const sectionId =
        sectionEl?.getAttribute("data-section-id") ??
        sectionEl?.getAttribute("data-section-anchor") ??
        "";
      // No single owning section — a selection spanning two sections resolves to
      // the shared ancestor above both wrappers. Don't guess a fallback: it would
      // silently anchor the comment/suggestion to the wrong section. Dismiss.
      if (!sectionId) {
        setSelBubble(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelBubble(null);
        return;
      }
      // A selection with no actual text (element-boundary artifacts) is not
      // commentable/suggestable — don't offer the bubble for it. Selection
      // .toString() is layout-dependent (returns "" in unrendered/background
      // tabs); Range.toString() is DOM-based and always reflects the text.
      const quote = (sel.toString() || range.toString()).trim().slice(0, 240);
      if (!quote) {
        setSelBubble(null);
        return;
      }
      // Fixed-position (viewport) coords — the pagedly canvas scrolls internally,
      // so a container-relative bubble wouldn't track. We dismiss on scroll below.
      // Flip below the selection when it sits too close to the top to fit above.
      setSelBubble({
        top: rect.top < 52 ? rect.bottom + 8 : rect.top - 44,
        left: rect.left + rect.width / 2,
        sectionId,
        quote,
      });
    };
    const dismiss = () => setSelBubble(null);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [draft]);

  // The bubble's onMouseDown preventDefault keeps the selection alive through
  // the click, so the LIVE selection is the most trustworthy source for the
  // quoted text; the bubble state is the fallback (a stray selectionchange —
  // e.g. from pagedly's own selection handling — can overwrite it late).
  const readQuote = () => {
    const s = window.getSelection();
    const live =
      s && s.rangeCount > 0 ? s.toString() || s.getRangeAt(0).toString() : "";
    return live.trim().slice(0, 240) || selBubble?.quote || "";
  };

  const commentOnSelection = () => {
    if (!selBubble) return;
    setPendingComment({ sectionId: selBubble.sectionId, quote: readQuote() || undefined });
    setSelBubble(null);
    window.getSelection()?.removeAllRanges();
  };
  const suggestOnSelection = () => {
    if (!selBubble) return;
    // Mirror the rail's picker: don't stack a second suggestion on a section
    // that already has an open pending change (it would silently replace it).
    const section = draft?.sections.find((s) => s.id === selBubble.sectionId);
    if (section?.pendingChange) {
      toast("This section already has a pending suggestion — resolve it first.");
      setSelBubble(null);
      return;
    }
    setSuggestFor({ sectionId: selBubble.sectionId, quote: readQuote() || undefined });
    setSelBubble(null);
    window.getSelection()?.removeAllRanges();
  };

  if (!draft || !draftId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted-foreground">Draft not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => nav("/")}>
          <ArrowLeft className="size-4 mr-1" /> Back home
        </Button>
      </div>
    );
  }

  const meta = getLetterMeta(draft.letterType);
  const reviewStatus = draft.reviewStatus ?? "draft";
  const canResolve = canEditDraft(role, reviewStatus);

  // Counsel-review status surfaced in ReviewRail. The actual export gate
  // moved to Finalize, but the rail still wants to know whether a review
  // has been attached so it can render the green tick.
  const counselReview = counselAttestationForDraft(draft) ?? null;

  const unresolvedCommentCount = (draft.comments ?? []).filter((c) => !c.resolved).length;

  const onReviewSubmit = (input: { reviewerName: string; body: string; reviewerUserId?: string }) => {
    if (!reviewDialogKind) return;
    const store = useDraftStore.getState();
    if (reviewDialogKind === "submit") {
      store.submitForReview(draft.id, input.reviewerName, input.body);
      if (input.reviewerUserId) {
        notifyReviewRequested(draft.id, input.reviewerUserId, input.body || undefined);
      }
      toast.success("Submitted for approval");
    } else if (reviewDialogKind === "approve") {
      store.approveDraft(draft.id, input.reviewerName, input.body);
      toast.success("Draft approved");
    } else if (reviewDialogKind === "request_changes") {
      store.requestChanges(draft.id, input.reviewerName, input.body);
      toast("Changes requested");
    }
  };

  const onWithdraw = () => {
    useDraftStore.getState().withdrawForReview(draft.id);
    toast("Withdrawn from review");
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      <header className="h-14 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30 flex items-center px-4 gap-2">
        <Link
          to="/"
          aria-label="Home"
          className="shrink-0 flex items-center gap-2 rounded-md hover:bg-[var(--ds-line-2)] transition px-1.5 py-1 -mx-1.5 h-10 mr-2"
        >
          <BrandMark size={36} />
          <Wordmark size={16} className="hidden sm:inline" />
        </Link>
        <span className="text-[13px] font-medium text-[var(--ds-ink)]">Review</span>
        <span className="text-[12px] text-[var(--ds-muted)] hidden md:inline">· {meta.title}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => nav(`/editor/${draft.id}`)}>
            <ArrowLeft className="size-3.5 mr-1.5" />
            Edit
          </Button>
          <Button size="sm" onClick={() => nav(`/editor/${draft.id}/finalize`)}>
            Finalise
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </header>

      {/* Three columns: Health sidebar · letter · collaborative Review rail.
       * The right rail is the review workspace (comment/suggest/approve). Both
       * side rails are lg-only; below lg the letter takes the full width. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="hidden min-h-0 border-r border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <WizardChrome draftId={draft.id} mode={draft.mode} current="review" />
          <ReviewRail
            draft={draft}
            counselReviewedBy={counselReview}
            unresolvedComments={unresolvedCommentCount}
            onJumpToSection={(sectionId) => nav(`/editor/${draft.id}?section=${sectionId}`)}
            onJumpToEvidence={() => nav(`/editor/${draft.id}/evidence`)}
            onContinueToFinalize={() => nav(`/editor/${draft.id}/finalize`)}
          />
        </aside>

        <main
          ref={canvasRef}
          className="review-canvas relative min-h-0 overflow-hidden bg-[var(--ds-canvas)]"
        >
          {/* The review surface is the PAGEDLY editor (not the read-only
           * preview): comments + track-change suggestions happen ON the page.
           * A reviewer (canResolve=false) suggests (tracked <ins>/<del>); the
           * author edits directly. Both persist their marks. Select any text to
           * get the Comment / Suggest bubble (see selBubble below). */}
          <PagedlyDocEditor
            draft={draft}
            reviewMode
            // Respect the review-lock: a reviewer/approved draft is read-only
            // on the page (they comment + suggest via the rail); the author
            // (canResolve) gets on-page comments + direct editing of their draft.
            readOnly={!canResolve}
            onCommentAdd={(commentId, quotedText) => {
              // Pagedly wrote the highlight span synchronously; find which
              // section it landed in, then open the rail composer for it,
              // sharing pagedly's id so the thread and highlight line up.
              const span = document.querySelector<HTMLElement>(
                `[data-comment-id="${commentId}"]`,
              );
              const anchor = span?.closest<HTMLElement>("[data-section-anchor],[data-section-id]");
              const sectionId =
                anchor?.getAttribute("data-section-anchor") ??
                anchor?.getAttribute("data-section-id") ??
                draft.sections[0]?.id ??
                "";
              setPendingComment({ sectionId, quote: quotedText, commentId });
            }}
            onCommentClick={(commentId) => setFocusCommentId(commentId)}
          />
        </main>

        <aside className="hidden min-h-0 border-l border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <CollabReviewRail
            draft={draft}
            role={role}
            canResolve={canResolve}
            onOpenReviewDialog={(kind) => setReviewDialogKind(kind)}
            onWithdraw={onWithdraw}
            pendingComment={pendingComment}
            onPendingCommentConsumed={() => setPendingComment(null)}
            focusCommentId={focusCommentId}
            onFocusCommentConsumed={() => setFocusCommentId(null)}
            openSuggest={suggestFor}
            onOpenSuggestConsumed={() => setSuggestFor(null)}
          />
        </aside>
      </div>

      {/* On-page selection popover — the discoverable Comment / Suggest bubble.
       * Fixed to the viewport at the selection; onMouseDown preventDefault keeps
       * the selection alive long enough for the click to read it. */}
      {selBubble && (
        <div
          role="toolbar"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            top: selBubble.top,
            left: selBubble.left,
            transform: "translateX(-50%)",
            zIndex: 50,
          }}
          className="flex items-center gap-0.5 rounded-lg bg-[var(--ds-ink)] p-0.5 text-white shadow-[0_6px_20px_rgba(0,0,0,0.22)]"
        >
          <button
            type="button"
            onClick={commentOnSelection}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium hover:bg-white/15"
          >
            <MessageSquarePlus className="size-3.5" /> Comment
          </button>
          <div className="h-4 w-px bg-white/20" />
          <button
            type="button"
            onClick={suggestOnSelection}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium hover:bg-white/15"
          >
            <PenLine className="size-3.5" /> Suggest edit
          </button>
        </div>
      )}

      {reviewDialogKind && (
        <ReviewDialog
          open
          onOpenChange={(next) => !next && setReviewDialogKind(null)}
          kind={reviewDialogKind}
          onSubmit={onReviewSubmit}
        />
      )}
    </div>
  );
}
