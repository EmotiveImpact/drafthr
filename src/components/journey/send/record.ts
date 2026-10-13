import type { Draft, Employee, ExportEvent } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { parseDateOnly, toDateOnly, todayDateOnly } from "@/lib/date-only";

/**
 * The Send step's saved data, and the facts the Sent screens show, read from
 * the draft's real fields. Pure functions only (no React, no store), so the
 * Send step, the Sent panel, the full Finalise page and the letter's banner
 * all tell the same story.
 *
 * Where it lives on the draft (synced with the rest of `answers`):
 *   answers._send          the choices on the Send step, saved as they change
 *   answers._sent          the record of the last send (how, when, what)
 *   answers.appealDeadline the appeal window's close date once sent (the
 *                          Calendar reads this key)
 *   answers.appealHearingDate  the appeal hearing, once picked
 * The sent state itself is the "marked-sent" export event, as before, whose
 * time is the date given (so the seal and the appeal date follow it).
 */

/** How the person gets the letter. */
export type SendWay = "self" | "email";

/** How it was handed over. Same values as `context.deliveryMethod`. */
export type GivenBy = Draft["context"]["deliveryMethod"];

/** What the Send step downloads. "audit" is the audit record (a text file). */
export type DownloadKey = "pdf" | "docx" | "pack" | "audit";
export type DownloadChoice = Record<DownloadKey, boolean>;

/** The letter's own format on the full page ("The letter: PDF / Word / Plain text"). */
export type LetterFormat = "pdf" | "docx" | "txt";

export type SendPrefs = {
  way: SendWay;
  givenBy: GivenBy;
  /** YYYY-MM-DD, local calendar date. */
  dateGiven: string;
  downloads: DownloadChoice;
  /** Full page: the letter's format. */
  letterFormat: LetterFormat;
  /** Full page: download the letter itself. */
  includeLetter: boolean;
  /** Full page: evidence items left out of the pack. */
  excludedEvidence: string[];
  /** Full page: a covering note kept with the pack. */
  coverNote: string;
};

export type SentRecord = {
  /** When the send was recorded (the click), ms. */
  recordedAt: number;
  way: SendWay;
  givenBy: GivenBy;
  dateGiven: string;
  /** The files downloaded with the send, in order. */
  downloaded: Array<DownloadKey | LetterFormat>;
  /** Emailed from DraftHR: the address, the name and the provider's id. */
  emailedTo?: string;
  emailedName?: string;
  emailId?: string;
  /** The appeal close date written to answers.appealDeadline, if any. */
  appealDeadline?: string;
  /** What answers.appealDeadline held before the send (restored on Undo). */
  prevAppealDeadline?: string | null;
};

export const GIVEN_BY_OPTIONS: ReadonlyArray<{ value: GivenBy; label: string }> = [
  { value: "hand-delivery", label: "Hand, in person" },
  { value: "post", label: "Post" },
  { value: "recorded-delivery", label: "Recorded delivery" },
  { value: "email", label: "Email, from your own inbox" },
];

export function givenByLabel(v: GivenBy): string {
  return GIVEN_BY_OPTIONS.find((o) => o.value === v)?.label ?? "Hand, in person";
}

/** How it was given, in words, for the banner ("handed over in person"). */
export function givenByPhrase(v: GivenBy, way: SendWay = "self"): string {
  if (way === "email") return "emailed from DraftHR";
  switch (v) {
    case "post":
      return "sent by post";
    case "recorded-delivery":
      return "sent by recorded delivery";
    case "email":
      return "emailed from your own inbox";
    default:
      return "handed over in person";
  }
}

/** The Activity entry for the send ("Handed over in person"). */
export function givenByActivity(v: GivenBy, way: SendWay = "self", emailedName?: string): string {
  if (way === "email") return emailedName ? `Emailed to ${emailedName}` : "Emailed from DraftHR";
  switch (v) {
    case "post":
      return "Sent by post";
    case "recorded-delivery":
      return "Sent by recorded delivery";
    case "email":
      return "Emailed from your own inbox";
    default:
      return "Handed over in person";
  }
}

const DEFAULT_DOWNLOADS = (evidence: number): DownloadChoice => ({
  pdf: true,
  docx: false,
  pack: evidence > 0,
  audit: false,
});

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const WAYS: SendWay[] = ["self", "email"];
const GIVEN: GivenBy[] = ["hand-delivery", "post", "recorded-delivery", "email"];
const FORMATS: LetterFormat[] = ["pdf", "docx", "txt"];

