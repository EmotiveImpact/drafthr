/**
 * Every dated thing on a letter, as calendar events: hearings, appeal
 * windows, probation reviews, tribunal time limits and letter responses.
 * Pure: read from the drafts (and their matters), nothing stored.
 *
 * Keys read from a draft:
 *   context.protectedDeadline          tribunal time limit (+ ACAS EC 42 days
 *                                      before, UK letters)
 *   answers.appealDeadline             appeal window closes (set by the Send
 *                                      step when a letter is marked as sent)
 *   answers.hearingDate, meetingDate,
 *   reviewMeetingDate, appealHearingDate hearings and meetings
 *   answers.reviewDate                 probation or performance review
 *   answers.acceptanceDeadline, remedyDeadline, demandDeadline,
 *   advisorDeadline, sendBy            letter responses
 */
import type { Draft, Matter } from "@/lib/letters/types";
import { addDaysToDateOnly, daysUntilDateOnly } from "@/lib/date-only";
import type { LetterTypeId } from "@/lib/letters/types";
import { categoryOf, getLetterMeta } from "@/lib/letters/catalog";

export type CalendarEventType = "hearing" | "appeal" | "probation" | "tribunal" | "response";

/** The older, finer kinds (kept for the .ics summary and the agenda). */
export type CalendarEventKind =
  | "tribunal"
  | "acas_ec"
  | "advisor"
  | "remedy"
  | "appeal"
  | "acceptance"
  | "send_by"
  | "hearing"
  | "review";

export type CalendarEvent = {
  id: string;
  draftId: string;
  /** yyyy-mm-dd */
  iso: string;
  /** "10:00" when the date carried a time. */
  time?: string;
  daysAway: number;
  type: CalendarEventType;
  kind: CalendarEventKind;
  /** Bold first line of the month-grid chip ("Hearing 10:00"). */
  chip: string;
  /** Row title ("Disciplinary hearing, 10:00"). */
  title: string;
  /** Older label kept for the agenda and the .ics file ("Warning letter: appeal by"). */
  label: string;
  /** Longer basis ("Appeal must be lodged by"). */
  basis: string;
  /** Short legal citation when the data carries one ("ERA 1996 s.111(2)"). */
  citation?: string;
  /** Who it is about. */
  person: string;
  letter: string;
  matterId?: string;
  matterName?: string;
};

export const EVENT_TYPE_LABEL: Record<CalendarEventType, string> = {
  hearing: "Hearings",
  appeal: "Appeal deadlines",
  probation: "Probation reviews",
  tribunal: "Tribunal time limits",
  response: "Letter responses",
};

export const EVENT_TYPES: CalendarEventType[] = ["hearing", "appeal", "probation", "tribunal", "response"];

/** Ink and pale fill for each type, from the status tokens. */
export const EVENT_TONE: Record<CalendarEventType, { fg: string; bg: string }> = {
  hearing: { fg: "var(--ds-blue-fg)", bg: "var(--ds-blue-soft)" },
  appeal: { fg: "var(--ds-amber-fg)", bg: "var(--ds-amber-soft)" },
  probation: { fg: "var(--ds-green-fg)", bg: "var(--ds-green-soft)" },
  tribunal: { fg: "var(--ds-red-fg)", bg: "var(--ds-red-soft)" },
  response: { fg: "var(--ds-lilac-fg)", bg: "var(--ds-lilac-soft)" },
};

function meta(id: string) {
  try {
    return getLetterMeta(id as LetterTypeId);
  } catch {
    return null;
  }
}

