/**
 * The notification feed behind the bell and the Notifications page.
 *
 * Two sources, both read from real data:
 *   deriveNotifications (src/lib/notifications.ts): tribunal and ACAS
 *     deadlines, counsel review, missing clauses, idle drafts, profile set-up
 *   people and dates on the letters: approvals and change requests,
 *     comments from other people, reviews sent back, an appeal window
 *     closing within five working days on a sent letter, and a hearing
 *     today or tomorrow
 *
 * Each item has a stable id (read and snoozed state are kept against it,
 * see notificationState.ts) and the time it happened, so the list can be
 * split into Today and Earlier. Items with no event time (a deadline that
 * is getting close) use the time they first appeared.
 */
import type { Draft, Matter } from "@/lib/letters/types";
import type { Profile } from "@/lib/profile";
import { deriveNotifications, type NotificationSeverity } from "@/lib/notifications";
import { daysUntilDateOnly } from "@/lib/date-only";
import type { ReviewRequest } from "@/lib/journey/reviews";
import { extractCalendarEvents } from "./calendarEvents";
import { letterInSentence, letterName, personFor, shortDay } from "./homeData";

/** A title in parts; `b` parts are names, shown in ink. */
export type TitlePart = string | { b: string };

export type FeedCategory = "deadlines" | "approvals" | "comments" | "compliance" | "reminders";

export const FEED_CATEGORY_LABEL: Record<FeedCategory, { title: string; sub: string }> = {
  deadlines: { title: "Deadlines and hearings", sub: "Tribunal and ACAS dates, appeal windows, hearings" },
  approvals: { title: "Approvals and reviews", sub: "Sign-off decisions and reviews coming back" },
  comments: { title: "Comments", sub: "When someone comments on your letter" },
  compliance: { title: "Compliance", sub: "Missing clauses and counsel review" },
  reminders: { title: "Reminders", sub: "Idle drafts and profile set-up" },
};

export type FeedLead =
  | { type: "person"; name: string }
  | {
      type: "icon";
      icon: "calendar" | "message" | "scale" | "gauge" | "shield" | "file" | "user" | "check" | "undo";
      tone: "red" | "amber" | "grey" | "green";
    };

export type FeedItem = {
  id: string;
  severity: NotificationSeverity;
  category: FeedCategory;
  title: TitlePart[];
  /** Plain text of the title (aria labels, tests). */
  text: string;
  /** Context line (letter, person, date). */
  meta: string;
  /** Dot before the meta line (a token), when the item has one. */
  dot?: string;
  lead: FeedLead;
  /** When it happened (ms). Undefined: use when it first appeared. */
  at?: number;
  href?: string;
  /** Short label for the action on the page ("Open draft"). */
  actionLabel?: string;
  /** Urgent items: a primary button and Snooze. */
  primary?: string;
  draftId?: string;
};

const DAY = 86400000;

