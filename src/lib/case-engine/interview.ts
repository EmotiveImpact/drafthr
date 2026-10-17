import type { CaseFile, FactSpec, FactValue, IsoDate, MissingFact, Playbook, RunResult, SituationId } from "./types.js";

/**
 * View helpers for the case interview screens: which chapter a question sits
 * in, which question comes next, and how facts read on the case file.
 * Plain code, no React, so the order of questions can be tested.
 */

export type ChapterId = "story" | "who" | "dates" | "risks" | "plan";

export const CHAPTERS: { id: ChapterId; label: string }[] = [
  { id: "story", label: "The story" },
  { id: "who", label: "Who’s involved" },
  { id: "dates", label: "Dates" },
  { id: "risks", label: "Risks" },
  { id: "plan", label: "The plan" },
];

const WHO = /name|investigator|decisionmaker|appealmanager|witness|companion|employmentstatus|employmentstart|worklocation|usstate|personname|reps|headcount|supervisor|publicemployer/i;
const RISK =
  /complaint|grievance|protected|pregnan|health|adjust|criminal|concerted|union|lawyer|whistle|discrimin|ageforty|claimbasis|familyleave|confidentiality|sickness/i;

export function chapterOf(spec: Pick<FactSpec, "key" | "type" | "specialCategory">): ChapterId {
  if (WHO.test(spec.key)) return "who";
  if (spec.specialCategory || RISK.test(spec.key)) return "risks";
  if (spec.type === "date") return "dates";
  return "story";
}

const ORDER: Record<ChapterId, number> = { story: 0, who: 1, dates: 2, risks: 3, plan: 4 };

/**
 * The questions still to ask, in interview order: conflicts first, then must
 * facts by chapter (the playbook's order within a chapter), then the should
 * facts the next letter needs. Skipped questions are left out.
 */
export function questionQueue(run: RunResult, playbook: Playbook, skipped: readonly string[]): MissingFact[] {
  const specs = new Map(playbook.facts.map((f, i) => [f.key, { f, i }]));
  const letterNeeds = new Set(
    run.route.filter((r) => r.status === "needs_facts").flatMap((r) => r.missing ?? []),
  );
  const wanted = run.missing.filter(
    (m) => !skipped.includes(m.key) && (m.conflicted || m.priority === "must" || letterNeeds.has(m.key)),
  );
  const rank = (m: MissingFact) => {
    const s = specs.get(m.key);
    return [m.conflicted ? 0 : 1, s ? ORDER[chapterOf(s.f)] : 9, s?.i ?? 999];
  };
  return [...wanted].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
}

