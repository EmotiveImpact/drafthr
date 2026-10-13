import { Link } from "react-router-dom";
import {
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  Eye,
  Folder,
  Reply,
  Scale,
  Stamp,
  UserRound,
} from "lucide-react";
import type { Draft, Employee, Matter } from "@/lib/letters/types";
import { isOwnLetter, type JourneyInfo } from "@/lib/journey/stage";
import { currentRound, firstName, type ReviewRequest } from "@/lib/journey/reviews";
import { NoticeChip, NoticeStrip } from "@/components/journey/ui";
import { cn } from "@/lib/utils";
import {
  approvedEntry,
  appealWorkingDays,
  fmtDay,
  fmtTime,
  verdictWords,
} from "./letter-facts";
import { disclaimerFor } from "./InlineDisclaimer";
import { appealChipText, recipientOf, sentBannerText } from "@/components/journey/send/record";
import { openPoints, reviewPoints } from "@/components/journey/review/model";
import { useReviewerMode } from "@/components/journey/review/review-ui";

/**
 * The calm line above the letter when something has happened (mocks f3,
 * f5, f6, f7, f8), then the chips row: the matter, the employee and, on the
 * right, the appeal window, the review round or the appeal date. Every
 * sentence is filled from the draft, its review request and its approvals.
 */
export function LetterNotices({
  draft,
  journey,
  review,
  matter,
  employee,
  onMessage,
  onUndoSent,
  animateSent,
  viewerIsReviewer,
  viewerIsAsker,
  className,
}: {
  draft: Draft;
  journey: JourneyInfo;
  review: ReviewRequest | null;
  /** The named teammate reviewer is looking (out, sent back or recalled). */
  viewerIsReviewer?: boolean;
  /** False when someone else asked for the review (read only). */
  viewerIsAsker?: boolean;
  matter?: Matter;
  employee?: Employee;
  /** "Message": open the conversation with the reviewer. */
  onMessage: () => void;
  /** Undo "marked as sent". */
  onUndoSent?: () => void;
  animateSent?: boolean;
  className?: string;
}) {
  const strip = noticeFor({ draft, journey, review, matter, onMessage, onUndoSent, animateSent, viewerIsReviewer, viewerIsAsker });
  // The named teammate reviewer is looking (their main action is "Send back").
  const reviewing = journey.primaryAction?.id === "send-back";
  const [reviewerMode] = useReviewerMode(draft.id);
  const appealDays = appealWorkingDays(draft);
  const name = draft.employee?.legalName?.trim() || employee?.legalName;
  const job = draft.employee?.jobTitle?.trim() || employee?.jobTitle;

  // Right-hand chip, by stage.
  let right: React.ReactNode = null;
  const r = review && review.status !== "recalled" ? review : null;
  const round = r ? currentRound(r) : undefined;
  const appealChip = journey.stage === "sent" ? appealChipText(draft) : null;
  if (journey.stage === "sent") {
    right = appealChip ? <NoticeChip icon={CalendarCheck}>{appealChip}</NoticeChip> : null;
  } else if (r && r.status === "out" && reviewing) {
    // The named teammate reviewer (f4): how they are working right now.
    const asker = firstName(r.asker?.name ?? "") || "They";
    right = (
      <NoticeChip icon={Eye} tone="lilac">
        {reviewerMode === "suggest" ? `Suggesting · ${asker} accepts or rejects` : reviewerMode === "comment" ? "Commenting" : "Reading"}
      </NoticeChip>
    );
  } else if (r && r.status === "out") {
    const due = r.dueAt ? new Date(r.dueAt) : null;
    right = (
      <NoticeChip icon={Eye} tone="lilac">
        Round {round?.n ?? 1}
        {due && !Number.isNaN(due.getTime()) ? ` · back by ${due.toLocaleDateString("en-GB", { weekday: "short" })} ${fmtTime(due.getTime())}` : ""}
      </NoticeChip>
    );
  } else if (r && r.status === "back") {
    right = (
      <NoticeChip icon={Eye} tone="lilac">
        Round {round?.n ?? 1} · {viewerIsReviewer ? "sent back" : `from ${r.reviewer.name}`}
      </NoticeChip>
    );
  } else if (r && r.status === "finished" && (journey.stage === "approve" || journey.stage === "send")) {
    const n = r.rounds.length;
    right = (
      <NoticeChip icon={Eye} tone="lilac">
        Reviewed by {firstName(r.reviewer.name)} · {n} round{n === 1 ? "" : "s"}
      </NoticeChip>
    );
  } else if (appealDays) {
    right = (
      <NoticeChip icon={CalendarClock} tone="warn">
        Appeal window: {appealDays} working day{appealDays === 1 ? "" : "s"}
      </NoticeChip>
    );
  }

  const chipLink =
    "rounded-[7px] transition-colors duration-[120ms] hover:[&>span]:bg-[var(--ds-hover)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

  return (
    <div data-slot="letter-notices" className={cn("flex min-w-0 flex-col gap-3", className)}>
      {strip}
      {!draft.isTemplateSource && (matter || name || right) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap">
          {matter && (
            <Link to={`/matters/${matter.id}`} className={cn(chipLink, "min-w-0 max-w-full shrink")} title={`Open the matter: ${matter.name}`}>
              <NoticeChip icon={Folder} className="max-w-full">
                <span className="min-w-0 truncate">{matter.name}</span>
              </NoticeChip>
            </Link>
          )}
          {name &&
            (employee ? (
              <Link to={`/employees/${employee.id}`} className={cn(chipLink, "min-w-0 max-w-full shrink")} title={`Open ${name}'s profile`}>
                <NoticeChip icon={UserRound} className="max-w-full">
                  <span className="min-w-0 truncate">
                    {name}
                    {job ? ` · ${job}` : ""}
                  </span>
                </NoticeChip>
              </Link>
            ) : (
              <NoticeChip icon={UserRound} className="min-w-0 max-w-full shrink">
                <span className="min-w-0 truncate">
                  {name}
                  {job ? ` · ${job}` : ""}
                </span>
              </NoticeChip>
            ))}
          {right && <span className="ml-auto shrink-0">{right}</span>}
        </div>
      )}
    </div>
  );
}

