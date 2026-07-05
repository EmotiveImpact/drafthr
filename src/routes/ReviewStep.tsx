import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/ds";
import { Wordmark } from "@/components/ds/Wordmark";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { LetterPreview } from "@/components/editor/LetterPreview";
import { ReviewRail } from "@/components/editor/ReviewRail";
import { CollabReviewRail } from "@/components/editor/CollabReviewRail";
import { ReviewDialog, type ReviewDialogKind } from "@/components/editor/ReviewDialog";
import { canEditDraft } from "@/lib/permissions";
import { notifyReviewRequested } from "@/lib/collab-notify";
import { Button } from "@/components/ui/button";
import { getLetterMeta } from "@/lib/letters/catalog";
import { WizardChrome } from "@/components/editor/WizardChrome";

type PendingComment = {
  sectionId: string;
  quote?: string;
  applyMark?: (commentId: string) => void;
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

        <main className="min-h-0 overflow-y-auto bg-[var(--ds-canvas)] p-4 sm:p-6">
          <LetterPreview
            draft={draft}
            onAddComment={(sectionId, opts) =>
              setPendingComment({ sectionId, quote: opts?.quote, applyMark: opts?.applyMark })
            }
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
          />
        </aside>
      </div>

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
