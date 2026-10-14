/**
 * What the matters list and the matter page show about a matter, worked out
 * from real data: its reference, type label, people, stage, deadlines
 * (including the tribunal time limit), owner and an .ics export. Pure
 * functions; nothing here changes the store.
 */
import { format } from "date-fns";
import type { Draft, Employee, EventKind, Matter, MatterColor, MatterEvent, MatterType, RiskBand, Task } from "@/lib/letters/types";
import { addDaysToDateOnly, daysUntilDateOnly, parseDateOnly, todayDateOnly, toDateOnly } from "@/lib/date-only";
import { ukTribunalLimitation } from "@/lib/tribunal-limitation";
import { categoryOf } from "@/lib/letters/catalog";
import type { JourneyInfo } from "@/lib/journey/stage";
import type { PillTone } from "@/components/ds";
import { letterLabel } from "@/components/letters/letterView";

/* ─── Labels and colours ─────────────────────────────────────────────── */

export const MATTER_TYPE_LABEL: Record<MatterType, string> = {
  investigation: "Investigation",
  grievance: "Grievance",
  disciplinary: "Disciplinary",
  performance: "Performance",
  absence: "Absence",
  redundancy: "Redundancy",
  restructure: "Restructure",
  settlement: "Settlement",
  tribunal: "Tribunal",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  other: "Other",
};

export const MATTER_TYPES = Object.keys(MATTER_TYPE_LABEL) as MatterType[];

export function matterTypeLabel(type?: MatterType): string | undefined {
  return type ? (MATTER_TYPE_LABEL[type] ?? type) : undefined;
}

/** Soft swatch (background, ink) per matter colour. */
export const MATTER_TINT: Record<MatterColor, [string, string]> = {
  red: ["var(--ds-tint-rose)", "var(--ds-tint-rose-ink)"],
  amber: ["var(--ds-tint-butter)", "var(--ds-tint-butter-ink)"],
  blue: ["var(--ds-tint-sky)", "var(--ds-tint-sky-ink)"],
  violet: ["var(--ds-tint-lavender)", "var(--ds-tint-lavender-ink)"],
  green: ["var(--ds-tint-mint)", "var(--ds-tint-mint-ink)"],
  slate: ["var(--ds-surface-3)", "var(--ds-body)"],
};

/** Solid tile (background, text) per matter colour: the initial tile. */
export const MATTER_SOLID: Record<MatterColor, [string, string]> = {
  red: ["var(--ds-tint-rose-ink)", "var(--ds-tint-rose)"],
  // The amber status ink, a touch deeper than butter ink, so the butter
  // initial keeps 4.5:1 (butter on butter ink was 4.48:1).
  amber: ["var(--ds-amber-fg)", "var(--ds-tint-butter)"],
  blue: ["var(--ds-tint-sky-ink)", "var(--ds-tint-sky)"],
  violet: ["var(--ds-tint-lavender-ink)", "var(--ds-tint-lavender)"],
  green: ["var(--ds-tint-mint-ink)", "var(--ds-tint-mint)"],
  slate: ["var(--ds-body)", "var(--ds-surface)"],
};

export const RISK_LABEL: Record<RiskBand, string> = {
  low: "Low",
  moderate: "Medium",
  high: "High",
  critical: "Critical",
};

export const RISK_TONE: Record<RiskBand, PillTone> = {
  low: "green",
  moderate: "amber",
  high: "red",
  critical: "red",
};

