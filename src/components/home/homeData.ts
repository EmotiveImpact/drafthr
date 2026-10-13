/**
 * What Home shows, worked out from the stores. Pure functions (tested in
 * homeData.test.ts) plus one hook that wires them to the stores.
 *
 *   journeys          getJourney for every real letter (a letter whose
 *                     checks throw is skipped, never breaks Home)
 *   summary           "<N letters> in progress, <M> need you today."
 *   needsYou          letters that need you (as on Letters), hearings this week, tasks due
 *                     within 7 days, matters' next actions
 *   history           sentences from the letters' timelines, newest first
 */
import { useMemo } from "react";
import type { Draft, Matter, Mode, Task } from "@/lib/letters/types";
import type { WorkspaceRole } from "@/lib/profile";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { canApprove } from "@/lib/permissions";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { getJourney, type JourneyInfo, type JourneyPillTone } from "@/lib/journey/stage";
import { latestReviewIn, useReviewStore, firstName, currentRound, type ReviewRequest } from "@/lib/journey/reviews";
import { allCalendarEvents, type CalendarEvent } from "./calendarEvents";
import { metaFor } from "./letterArt";
import { listStatusPill } from "@/components/letters/letterView";
import { useLetterArchive } from "@/components/letters/archive";

export type LetterJourney = { draft: Draft; journey: JourneyInfo };

/** Real letters of a mode (template sources left out). */
export function realLetters(drafts: Record<string, Draft>, mode: Mode): Draft[] {
  return Object.values(drafts).filter((d) => d.mode === mode && !d.isTemplateSource);
}

/** Who a letter waiting for sign-off was sent to (its latest submission). */
export function approverOf(d: Draft): string {
  const list = d.approvals ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].decision === "submitted") return list[i].reviewerName?.trim() || "Workspace reviewer";
  }
  return "Workspace reviewer";
}

/**
 * The signed-in person is the one this letter waits on for sign-off: they
 * can approve, and it was sent to them by name, to the workspace's
 * reviewers, or they hold the reviewer role (as on the letter itself).
 */
export function viewerApproves(d: Draft, role: WorkspaceRole | undefined, names: string[]): boolean {
  if (!canApprove(role)) return false;
  if (role === "reviewer") return true;
  const who = approverOf(d).toLowerCase();
  if (who === "workspace reviewer") return true;
  return names.some((n) => !!n.trim() && n.trim().toLowerCase() === who);
}

/** getJourney for each letter; a letter that cannot be read is skipped. */
export function journeysFor(
  letters: Draft[],
  requests: Record<string, ReviewRequest>,
  viewerIsApprover: boolean | ((d: Draft) => boolean)
): LetterJourney[] {
  const out: LetterJourney[] = [];
  for (const draft of letters) {
    try {
      const approves = typeof viewerIsApprover === "function" ? viewerIsApprover(draft) : viewerIsApprover;
      out.push({ draft, journey: getJourney(draft, latestReviewIn(requests, draft.id), { viewerIsApprover: approves }) });
    } catch {
      // A letter whose checks cannot run is left out of every roll-up.
    }
  }
  return out;
}

/** "Warning letter" (the short title, or the person's own title for the letter). */
export function letterName(d: Draft): string {
  return d.title?.trim() || metaFor(d.letterType)?.shortTitle || d.letterType.replace(/_/g, " ");
}

/** The letter in a sentence: "warning letter", keeping capitals like "ACAS". */
export function letterInSentence(d: Draft): string {
  const n = letterName(d);
  return n.replace(/^([A-Z])([a-z])/, (_, a: string, b: string) => a.toLowerCase() + b);
}

export function personFor(d: Draft): string {
  return ((d.mode === "employer" ? d.employee?.legalName : d.employer?.legalName) ?? "").trim();
}

/* ─── Summary line ─────────────────────────────────────────────────── */

export type HomeSummary = { inProgress: number; needYou: number };

/**
 * "<N letters> in progress, <M> need you today." M counts the letters whose
 * journey needs the person (a check to fix, an edit to decide, a review back,
 * your approval, ready to send): the same rule as the Letters page's "Needs
 * you" tab and its "N need you" line, so the two pages never disagree.
 */
export function summaryFor(list: LetterJourney[]): HomeSummary {
  let inProgress = 0;
  let needYou = 0;
  for (const { journey } of list) {
    if (journey.stage !== "sent") inProgress += 1;
    if (journey.needsYou) needYou += 1;
  }
  return { inProgress, needYou };
}

