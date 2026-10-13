import { useMemo } from "react";
import type { Draft } from "@/lib/letters/types";
import { runHealthChecks, type HealthCheck } from "@/lib/finalize/healthChecks";
import { useDraftStore } from "@/lib/store";
import { currentRound, firstName, useLatestReview, useNewestReview, type ReviewRequest } from "./reviews";

/**
 * Where a letter is in its journey: Draft, Review (optional), Approve, Send,
 * then Sent. Derived only from the real draft fields (sections, suggestion
 * marks, health checks, reviewStatus and approvals, exports) plus the
 * draft's latest review request (./reviews.ts). Nothing here is stored.
 *
 * Contract (design/build/phase3/brief.md section 5). Frozen after the
 * foundation: other workstreams read it, they do not change it.
 *
 * Mapping from the data:
 *   sent       exports include a "marked-sent" event
 *   send       reviewStatus "approved" (approved, ready to send)
 *   approve    reviewStatus "in_review" (submitted, with the approver), or a
 *              review request finished and not yet sent for approval
 *   review     a review request is out (with the reviewer) or back (your
 *              turn), or the draft is complete and ready for review
 *   draft      anything else, including "changes_requested" by the approver
 */

export type JourneyStage = "draft" | "review" | "approve" | "send" | "sent";

/**
 * Whose move it is, which colours the tracker and list rows:
 *   yours      your turn, nothing urgent (black)
 *   needs-you  something needs you (amber)
 *   away       someone else has it (lilac)
 *   done       finished (green)
 */
export type StageTone = "yours" | "needs-you" | "away" | "done";

/** Pill colours, matching <Pill tone> in @/components/ds. */
export type JourneyPillTone = "amber" | "green" | "blue" | "red" | "grey" | "lilac";

/** The four steps of the tracker, in order. "sent" is all four done. */
export const JOURNEY_STEPS: ReadonlyArray<{
  stage: Exclude<JourneyStage, "sent">;
  label: string;
  optional?: boolean;
}> = [
  { stage: "draft", label: "Draft" },
  { stage: "review", label: "Review", optional: true },
  { stage: "approve", label: "Approve" },
  { stage: "send", label: "Send" },
];

/** 0 to 3 for the current step; 4 when sent (every step done). */
export function stageIndex(stage: JourneyStage): number {
  return stage === "sent" ? 4 : JOURNEY_STEPS.findIndex((s) => s.stage === stage);
}

export type JourneyActionId =
  | "send-for-review"
  | "skip-review"
  | "recall"
  | "finish-review"
  | "send-for-approval"
  | "approve"
  | "remind"
  | "export"
  | "download"
  | "send-back";

export type JourneyAction = {
  id: JourneyActionId;
  label: string;
  /** Present and true when the action cannot be taken yet. */
  disabled?: boolean;
  /** Why it is disabled, for a tooltip or the gate line. */
  reason?: string;
  /** The action opens a menu (Export: PDF, Word, plain text, evidence pack). */
  menu?: boolean;
};

export type JourneyCounts = {
  sections: number;
  /** Sections with text. */
  sectionsDrafted: number;
  /** Required sections still empty. */
  requiredSectionsEmpty: number;
  /** DraftHR is still writing a section. */
  streaming: boolean;
  /** Suggested edits waiting for a decision (pending marks and pending changes). */
  pendingSuggestions: number;
  /** Health checks failing (these block sending). */
  failingRequired: number;
  /** Health checks with a warning (recommended, not blocking). */
  warnings: number;
  checksTotal: number;
  checksPassing: number;
  evidence: number;
  unresolvedComments: number;
};