/** Ready-to-draft progress: must facts known out of must facts that apply. */
export function readiness(file: CaseFile, run: RunResult, playbook: Playbook): { known: number; total: number } {
  const mustMissing = run.missing.filter((m) => m.priority === "must").length;
  const known = playbook.facts.filter(
    (f) => f.priority[file.lens] === "must" && file.facts[f.key] && file.facts[f.key].value !== null,
  ).length;
  return { known, total: known + mustMissing };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2 OCT" over "2026", the way the case file's timeline shows dates. */
export function shortDate(iso: IsoDate): { day: string; year: string } {
  const [y, m, d] = iso.split("-").map(Number);
  return { day: `${d} ${MONTHS[m - 1]}`, year: String(y) };
}

export function longDate(iso: IsoDate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${LONG_MONTHS[m - 1]} ${y}`;
}

const WORDS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure",
  not_known: "Not known",
  england: "England",
  wales: "Wales",
  scotland: "Scotland",
  northern_ireland: "Northern Ireland",
  us: "United States",
};

/** A choice as words: "first_written_warning" reads "First written warning". */
export function choiceLabel(value: string): string {
  if (WORDS[value]) return WORDS[value];
  const t = value.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function formatValue(spec: Pick<FactSpec, "type"> | undefined, value: FactValue): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(choiceLabel).join(", ");
  if (spec?.type === "date" && typeof value === "string") return longDate(value);
  if (spec?.type === "choice" && typeof value === "string") return choiceLabel(value);
  return String(value);
}

export const SITUATION_NAMES: Record<SituationId, string> = {
  disciplinary: "Disciplinary",
  grievance: "Grievance",
  redundancy: "Redundancy",
};

/** The case's name: the Reader's title, else the situation and the person. */
export function caseTitle(file: CaseFile): string {
  if (file.notes.title) return file.notes.title;
  const who = file.facts.employeeName?.value ?? file.facts.personName?.value;
  return typeof who === "string" && who ? `${SITUATION_NAMES[file.situation]}: ${who}` : "New case";
}

export type TimelineRow = { key: string; date: IsoDate | null; when: string; what: string; from: string };

/** The timeline: the Reader's dated moments, plus every date fact the case holds. */
export function timelineRows(file: CaseFile, playbook: Playbook): TimelineRow[] {
  const rows: TimelineRow[] = file.notes.moments.map((m, i) => ({
    key: `m${i}:${m.date ?? m.when}`,
    date: m.date,
    when: m.when,
    what: m.what,
    from: "your words",
  }));
  for (const spec of playbook.facts) {
    if (spec.type !== "date") continue;
    const entry = file.facts[spec.key];
    if (!entry || typeof entry.value !== "string") continue;
    const fromAnswer = entry.sources.some((s) => s.kind === "answer" || s.kind === "correction");
    // A date the Reader already put on the timeline as a moment needs no second row.
    if (!fromAnswer && rows.some((r) => r.date === entry.value && r.from === "your words" && r.key.startsWith("m"))) continue;
    rows.push({ key: `f:${spec.key}`, date: entry.value, when: entry.value, what: spec.label, from: fromAnswer ? "you" : "your words" });
  }
  return rows.sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
}

/** Made-up stories to try the interview with, one or two per kind of case. */
export const EXAMPLE_STORIES: { situation: SituationId; where: "england-wales" | "scotland" | "northern-ireland"; label: string; text: string }[] = [
  {
    situation: "disciplinary",
    where: "scotland",
    label: "Missing stock",
    text: "Our stock count on 5 October showed about £2,400 of frozen stock missing from the Leith warehouse. CCTV shows Jordan Hale loading boxes into his own car after his shift on 2 October. His manager Sam Ortiz spoke to him and he said they were damaged goods he was told he could take. We suspended him on full pay on the 6th, just verbally so far. I think this is gross misconduct but I want to do it properly.",
  },
  {
    situation: "disciplinary",
    where: "england-wales",
    label: "Lateness",
    text: "Priya Mehta is a customer service adviser at our Bristol call centre and has been late nine times since August, usually by 20 to 40 minutes. Her team leader Tom Reed had an informal chat with her in July and she was given a first written warning for lateness on 12 September. She was late again on 3 October and 10 October. She says it is childcare but has never asked to change her hours. We want to hold a disciplinary hearing.",
  },
  {
    situation: "disciplinary",
    where: "england-wales",
    label: "Social media post",
    text: "On 9 October a customer sent us a screenshot of a public Facebook post by Marcus Bell, one of our delivery drivers in Manchester, calling her a name and mentioning her street. Marcus has worked here three years with a clean record. His manager Leanne Clarke has not spoken to him yet. Our social media policy says staff must not post about customers. We want to investigate before deciding anything.",
  },
  {
    situation: "grievance",
    where: "england-wales",
    label: "Complaint about a manager",
    text: "Aisha Khan, a nurse at our Leeds clinic, emailed on 8 October to raise a formal grievance against her line manager Gary Owens. She says he shouts at her in front of patients, most recently on 1 October, and that he gave her every weekend shift for four weeks running while others had none. Two colleagues, Beth Ward and Femi Adeyemi, saw what happened on 1 October. She wants someone other than Gary to deal with it.",
  },
  {
    situation: "redundancy",
    where: "scotland",
    label: "Closing a team",
    text: "We are closing our Glasgow print room at the end of December because our main client's contract ended on 30 September. Four people work there: Ellen Murray, the supervisor, and three operators, Craig Duncan, Lisa Grant and Omar Haddad. Craig has been off sick since August. There may be a job in our Edinburgh office for one of them. We want to start consulting with them next week.",
  },
];

export const EXAMPLE_STORY = EXAMPLE_STORIES[0]!.text;

export function todayIso(now = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