/** Letters sitting with the approver (in_review), oldest submission first. */
export function waitingForApproval(letters: Draft[]): Draft[] {
  return letters
    .filter((d) => d.reviewStatus === "in_review")
    .sort((a, b) => (a.submittedForReviewAt ?? a.updatedAt) - (b.submittedForReviewAt ?? b.updatedAt));
}

/** "2 days", "5 hours", "20 minutes". */
export function ageWords(ms: number): string {
  const m = Math.max(1, Math.floor(ms / 60000));
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"}`;
}

/** "4m", "1h", "3h", "1d". */
export function shortAgo(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return formatDateOnly(new Date(ts).toISOString().slice(0, 10), { day: "numeric", month: "short" }, "en-GB");
}

/* ─── Needs you ────────────────────────────────────────────────────── */

export type NeedItem = {
  id: string;
  kind: "review" | "back" | "changes" | "draft" | "reviewed" | "send" | "hearing" | "task" | "next-action";
  pill: { label: string; tone: JourneyPillTone };
  title: string;
  meta: string;
  href: string;
  /** Sort: lower first. */
  rank: number;
};

const DAY = 86400000;

export function needsYouItems({
  journeys,
  tasks,
  matters,
  events,
  now = Date.now(),
}: {
  journeys: LetterJourney[];
  tasks: Record<string, Task>;
  matters: Record<string, Matter>;
  events: CalendarEvent[];
  now?: number;
}): NeedItem[] {
  const out: NeedItem[] = [];

  // One row for every letter whose journey needs you: the same letters as
  // the Letters page's "Needs you" tab (FOUNDATION-X6, HOME-X1).
  for (const { draft: d, journey: j } of journeys) {
    if (!j.needsYou) continue;
    const who = personFor(d);
    const title = who ? `${letterName(d)} for ${who}` : letterName(d);
    const fails = j.counts.failingRequired;
    const issues = `${fails} compliance ${fails === 1 ? "issue" : "issues"} to fix before sending`;
    if (d.reviewStatus === "in_review") {
      const asked = d.submittedForReviewAt ?? d.updatedAt;
      out.push({
        id: `review:${d.id}`,
        kind: "review",
        pill: { label: "Review", tone: "amber" },
        title,
        meta: fails > 0 ? issues : `Waiting for your approval, asked ${ageWords(now - asked)} ago`,
        href: `/editor/${d.id}`,
        rank: 0 + asked / 1e15,
      });
    } else if (j.stage === "review" && j.review?.status === "back") {
      const r = j.review;
      const round = currentRound(r);
      out.push({
        id: `back:${d.id}`,
        kind: "back",
        pill: { label: "Review", tone: "amber" },
        title,
        meta: `Back from ${r.reviewer.name || "your reviewer"}${round?.backAt ? `, ${ageWords(now - round.backAt)} ago` : ""}`,
        href: `/editor/${d.id}`,
        rank: 1,
      });
    } else if (d.reviewStatus === "changes_requested") {
      const by = [...(d.approvals ?? [])].reverse().find((a) => a.decision === "changes_requested");
      out.push({
        id: `changes:${d.id}`,
        kind: "changes",
        pill: { label: "Changes", tone: "amber" },
        title,
        meta: by ? `${firstName(by.reviewerName) || by.reviewerName} asked for changes` : "Changes requested",
        href: `/editor/${d.id}`,
        rank: 2,
      });
    } else if (j.stage === "draft") {
      // A draft with a required check failing or a suggested edit to decide.
      const edits = j.counts.pendingSuggestions;
      out.push({
        id: `draft:${d.id}`,
        kind: "draft",
        pill: { label: "Review", tone: "amber" },
        title,
        meta: fails > 0 ? issues : `${edits} suggested ${edits === 1 ? "edit" : "edits"} to decide`,
        href: `/editor/${d.id}`,
        rank: 2.5,
      });
    } else if (j.stage === "approve") {
      // Review finished: next it goes to the approver.
      const by = j.review?.reviewer.name;
      out.push({
        id: `reviewed:${d.id}`,
        kind: "reviewed",
        pill: { label: "Approval", tone: "amber" },
        title,
        meta: by ? `Reviewed by ${by}, send it for approval` : "Review finished, send it for approval",
        href: `/editor/${d.id}`,
        rank: 2.6,
      });
    } else if (j.stage === "send") {
      const approved = [...(d.approvals ?? [])].reverse().find((a) => a.decision === "approved");
      const by = approved?.reviewerName && !/^workspace reviewer$/i.test(approved.reviewerName) ? approved.reviewerName : "";
      out.push({
        id: `send:${d.id}`,
        kind: "send",
        pill: { label: "Send", tone: "amber" },
        title,
        meta: by ? `Approved by ${by}, ready to send` : "Approved, ready to send",
        href: `/editor/${d.id}`,
        rank: 2.7,
      });
    } else {
      out.push({
        id: `letter:${d.id}`,
        kind: "draft",
        pill: { label: "Review", tone: "amber" },
        title,
        meta: j.whereLabel,
        href: `/editor/${d.id}`,
        rank: 2.8,
      });
    }
  }

  for (const e of events) {
    if (e.type !== "hearing" || e.daysAway < 0 || e.daysAway > 7) continue;
    const [yy, mm, dd] = e.iso.split("-").map(Number);
    const date = shortDay(new Date(yy, mm - 1, dd));
    out.push({
      id: `hearing:${e.id}`,
      kind: "hearing",
      pill: { label: "Hearing", tone: "blue" },
      title: `${e.title.split(",")[0]}, ${date}${e.time ? ` at ${e.time}` : ""}`,
      meta: [e.person, e.matterName ?? e.letter].filter(Boolean).join(" · "),
      href: e.href,
      rank: 3 + e.daysAway / 100,
    });
  }

  const due = Object.values(tasks)
    .filter((t) => t.status === "open" && t.dueISO)
    .filter((t) => {
      const ts = Date.parse(t.dueISO!);
      return Number.isFinite(ts) && ts - now <= 7 * DAY;
    })
    // Sort by the real due date (most overdue first), not the label.
    .sort((a, b) => (a.dueISO ?? "").localeCompare(b.dueISO ?? ""));
  for (const t of due) {
    const m = matters[t.matterId];
    const days = daysUntilDateOnly(t.dueISO!.slice(0, 10), new Date(now));
    const dueLabel =
      days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `Due in ${days}d`;
    out.push({
      id: `task:${t.id}`,
      kind: "task",
      pill: { label: days <= 2 ? "Due" : "Task", tone: days <= 2 ? "amber" : "grey" },
      title: t.label,
      meta: [dueLabel, m?.name].filter(Boolean).join(" · "),
      href: m ? `/matters/${m.id}` : "/matters",
      rank: 4 + days / 1000,
    });
  }

  for (const m of Object.values(matters)) {
    if (m.mode !== "employer" || m.status !== "active" || !m.nextAction) continue;
    out.push({
      id: `matter:${m.id}`,
      kind: "next-action",
      pill: { label: "Next", tone: "grey" },
      title: m.nextAction,
      meta: `Next action · ${m.name}`,
      href: `/matters/${m.id}`,
      rank: 5,
    });
  }

  return out.sort((a, b) => a.rank - b.rank);
}