/** The saved Send step choices, with the defaults filled in. */
export function getSendPrefs(draft: Draft, today = todayDateOnly()): SendPrefs {
  const raw = obj((draft.answers as Record<string, unknown>)?._send) ?? {};
  const evidence = draft.evidence?.length ?? 0;
  const d = obj(raw.downloads);
  const dl = DEFAULT_DOWNLOADS(evidence);
  const date = typeof raw.dateGiven === "string" && parseDateOnly(raw.dateGiven) ? raw.dateGiven : today;
  return {
    way: WAYS.includes(raw.way as SendWay) ? (raw.way as SendWay) : "self",
    givenBy: GIVEN.includes(raw.givenBy as GivenBy) ? (raw.givenBy as GivenBy) : "hand-delivery",
    // A saved date later than today (a clock change) falls back to today.
    dateGiven: date > today ? today : date,
    downloads: d
      ? {
          pdf: d.pdf === true,
          docx: d.docx === true,
          pack: d.pack === true,
          audit: d.audit === true,
        }
      : dl,
    letterFormat: FORMATS.includes(raw.letterFormat as LetterFormat) ? (raw.letterFormat as LetterFormat) : "pdf",
    includeLetter: raw.includeLetter !== false,
    excludedEvidence: Array.isArray(raw.excludedEvidence)
      ? (raw.excludedEvidence as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    coverNote: typeof raw.coverNote === "string" ? raw.coverNote : "",
  };
}

/** The record of the last send, when the letter is sent. */
export function getSentRecord(draft: Draft): SentRecord | null {
  const raw = obj((draft.answers as Record<string, unknown>)?._sent);
  if (!raw) return null;
  if (!isSent(draft)) return null;
  const way = WAYS.includes(raw.way as SendWay) ? (raw.way as SendWay) : "self";
  const givenBy = GIVEN.includes(raw.givenBy as GivenBy) ? (raw.givenBy as GivenBy) : "hand-delivery";
  return {
    recordedAt: typeof raw.recordedAt === "number" ? raw.recordedAt : 0,
    way,
    givenBy,
    dateGiven: typeof raw.dateGiven === "string" ? raw.dateGiven : "",
    downloaded: Array.isArray(raw.downloaded)
      ? (raw.downloaded as unknown[]).filter((x): x is SentRecord["downloaded"][number] =>
          typeof x === "string" && ["pdf", "docx", "pack", "audit", "txt"].includes(x)
        )
      : [],
    emailedTo: typeof raw.emailedTo === "string" ? raw.emailedTo : undefined,
    emailedName: typeof raw.emailedName === "string" ? raw.emailedName : undefined,
    emailId: typeof raw.emailId === "string" ? raw.emailId : undefined,
    appealDeadline: typeof raw.appealDeadline === "string" ? raw.appealDeadline : undefined,
    prevAppealDeadline:
      typeof raw.prevAppealDeadline === "string" ? raw.prevAppealDeadline : raw.prevAppealDeadline === null ? null : undefined,
  };
}

export function markedSentEvents(draft: Draft): ExportEvent[] {
  return (draft.exports ?? []).filter((e) => e.format === "marked-sent");
}

export function isSent(draft: Draft): boolean {
  return markedSentEvents(draft).length > 0;
}

/** When it was sent (the latest marked-sent event): the date given. */
export function sentAtOf(draft: Draft): number | null {
  const ev = markedSentEvents(draft);
  return ev.length ? Math.max(...ev.map((e) => e.exportedAt)) : null;
}

/** The date given as a YYYY-MM-DD, from the record or the sent event. */
export function dateGivenOf(draft: Draft): string | null {
  const rec = getSentRecord(draft);
  if (rec?.dateGiven && parseDateOnly(rec.dateGiven)) return rec.dateGiven;
  const at = sentAtOf(draft);
  return at ? toDateOnly(new Date(at)) : null;
}

/**
 * The time to record for the marked-sent event: the date given at the
 * current time of day (so "today" is now and a back-dated date keeps the
 * order of the day).
 */
export function sentTimestampFor(dateGiven: string, now = new Date()): number {
  const d = parseDateOnly(dateGiven);
  if (!d || toDateOnly(now) === dateGiven) return now.getTime();
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return Math.min(d.getTime(), now.getTime());
}

/* ------------------------------------------------------------------ */
/*  Appeal window                                                      */
/* ------------------------------------------------------------------ */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, "twenty-one": 21, thirty: 30,
};

