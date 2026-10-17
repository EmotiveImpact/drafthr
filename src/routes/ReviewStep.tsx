import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, MessageSquarePlus, PenLine } from "lucide-react";
import { toast } from "sonner";
import { BAR_BTN, SegmentedTabs, SubPageBar } from "@/components/editor/SubPageChrome";
import { cn } from "@/lib/utils";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { PagedlyDocEditor } from "@/components/editor/paged-edit/PagedlyDocEditor";
import { ReviewRail } from "@/components/editor/ReviewRail";
import { CollabReviewRail } from "@/components/editor/CollabReviewRail";
import { ReviewDialog, type ReviewDialogKind } from "@/components/editor/ReviewDialog";
import { canEditDraft } from "@/lib/permissions";
import { finaliseBlocked, submitBlocked, useJourney } from "@/lib/journey/stage";
import { notifyReviewRequested } from "@/lib/collab-notify";
import { Button } from "@/components/ui/button";
import { useLatestReview } from "@/lib/journey/reviews";
import { isAskerOf, isReviewerOf, useMe } from "@/components/journey/review/actions";
import { requestFinishReview, requestRecall } from "@/components/journey/review/review-ui";
import { ReviewDialogsHost } from "@/components/journey/ReviewDialogsHost";
import "@/components/editor/letter-workspace.css";

type PanelTab = "edits" | "progress";

type PendingComment = {
  sectionId: string;
  quote?: string;
  applyMark?: (commentId: string) => void;
  /** Pre-assigned id when pagedly already wrote the highlight span. */
  commentId?: string;
};

/**
 * The old review address (`/editor/:id/review`), kept so old links work and
 * restyled in the letter workspace's language: the document bar (back to
 * the letter, name, status pill), the letter on the grey canvas where you
 * select text to comment or suggest, and a 380px side panel with Edits (the
 * collaborative review: reviewers, suggestions, comments, approval) and
 * Progress (health score, Fix this first, all checks, Improve).
 */