/* ─── History ──────────────────────────────────────────────────────── */

export type HistoryRow = {
  id: string;
  title: string;
  ts: number;
  draftId: string;
  /** A pill when the letter needs attention, else "Completed". */
  pill?: { label: string; tone: JourneyPillTone };
};

const FORMAT_WORD: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "plain text",
  pack: "an evidence pack",
};

/** One sentence per timeline event, naming what happened, the letter and the person. */
export function historySentence(d: Draft, ev: NonNullable<Draft["timeline"]>[number], me: string): string | null {
  const letter = letterInSentence(d);
  const who = personFor(d);
  const forWho = who ? ` for ${who}` : "";
  const actor = ev.actorName?.trim();
  const isMe = !actor || actor === me;
  switch (ev.kind) {
    case "created":
      return `Drafted ${letter}${forWho}`;
    case "section_generated":
      return `DraftHR drafted ${ev.sectionTitle ? `the ${ev.sectionTitle.toLowerCase()} of ` : ""}the ${letter}${forWho}`;
    case "sections_updated":
    case "details_updated":
    case "without_prejudice_updated":
      return `Edited the ${letter}${forWho}`;
    case "evidence_updated":
      return `Updated evidence on the ${letter}${forWho}`;
    case "comment_added":
      return `${isMe ? "You" : actor} commented on the ${letter}${forWho}`;
    case "comment_resolved":
      return `Resolved a comment on the ${letter}${forWho}`;
    case "collaborator_invited":
      return `${ev.title} to the ${letter}`;
    case "exported": {
      const fmt = String(ev.meta?.format ?? "");
      if (fmt === "marked-sent") return `Marked the ${letter}${forWho} as sent`;
      return `Exported ${letter}${forWho} as ${FORMAT_WORD[fmt] ?? fmt.toUpperCase()}`;
    }
    case "counsel_review":
      return `Counsel review recorded on the ${letter}${forWho}`;
    case "review_submitted":
      return `Sent the ${letter}${forWho} for approval${actor ? ` to ${actor}` : ""}`;
    case "review_approved":
      return `${actor || "The approver"} approved the ${letter}${forWho}`;
    case "review_changes_requested":
      return `${actor || "The approver"} asked for changes to the ${letter}${forWho}`;
    case "review_withdrawn":
      return `Withdrew the ${letter}${forWho} from approval`;
    case "ai_applied":
      return `Applied a DraftHR edit to the ${letter}${forWho}`;
    default:
      return null;
  }
}