function textOf(html: string | undefined): string {
  return (html ?? "")
    .replace(/<(ins)\b[^>]*data-status="pending"[^>]*>[\s\S]*?<\/ins>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The letter type gives a right of appeal (it has an appeal section). */
export function letterHasAppealSection(draft: Draft): boolean {
  if (draft.mode !== "employer") return false;
  if ((draft.sections ?? []).some((s) => s.sectionId === "appeal_rights" && textOf(s.html).length > 0)) return true;
  try {
    return getLetterMeta(draft.letterType).defaultSections.some((s) => s.id === "appeal_rights" && s.required);
  } catch {
    return false;
  }
}

/**
 * The appeal period in working days, as the letter states it ("within five
 * working days"), or the wizard's answer. Null when the letter gives no
 * right of appeal (offers, promotions, employee letters).
 */
export function appealWorkingDays(draft: Draft): number | null {
  if (draft.mode !== "employer") return null;
  const sections = draft.sections ?? [];
  const ordered = [
    ...sections.filter((s) => s.sectionId === "appeal_rights"),
    ...sections.filter((s) => s.sectionId !== "appeal_rights"),
  ];
  for (const s of ordered) {
    const text = textOf(s.html).toLowerCase();
    if (!/appeal/.test(text)) continue;
    const m = text.match(/within\s+([a-z-]+|\d{1,2})\s*(?:\(\d+\)\s*)?working days/);
    if (!m) continue;
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1]];
    if (n && n > 0 && n < 60) return n;
  }
  const answered = Number((draft.answers as Record<string, unknown>)?.appealDeadlineWorkingDays);
  if (Number.isFinite(answered) && answered > 0 && answered < 60 && letterHasAppealSection(draft)) return answered;
  return null;
}

/** Add working days (Monday to Friday) to a YYYY-MM-DD date. */
export function addWorkingDays(dateOnly: string, days: number): string {
  const d = parseDateOnly(dateOnly);
  if (!d) return dateOnly;
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return toDateOnly(d);
}

/** The appeal window's close date for a date given, or null without one. */
export function appealCloseDate(draft: Draft, dateGiven: string | null): string | null {
  const n = appealWorkingDays(draft);
  if (!n || !dateGiven) return null;
  return addWorkingDays(dateGiven, n);
}

/* ------------------------------------------------------------------ */
/*  Dates in words                                                     */
/* ------------------------------------------------------------------ */

const asDate = (v: string | number | Date): Date | null =>
  typeof v === "string" ? parseDateOnly(v) : new Date(v);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);

/** "Wed 14 Oct" */
export function fmtShortDay(v: string | number | Date): string {
  const d = asDate(v);
  return d ? `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MON(d)}` : "";
}
/** "Wed 14 Oct 2026" */
export function fmtShortDayYear(v: string | number | Date): string {
  const d = asDate(v);
  return d ? `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MON(d)} ${d.getFullYear()}` : "";
}
/** "14 October" */
export function fmtDayMonth(v: string | number | Date): string {
  const d = asDate(v);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : "";
}
/** "21 Oct 2026" */
export function fmtDayMonYear(v: string | number | Date): string {
  const d = asDate(v);
  return d ? `${d.getDate()} ${MON(d)} ${d.getFullYear()}` : "";
}
/** "16:05" */
export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/*  The recipient                                                      */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
export function isValidEmail(v: string | undefined | null): v is string {
  return !!v && v.length <= 254 && EMAIL_RE.test(v.trim());
}

export type Recipient = {
  /** Full name ("Jordan Hale"), or the employer's name for an employee letter. */
  name: string;
  /** For the headings ("How will Jordan get it?"). */
  short: string;
  /** The address stored on the letter (the only one DraftHR emails). */
  email: string | null;
  /** The employee record's address, when the letter has none of its own. */
  suggestedEmail: string | null;
  /** The letter goes to the employer (an employee's own letter). */
  toEmployer: boolean;
};