function noticeFor({
  draft,
  journey,
  review,
  matter,
  onMessage,
  onUndoSent,
  animateSent,
  viewerIsReviewer,
  viewerIsAsker,
}: {
  draft: Draft;
  journey: JourneyInfo;
  review: ReviewRequest | null;
  matter?: Matter;
  onMessage: () => void;
  onUndoSent?: () => void;
  animateSent?: boolean;
  viewerIsReviewer?: boolean;
  viewerIsAsker?: boolean;
}): React.ReactNode {
  const r = review && review.status !== "recalled" ? review : null;
  const employeeFirst = firstName(draft.employee?.preferredName || draft.employee?.legalName) || "the employee";
  // Who the letter goes to: the employee, or on an employee's own letter the
  // employer contact (or the company).
  const recipientFirst = recipientOf(draft).short || (draft.mode === "employee" ? "they" : employeeFirst);

  // Sent: the words come from the send record (how and when it was given,
  // the appeal window only for letters with a right of appeal).
  if (journey.stage === "sent" && journey.sentAt) {
    const text = sentBannerText(draft, { matterName: matter?.name });
    return (
      <NoticeStrip tone="green" icon={CircleCheck} title={text?.title ?? "Sent."} onUndo={onUndoSent} animate={animateSent}>
        {text?.detail}
      </NoticeStrip>
    );
  }

  // Approved, ready to send.
  if (journey.stage === "send") {
    const a = approvedEntry(draft);
    return (
      <NoticeStrip
        tone="green"
        icon={Stamp}
        title={
          // An employee's own letter has no approver: they signed it off.
          isOwnLetter(draft)
            ? a
              ? `Signed off at ${fmtTime(a.createdAt)}.`
              : "Signed off."
            : a
              ? `Approved by ${a.reviewerName} at ${fmtTime(a.createdAt)}.`
              : "Approved."
        }
      >
        {/* On the phone the panel is the Progress sheet, not a column on the right. */}
        <span className="hidden md:inline">Ready to send. Choose how {recipientFirst} gets it on the right.</span>
        <span className="md:hidden">Ready to send. Tap Progress to choose how {recipientFirst} gets it.</span>
      </NoticeStrip>
    );
  }

  // Out for review.
  if (r && r.status === "out" && journey.stage === "review") {
    const due = r.dueAt ? new Date(r.dueAt) : null;
    const dueOk = due && !Number.isNaN(due.getTime());
    if (journey.primaryAction?.id === "send-back") {
      const asker = firstName(r.asker?.name ?? "") || "The person who asked";
      return (
        <NoticeStrip
          tone="lilac"
          icon={Eye}
          title={`${asker} asked you to review this letter.`}
          actions={
            <button type="button" onClick={onMessage}>
              Message
            </button>
          }
        >
          {dueOk ? `Back by ${fmtDay(due!)} at ${fmtTime(due!.getTime())}. ` : ""}
          Suggest changes or comment; {asker === "The person who asked" ? "they decide" : `${asker} decides`} what to accept.
        </NoticeStrip>
      );
    }
    if (viewerIsAsker === false) {
      // Someone else's review: where it is, nothing to act on.
      const asker = firstName(r.asker?.name ?? "") || "Someone in your team";
      return (
        <NoticeStrip tone="lilac" icon={Eye} title={`With ${r.reviewer.name} for review.`}>
          {asker} sent it for review{dueOk ? `, back by ${fmtDay(due!)} at ${fmtTime(due!.getTime())}` : ""}. Editing is paused until it's back.
        </NoticeStrip>
      );
    }
    return (
      <NoticeStrip
        tone="lilac"
        icon={Eye}
        title={`With ${r.reviewer.name} for review.`}
        actions={
          <button type="button" onClick={onMessage}>
            Message
          </button>
        }
      >
        {dueOk ? `Back by ${fmtDay(due!)} at ${fmtTime(due!.getTime())}. ` : ""}
        Editing is paused so you're both looking at the same version.
      </NoticeStrip>
    );
  }

  // The named reviewer after sending it back: a calm confirmation.
  if (r && r.status === "back" && viewerIsReviewer) {
    const round = currentRound(r);
    const asker = firstName(r.asker?.name ?? "") || "The person who asked";
    return (
      <NoticeStrip tone="lilac" icon={Reply} title={`Sent back to ${asker}${round?.backAt ? ` at ${fmtTime(round.backAt)}` : ""}.`}>
        {asker === "The person who asked" ? "They decide" : `${asker} decides`} what to accept. You'll be told if it comes back to you.
      </NoticeStrip>
    );
  }

  // The named reviewer after the person who asked recalled it.
  if (review && review.status === "recalled" && viewerIsReviewer && journey.stage === "review") {
    const asker = firstName(review.asker?.name ?? "") || "The person who asked";
    return (
      <NoticeStrip tone="blue" icon={Eye} title={`${asker} recalled this review${review.recalledAt ? ` at ${fmtTime(review.recalledAt)}` : ""}.`}>
        There's nothing for you to do. You can still read the letter.
      </NoticeStrip>
    );
  }

  // Back to you.
  if (r && r.status === "back" && journey.stage === "review") {
    const round = currentRound(r);
    const who = firstName(r.reviewer.name) || "The reviewer";
    const verdict = round?.verdict ? verdictWords(round.verdict) : "";
    // What is still to decide, counted as the Progress panel counts it.
    const open = openPoints(reviewPoints(draft, r, round));
    const changes = open.filter((p) => p.kind === "suggestion").length;
    const comments = open.length - changes;
    const what = [
      changes > 0 ? `${changes} suggested change${changes === 1 ? "" : "s"}` : "",
      comments > 0 ? `${comments} comment${comments === 1 ? "" : "s"}` : "",
    ]
      .filter(Boolean)
      .join(" and ");
    const next =
      changes > 0
        ? "Accept or reject each, or send it back with a question."
        : comments > 0
          ? `Read and resolve ${comments === 1 ? "it" : "them"}, or send it back with a question.`
          : "Nothing to accept or reject. Finish the review, or send it back with a question.";
    return (
      <NoticeStrip
        tone="lilac"
        icon={Reply}
        title={`${who} sent it back${verdict ? `: ${verdict}` : ""}.`}
      >
        {what ? `${what}. ` : ""}
        {viewerIsAsker === false
          ? `${firstName(r.asker?.name ?? "") || "The person who asked"} decides what to accept.`
          : next}
      </NoticeStrip>
    );
  }

  // Approve stage after a finished review.
  if (journey.stage === "approve" && r && r.status === "finished") {
    const n = r.rounds.length;
    const who = firstName(r.reviewer.name) || "The reviewer";
    const last = currentRound(r);
    const happy = last?.verdict !== "rethink";
    const withApprover = (draft.reviewStatus ?? "draft") === "in_review" && journey.approverName && !/^workspace reviewer$/i.test(journey.approverName);
    return (
      <NoticeStrip tone="green" icon={CircleCheck} title={`Review finished after ${n} round${n === 1 ? "" : "s"}.`}>
        {happy ? `${who} is happy for it to go.` : `${who} asked for a rethink.`}
        {withApprover ? ` It's now with ${journey.approverName} to approve.` : (draft.reviewStatus ?? "draft") === "in_review" ? " It's now with the approver." : " Send it for approval when you're ready."}
      </NoticeStrip>
    );
  }

  // Employee letters that may be disclosed in proceedings keep their warning.
  if (draft.mode === "employee" && journey.stage === "draft") {
    const d = disclaimerFor(draft);
    if (d.tone === "danger") {
      return (
        <NoticeStrip tone="amber" icon={Scale} title={d.title ?? ""}>
          {d.lines.join(" ")}
        </NoticeStrip>
      );
    }
  }

  return null;
}