export function historyRows(journeys: LetterJourney[], me: string, limit = 4): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const { draft: d, journey: j } of journeys) {
    for (const ev of d.timeline ?? []) {
      const title = historySentence(d, ev, me);
      if (!title) continue;
      rows.push({
        id: `${d.id}:${ev.id}`,
        title,
        ts: ev.createdAt,
        draftId: d.id,
        pill: j.needsYou ? listStatusPill(j) : undefined,
      });
    }
  }
  rows.sort((a, b) => b.ts - a.ts);
  // Only the newest row for a letter carries the letter's live status pill.
  const seen = new Set<string>();
  return rows.slice(0, limit).map((r) => {
    if (!r.pill || seen.has(r.draftId)) return { ...r, pill: undefined };
    seen.add(r.draftId);
    return r;
  });
}

/* ─── Greeting ─────────────────────────────────────────────────────── */

export function greetingFor(date: Date, first: string): string {
  const h = date.getHours();
  const slot = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${slot}, ${first || "there"}`;
}

export function firstNameOf(profile: { personal: { preferredName?: string; legalName?: string } }): string {
  return (
    profile.personal.preferredName?.trim().split(/\s+/)[0] ||
    profile.personal.legalName?.trim().split(/\s+/)[0] ||
    ""
  );
}

/* ─── Hook ─────────────────────────────────────────────────────────── */

/** Everything Home's band and tabs need, kept in step with the stores. */
export function useHomeData(mode: Mode = "employer") {
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const tasks = useDraftStore((s) => s.tasks);
  const requests = useReviewStore((s) => s.requests);
  const matterEvents = useDraftStore((s) => s.events);
  const role = useProfileStore((s) => s.profile.workspaceRole);
  const legalName = useProfileStore((s) => s.profile.personal.legalName);
  const preferredName = useProfileStore((s) => s.profile.personal.preferredName);
  const archived = useLetterArchive((s) => s.archived);
  return useMemo(() => {
    const letters = realLetters(drafts, mode);
    const names = [legalName ?? "", preferredName ?? ""];
    const journeys = journeysFor(letters, requests, (d) => viewerApproves(d, role, names));
    // Letters archived on the Letters page leave its counts and tabs; they
    // leave Home's summary, "Needs you" and "Continue" the same way.
    const live = journeys.filter((x) => !archived[x.draft.id]);
    const events = allCalendarEvents(letters, matters, matterEvents, { mode });
    // Sign-off waits on letters of either mode (the Needs approval tab's badge).
    const waiting = waitingForApproval(Object.values(drafts).filter((d) => !d.isTemplateSource));
    return {
      letters,
      journeys,
      live,
      events,
      waiting,
      summary: summaryFor(live),
      needs: needsYouItems({ journeys: live, tasks, matters, events }),
      canApprove: canApprove(role),
    };
  }, [drafts, matters, matterEvents, tasks, requests, role, legalName, preferredName, mode, archived]);
}

/** "Fri 9 Oct" (no commas). */
export function shortDay(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  const wd = d.toLocaleDateString("en-GB", { weekday: "short" });
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  return `${wd} ${d.getDate()} ${mon}`;
}