export function firstNameOf(name: string | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** The employee record behind the letter: the linked one, else a name match. */
export function employeeRecordFor(draft: Draft, employees: Record<string, Employee>): Employee | undefined {
  const linked = (draft.answers as Record<string, unknown>)?.linkedEmployeeId as string | undefined;
  if (linked && employees[linked]) return employees[linked];
  const name = draft.employee?.legalName?.trim().toLowerCase();
  if (!name) return undefined;
  return Object.values(employees).find((e) => e.legalName?.trim().toLowerCase() === name);
}

/** Who the letter goes to, and the address it can be emailed to. */
export function recipientOf(draft: Draft, employee?: Employee): Recipient {
  const a = draft.answers as Record<string, unknown>;
  if (draft.mode === "employee") {
    const person = draft.employer?.signatoryName?.trim();
    const company = draft.employer?.legalName?.trim() ?? "";
    const email = typeof a.recipientEmail === "string" && isValidEmail(a.recipientEmail) ? a.recipientEmail.trim() : null;
    return {
      name: person || company,
      short: person ? firstNameOf(person) : company,
      email,
      suggestedEmail: null,
      toEmployer: true,
    };
  }
  const name = draft.employee?.legalName?.trim() ?? "";
  const preferred = draft.employee?.preferredName?.trim();
  const stored = draft.employee?.email?.trim() || (typeof a.employeeEmail === "string" ? a.employeeEmail.trim() : "");
  const fromRecord = employee?.email?.trim() ?? "";
  return {
    name,
    short: firstNameOf(preferred || name),
    email: isValidEmail(stored) ? stored : null,
    suggestedEmail: !isValidEmail(stored) && isValidEmail(fromRecord) ? fromRecord : null,
    toEmployer: false,
  };
}

/* ------------------------------------------------------------------ */
/*  The sent banner                                                    */
/* ------------------------------------------------------------------ */

const DOWNLOAD_WORDS: Record<string, string> = {
  pdf: "the PDF",
  docx: "the Word file",
  txt: "the plain text",
  pack: "the evidence pack",
  audit: "the audit record",
};

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * The green banner above a sent letter (mock f8-sent, letter-live):
 *   downloaded: "Marked as sent on 14 October, handed over in person." then
 *     "The PDF is in your downloads and a copy is saved to <matter>. The
 *     appeal window closes on 21 October."
 *   emailed: "Emailed to Jordan Hale at 18:42." then "A copy is saved to
 *     <matter>. The appeal window closes on 21 October."
 * Only what happened is said: the downloads named are the ones made with the
 * send, the matter only when the letter is in one, the appeal sentence only
 * for letters with a right of appeal.
 */
export function sentBannerText(
  draft: Draft,
  opts: { matterName?: string | null } = {}
): { title: string; detail: string } | null {
  const sentAt = sentAtOf(draft);
  if (!sentAt) return null;
  const rec = getSentRecord(draft);
  const dateGiven = rec?.dateGiven || toDateOnly(new Date(sentAt));
  const close = rec?.appealDeadline ?? appealCloseDate(draft, dateGiven);
  const where = opts.matterName ? `a copy is saved to ${opts.matterName}` : "a copy is saved with this letter";
  const appeal = close ? ` The appeal window closes on ${fmtDayMonth(close)}.` : "";

  if (rec?.way === "email") {
    const who = rec.emailedName || rec.emailedTo || "the recipient";
    return {
      title: `Emailed to ${who} at ${fmtTime(rec.recordedAt || sentAt)}.`,
      detail: `${cap(where)}.${appeal}`,
    };
  }

  const how = givenByPhrase(rec?.givenBy ?? draft.context.deliveryMethod ?? "hand-delivery", "self");
  const files = (rec?.downloaded ?? []).map((k) => DOWNLOAD_WORDS[k]).filter(Boolean);
  const first = files.length
    ? `${cap(joinAnd(files))} ${files.length === 1 ? "is" : "are"} in your downloads and ${where}.`
    : `${cap(where)}.`;
  return {
    title: `Marked as sent on ${fmtDayMonth(dateGiven)}, ${how}.`,
    detail: `${first}${appeal}`,
  };
}

/** "Appeal by 21 Oct 2026" for the chip under the banner, or null. */
export function appealChipText(draft: Draft): string | null {
  const rec = getSentRecord(draft);
  const close = rec?.appealDeadline ?? appealCloseDate(draft, dateGivenOf(draft));
  return close ? `Appeal by ${fmtDayMonYear(close)}` : null;
}

/** The download words for Activity ("Downloaded PDF and evidence pack"). */
export function downloadedActivity(keys: SentRecord["downloaded"]): string | null {
  const words: Record<string, string> = {
    pdf: "PDF",
    docx: "Word",
    txt: "plain text",
    pack: "evidence pack",
    audit: "audit record",
  };
  const parts = keys.map((k) => words[k]).filter(Boolean);
  return parts.length ? `Downloaded ${joinAnd(parts)}` : null;
}
