import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { LetterPreview } from "@/components/editor/LetterPreview";
import { ReviewRail } from "@/components/editor/ReviewRail";
import { Button } from "@/components/ui/button";
import { getLetterMeta } from "@/lib/letters/catalog";
import { WizardSidebar } from "@/components/editor/WizardSidebar";

/**
 * Review step — the page between Evidence & Attachments and the new
 * Finalize ship-gate. 3-column layout matching the rest of the wizard:
 *
 *   [WizardSidebar] [LetterPreview]  [ReviewRail]
 *      sections        clean letter     verdict + checks
 *
 *   Edit → Evidence → REVIEW → Finalize (export + sign-off lives there)
 *
 * The letter is actually visible on Review — the right rail (ReviewRail)
 * handles all the "is this ready?" signals before the user steps into
 * Finalize. Export and counsel-gate logic moved to Finalize so the user
 * gets one consolidated ship surface instead of a button-driven export
 * scattered across pages.
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
      {/* Breadcrumb header */}
      <header className="h-12 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface)] sticky top-0 z-30 flex items-center px-4 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav(`/editor/${draft.id}/evidence`)}
          className="text-[12px]"
        >
          <ArrowLeft className="size-3.5 mr-1.5" />
          Evidence
        </Button>
        <span className="text-[var(--ds-subtle)]">/</span>
        <span className="text-[13px] font-medium text-[var(--ds-ink)]">Review</span>
        <span className="text-[12px] text-[var(--ds-muted)] hidden md:inline">
          · {meta.title}
        </span>
        {/* Right cluster — mirrors Evidence's topbar pattern:
         *   [outline back-to-previous-step] [primary next-action] */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => nav(`/editor/${draft.id}`)}
          >
            Back to editor
          </Button>
          <Button
            size="sm"
            onClick={() => nav(`/editor/${draft.id}/finalize`)}
          >
            Finalize
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </header>

      {/* 3-column layout matches Edit and Evidence:
       *   [WizardSidebar 260px] [letter preview canvas] [ReviewRail 360px]
       * Single visual rhythm across the whole wizard. The letter is now
       * actually visible on Review — previously it was buried behind
       * the checklist. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
        <aside className="hidden min-h-0 border-r border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <WizardSidebar
            draft={draft}
            current="review"
            onSelectSection={(id) => nav(`/editor/${draft.id}?section=${id}`)}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto bg-[var(--ds-canvas)] p-4 sm:p-6">
          <LetterPreview draft={draft} />
        </main>

        <aside className="hidden min-h-0 border-l border-[var(--ds-line)] bg-[var(--ds-surface)] lg:flex lg:flex-col">
          <ReviewRail
            draft={draft}
            counselReviewedBy={counselReview}
            unresolvedComments={unresolvedCommentCount}
            onJumpToSection={(sectionId) =>
              nav(`/editor/${draft.id}?section=${sectionId}`)
            }
            onJumpToEvidence={() => nav(`/editor/${draft.id}/evidence`)}
          />
        </aside>
      </div>

    </div>
  );
}
