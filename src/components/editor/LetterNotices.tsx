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
import type { JourneyInfo } from "@/lib/journey/stage";
import { currentRound, firstName, type ReviewRequest } from "@/lib/journey/reviews";
import { NoticeChip, NoticeStrip } from "@/components/journey/ui";
import { cn } from "@/lib/utils";
import {
  addWorkingDays,
  approvedEntry,
  appealWorkingDays,
  deliveryPhrase,
  fmtDay,
  fmtTime,
  verdictWords,
} from "./letter-facts";
import { disclaimerFor } from "./InlineDisclaimer";
import { suggestedEdits } from "./suggestion-groups";

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
  className,
}: {
  draft: Draft;
  journey: JourneyInfo;
  review: ReviewRequest | null;
  matter?: Matter;
  employee?: Employee;
  /** "Message": open the conversation with the reviewer. */
  onMessage: () => void;
  /** Undo "marked as sent". */
  onUndoSent?: () => void;
  animateSent?: boolean;
  className?: string;
}) {
  const strip = noticeFor({ draft, journey, review, matter, onMessage, onUndoSent, animateSent });
  const appealDays = appealWorkingDays(draft);
  const name = draft.employee?.legalName?.trim() || employee?.legalName;
  const job = draft.employee?.jobTitle?.trim() || employee?.jobTitle;

  // Right-hand chip, by stage.
  let right: React.ReactNode = null;
  const r = review && review.status !== "recalled" ? review : null;
  const round = r ? currentRound(r) : undefined;
  if (journey.stage === "sent" && journey.sentAt && appealDays) {
    right = (
      <NoticeChip icon={CalendarCheck}>
        Appeal by {addWorkingDays(journey.sentAt, appealDays).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
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
        Round {round?.n ?? 1} · from {r.reviewer.name}
      </NoticeChip>
    );
  } else if (r && r.status === "finished" && (journey.stage === "approve" || journey.stage === "send")) {
    const n = r.rounds.length;
    right = (
      <NoticeChip icon={Eye} tone="lilac">
        Reviewed by {firstName(r.reviewer.name)} · {n} round{n === 1 ? "" : "s"}
      </NoticeChip>
    );
  } else if (appealDays && journey.stage !== "sent") {
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
}: {
  draft: Draft;
  journey: JourneyInfo;
  review: ReviewRequest | null;
  matter?: Matter;
  onMessage: () => void;
  onUndoSent?: () => void;
  animateSent?: boolean;
}): React.ReactNode {
  const r = review && review.status !== "recalled" ? review : null;
  const employeeFirst = firstName(draft.employee?.preferredName || draft.employee?.legalName) || "the employee";

  // Sent.
  if (journey.stage === "sent" && journey.sentAt) {
    const sentAt = journey.sentAt;
    const appealDays = appealWorkingDays(draft);
    const hasPdf = (draft.exports ?? []).some((e) => e.format === "pdf");
    const parts: string[] = [];
    if (hasPdf) parts.push("The PDF is in your downloads");
    parts.push(matter ? `a copy is saved to ${matter.name}` : "a copy is saved with this letter");
    let detail = `${parts.join(" and ")}.`;
    detail = detail.charAt(0).toUpperCase() + detail.slice(1);
    if (appealDays) {
      detail += ` The appeal window closes on ${addWorkingDays(sentAt, appealDays).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`;
    }
    return (
      <NoticeStrip
        tone="green"
        icon={CircleCheck}
        title={`Marked as sent on ${new Date(sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}, ${deliveryPhrase(draft.context.deliveryMethod)}.`}
        onUndo={onUndoSent}
        animate={animateSent}
      >
        {detail}
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
        title={a ? `Approved by ${a.reviewerName} at ${fmtTime(a.createdAt)}.` : "Approved."}
      >
        Ready to send. Choose how {employeeFirst} gets it on the right.
      </NoticeStrip>
    );
  }

  // Out for review.
  if (r && r.status === "out" && journey.stage === "review") {
    const due = r.dueAt ? new Date(r.dueAt) : null;
    const dueOk = due && !Number.isNaN(due.getTime());
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

  // Back to you.
  if (r && r.status === "back" && journey.stage === "review") {
    const round = currentRound(r);
    const who = firstName(r.reviewer.name) || "The reviewer";
    const verdict = round?.verdict ? verdictWords(round.verdict) : "";
    const theirIds = new Set(round?.suggestionIds ?? []);
    const changes = suggestedEdits(draft).filter(
      (e) => !e.ai && (e.author === r.reviewer.name || e.ids.some((id) => theirIds.has(id)))
    ).length;
    const openIds = new Set((draft.comments ?? []).filter((c) => !c.resolved).map((c) => c.id));
    const comments = (round?.commentIds ?? []).filter((id) => openIds.has(id)).length;
    return (
      <NoticeStrip
        tone="lilac"
        icon={Reply}
        title={`${who} sent it back${verdict ? `: ${verdict}` : ""}.`}
      >
        {changes} suggested change{changes === 1 ? "" : "s"} and {comments} comment{comments === 1 ? "" : "s"}. Accept or reject each, or send it back with a question.
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