export type JourneyInfo = {
  stage: JourneyStage;
  tone: StageTone;
  /** The status pill in the document bar ("Draft", "With Claire", "Back to you"). */
  statusLabel: string;
  statusTone: JourneyPillTone;
  /** The short line under the stage bar in the Letters list ("Review · back to you"). */
  whereLabel: string;
  /** The grey "what to do now" line under the tracker: a bold lead, then detail. */
  whatNow: { lead: string; detail: string };
  /** The one main action for the stage (the right of the document bar). */
  primaryAction: JourneyAction | null;
  /** A second way on, when the stage has one ("Skip review"). */
  secondaryAction: JourneyAction | null;
  /** The row needs the person (tinted in lists, counted in "Needs you"). */
  needsYou: boolean;
  /** Tone for list rows and the mini stage bar (amber when it needs you). */
  listTone: StageTone;
  /** 0 to 3 for the current step, 4 when sent. */
  stepIndex: number;
  /** Editing is paused (out for review, with the approver, approved, sent). */
  locked: boolean;
  /** When the letter was marked as sent. */
  sentAt?: number;
  /** The approver's name, once it has been sent for approval. */
  approverName?: string;
  /** The latest review request (out, back or finished), if any. */
  review: ReviewRequest | null;
  counts: JourneyCounts;
};