export const RISK_OPTIONS: { value: RiskBand; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

/**
 * A short reference made from the matter itself: the year it was opened and
 * a short code made from its id ("M-2026-4F2A"). Stable for the life of the matter.
 */
export function matterRef(m: Matter): string {
  let h = 2166136261;
  for (let i = 0; i < m.id.length; i++) h = Math.imul(h ^ m.id.charCodeAt(i), 16777619);
  const tail = (h >>> 0).toString(36).toUpperCase().padStart(4, "0").slice(-4);
  return `M-${new Date(m.createdAt).getFullYear()}-${tail}`;
}

/* ─── People ─────────────────────────────────────────────────────────── */

export type MatterPerson = { name: string; role: string; employeeId: string | null; jobTitle?: string; email?: string };

export const ROLE_LABEL: Record<string, string> = {
  subject: "Subject",
  manager: "Manager",
  accused: "Accused",
  complainant: "Complainant",
  witness: "Witness",
  representative: "Rep",
  other: "Other",
  primary: "Subject",
};

/** Participants with the subject first, else the primary party. */
export function matterPeople(m: Matter, employees: Record<string, Employee>): MatterPerson[] {
  const list: MatterPerson[] = (m.participants ?? []).map((p) => {
    const e = p.employeeId ? employees[p.employeeId] : undefined;
    return {
      name: e?.legalName || p.name,
      role: p.role,
      employeeId: p.employeeId,
      jobTitle: e?.jobTitle,
      email: e?.email,
    };
  });
  list.sort((a, b) => (a.role === "subject" ? -1 : 0) - (b.role === "subject" ? -1 : 0));
  const primary = m.parties?.primaryName?.trim();
  if (primary && !list.some((p) => p.name.trim().toLowerCase() === primary.toLowerCase())) {
    const e = Object.values(employees).find((x) => x.legalName.trim().toLowerCase() === primary.toLowerCase());
    list.unshift({ name: primary, role: "primary", employeeId: e?.id ?? null, jobTitle: e?.jobTitle ?? m.parties?.primaryContext, email: e?.email });
  }
  return list;
}

/** The matter's owner as a display name: its owner field, else you. */
export function matterOwnerName(m: Matter, me: string): string {
  const o = m.ownerUserId?.trim();
  if (o && /\s/.test(o)) return o;
  if (o && /@/.test(o)) return o;
  return me;
}

/* ─── Deadlines ──────────────────────────────────────────────────────── */

export type DeadlineKind = "key" | "event" | "task" | "letter" | "tribunal";

export type DeadlineItem = {
  id: string;
  kind: DeadlineKind;
  /** Date (yyyy-mm-dd); missing for a tribunal limit with no anchor yet. */
  iso?: string;
  /** Exact time for events that have one. */
  time?: string;
  title: string;
  /** Short detail after the date ("Hearing", "Final written warning"). */
  detail?: string;
  /** Statute chip ("ERA s.111"). */
  law?: string;
  /** Extra line under a tribunal item. */
  note?: string;
  eventKind?: EventKind;
  draftId?: string;
  done?: boolean;
};

const EVENT_KIND_LABEL: Record<EventKind, string> = {
  meeting: "Meeting",
  hearing: "Hearing",
  deadline: "Deadline",
  review: "Review",
};

const LETTER_DATE_FIELDS: [string, string][] = [
  ["appealDeadline", "Appeal by"],
  ["acceptanceDeadline", "Acceptance by"],
  ["sendBy", "Send by"],
  ["remedyDeadline", "Remedy by"],
  ["advisorDeadline", "Advisor sign-off"],
  ["demandDeadline", "Payment by"],
  ["reviewDate", "Review date"],
];

const TRIBUNAL_TYPES: MatterType[] = ["disciplinary", "grievance", "tribunal", "settlement", "redundancy", "offboarding", "performance", "investigation", "restructure"];
const TRIBUNAL_CATEGORIES = ["performance_conduct", "dispute", "departure", "tribunal_legal"];

function isDismissal(d: Draft): boolean {
  return categoryOf(d.letterType) === "departure" || /dismiss|termination|redundan/i.test(d.letterType);
}

function sentAt(d: Draft): number | undefined {
  const sent = (d.exports ?? []).filter((e) => e.format === "marked-sent");
  return sent.length ? Math.max(...sent.map((e) => e.exportedAt)) : undefined;
}

/**
 * The tribunal time limit for a matter, from a real anchor: a letter's
 * recorded protected deadline, else the date its latest relevant letter was
 * given (marked as sent). With no anchor it says what starts the clock.
 * Undefined when the matter is not the kind that can reach a tribunal.
 */
export function tribunalItem(m: Matter, drafts: Draft[]): DeadlineItem | undefined {
  const relevant = drafts.filter((d) => TRIBUNAL_CATEGORIES.includes(categoryOf(d.letterType) ?? ""));
  if (relevant.length === 0 && !(m.type && TRIBUNAL_TYPES.includes(m.type))) return undefined;
  if (m.mode !== "employer" && relevant.length === 0) return undefined;
  const lawFor = (d?: Draft) => (d && isDismissal(d) ? "ERA s.111" : m.type === "redundancy" || m.type === "offboarding" ? "ERA s.111" : "EqA s.123");

  const withDeadline = relevant.find((d) => d.context?.protectedDeadline?.iso && d.context.jurisdiction !== "US");
  if (withDeadline?.context.protectedDeadline) {
    return {
      id: `tribunal-${withDeadline.id}`,
      kind: "tribunal",
      iso: withDeadline.context.protectedDeadline.iso.slice(0, 10),
      title: "Tribunal time limit",
      detail: `from ${letterLabel(withDeadline)}`,
      law: lawFor(withDeadline),
      draftId: withDeadline.id,
    };
  }
  const sent = relevant
    .map((d) => ({ d, at: sentAt(d) }))
    .filter((x): x is { d: Draft; at: number } => !!x.at)
    .sort((a, b) => b.at - a.at)[0];
  if (sent) {
    const anchor = toDateOnly(new Date(sent.at));
    const lim = ukTribunalLimitation(anchor, sent.d.context?.ukRegion);
    if (lim) {
      return {
        id: `tribunal-${sent.d.id}`,
        kind: "tribunal",
        iso: lim.iso,
        title: "Tribunal time limit",
        detail: `${lim.months} months less a day`,
        note: `Counted from ${format(new Date(sent.at), "d MMM yyyy")}, when ${letterLabel(sent.d)} was given.`,
        law: lawFor(sent.d),
        draftId: sent.d.id,
      };
    }
  }
  return {
    id: "tribunal-pending",
    kind: "tribunal",
    title: "Tribunal time limit",
    detail: "Starts when the outcome letter is given",
    law: lawFor(relevant[0]),
  };
}

/** Every dated item for the matter, oldest first; the tribunal limit last when undated. */
export function matterDeadlines(m: Matter, drafts: Draft[], events: MatterEvent[], tasks: Task[]): DeadlineItem[] {
  const out: DeadlineItem[] = [];
  const today = todayDateOnly();
  if (m.deadlineISO) {
    out.push({ id: "key", kind: "key", iso: m.deadlineISO.slice(0, 10), title: m.deadlineLabel?.trim() || "Key deadline", detail: "Key deadline" });
  }
  for (const e of events) {
    const iso = e.whenISO.slice(0, 10);
    const time = e.whenISO.length > 10 ? e.whenISO.slice(11, 16) : undefined;
    out.push({ id: `event-${e.id}`, kind: "event", iso, time, title: e.label, detail: [EVENT_KIND_LABEL[e.kind], e.detail].filter(Boolean).join(", "), eventKind: e.kind });
  }
  for (const t of tasks) {
    if (!t.dueISO || t.status === "done") continue;
    out.push({ id: `task-${t.id}`, kind: "task", iso: t.dueISO.slice(0, 10), title: t.label, detail: "Task" });
  }
  for (const d of drafts) {
    const a = d.answers as Record<string, unknown>;
    for (const [field, label] of LETTER_DATE_FIELDS) {
      const v = a?.[field];
      if (typeof v === "string" && parseDateOnly(v)) {
        out.push({ id: `letter-${d.id}-${field}`, kind: "letter", iso: v.slice(0, 10), title: label, detail: letterLabel(d), draftId: d.id });
      }
    }
  }
  const trib = tribunalItem(m, drafts);
  if (trib) out.push(trib);
  for (const it of out) if (it.iso && it.iso < today && it.kind !== "tribunal") it.done = true;
  return out.sort((a, b) => (a.iso ?? "9999").localeCompare(b.iso ?? "9999") || (a.time ?? "").localeCompare(b.time ?? ""));
}

/** The soonest item still to come (today or later). */
export function nextDeadline(items: DeadlineItem[]): DeadlineItem | undefined {
  const today = todayDateOnly();
  return items.find((i) => i.iso && i.iso >= today);
}

/** Items due between today and `days` from now. */
export function dueWithin(items: DeadlineItem[], days: number): DeadlineItem[] {
  const today = todayDateOnly();
  const end = addDaysToDateOnly(today, days);
  return items.filter((i) => i.iso && i.iso >= today && i.iso <= end);
}

export function relativeDays(iso: string): { text: string; tone: "late" | "soon" | "later" } {
  const n = daysUntilDateOnly(iso);
  if (n < 0) return { text: `${Math.abs(n)} ${Math.abs(n) === 1 ? "day" : "days"} overdue`, tone: "late" };
  if (n === 0) return { text: "today", tone: "soon" };
  if (n === 1) return { text: "tomorrow", tone: "soon" };
  return { text: `in ${n} days`, tone: n <= 7 ? "soon" : "later" };
}

/** Longest deadline title the header pill shows as it is. */
const PILL_TITLE_MAX = 22;

/**
 * A short name for a deadline in the matter header pill ("Hearing",
 * "Task", "Tribunal limit"): the title itself when it is short, otherwise what
 * kind of deadline it is, so the pill never ends mid-phrase. The full title is
 * in the Next strip and the Deadlines card.
 */
export function shortDeadlineLabel(item: Pick<DeadlineItem, "kind" | "title" | "eventKind">): string {
  const title = item.title.trim();
  if (title && title.length <= PILL_TITLE_MAX) return title;
  switch (item.kind) {
    case "task":
      return "Task";
    case "event":
      return item.eventKind ? EVENT_KIND_LABEL[item.eventKind] : "Event";
    case "letter":
      return "Letter";
    case "tribunal":
      return "Tribunal limit";
    case "key":
      return "Key deadline";
  }
}

/** The header pill: "Hearing due in 3 days", "Task due today", "Task 2 days overdue". */
export function deadlinePillText(item: Pick<DeadlineItem, "kind" | "title" | "eventKind">, iso: string): string {
  const n = daysUntilDateOnly(iso);
  const rel = relativeDays(iso);
  const when = n < 0 ? rel.text : n === 0 ? "due today" : `due ${rel.text}`;
  return `${shortDeadlineLabel(item)} ${when}`;
}

export function shortDay(iso: string): string {
  const d = parseDateOnly(iso);
  return d ? format(d, "EEE d MMM") : iso;
}

/* ─── Stage ──────────────────────────────────────────────────────────── */

export type MatterStage = { label: string; tone: PillTone };

/**
 * A short stage for the matter from what is happening in it: closed or
 * archived, a hearing coming up, else the stage of its most recent letter
 * still in progress; "Letter sent" once every letter has gone out.
 */
export function matterStage(m: Matter, letters: { draft: Draft; journey: JourneyInfo }[], items: DeadlineItem[]): MatterStage {
  if (m.status === "closed") return { label: "Closed", tone: "grey" };
  if (m.status === "archived") return { label: "Archived", tone: "grey" };
  const next = nextDeadline(items);
  if (next?.eventKind === "hearing") {
    const soon = next.iso ? daysUntilDateOnly(next.iso) <= 7 : false;
    return { label: "Hearing", tone: soon ? "amber" : "blue" };
  }
  const open = letters.filter((l) => l.journey.stage !== "sent").sort((a, b) => b.draft.updatedAt - a.draft.updatedAt)[0];
  if (open) {
    const j = open.journey;
    const label = j.stage === "draft" ? "Drafting" : j.stage === "review" ? "In review" : j.stage === "approve" ? "Approval" : "Ready to send";
    return { label, tone: j.needsYou ? "amber" : j.stage === "draft" ? "grey" : "blue" };
  }
  if (letters.length > 0) return { label: "Letter sent", tone: "green" };
  return { label: "Opened", tone: "grey" };
}

/* ─── Calendar export ────────────────────────────────────────────────── */

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** An .ics calendar with one all-day event per dated item. */
export function deadlinesIcs(entries: { matter: Matter; item: DeadlineItem }[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DRAFTHR//Matters//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  entries.forEach(({ matter, item }, i) => {
    if (!item.iso) return;
    const date = item.iso.replace(/-/g, "");
    const next = addDaysToDateOnly(item.iso, 1).replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${matter.id}-${item.id}-${date}-${i}@drafthr.app`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${escapeIcs(`${item.title}: ${matter.name}`)}`,
      `DESCRIPTION:${escapeIcs([item.detail, item.law, item.note].filter(Boolean).join(". "))}`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