/** "2026-10-15" or "2026-10-15T10:00" → date and optional time. */
function splitDate(v: unknown): { iso: string; time?: string } | null {
  if (typeof v !== "string" || !v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(v.trim());
  if (!m) return null;
  return { iso: m[1], time: m[2] && m[2] !== "00:00" ? m[2] : undefined };
}

function timeFrom(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : undefined;
}

/** A short statute citation inside a longer basis, if there is one. */
export function shortCitation(basis: string | undefined): string | undefined {
  if (!basis) return undefined;
  const b = basis.trim();
  if (b.length <= 22) return b;
  const m = /([A-Z][A-Za-z]*(?:\s[A-Z][A-Za-z]*)?\s\d{4}\s?,?\s?s\.?\s?\d+[A-Za-z]?(?:\(\d+[a-z]?\))*)/.exec(b);
  return m ? m[1].replace(/\s+/g, " ") : undefined;
}

function hearingNoun(letterType: string): string {
  const cat = (() => {
    try {
      return categoryOf(letterType as LetterTypeId);
    } catch {
      return undefined;
    }
  })();
  if (/grievance/.test(letterType) || cat === "dispute") return "Grievance hearing";
  if (cat === "performance_conduct") return "Disciplinary hearing";
  return "Hearing";
}

/** "Hearing 10:00", "Appeal 14:00", "Meeting", "Hearing". */
function chipFor(noun: string, time?: string): string {
  const short = noun === "Appeal hearing" ? "Appeal" : /meeting/i.test(noun) ? "Meeting" : "Hearing";
  if (time) return `${short} ${time}`;
  return noun === "Appeal hearing" || /meeting/i.test(noun) ? noun : "Hearing";
}

export function extractCalendarEvents(
  drafts: Draft[],
  matters: Record<string, Matter> = {},
  now: Date = new Date()
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const d of drafts) {
    if (d.isTemplateSource) continue;
    const m = meta(d.letterType);
    const letter = d.title?.trim() || m?.shortTitle || d.letterType.replace(/_/g, " ");
    const person =
      (d.mode === "employer" ? d.employee?.legalName : d.employer?.legalName)?.trim() || "No name yet";
    const matter = d.matterId ? matters[d.matterId] : undefined;
    const base = { draftId: d.id, person, letter, matterId: matter?.id, matterName: matter?.name };
    const a = (d.answers ?? {}) as Record<string, unknown>;
    let n = 0;
    const push = (
      e: Omit<CalendarEvent, "id" | "daysAway" | "draftId" | "person" | "letter" | "matterId" | "matterName">
    ) => {
      out.push({ ...base, ...e, id: `${d.id}:${e.kind}:${e.iso}:${n++}`, daysAway: daysUntilDateOnly(e.iso, now) });
    };

    const dl = d.context?.protectedDeadline;
    const dlDate = splitDate(dl?.iso);
    if (dl && dlDate) {
      push({
        iso: dlDate.iso,
        type: "tribunal",
        kind: "tribunal",
        chip: "ET time limit",
        title: "Tribunal claim time limit",
        label: `${letter}: limitation expires`,
        basis: dl.basis,
        citation: shortCitation(dl.basis),
      });
      if (d.context.jurisdiction === "UK") {
        const ec = addDaysToDateOnly(dlDate.iso, -42);
        push({
          iso: ec,
          type: "tribunal",
          kind: "acas_ec",
          chip: "ACAS EC by",
          title: "ACAS Early Conciliation by",
          label: `${letter}: ACAS EC by`,
          basis: "Lodge ACAS Early Conciliation at least 6 weeks before tribunal limitation",
          citation: "ACAS EC",
        });
      }
    }

    const hearings: Array<[string, string]> = [
      ["hearingDate", hearingNoun(d.letterType)],
      ["meetingDate", "Meeting"],
      ["reviewMeetingDate", "Review meeting"],
      ["appealHearingDate", "Appeal hearing"],
    ];
    for (const [key, noun] of hearings) {
      const v = splitDate(a[key]);
      if (!v) continue;
      const time = v.time ?? timeFrom(a[key.replace(/Date$/, "Time")]);
      // UK disciplinary, grievance and appeal hearings carry the right to be accompanied.
      const accompanied = d.context?.jurisdiction === "UK" && /Disciplinary|Grievance|Appeal/.test(noun);
      push({
        iso: v.iso,
        time,
        citation: accompanied ? "ERelA 1999 s.10" : undefined,
        type: "hearing",
        kind: "hearing",
        chip: chipFor(noun, time),
        title: time ? `${noun}, ${time}` : noun,
        label: `${letter}: ${noun.toLowerCase()}`,
        basis: noun,
      });
    }

    const appeal = splitDate(a.appealDeadline);
    if (appeal) {
      push({
        iso: appeal.iso,
        type: "appeal",
        kind: "appeal",
        chip: "Appeal closes",
        title: "Appeal window closes",
        label: `${letter}: appeal by`,
        basis: "Appeal must be lodged by",
        citation: d.context?.jurisdiction === "UK" ? "ACAS Code para 26" : undefined,
      });
    }

    const review = splitDate(a.reviewDate);
    if (review) {
      const probation = /probation/.test(d.letterType);
      push({
        iso: review.iso,
        type: "probation",
        kind: "review",
        chip: probation ? "Probation" : "Review",
        title: probation ? "Probation review" : "Performance review",
        label: `${letter}: performance review`,
        basis: "PIP / probation review date",
      });
    }

    const responses: Array<[string, CalendarEventKind, string, string, string, string]> = [
      ["acceptanceDeadline", "acceptance", "Reply due", "Offer reply due", "acceptance by", "Acceptance deadline (offer)"],
      ["remedyDeadline", "remedy", "Remedy due", "Remedy due", "remedy by", "Demanded remedy deadline"],
      ["demandDeadline", "remedy", "Payment due", "Payment due", "payment by", "Pay-dispute demand deadline"],
      ["advisorDeadline", "advisor", "Adviser sign-off", "Adviser sign-off due", "advisor sign-off", "Advisor certification deadline (settlement)"],
      ["sendBy", "send_by", "Send by", "Letter to go out", "send by", "Target date for the letter to go out"],
    ];
    for (const [key, kind, chip, title, lbl, basis] of responses) {
      const v = splitDate(a[key]);
      if (!v) continue;
      push({ iso: v.iso, type: "response", kind, chip, title, label: `${letter}: ${lbl}`, basis });
    }
  }
  out.sort((x, y) => x.iso.localeCompare(y.iso) || (x.time ?? "").localeCompare(y.time ?? ""));
  return out;
}

/** "Today", "Tomorrow", "In 3 days", "2 days ago". */
export function daysLeftLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${-days} days ago`;
  return `In ${days} days`;
}

/** Red for tribunal limits and anything overdue, amber within 14 days, grey beyond. */
export function daysLeftTone(e: Pick<CalendarEvent, "type" | "daysAway">): "red" | "amber" | "grey" {
  if (e.daysAway < 0 || e.type === "tribunal") return "red";
  if (e.daysAway < 14) return "amber";
  return "grey";
}

/** The .ics file for every event (one VEVENT each, all-day, unique UID). */
export function buildIcs(events: CalendarEvent[], now: Date = new Date()): string {
  const stamp = (iso: string) => iso.replace(/-/g, "");
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DRAFTHR//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  events.forEach((e, i) => {
    const date = stamp(e.iso);
    const next = stamp(addDaysToDateOnly(e.iso, 1));
    // UID must be unique per VEVENT: several answer fields share one kind,
    // so fold in the date and the index (calendar apps dedupe same-UID events).
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.draftId}-${e.kind}-${date}-${i}@drafthr.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${escapeIcs(`${e.title}${e.person ? `, ${e.person}` : ""}`)}`,
      `DESCRIPTION:${escapeIcs([e.label, e.basis, e.matterName ? `Matter: ${e.matterName}` : ""].filter(Boolean).join(". "))}`,
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