export type JourneyOptions = {
  /** Precomputed health checks for the draft (saves running them twice). */
  checks?: HealthCheck[];
  /** The person looking is the approver (they can approve it). */
  viewerIsApprover?: boolean;
  /** The person looking is the named teammate reviewer of the review that
   *  is out (their own review: suggest, pick a verdict, send it back). */
  viewerIsReviewer?: boolean;
  /** False when the person looking did not ask for the review and is not its
   *  named reviewer (another member of the workspace): they see where it is,
   *  read only, and cannot recall it or finish it (REVIEW-100). Undefined is
   *  the person who asked. */
  viewerIsAsker?: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Ids of pending suggestion marks (<ins>/<del data-suggestion-id data-status="pending">). */
export function pendingSuggestionIds(draft: Draft): string[] {
  return pendingSuggestionGroups(draft).flatMap((g) => g.ids);
}

/** One suggested edit: the marks one proposal left in the text. */
export type SuggestionGroup = {
  /** "author|createdAt": the marks of one proposal share both. */
  key: string;
  author: string;
  ids: string[];
};

/**
 * Pending suggestion marks grouped into suggested edits. A single proposal
 * (DraftHR's or a reviewer's) is diffed into several <ins>/<del> marks, each
 * with its own id but the same author and timestamp, so they count as one.
 */
export function pendingSuggestionGroups(draft: Draft): SuggestionGroup[] {
  const groups = new Map<string, SuggestionGroup>();
  for (const s of draft.sections) {
    const html = s.html ?? "";
    if (!html.includes("data-suggestion-id")) continue;
    const tags = html.match(/<(ins|del)\b[^>]*>/gi) ?? [];
    for (const tag of tags) {
      if (!/data-status\s*=\s*"pending"/i.test(tag)) continue;
      const id = attr(tag, "data-suggestion-id");
      if (!id) continue;
      const author = attr(tag, "data-author") ?? "";
      const at = attr(tag, "data-created-at") ?? "";
      // Marks without a timestamp cannot be grouped safely: one each.
      const key = at ? `${author}|${at}` : `id|${id}`;
      const g = groups.get(key) ?? { key, author, ids: [] };
      if (!g.ids.includes(id)) g.ids.push(id);
      groups.set(key, g);
    }
  }
  return [...groups.values()];
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : undefined;
}

/** A section has words in it (an empty "<p></p>" left by the editor does not count). */
export function hasText(html: string | undefined): boolean {
  return (html ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

/**
 * The letter is the employee's own (employee mode): it goes to their
 * employer, so there is no approver. Review stays optional; the Approve step
 * is their own sign-off ("Get it ready to send").
 */
export function isOwnLetter(draft: Pick<Draft, "mode">): boolean {
  return draft.mode === "employee";
}

/**
 * The Send step's what-to-do line. Also shown for the moment right after
 * sending, while the Send step is still on screen (SEND-X36).
 */
export function sendWhatNow(draft: Pick<Draft, "mode" | "sections">): { lead: string; detail: string } {
  return {
    lead: "Last step.",
    // Only letters with a right of appeal start an appeal window (SEND-22).
    detail:
      draft.mode === "employer" && (draft.sections ?? []).some((s) => s.sectionId === "appeal_rights")
        ? "Send it yourself or from DraftHR. We record the date it's given, because the appeal window starts then."
        : "Send it yourself or from DraftHR. We record the date it's given.",
  };
}

/**
 * The four steps as this letter names them: an employee's own letter has no
 * approver, so its third step is their own sign-off ("Sign off"), not
 * "Approve" (FOUNDATION-X5).
 */
export function journeyStepsFor(draft: Pick<Draft, "mode"> | null | undefined): typeof JOURNEY_STEPS {
  if (!draft || !isOwnLetter(draft)) return JOURNEY_STEPS;
  return JOURNEY_STEPS.map((s) => (s.stage === "approve" ? { ...s, label: "Sign off" } : s));
}

/** What the approval record means for this letter, in words: "Signed off" for an employee's own letter. */
export function approvalWord(draft: Pick<Draft, "mode">): "Signed off" | "Approved" {
  return isOwnLetter(draft) ? "Signed off" : "Approved";
}

/**
 * An employee's own letter is ready to send: there is no approver, so the
 * writer signs it off themselves, which opens the Send step. It uses the
 * approval record (in their name) because that is what moves the letter on
 * and what the audit record reads, but it is logged as a sign-off: the
 * timeline says "Signed off by <name>", and everything that shows it on an
 * own letter says "Signed off" (approvalWord), never "Approved"
 * (FOUNDATION-X5). No-op for any other letter.
 */
export function markOwnLetterReady(draftId: string): boolean {
  const store = useDraftStore.getState();
  const draft = store.drafts[draftId];
  if (!draft || !isOwnLetter(draft)) return false;
  const name = draft.employee?.legalName?.trim() || "You";
  store.approveDraft(draftId, name, "Ready to send. Their own letter needs no approver.");
  const after = useDraftStore.getState().drafts[draftId];
  const approvalId = after?.approvals?.at(-1)?.id;
  if (after && approvalId) {
    useDraftStore.setState((s) => ({
      drafts: {
        ...s.drafts,
        [draftId]: {
          ...after,
          timeline: (after.timeline ?? []).map((t) =>
            t.kind === "review_approved" && t.meta?.approvalId === approvalId
              ? { ...t, title: `Signed off by ${name}`, meta: { ...t.meta, signedOff: true } }
              : t
          ),
        },
      },
    }));
  }
  return true;
}

function countsFor(draft: Draft, checks: HealthCheck[]): JourneyCounts {
  const sections = draft.sections ?? [];
  // A pending change in inline mode is already counted through its marks;
  // count the change itself only when it shows as a card (or has no marks).
  const pendingCards = sections.filter(
    (s) =>
      !!s.pendingChange &&
      !((s.pendingChange.diffViewMode ?? "inline") === "inline" && (s.html ?? "").includes("data-suggestion-id"))
  ).length;
  return {
    sections: sections.length,
    // Only sections that have finished: one DraftHR is still writing does not
    // count yet, so "N of M drafted" never runs ahead of the stream (FEAT-060).
    sectionsDrafted: sections.filter((s) => s.status !== "streaming" && hasText(s.html)).length,
    requiredSectionsEmpty: sections.filter((s) => s.required && !hasText(s.html)).length,
    streaming: sections.some((s) => s.status === "streaming"),
    pendingSuggestions: pendingSuggestionGroups(draft).length + pendingCards,
    failingRequired: checks.filter((c) => c.severity === "fail").length,
    warnings: checks.filter((c) => c.severity === "warn").length,
    checksTotal: checks.length,
    checksPassing: checks.filter((c) => c.severity === "pass").length,
    evidence: draft.evidence?.length ?? 0,
    unresolvedComments: (draft.comments ?? []).filter((c) => !c.parentId && !c.resolved).length,
  };
}

function lastSubmittedApprover(draft: Draft): string | undefined {
  const entries = (draft.approvals ?? []).filter((a) => a.decision === "submitted");
  const name = entries[entries.length - 1]?.reviewerName?.trim();
  return name || undefined;
}

function lastChangesBy(draft: Draft): string | undefined {
  const entries = (draft.approvals ?? []).filter((a) => a.decision === "changes_requested");
  return entries[entries.length - 1]?.reviewerName?.trim() || undefined;
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "the approver" when the name is the generic placeholder. */
function approverShort(name: string | undefined): string {
  if (!name || /^workspace reviewer$/i.test(name)) return "the approver";
  return firstName(name);
}

/**
 * Work out where a letter is. Pure: same draft and review in, same answer out.
 */
export function getJourney(
  draft: Draft,
  review?: ReviewRequest | null,
  opts: JourneyOptions = {}
): JourneyInfo {
  const checks = opts.checks ?? runHealthChecks(draft);
  const counts = countsFor(draft, checks);
  const status = draft.reviewStatus ?? "draft";
  const approverName = lastSubmittedApprover(draft);
  const r = review && review.draftId === draft.id && review.status !== "recalled" ? review : null;
  // An employee's own letter (a grievance, a resignation) goes to their
  // employer; nobody in a workspace approves it, so after an optional review
  // it goes straight to Send (LETTER-X25). See markOwnLetterReady.
  const ownLetter = isOwnLetter(draft);
  const base = { counts, review: r, approverName, secondaryAction: null as JourneyAction | null };

  // ---- Sent -------------------------------------------------------------
  const sentEvents = (draft.exports ?? []).filter((e) => e.format === "marked-sent");
  if (sentEvents.length > 0) {
    const sentAt = Math.max(...sentEvents.map((e) => e.exportedAt));
    return {
      ...base,
      stage: "sent",
      tone: "done",
      statusLabel: "Sent",
      statusTone: "green",
      whereLabel: `Sent · ${shortDate(sentAt)}`,
      // "for this matter" only when it is in one (SEND-91).
      whatNow: { lead: "Sent.", detail: draft.matterId ? "What's next for this matter:" : "What's next:" },
      primaryAction: { id: "download", label: "Download" },
      needsYou: false,
      listTone: "done",
      stepIndex: 4,
      locked: true,
      sentAt,
    };
  }

  // ---- Approved: ready to send -----------------------------------------
  if (status === "approved") {
    return {
      ...base,
      stage: "send",
      tone: "yours",
      statusLabel: ownLetter ? "Ready to send" : "Approved",
      statusTone: "green",
      whereLabel: "Send · ready",
      whatNow: sendWhatNow(draft),
      primaryAction: { id: "export", label: "Export", menu: true },
      needsYou: true,
      // It needs you, so the list shows it amber like every other row that
      // does (LISTS-33).
      listTone: "needs-you",
      stepIndex: 3,
      locked: true,
    };
  }

  // ---- With the approver ------------------------------------------------
  if (status === "in_review") {
    const who = approverShort(approverName);
    if (opts.viewerIsApprover) {
      return {
        ...base,
        stage: "approve",
        tone: "needs-you",
        statusLabel: "Needs your approval",
        statusTone: "amber",
        whereLabel: "Approve · needs you",
        whatNow: { lead: "Your approval.", detail: "Read it through, then approve it or ask for changes." },
        primaryAction: { id: "approve", label: "Approve" },
        needsYou: true,
        listTone: "needs-you",
        stepIndex: 2,
        locked: true,
      };
    }
    return {
      ...base,
      stage: "approve",
      tone: "away",
      statusLabel: who === "the approver" ? "Waiting for approval" : `Waiting for ${who}`,
      statusTone: "blue",
      whereLabel: who === "the approver" ? "Approve · with the approver" : `Approve · with ${who}`,
      whatNow: {
        lead: who === "the approver" ? "With the approver." : `With ${who} to approve.`,
        detail: "You'll get a message when it's done.",
      },
      primaryAction: { id: "remind", label: who === "the approver" ? "Remind the approver" : `Remind ${who}` },
      needsYou: false,
      listTone: "away",
      stepIndex: 2,
      locked: true,
    };
  }

  // ---- Out for review / back to you -------------------------------------
  // The named reviewer after the person who asked recalled it: nothing for
  // them to do, and no author controls on someone else's letter (REVIEW-69).
  if (review && review.draftId === draft.id && review.status === "recalled" && opts.viewerIsReviewer) {
    const asker = firstName(review.asker?.name ?? "") || "The person who asked";
    return {
      ...base,
      review,
      stage: "review",
      tone: "away",
      statusLabel: "Recalled",
      statusTone: "grey",
      whereLabel: "Review · recalled",
      whatNow: {
        lead: "Recalled.",
        detail: `${asker} recalled this review, so there's nothing for you to do. Your suggestions from this round were withdrawn.`,
      },
      primaryAction: null,
      needsYou: false,
      listTone: "away",
      stepIndex: 1,
      locked: true,
    };
  }
  // The named reviewer once they have sent it back: a calm read-only view
  // until the next round arrives (REVIEW-94).
  if (r && r.status === "back" && opts.viewerIsReviewer) {
    const asker = firstName(r.asker?.name ?? "") || "them";
    return {
      ...base,
      stage: "review",
      tone: "away",
      statusLabel: asker === "them" ? "Sent back" : `Sent back to ${asker}`,
      statusTone: "lilac",
      whereLabel: asker === "them" ? "Review · sent back" : `Review · back with ${asker}`,
      whatNow: {
        lead: "Sent back.",
        detail: `${asker === "them" ? "They decide" : `${asker} decides`} what to accept. You'll be told if it comes back to you.`,
      },
      primaryAction: null,
      needsYou: false,
      listTone: "away",
      stepIndex: 1,
      locked: true,
    };
  }
  if (r && r.status === "out" && opts.viewerIsReviewer) {
    const asker = firstName(r.asker?.name ?? "") || "them";
    return {
      ...base,
      stage: "review",
      tone: "needs-you",
      statusLabel: asker === "them" ? "Your review" : `Reviewing for ${asker}`,
      statusTone: "lilac",
      whereLabel: "Review · with you",
      whatNow: {
        lead: "Your review.",
        detail: `Suggest changes, pick a verdict and send it back to ${asker}.`,
      },
      primaryAction: { id: "send-back", label: asker === "them" ? "Send it back" : `Send back to ${asker}` },
      needsYou: true,
      listTone: "needs-you",
      stepIndex: 1,
      locked: true,
    };
  }
  if (r && (r.status === "out" || r.status === "back") && opts.viewerIsAsker === false) {
    // Someone else's review: where it is, and nothing to act on.
    const who = firstName(r.reviewer.name) || "the reviewer";
    const asker = firstName(r.asker?.name ?? "") || "the person who asked";
    const out = r.status === "out";
    return {
      ...base,
      stage: "review",
      tone: "away",
      statusLabel: out ? `With ${who}` : `Back with ${asker}`,
      statusTone: "lilac",
      whereLabel: out ? `Review · with ${r.reviewer.name || "the reviewer"}` : `Review · back with ${asker}`,
      whatNow: {
        lead: "Nothing for you to do.",
        detail: out
          ? `${asker[0].toUpperCase()}${asker.slice(1)} sent it to ${who} for review.`
          : `${who} sent it back to ${asker}, who decides what to accept.`,
      },
      primaryAction: out
        ? { id: "recall", label: "Recall", disabled: true, reason: `Only ${asker} can recall it.` }
        : { id: "finish-review", label: "Finish review", disabled: true, reason: `Only ${asker} can finish the review.` },
      needsYou: false,
      listTone: "away",
      stepIndex: 1,
      locked: true,
    };
  }
  if (r && r.status === "out") {
    const who = firstName(r.reviewer.name) || "the reviewer";
    return {
      ...base,
      stage: "review",
      tone: "away",
      statusLabel: `With ${who}`,
      statusTone: "lilac",
      whereLabel: `Review · with ${r.reviewer.name || "the reviewer"}`,
      whatNow: {
        lead: "Nothing for you to do.",
        detail: `We'll tell you the moment ${who} sends it back.`,
      },
      primaryAction: { id: "recall", label: "Recall" },
      needsYou: false,
      listTone: "away",
      stepIndex: 1,
      locked: true,
    };
  }
  if (r && r.status === "back") {
    const who = firstName(r.reviewer.name) || "the reviewer";
    const round = currentRound(r);
    // Points still to decide: the reviewer's suggested edits still pending
    // in the text, plus their comments still open.
    const theirIds = new Set(round?.suggestionIds ?? []);
    const edits = pendingSuggestionGroups(draft).filter((g) => g.ids.some((id) => theirIds.has(id))).length;
    const openIds = new Set((draft.comments ?? []).filter((c) => !c.resolved).map((c) => c.id));
    const notes = (round?.commentIds ?? []).filter((id) => openIds.has(id)).length;
    // Their suggestions not in the letter yet (held, REVIEW-X24) are still to decide.
    const held = Object.keys(r.heldSuggestions ?? {}).filter((id) => !round?.decisions?.[id]).length;
    const points = edits + notes + held;
    return {
      ...base,
      stage: "review",
      tone: "needs-you",
      statusLabel: "Back to you",
      statusTone: "amber",
      whereLabel: "Review · back to you",
      whatNow: {
        lead: "Your turn.",
        detail:
          points > 0
            ? `Decide on ${who}'s ${plural(points, "point")}, then finish the review or send it back to ${who}.`
            : `Read ${who}'s note, then finish the review or send it back to ${who}.`,
      },
      primaryAction: { id: "finish-review", label: "Finish review" },
      needsYou: true,
      listTone: "needs-you",
      stepIndex: 1,
      locked: false,
    };
  }

  // ---- Draft gates -------------------------------------------------------
  const blocking: string[] = [];
  if (counts.streaming) blocking.push("DraftHR is still drafting");
  if (counts.sectionsDrafted === 0) blocking.push("Nothing drafted yet");
  if (counts.requiredSectionsEmpty > 0)
    blocking.push(`${plural(counts.requiredSectionsEmpty, "required section")} still empty`);
  if (counts.failingRequired > 0)
    blocking.push(`${plural(counts.failingRequired, "required check")} to fix`);
  const gateReason = blocking.length ? `${blocking[0]}.` : undefined;

  // ---- Changes requested by the approver --------------------------------
  if (status === "changes_requested") {
    const who = approverShort(lastChangesBy(draft) ?? approverName);
    return {
      ...base,
      stage: "draft",
      tone: "needs-you",
      statusLabel: "Changes requested",
      statusTone: "amber",
      whereLabel: "Draft · changes requested",
      whatNow: {
        lead: "Changes requested.",
        detail: `${who === "the approver" ? "The approver" : who} asked for changes. Make them, then send it for approval again.`,
      },
      primaryAction: {
        id: "send-for-approval",
        label: "Send for approval",
        disabled: blocking.length > 0,
        reason: gateReason,
      },
      needsYou: true,
      listTone: "needs-you",
      stepIndex: 0,
      locked: false,
    };
  }

  // ---- Review finished, not yet with the approver ------------------------
  if (r && r.status === "finished") {
    return {
      ...base,
      stage: "approve",
      tone: "yours",
      statusLabel: "Reviewed",
      statusTone: "green",
      whereLabel: ownLetter ? "Sign off · ready" : "Approve · ready to send for approval",
      whatNow: ownLetter
        ? { lead: "Review finished.", detail: "Your own letter needs no approver. Get it ready to send." }
        : {
            lead: "Review finished.",
            detail: "Send it to be approved. The approver gets the letter and the review.",
          },
      primaryAction: ownLetter
        ? { id: "skip-review", label: "Get it ready to send", disabled: blocking.length > 0, reason: gateReason }
        : {
            id: "send-for-approval",
            label: "Send for approval",
            disabled: blocking.length > 0,
            reason: gateReason,
          },
      needsYou: true,
      listTone: "needs-you",
      stepIndex: 2,
      locked: false,
    };
  }

  // ---- Template authoring: no journey ------------------------------------
  if (draft.isTemplateSource) {
    return {
      ...base,
      stage: "draft",
      tone: "yours",
      statusLabel: "Template",
      statusTone: "grey",
      whereLabel: "Template",
      whatNow: { lead: "Template.", detail: "Save it to your templates when it reads right." },
      primaryAction: null,
      needsYou: false,
      listTone: "yours",
      stepIndex: 0,
      locked: false,
    };
  }

  // ---- Draft, or ready for review ----------------------------------------
  const nextStep = ownLetter ? "send it for review or skip straight to sending it" : "send it for review or straight to approval";
  const stillDrafting = blocking.length > 0 || counts.pendingSuggestions > 0;
  if (stillDrafting) {
    const left: string[] = [];
    if (counts.pendingSuggestions > 0) left.push(plural(counts.pendingSuggestions, "suggested edit"));
    if (counts.failingRequired > 0) left.push(plural(counts.failingRequired, "required check"));
    if (counts.requiredSectionsEmpty > 0) left.push(plural(counts.requiredSectionsEmpty, "required section"));
    const where = counts.streaming
      ? "Draft · drafting"
      : counts.failingRequired > 0
        ? `Draft · ${plural(counts.failingRequired, "check")} to fix`
        : counts.pendingSuggestions > 0
          ? `Draft · ${plural(counts.pendingSuggestions, "edit")} to decide`
          : counts.requiredSectionsEmpty > 0
            ? `Draft · ${plural(counts.requiredSectionsEmpty, "section")} to write`
            : "Draft";
    const detail = counts.streaming
      ? "DraftHR is drafting the letter. You can edit as soon as each section lands."
      : left.length > 0
        ? `${joinList(left)} left, then ${nextStep}.`
        : `Draft the letter, then ${nextStep}.`;
    const needsYou = counts.failingRequired > 0 || counts.pendingSuggestions > 0;
    return {
      ...base,
      stage: "draft",
      tone: "yours",
      statusLabel: "Draft",
      statusTone: "grey",
      whereLabel: where,
      whatNow: { lead: "Finish the draft.", detail },
      primaryAction: {
        id: "send-for-review",
        label: "Send for review",
        disabled: blocking.length > 0,
        reason: gateReason,
      },
      needsYou,
      listTone: needsYou ? "needs-you" : "yours",
      stepIndex: 0,
      locked: false,
    };
  }

  const allPass = counts.failingRequired === 0 && counts.warnings === 0;
  return {
    ...base,
    stage: "review",
    tone: "yours",
    statusLabel: "Ready for review",
    statusTone: "blue",
    whereLabel: "Review · ready to send",
    whatNow: {
      lead: "Ready for a second look.",
      detail: `${allPass ? `All ${counts.checksTotal} checks pass.` : "No required check is failing."} ${
        ownLetter ? "Send it for review, or skip straight to sending it." : "Send it for review, or skip straight to approval."
      }`,
    },
    primaryAction: { id: "send-for-review", label: "Send for review" },
    secondaryAction: ownLetter
      ? { id: "skip-review", label: "Skip review and get it ready to send" }
      : { id: "skip-review", label: "Skip review and send for approval" },
    needsYou: false,
    listTone: "yours",
    stepIndex: 1,
    locked: false,
  };
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * React: the journey for one draft, kept in step with the draft and review
 * stores. Null while the draft is not loaded.
 */
export function useJourney(draftId: string | undefined, opts?: Omit<JourneyOptions, "checks">): JourneyInfo | null {
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const latest = useLatestReview(draftId);
  const newest = useNewestReview(draftId);
  // The named reviewer of a review that was recalled sees that it was.
  const review = opts?.viewerIsReviewer && newest?.status === "recalled" ? newest : latest;
  const viewerIsApprover = opts?.viewerIsApprover;
  const viewerIsReviewer = opts?.viewerIsReviewer;
  const viewerIsAsker = opts?.viewerIsAsker;
  return useMemo(
    () => (draft ? getJourney(draft, review, { viewerIsApprover, viewerIsReviewer, viewerIsAsker }) : null),
    [draft, review, viewerIsApprover, viewerIsReviewer, viewerIsAsker]
  );
}

/**
 * Why the letter can't be sent for review or approval yet (a required check
 * fails), or null. Every "Submit for approval" (the document bar, its menu,
 * the Review page) reads this, so none of them gets round the health gate
 * that holds Send for review.
 */
export function submitBlocked(journey: JourneyInfo): string | null {
  const a = journey.primaryAction;
  if (!a || !a.disabled) return null;
  if (a.id !== "send-for-review" && a.id !== "send-for-approval") return null;
  return a.reason ?? "Fix the required checks first.";
}

/**
 * Why Finalise and send isn't open yet, or null. It opens once the letter
 * is approved (or sent); before that, a letter locked with someone else or
 * failing a required check says so.
 */
export function finaliseBlocked(journey: JourneyInfo): string | null {
  if (journey.stage === "send" || journey.stage === "sent") return null;
  if (journey.locked) return "It's with someone else at the moment.";
  return submitBlocked(journey);
}