export function plain(parts: TitlePart[]): string {
  return parts.map((p) => (typeof p === "string" ? p : p.b)).join("");
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Working days between today and an ISO date (Mon to Fri), 0 when today. */
export function workingDaysUntil(iso: string, now: Date): number {
  const days = daysUntilDateOnly(iso, now);
  if (days <= 0) return days;
  let n = 0;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 1; i <= days; i += 1) {
    const d = new Date(start.getTime() + i * DAY);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function buildFeed({
  drafts,
  matters = {},
  profile,
  reviews = {},
  now = Date.now(),
}: {
  drafts: Draft[];
  matters?: Record<string, Matter>;
  profile: Profile;
  reviews?: Record<string, ReviewRequest>;
  now?: number;
}): FeedItem[] {
  const out: FeedItem[] = [];
  const me = (profile.personal.legalName || profile.personal.preferredName || "").trim();
  const byId = new Map(drafts.map((d) => [d.id, d]));

  /* 1. What the app derived before (kept, with its wording). */
  for (const n of deriveNotifications(drafts, profile, now)) {
    const d = n.draftId ? byId.get(n.draftId) : undefined;
    const context = d ? [letterName(d), personFor(d)].filter(Boolean).join(" · ") : "";
    const deadline = n.kind === "tribunal_deadline" || n.kind === "acas_ec_deadline";
    const category: FeedCategory = deadline
      ? "deadlines"
      : n.kind === "stale_draft" || n.kind === "profile_incomplete"
        ? "reminders"
        : "compliance";
    out.push({
      id: n.id,
      severity: n.severity,
      category,
      title: [n.title],
      text: n.title,
      meta: deadline ? n.description : context || n.description,
      dot: n.severity === "urgent" ? "var(--ds-red-solid)" : n.severity === "warn" ? "var(--ds-amber-dot)" : undefined,
      lead: deadline
        ? { type: "icon", icon: "calendar", tone: n.severity === "urgent" ? "red" : "amber" }
        : n.kind === "stale_draft"
          ? { type: "icon", icon: "file", tone: "grey" }
          : n.kind === "profile_incomplete"
            ? { type: "icon", icon: "user", tone: "grey" }
            : { type: "icon", icon: "shield", tone: n.severity === "warn" ? "amber" : "grey" },
      href: n.actionHref,
      actionLabel: n.actionLabel,
      primary: n.severity === "urgent" && n.actionHref ? "Open letter" : undefined,
      draftId: n.draftId,
    });
  }

  for (const d of drafts) {
    const name = letterName(d);
    const inSentence = letterInSentence(d);
    const person = personFor(d);
    const href = `/editor/${d.id}`;
    const context = [name, person].filter(Boolean).join(" · ");

    /* 2. Sign-off decisions by someone else. */
    for (const a of d.approvals ?? []) {
      if (sameName(a.reviewerName, me) || a.decision === "submitted") continue;
      if (now - a.createdAt > 30 * DAY) continue;
      if (a.decision === "approved") {
        out.push({
          id: `approved-${a.id}`,
          severity: "info",
          category: "approvals",
          title: [{ b: a.reviewerName }, ` approved the ${inSentence}`],
          text: `${a.reviewerName} approved the ${inSentence}`,
          meta: context,
          dot: "var(--ds-green-fg)",
          lead: { type: "person", name: a.reviewerName },
          at: a.createdAt,
          href,
          actionLabel: "Open letter",
          draftId: d.id,
        });
      } else if (a.decision === "changes_requested") {
        out.push({
          id: `changes-${a.id}`,
          severity: "warn",
          category: "approvals",
          title: [{ b: a.reviewerName }, ` asked for changes to the ${inSentence}`],
          text: `${a.reviewerName} asked for changes to the ${inSentence}`,
          meta: a.body ? `“${a.body}”` : context,
          dot: "var(--ds-amber-dot)",
          lead: { type: "person", name: a.reviewerName },
          at: a.createdAt,
          href,
          actionLabel: "Read feedback",
          draftId: d.id,
        });
      }
    }

    /* 3. Comments from other people (open threads, last 30 days). */
    for (const c of d.comments ?? []) {
      if (c.resolved || c.authorId === "me" || sameName(c.authorName, me)) continue;
      if (now - c.createdAt > 30 * DAY) continue;
      out.push({
        id: `comment-${c.id}`,
        severity: "info",
        category: "comments",
        title: [{ b: c.authorName || "Someone" }, c.parentId ? ` replied on the ${inSentence}` : ` commented on the ${inSentence}`],
        text: `${c.authorName || "Someone"} commented on the ${inSentence}`,
        meta: `“${c.body.length > 90 ? `${c.body.slice(0, 88).trimEnd()}…` : c.body}”`,
        lead: { type: "icon", icon: "message", tone: "grey" },
        at: c.createdAt,
        href,
        actionLabel: "Open letter",
        draftId: d.id,
      });
    }

    /* 4. An appeal window closing within five working days on a sent letter. */
    const appeal = (d.answers as Record<string, unknown>)?.appealDeadline;
    const sent = (d.exports ?? []).some((x) => x.format === "marked-sent");
    if (sent && typeof appeal === "string" && /^\d{4}-\d{2}-\d{2}/.test(appeal)) {
      const iso = appeal.slice(0, 10);
      const wd = workingDaysUntil(iso, new Date(now));
      if (wd >= 0 && wd <= 5) {
        out.push({
          id: `appeal-${d.id}-${iso}`,
          severity: wd <= 1 ? "warn" : "info",
          category: "deadlines",
          title: ["Appeal window for ", { b: person || name }, ` closes ${shortDay(isoToDate(iso))}`],
          text: `Appeal window for ${person || name} closes ${shortDay(isoToDate(iso))}`,
          meta: `${name} · ${wd === 0 ? "closes today" : `${wd} working ${wd === 1 ? "day" : "days"} left`}`,
          dot: wd <= 1 ? "var(--ds-amber-dot)" : undefined,
          lead: { type: "icon", icon: "scale", tone: "grey" },
          href,
          actionLabel: "Open letter",
          draftId: d.id,
        });
      }
    }
  }

  /* 5. Reviews that came back. */
  for (const r of Object.values(reviews)) {
    const d = byId.get(r.draftId);
    if (!d) continue;
    for (const round of r.rounds ?? []) {
      if (!round.backAt || now - round.backAt > 30 * DAY) continue;
      const who = r.reviewer.name || "Your reviewer";
      out.push({
        id: `review-back-${r.id}-${round.n}`,
        severity: "warn",
        category: "approvals",
        title: [{ b: who }, ` sent back their review of the ${letterInSentence(d)}`],
        text: `${who} sent back their review of the ${letterInSentence(d)}`,
        meta: [letterName(d), personFor(d)].filter(Boolean).join(" · "),
        dot: "var(--ds-blue-fg)",
        lead: { type: "person", name: who },
        at: round.backAt,
        href: `/editor/${d.id}`,
        actionLabel: "Read feedback",
        draftId: d.id,
      });
    }
  }

  /* 6. Hearings today or tomorrow. */
  for (const e of extractCalendarEvents(drafts, matters, new Date(now))) {
    if (e.type !== "hearing" || e.daysAway < 0 || e.daysAway > 1) continue;
    const when = e.daysAway === 0 ? "today" : "tomorrow";
    const noun = e.title.split(",")[0];
    const date = shortDay(isoToDate(e.iso));
    out.push({
      id: `hearing-${e.id}`,
      severity: "urgent",
      category: "deadlines",
      title: [`${noun} for `, { b: e.person }, ` is ${when}`],
      text: `${noun} for ${e.person} is ${when}`,
      meta: `${noun}, ${date}${e.time ? ` at ${e.time}` : ""}`,
      dot: "var(--ds-red-solid)",
      lead: { type: "icon", icon: "calendar", tone: "red" },
      href: `/editor/${e.draftId}`,
      actionLabel: "Open letter",
      primary: "Open letter",
      draftId: e.draftId,
    });
  }

  return out;
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { urgent: 0, warn: 1, info: 2 };

/** Today first, then Earlier; most urgent then newest within each. */
export function groupFeed<T extends { severity: NotificationSeverity; time: number }>(
  items: T[],
  now = Date.now()
): { today: T[]; earlier: T[] } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const sort = (a: T, b: T) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.time - a.time;
  return {
    today: items.filter((i) => i.time >= start.getTime()).sort(sort),
    earlier: items.filter((i) => i.time < start.getTime()).sort(sort),
  };
}

/** "now", "2m", "25m", "1h", "Yesterday", "Mon 12 Oct". */
export function feedAgo(at: number, now = Date.now()): string {
  const m = Math.floor((now - at) / 60000);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  if (at >= startToday.getTime()) {
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  }
  if (at >= startToday.getTime() - DAY) return "Yesterday";
  return shortDay(at);
}

/** Start of tomorrow: when a snoozed item comes back. */
export function snoozeUntil(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + DAY;
}
