import { Button } from "@/components/ui/button";
import { useJourney } from "@/lib/journey/stage";
import {
  REVIEW_KIND_LABELS,
  REVIEW_VERDICT_LABELS,
  currentRound,
  useReviewStore,
} from "@/lib/journey/reviews";
import { useJourneyUI } from "@/components/journey/ui-store";
import { PersonCard } from "@/components/journey/ui";

/**
 * Review step of the Progress panel (mocks f2, f3, f5). Placeholder from the
 * foundation; the review builder owns this file and replaces the body.
 * Props are fixed: { draftId }.
 */
export function ReviewStage({ draftId }: { draftId: string }) {
  const journey = useJourney(draftId);
  const recall = useReviewStore((s) => s.recall);
  const finish = useReviewStore((s) => s.finish);
  const openReviewPicker = useJourneyUI((s) => s.openReviewPicker);
  if (!journey) return null;
  const review = journey.review;

  if (review && (review.status === "out" || review.status === "back")) {
    const round = currentRound(review);
    const out = review.status === "out";
    return (
      <PersonCard
        name={review.reviewer.name || "Reviewer"}
        role={review.reviewer.role ?? REVIEW_KIND_LABELS[review.kind]}
        pill={out ? { tone: "lilac", label: "Reviewing" } : { tone: "amber", label: "Back to you" }}
      >
        {!out && round?.verdict && (
          <p className="m-0 text-[13px] font-medium text-[var(--ds-ink)]">{REVIEW_VERDICT_LABELS[round.verdict]}</p>
        )}
        {!out && round?.note && (
          <p className="m-0 mt-1 text-[13px] leading-[1.45] text-[var(--ds-body)]">{round.note}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {out ? (
            <Button size="sm" variant="outline" onClick={() => recall(review.id)}>
              Recall
            </Button>
          ) : (
            <Button size="sm" onClick={() => finish(review.id)}>
              Finish review
            </Button>
          )}
        </div>
      </PersonCard>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => openReviewPicker(draftId, { from: "panel" })} disabled={journey.primaryAction?.disabled}>
        Send for review
      </Button>
      <p className="m-0 text-[12.5px] leading-[1.45] text-[var(--ds-muted)]">
        Review is optional. You can skip it and send the letter for approval.
      </p>
    </div>
  );
}
