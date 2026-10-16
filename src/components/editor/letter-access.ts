import { useMemo } from "react";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { canEditDraft } from "@/lib/permissions";
import { useJourney } from "@/lib/journey/stage";
import { useLatestReview, useNewestReview } from "@/lib/journey/reviews";
import { isAskerOf, isReviewerOf, useMe } from "@/components/journey/review/actions";
import { evidenceSharedWith } from "@/components/journey/review/model";
import { submittedEntry, viewerIsApproverFor } from "./letter-facts";

/**
 * Who is looking at a letter and what they may change, worked out the same
 * way as the letter workspace (Editor.tsx): the named teammate reviewer sees
 * only the evidence they were given and changes nothing; nobody changes the
 * letter or its evidence while the journey has it locked (out for review,
 * with the approver, approved, sent) or when their role cannot edit.
 * For the letter's sub-pages (Evidence), so they cannot do what the
 * workspace would not allow.
 */
export function useLetterAccess(draftId: string | undefined): {
  draft: Draft | undefined;
  /** The draft as this person may see it (a reviewer: only the shared evidence). */
  shown: Draft | undefined;
  viewerIsReviewer: boolean;
  canEdit: boolean;
  /** Why it is read only, in a sentence, when it is. */
  lockedReason?: string;
} {
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const profile = useProfileStore((s) => s.profile);
  const review = useLatestReview(draftId);
  const newest = useNewestReview(draftId);
  const me = useMe();
  const reviewerOf = newest?.status === "recalled" ? newest : review;
  const viewerIsReviewer = Boolean(
    reviewerOf?.kind === "team" &&
      (reviewerOf.status === "out" || reviewerOf.status === "back" || reviewerOf.status === "recalled") &&
      isReviewerOf(reviewerOf, me) &&
      !isAskerOf(reviewerOf, me)
  );
  const approverName = draft ? submittedEntry(draft)?.reviewerName : undefined;
  const viewerIsApprover = draft ? viewerIsApproverFor(draft, profile, approverName) : false;
  const viewerIsAsker =
    review && (review.status === "out" || review.status === "back") && !viewerIsReviewer ? isAskerOf(review, me) : undefined;
  const journey = useJourney(draftId, { viewerIsApprover, viewerIsReviewer, viewerIsAsker });
  const roleCanEdit = draft ? canEditDraft(profile.workspaceRole, draft.reviewStatus ?? "draft") : false;
  const canEdit = Boolean(draft && journey && roleCanEdit && !journey.locked && !viewerIsReviewer);
  const shown = useMemo(
    () =>
      draft && viewerIsReviewer && reviewerOf ? { ...draft, evidence: evidenceSharedWith(draft.evidence, reviewerOf.share) } : draft,
    [draft, viewerIsReviewer, reviewerOf]
  );
  let lockedReason: string | undefined;
  if (draft && !canEdit) {
    if (viewerIsReviewer) lockedReason = "You can read the evidence you were given. Only the author changes it.";
    else if (!roleCanEdit) lockedReason = "Your role can read this letter's evidence but not change it.";
    else if (journey?.stage === "review") lockedReason = "Editing is paused while the letter is out for review. Recall it to change the evidence.";
    else if (journey?.stage === "approve") lockedReason = "Editing is paused while the letter is with the approver.";
    else lockedReason = "This letter is locked, so its evidence cannot change.";
  }
  return { draft, shown, viewerIsReviewer, canEdit, lockedReason };
}
