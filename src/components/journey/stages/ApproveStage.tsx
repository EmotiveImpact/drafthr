import { useMemo } from "react";
import { CircleCheck, Check, Stamp, Undo2, CircleDot } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { canApprove, canSubmitForReview } from "@/lib/permissions";
import { useJourney } from "@/lib/journey/stage";
import { currentRound, firstName, type ReviewRequest } from "@/lib/journey/reviews";
import { PersonCard, type PersonTimelineItem } from "@/components/journey/ui";
import { Button } from "@/components/ui/button";
import { RateExpertCard } from "@/components/journey/review/parts";
import { openRoundsHistory } from "@/components/journey/review/review-ui";
import type { Draft } from "@/lib/letters/types";
import { useWorkspaceFor } from "@/components/editor/workspace-store";
import { openPoints, reviewPoints, reviewSummary } from "@/components/journey/review/model";
import {
  APPROVER_ROLE_KEY,
  approverTitleFor,
  fmtWhen,
  submittedEntry,
  verdictWords,
  viewerIsApproverFor,
} from "@/components/editor/letter-facts";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ROLE_WORDS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  reviewer: "Reviewer",
  drafter: "Drafter",
  member: "Member",
};

function storedApproverRole(draftId: string): string | null {
  try {
    const raw = window.localStorage.getItem(APPROVER_ROLE_KEY(draftId));
    return raw ? ROLE_WORDS[raw] ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Approve step of the Progress panel (mock f6). While the letter is with
 * the approver: their card (who, the state, a short timeline), the review
 * summary when it was reviewed, Approve and Request changes for the person
 * who can approve it, Withdraw for the sender. After a finished review and
 * before it is sent for approval: the review summary and Send for approval.
 * Everything shown is read from the draft's approvals, timeline and review.
 */
/** "a", "a and b", "a, b and c". */
function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function ApproveStage({ draftId }: { draftId: string }) {
  const draft = useDraftStore((s) => s.drafts[draftId]);
  const drafts = useDraftStore((s) => s.drafts);
  const employees = useDraftStore((s) => s.employees);
  const profile = useProfileStore((s) => s.profile);
  const approverName = draft ? submittedEntry(draft)?.reviewerName : undefined;
  const viewerIsApprover = draft ? viewerIsApproverFor(draft, profile, approverName) : false;
  const journey = useJourney(draftId, { viewerIsApprover });
  const ws = useWorkspaceFor(draftId);
  const role = profile.workspaceRole;

  if (!journey || !draft) return null;
  const h = ws?.handlers;
  const review = journey.review && journey.review.status === "finished" ? journey.review : null;
  const inApproval = (draft.reviewStatus ?? "draft") === "in_review";

  // Waiting for the approver (or it is you).
  if (inApproval) {
    const submitted = submittedEntry(draft);
    const named = submitted?.reviewerName && !/^workspace reviewer$/i.test(submitted.reviewerName) ? submitted.reviewerName : "";
    const name = named || "Your approver";
    const first = firstName(named) || "the approver";
    // Their job title (employee record, or how the workspace's letters name
    // them), else the workspace role picked when it was sent.
    const roleWord = approverTitleFor(named, drafts, employees) ?? storedApproverRole(draftId);
    const timeline: PersonTimelineItem[] = [
      { id: "sent", label: "Sent for approval", time: submitted ? fmtWhen(submitted.createdAt) : undefined, state: "done" },
      { id: "with", label: viewerIsApprover ? "With you to approve" : `With ${first}`, time: "now", state: "now" },
      { id: "approved", label: "Approved, ready to send", state: "todo" },
    ];
    return (
      <div className="flex flex-col gap-3.5">
        <PersonCard
          name={name}
          seed={name}
          role={roleWord ? `${roleWord} · approver` : "Approver"}
          pill={viewerIsApprover ? { tone: "amber", label: "Needs you" } : { tone: "blue", label: "Waiting" }}
          timeline={timeline}
        >
          {viewerIsApprover && canApprove(role) && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--ds-line-2)] pt-3">
              <Button size="sm" onClick={() => h?.openReviewDialog?.("approve")} disabled={!h?.openReviewDialog}>
                <Check className="size-3.5" /> Approve
              </Button>
              <Button variant="outline" size="sm" onClick={() => h?.openReviewDialog?.("request_changes")} disabled={!h?.openReviewDialog}>
                Request changes
              </Button>
            </div>
          )}
        </PersonCard>
        <ReviewSummary draft={draft} review={review} skipped={!review} onRounds={() => openRoundsHistory(draftId)} />
        {review?.kind === "expert" && <RateExpertCard review={review} />}
        {!viewerIsApprover && canSubmitForReview(role) && h?.withdraw && (
          <div>
            <button
              type="button"
              onClick={h.withdraw}
              className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-1.5 text-[12.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              <Undo2 className="size-3.5" /> Withdraw the request
            </button>
          </div>
        )}
      </div>
    );
  }

  // The review is finished: send it for approval.
  const action = journey.primaryAction;
  return (
    <div className="flex flex-col gap-3.5">
      <ReviewSummary draft={draft} review={review} skipped={false} onRounds={() => openRoundsHistory(draftId)} />
      {review?.kind === "expert" && <RateExpertCard review={review} />}
      {canSubmitForReview(role) && action?.id === "send-for-approval" && (
        <div className="flex flex-col gap-1.5">
          <Button size="sm" className="self-start" disabled={Boolean(action.disabled) || !h?.openReviewDialog} onClick={() => h?.openReviewDialog?.("submit")}>
            <Stamp className="size-3.5" /> Send for approval
          </Button>
          {action.disabled && action.reason && <p className="m-0 text-[12.5px] text-[var(--ds-muted)]">{action.reason}</p>}
        </div>
      )}
    </div>
  );
}

