import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/ds";
import { Wordmark } from "@/components/ds/Wordmark";
import { useDraftStore } from "@/lib/store";
import { LetterPreview } from "@/components/editor/LetterPreview";
import { ReviewRail } from "@/components/editor/ReviewRail";
import { Button } from "@/components/ui/button";
import { getLetterMeta } from "@/lib/letters/catalog";
import { WizardChrome } from "@/components/editor/WizardChrome";

/**
 * Review step — the assessment page between Edit and Finalise. 2-column
 * layout matching the rest of the wizard:
 *
 *   [WizardSidebar 300px: Sections | Health tabs] [LetterPreview — full width]
 *
 *   Edit → REVIEW → Finalise (ship gate lives there)
 *
 * Health/Improve audit surface lives in the left sidebar's second tab
 * (the VS Code / Figma primary-nav-on-the-left pattern). No right rail,
 * no dock pill, no drawer overlay.
 *
 * Evidence is a drawer accessible from Edit; it is no longer a wizard step.
 */
export function ReviewStep() {
  const { draftId } = useParams<{ draftId: string }>();
  const nav = useNavigate();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));

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

  const unresolvedCommentCount = (draft.comments ?? []).filter(
    (c) => !c.resolved
  ).length;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ds-canvas)]">
      {/* Header. Brand + breadcrumb text on the left; step navigation
       * buttons on the right (Edit ↔ Finalise). The old ghost ← Edit
       * back-link was removed — the right-side "Edit" button is the
       * single, explicit back-to-Edit action, paired with Finalise. */}
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
        <span className="text-[12px] text-[var(--ds-muted)] hidden md:inline">
          · {meta.title}
        </span>
        {/* Right cluster: Edit (back to previous step) + Finalise (forward). */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => nav(`/editor/${draft.id}`)}
          >
            <ArrowLeft className="size-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            size="sm"
            onClick={() => nav(`/editor/${draft.id}/finalize`)}
          >
            Finalise
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </header>

      {/* Layout — 2 columns: left sidebar (Health-only) + letter canvas.
       *   [Stepper + ReviewRail 300px] [LetterPreview — full remaining width]
       * 300px matches the Edit sidebar so the wizard step transitions
       * don't shift the canvas. Wide enough for Health verdict text +
       * Fix-this-first titles to read on a single line. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <WizardChrome draftId={draft.id} mode={draft.mode} current="review" />
          <ReviewRail
            draft={draft}
            counselReviewedBy={counselReview}
            unresolvedComments={unresolvedCommentCount}
            onJumpToSection={(sectionId) =>
              nav(`/editor/${draft.id}?section=${sectionId}`)
            }
            onJumpToEvidence={() => nav(`/editor/${draft.id}/evidence`)}
            onContinueToFinalize={() => nav(`/editor/${draft.id}/finalize`)}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto bg-[var(--ds-canvas)] p-4 sm:p-6">
          <LetterPreview draft={draft} />
        </main>
      </div>
    </div>
  );
}