export function ReviewStep() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  // The journey as this person sees it (as in the workspace): the named
  // teammate reviewer gets their own actions, someone else's review is read
  // only.
  const review = useLatestReview(draftId);
  const me = useMe();
  const open = review && (review.status === "out" || review.status === "back") ? review : null;
  const viewerIsReviewer = Boolean(open && open.kind === "team" && isReviewerOf(open, me) && !isAskerOf(open, me));
  const viewerIsAsker = open && !viewerIsReviewer ? isAskerOf(open, me) : undefined;
  const journey = useJourney(draftId, { viewerIsReviewer, viewerIsAsker });
  const role = useProfileStore((s) => s.profile.workspaceRole);
  const myName = useProfileStore(
    (s) => s.profile.personal.preferredName || s.profile.personal.legalName,
  );

  const [reviewDialogKind, setReviewDialogKind] = useState<ReviewDialogKind | null>(null);
  const [pendingComment, setPendingComment] = useState<PendingComment | null>(null);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  // "Suggest edit" chosen from an on-page selection → the rail opens its dialog.
  const [suggestFor, setSuggestFor] = useState<{ sectionId: string; quote?: string } | null>(
    null,
  );
  // Side panel tab (14B). A new comment, a suggestion or a clicked comment
  // highlight all live in Edits, so bring that tab forward when one arrives.
  const [panelTab, setPanelTab] = useState<PanelTab>("edits");
  useEffect(() => {
    if (pendingComment || suggestFor || focusCommentId) setPanelTab("edits");
  }, [pendingComment, suggestFor, focusCommentId]);

  // On-page selection popover: select any text in the letter, then Comment or
  // Suggest. This is the app's own affordance (not pagedly's toolbar) so it is
  // discoverable and works for everyone: a reviewer on a read-only page can still select text
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
      toast("This section already has a pending suggestion. Resolve it first.");
      setSelBubble(null);
      return;
    }
    setSuggestFor({ sectionId: selBubble.sectionId, quote: readQuote() || undefined });
    setSelBubble(null);
    window.getSelection()?.removeAllRanges();
  };

  if (!draft || !draftId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
        <h1 className="m-0 font-serif text-[28px] font-normal leading-tight text-[var(--ds-ink)]">Draft not found.</h1>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-[var(--ds-muted)]">
          This letter isn't in this workspace, or it was deleted.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => nav("/")}>
          <ArrowLeft className="size-4" /> Back home
        </Button>
      </div>
    );
  }

  const reviewStatus = draft.reviewStatus ?? "draft";
  const canResolve = canEditDraft(role, reviewStatus);

  // Counsel-review status surfaced in ReviewRail. The actual export gate
  // moved to Finalize, but the rail still wants to know whether a review
  // has been attached so it can render the green tick.
  const counselReview: { reviewedBy: string; reviewedOn: string } | null = (() => {
    const last = (draft.exports ?? [])
      .slice()
      .sort((a, b) => b.exportedAt - a.exportedAt)
      .find((e) => e.reviewedBy);
    if (last?.reviewedBy && last.reviewedOn) {
      return { reviewedBy: last.reviewedBy, reviewedOn: last.reviewedOn };
    }
    const manual = (draft.answers as Record<string, unknown>)._counselReview as
      | { reviewedBy?: string; reviewedOn?: string }
      | undefined;
    if (manual?.reviewedBy && manual.reviewedOn) {
      return { reviewedBy: manual.reviewedBy, reviewedOn: manual.reviewedOn };
    }
    return null;
  })();

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

  const openSuggestions = draft.sections.filter((s) => s.pendingChange).length;
  // The same gates as the letter workspace: no Submit for approval past a
  // failing required check, Finalise only once it can be sent.
  const submitHeld = journey ? submitBlocked(journey) : null;
  const finaliseHeld = journey ? finaliseBlocked(journey) : null;
  const finalisePrimary = journey?.stage === "send" || journey?.stage === "sent";

  // While a review is out or back, the footer is the review's own next step
  // (as in the workspace: Recall, Finish review), never "Submit for
  // approval": the review is decided and finished first (LETTER-X47).
  const reviewAction = journey?.stage === "review" ? journey.primaryAction : undefined;
  const reviewFooter =
    reviewAction && (reviewAction.id === "finish-review" || reviewAction.id === "recall" || reviewAction.id === "send-back") ? (
      <>
        <p className="mb-2 text-[12px] leading-snug text-[var(--ds-muted)]">
          <b className="font-medium text-[var(--ds-ink)]">{journey!.whatNow.lead}</b>
          {journey!.whatNow.detail ? ` ${journey!.whatNow.detail}` : null}
        </p>
        {reviewAction.id === "send-back" ? (
          <Button size="sm" className="w-full" onClick={() => nav(`/editor/${draft.id}`)}>
            Open in the workspace to send it back
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            variant={reviewAction.id === "recall" ? "outline" : "default"}
            disabled={reviewAction.disabled}
            title={reviewAction.reason}
            data-journey-action={reviewAction.id}
            onClick={() => (reviewAction.id === "recall" ? requestRecall(draft.id) : requestFinishReview(draft.id))}
          >
            {reviewAction.label}
          </Button>
        )}
        {reviewAction.disabled && reviewAction.reason && (
          <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--ds-muted)]">{reviewAction.reason}</p>
        )}
      </>
    ) : undefined;

  return (
    <div className="lw-root flex min-h-0 flex-1 flex-col bg-[var(--ds-canvas)]">
      <SubPageBar
        draft={draft}
        onBack={() => nav(`/editor/${draft.id}`)}
        actions={
          <>
            <button
              type="button"
              className={BAR_BTN}
              onClick={() => nav(`/editor/${draft.id}`)}
              aria-label="Back to edit"
            >
              <span className="hidden sm:inline">Open in the workspace</span>
              <span className="sm:hidden">Letter</span>
            </button>
            <button
              type="button"
              className={cn(BAR_BTN, "disabled:pointer-events-none disabled:text-[var(--ds-faint)]")}
              disabled={Boolean(finaliseHeld)}
              title={finaliseHeld ?? undefined}
              onClick={() => nav(`/editor/${draft.id}/finalize`)}
            >
              Finalise
              <ArrowRight className="size-3.5" />
            </button>
          </>
        }
      />

      {/* 14B: the letter in the centre, one side panel with Edits (the
       * collaborative review: suggestions, comments, approval) and Progress
       * (health score, Fix this first, all checks). Both panels stay mounted
       * so composer drafts survive a tab switch. Below lg the page scrolls:
       * the letter first, then the panel, so Submit / Approve / comments stay
       * reachable on phones. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start overflow-y-auto lg:content-stretch lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
        <div data-page-main
          ref={canvasRef}
          className="review-canvas relative h-[75dvh] min-h-0 overflow-hidden bg-[var(--ds-canvas)] lg:h-auto"
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
        </div>

        <aside
          aria-label="Review panel"
          className="flex flex-col border-t border-[var(--ds-line-2)] bg-[var(--ds-surface)] lg:min-h-0 lg:border-l lg:border-t-0"
        >
          <div className="flex h-[60px] shrink-0 items-center border-b border-[var(--ds-line-2)] pl-4 pr-3">
            <SegmentedTabs<PanelTab>
              label="Review panel"
              value={panelTab}
              onChange={setPanelTab}
              tabs={[
                { id: "edits", label: "Edits", count: openSuggestions + unresolvedCommentCount },
                { id: "progress", label: "Progress" },
              ]}
            />
          </div>
          <div className={cn("flex min-h-0 flex-1 flex-col", panelTab !== "edits" && "hidden")}>
            <CollabReviewRail
              draft={draft}
              role={role}
              canResolve={canResolve}
              onOpenReviewDialog={(kind) => setReviewDialogKind(kind)}
              submitBlockedReason={submitHeld}
              stageFooter={reviewFooter}
              onWithdraw={onWithdraw}
              pendingComment={pendingComment}
              onPendingCommentConsumed={() => setPendingComment(null)}
              focusCommentId={focusCommentId}
              onFocusCommentConsumed={() => setFocusCommentId(null)}
              openSuggest={suggestFor}
              onOpenSuggestConsumed={() => setSuggestFor(null)}
            />
          </div>
          <div className={cn("flex min-h-0 flex-1 flex-col", panelTab !== "progress" && "hidden")}>
            <ReviewRail
              draft={draft}
              counselReviewedBy={counselReview}
              unresolvedComments={unresolvedCommentCount}
              onJumpToSection={(sectionId) => nav(`/editor/${draft.id}?section=${sectionId}`)}
              onJumpToEvidence={() => nav(`/editor/${draft.id}/evidence`)}
              onContinueToFinalize={() => nav(`/editor/${draft.id}/finalize`)}
              finaliseBlockedReason={finaliseHeld}
              finalisePrimary={finalisePrimary}
            />
          </div>
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
          className="flex items-center gap-0.5 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-[3px] text-[var(--ds-ink)] shadow-[var(--ds-shadow-l)]"
        >
          <button
            type="button"
            onClick={commentOnSelection}
            className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          >
            <MessageSquarePlus className="size-3.5" /> Comment
          </button>
          <div className="h-4 w-px bg-[var(--ds-line)]" />
          <button
            type="button"
            onClick={suggestOnSelection}
            className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
          >
            <PenLine className="size-3.5" /> Suggest edit
          </button>
        </div>
      )}

      {/* Recall and Finish review confirm in the review loop's dialogs. */}
      <ReviewDialogsHost />

      {reviewDialogKind && (
        <ReviewDialog
          open
          onOpenChange={(next) => !next && setReviewDialogKind(null)}
          kind={reviewDialogKind}
          defaultReviewerName={myName}
          onSubmit={onReviewSubmit}
        />
      )}
    </div>
  );
}