/** "Review": who, how many rounds, the verdict, what you decided. */
function ReviewSummary({
  draft,
  review,
  skipped,
  onRounds,
}: {
  draft: Draft;
  review: ReviewRequest | null;
  skipped: boolean;
  onRounds?: () => void;
}) {
  // The same counts as the rounds history (reviewSummary), and what is
  // still open in the last round.
  const facts = useMemo(() => {
    if (!review) return null;
    const sum = reviewSummary(draft, review);
    const open = openPoints(reviewPoints(draft, review)).length;
    const last = currentRound(review);
    const verdict = sum.verdict ?? last?.verdict;
    return {
      accepted: sum.accepted,
      kept: sum.kept,
      resolved: sum.resolved,
      open,
      verdict: verdict ? verdictWords(verdict) : "",
      n: Math.max(1, review.rounds.length),
    };
  }, [draft, review]);

  if (!review || !facts) {
    if (!skipped) return null;
    return (
      <section aria-label="Review">
        <h4 className="m-0 mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ds-subtle)]">Review</h4>
        <p className="m-0 text-[13px] text-[var(--ds-muted)]">Review was skipped. It went straight to approval.</p>
      </section>
    );
  }
  // What was decided, in words, leaving out what did not happen
  // ("You kept your wording on 1 change", not "accepted 0, kept 1").
  const did: string[] = [];
  if (facts.accepted > 0) did.push(`accepted ${plural(facts.accepted, "change")}`);
  if (facts.kept > 0) did.push(`kept your wording on ${plural(facts.kept, "change")}`);
  if (facts.resolved > 0) did.push(`resolved ${plural(facts.resolved, "comment")}`);
  const parts: string[] = [];
  if (did.length > 0) parts.push(`You ${listWords(did)}`);
  if (facts.open > 0) parts.push(`${plural(facts.open, "point")} still open`);
  if (parts.length === 0) parts.push("Nothing to decide");
  const roundsLink = facts.n === 2 ? "See both rounds" : facts.n > 2 ? "See all rounds" : "See the round";
  return (
    <section aria-label="Review">
      <h4 className="m-0 mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ds-subtle)]">Review</h4>
      <p className="m-0 flex items-start gap-2 text-[13px] text-[var(--ds-ink)]">
        <CircleCheck aria-hidden className="mt-[2px] size-3.5 shrink-0 text-[var(--ds-green-fg)]" />
        <span className="text-pretty">
          {review.reviewer.name} · {plural(facts.n, "round")}
          {/* The verdict's last two words stay together on a wrap. */}
          {facts.verdict ? ` · ${facts.verdict.replace(/ (\S+)$/, "\u00a0$1")}` : ""}
        </span>
      </p>
      <p className="m-0 mt-1 flex items-start gap-2 text-[13px] text-[var(--ds-body)]">
        {facts.open > 0 ? (
          <CircleDot aria-hidden className="mt-[2px] size-3.5 shrink-0 text-[var(--ds-amber-fg)]" />
        ) : (
          <Check aria-hidden className="mt-[2px] size-3.5 shrink-0 text-[var(--ds-muted)]" />
        )}
        <span className="text-pretty">{parts.join(", ").replace(/(\d) /g, "$1\u00a0")}</span>
      </p>
      {onRounds && (
        <button
          type="button"
          onClick={onRounds}
          className="mt-1.5 rounded-[4px] text-[13px] text-[var(--ds-ink)] underline underline-offset-[3px] transition-colors duration-[120ms] hover:text-[var(--ds-muted)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
        >
          {roundsLink}
        </button>
      )}
    </section>
  );
}
