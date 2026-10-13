/**
 * The figures behind /reports (mock reports), worked out from the
 * workspace's own letters, matters and employee records. Pure functions:
 * the page passes the store contents and the time in, so tests can too.
 *
 *   sent        a letter's latest "marked-sent" export
 *   strong      passes every check and lands in the strong band (the same
 *               rule the compliance ring has always used)
 *   department  the employee record's department, else the letter's own
 *   manager     the employee record's managerName
 */
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import type { Draft, Employee, LetterTypeId, Matter, RiskBand } from "@/lib/letters/types";
import { computeHealthScore, runHealthChecks, type HealthCheck, type HealthScore } from "@/lib/finalize/healthChecks";
import { effectiveRiskBand } from "@/lib/matters/risk";
import { draftsInMatter } from "@/lib/matters";
import { matchEmployeeForDraft } from "@/lib/employees";
import { getLetterMeta } from "@/lib/letters/catalog";
import { HEALTH_CHECKS, failingDraftsForCheck } from "@/lib/reports/check-predicates";

const DAY = 24 * 60 * 60 * 1000;

/* ─── Period ───────────────────────────────────────────────────────── */

export type PeriodId = "30d" | "3m" | "12m" | "all";

export const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: "30d", label: "Last 30 days" },
  { id: "3m", label: "Last 3 months" },
  { id: "12m", label: "Last 12 months" },
  { id: "all", label: "All time" },
];

export function periodLabel(id: PeriodId): string {
  return PERIODS.find((p) => p.id === id)?.label ?? "Last 12 months";
}

export type Bucket = {
  key: string;
  /** Under the bar ("Oct", "5 Oct", "Mon 5"). */
  short: string;
  /** In the tooltip and the table ("October 2026", "Week of 5 Oct 2026"). */
  long: string;
  start: number;
  end: number;
  /** The bucket that holds now (drawn hatched, "so far"). */
  current: boolean;
};

export type BucketUnit = "day" | "week" | "month";

export type PeriodFrame = {
  id: PeriodId;
  label: string;
  unit: BucketUnit;
  start: number;
  buckets: Bucket[];
};

/**
 * The period's start and its chart buckets: 30 days by day, 3 months by
 * week, 12 months by month, all time by month from the first letter.
 */
export function periodFrame(id: PeriodId, now: number, earliest?: number): PeriodFrame {
  const today = new Date(now);
  const buckets: Bucket[] = [];
  let unit: BucketUnit = "month";
  if (id === "30d") {
    unit = "day";
    const first = startOfDay(subDays(today, 29));
    for (let i = 0; i < 30; i++) {
      const s = addDays(first, i);
      buckets.push({
        key: format(s, "yyyy-MM-dd"),
        short: format(s, "d MMM"),
        long: format(s, "EEEE d MMMM yyyy"),
        start: s.getTime(),
        end: addDays(s, 1).getTime(),
        current: i === 29,
      });
    }
  } else if (id === "3m") {
    unit = "week";
    const thisWeek = startOfWeek(today, { weekStartsOn: 1 });
    for (let i = 12; i >= 0; i--) {
      const s = addDays(thisWeek, -7 * i);
      buckets.push({
        key: format(s, "yyyy-MM-dd"),
        short: format(s, "d MMM"),
        long: `Week of ${format(s, "d MMMM yyyy")}`,
        start: s.getTime(),
        end: addDays(s, 7).getTime(),
        current: i === 0,
      });
    }
  } else {
    const thisMonth = startOfMonth(today);
    let months = 12;
    if (id === "all" && earliest != null && earliest < now) {
      const first = startOfMonth(new Date(earliest));
      const span = (thisMonth.getFullYear() - first.getFullYear()) * 12 + (thisMonth.getMonth() - first.getMonth()) + 1;
      months = Math.max(12, Math.min(60, span));
    }
    for (let i = months - 1; i >= 0; i--) {
      const s = subMonths(thisMonth, i);
      buckets.push({
        key: format(s, "yyyy-MM"),
        short: format(s, months > 12 && s.getMonth() === 0 ? "MMM yy" : "MMM"),
        long: format(s, "MMMM yyyy"),
        start: s.getTime(),
        end: addMonths(s, 1).getTime(),
        current: i === 0,
      });
    }
  }
  const start = id === "all" ? Number.NEGATIVE_INFINITY : buckets[0].start;
  return { id, label: periodLabel(id), unit, start, buckets };
}

/* ─── Per-letter facts ─────────────────────────────────────────────── */

export function sentAtOf(d: Draft): number | undefined {
  const sent = (d.exports ?? []).filter((e) => e.format === "marked-sent").map((e) => e.exportedAt);
  return sent.length ? Math.max(...sent) : undefined;
}

export type LetterFacts = {
  draft: Draft;
  sentAt?: number;
  /** Days from creation to sent, when sent. */
  daysToSend?: number;
  /** When the letter last counted: sent, else created. */
  at: number;
  score?: HealthScore;
  checks?: HealthCheck[];
  /** Passes every check in the strong band. Undefined when it can't be scored. */
  strong?: boolean;
  department?: string;
  manager?: string;
  employee?: Employee;
  typeLabel: string;
};

export function typeLabelOf(id: LetterTypeId | string): string {
  try {
    return getLetterMeta(id as LetterTypeId).shortTitle;
  } catch {
    const s = String(id).replace(/[_-]+/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

export function letterFacts(d: Draft, employees: Record<string, Employee>): LetterFacts {
  const sentAt = sentAtOf(d);
  let score: HealthScore | undefined;
  let checks: HealthCheck[] | undefined;
  try {
    checks = runHealthChecks(d);
    score = computeHealthScore(checks);
  } catch {
    // A letter the checks can't read is left unscored, never breaks the page.
  }
  let employee: Employee | undefined;
  try {
    const id = matchEmployeeForDraft(d, employees);
    employee = id ? employees[id] : undefined;
  } catch {
    employee = undefined;
  }
  const department = (employee?.department || d.employee?.department || "").trim() || undefined;
  const manager = (employee?.managerName || "").trim() || undefined;
  return {
    draft: d,
    sentAt,
    daysToSend: sentAt != null ? Math.max(0, (sentAt - d.createdAt) / DAY) : undefined,
    at: sentAt ?? d.createdAt,
    score,
    checks,
    strong: score ? score.band === "strong" && score.failCount === 0 : undefined,
    department,
    manager,
    employee,
    typeLabel: typeLabelOf(d.letterType),
  };
}

/** Departments named on employee records (and letters), sorted. */
export function departmentsOf(employees: Record<string, Employee>, letters: LetterFacts[] = []): string[] {
  const set = new Set<string>();
  for (const e of Object.values(employees)) if (e.department?.trim()) set.add(e.department.trim());
  for (const l of letters) if (l.department) set.add(l.department);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Matters in a department: one of its letters is, or its main party works there. */
export function matterInDepartment(
  m: Matter,
  dept: string,
  letters: LetterFacts[],
  employees: Record<string, Employee>
): boolean {
  if (letters.some((l) => l.draft.matterId === m.id && l.department === dept)) return true;
  const name = m.parties?.primaryName?.trim().toLowerCase();
  if (!name) return false;
  return Object.values(employees).some((e) => e.legalName.trim().toLowerCase() === name && e.department?.trim() === dept);
}

/* ─── Small maths ──────────────────────────────────────────────────── */

function avg(xs: number[]): number | undefined {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}

export function percentOf(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function strongRate(list: LetterFacts[]): { scored: number; strong: number; percent: number } {
  const scored = list.filter((l) => l.strong !== undefined);
  const strong = scored.filter((l) => l.strong).length;
  return { scored: scored.length, strong, percent: percentOf(strong, scored.length) };
}

/** One decimal place, dropping a trailing ".0" ("2.4", "3"). */
export function oneDp(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "1 day", "2.4 days". */
export function daysWords(n: number): string {
  const v = oneDp(n);
  return `${v} ${v === "1" ? "day" : "days"}`;
}

/** A tidy top for the chart's scale with four even steps (0, 10, 20, 30, 40). */
export function niceTop(max: number): number {
  if (max <= 4) return 4;
  const step = max / 4;
  const mag = Math.max(1, Math.pow(10, Math.floor(Math.log10(step))));
  const nice = [1, 2, 3, 5, 10].map((m) => m * mag).find((s) => s * 4 >= max) ?? 10 * mag;
  return nice * 4;
}

/* ─── Tiles ────────────────────────────────────────────────────────── */

export type Tone = "green" | "red" | "amber" | "grey";

export type ReportTiles = {
  sentThisMonth: number;
  sentDelta: number;
  lastMonthName: string;
  sentSeries: number[];
  compliance: { percent: number; scored: number; strong: number; deltaPts: number | null; series: number[] };
  highRisk: { open: number; newThisWeek: number; series: number[] };
  timeToSend: { days: number | null; delta: number | null; series: number[] };
};

function isHighRisk(m: Matter, drafts: Draft[]): boolean {
  let band: RiskBand = "low";
  try {
    band = effectiveRiskBand(m, draftsInMatter(drafts, m.id)) ?? "low";
  } catch {
    band = "low";
  }
  return band === "high" || band === "critical";
}

function closedAt(m: Matter): number | undefined {
  if (m.status === "active") return undefined;
  return m.archivedAt ?? m.updatedAt;
}

export function reportTiles({
  letters,
  matters,
  drafts,
  frame,
  now,
}: {
  letters: LetterFacts[];
  matters: Matter[];
  drafts: Draft[];
  frame: PeriodFrame;
  now: number;
}): ReportTiles {
  const today = new Date(now);
  const monthStart = startOfMonth(today).getTime();
  const lastMonthStart = subMonths(startOfMonth(today), 1);
  // "This point" last month: the same time after the start of last month,
  // capped at the end of last month (31 Mar compares with 28 Feb).
  const lastPoint = Math.min(lastMonthStart.getTime() + (now - monthStart), monthStart);
  const sentThisMonth = letters.filter((l) => l.sentAt != null && l.sentAt >= monthStart && l.sentAt <= now).length;
  const sentLastPoint = letters.filter(
    (l) => l.sentAt != null && l.sentAt >= lastMonthStart.getTime() && l.sentAt <= lastPoint
  ).length;

  const inPeriod = letters.filter((l) => l.at >= frame.start && l.at <= now);
  const rate = strongRate(inPeriod);
  // The change against the same letters as they stood before this month.
  const before = inPeriod.filter((l) => l.draft.createdAt < monthStart);
  const beforeRate = strongRate(before);
  const deltaPts = before.length && before.length !== inPeriod.length && beforeRate.scored ? rate.percent - beforeRate.percent : null;

  const sentIn = (s: number, e: number) => letters.filter((l) => l.sentAt != null && l.sentAt >= s && l.sentAt < e);
  const sentSeries = frame.buckets.map((b) => sentIn(b.start, b.end).length);
  const complianceSeries = frame.buckets.map((b) => strongRate(letters.filter((l) => l.draft.createdAt < b.end)).percent);

  const high = matters.filter((m) => m.status === "active" && isHighRisk(m, drafts));
  const weekAgo = now - 7 * DAY;
  const highSeries = frame.buckets.map(
    (b) =>
      matters.filter((m) => {
        if (m.createdAt >= b.end) return false;
        const c = closedAt(m);
        if (c != null && c < b.end) return false;
        return isHighRisk(m, drafts);
      }).length
  );

  const sentInPeriod = letters.filter((l) => l.sentAt != null && l.sentAt >= frame.start && l.sentAt <= now);
  const days = avg(sentInPeriod.map((l) => l.daysToSend ?? 0));
  // Month on month: letters sent this month against those sent last month.
  const current = avg(sentIn(monthStart, now + 1).map((l) => l.daysToSend ?? 0));
  const prior = avg(sentIn(lastMonthStart.getTime(), monthStart).map((l) => l.daysToSend ?? 0));
  const delta = current != null && prior != null ? Math.round((current - prior) * 10) / 10 : null;
  let lastAvg: number | undefined;
  const timeSeries = frame.buckets.map((b) => {
    const a = avg(sentIn(b.start, b.end).map((l) => l.daysToSend ?? 0));
    if (a != null) lastAvg = a;
    return lastAvg ?? 0;
  });

  return {
    sentThisMonth,
    sentDelta: sentThisMonth - sentLastPoint,
    lastMonthName: format(lastMonthStart, "MMM"),
    sentSeries,
    compliance: { percent: rate.percent, scored: rate.scored, strong: rate.strong, deltaPts, series: complianceSeries },
    highRisk: { open: high.length, newThisWeek: high.filter((m) => m.createdAt >= weekAgo).length, series: highSeries },
    timeToSend: { days: days ?? null, delta, series: timeSeries },
  };
}

/* ─── Chart ────────────────────────────────────────────────────────── */

export type ChartBar = Bucket & { sent: number; drafted: number; compliance: number | null };

export function chartBars(letters: LetterFacts[], frame: PeriodFrame): ChartBar[] {
  return frame.buckets.map((b) => {
    const sent = letters.filter((l) => l.sentAt != null && l.sentAt >= b.start && l.sentAt < b.end);
    const drafted = letters.filter((l) => l.draft.createdAt >= b.start && l.draft.createdAt < b.end).length;
    const r = strongRate(sent);
    return { ...b, sent: sent.length, drafted, compliance: r.scored ? r.percent : null };
  });
}

/* ─── Breakdowns ───────────────────────────────────────────────────── */

export type TypeRow = { id: string; label: string; count: number };

/** Letters in the period by type, most first. */
export function byLetterType(letters: LetterFacts[]): TypeRow[] {
  const map = new Map<string, TypeRow>();
  for (const l of letters) {
    const id = String(l.draft.letterType);
    const row = map.get(id) ?? { id, label: l.typeLabel, count: 0 };
    row.count += 1;
    map.set(id, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The first `top` types, then "Other" for the rest. */
export function topTypesWithOther(rows: TypeRow[], top = 6): TypeRow[] {
  if (rows.length <= top + 1) return rows;
  const rest = rows.slice(top).reduce((n, r) => n + r.count, 0);
  return [...rows.slice(0, top), { id: "other", label: "Other", count: rest }];
}

export const NO_MANAGER = "No manager set";

export type ManagerRow = {
  name: string;
  department?: string;
  letters: number;
  avgDaysToSend: number | null;
  compliance: number | null;
  openMatters: number;
};

export function byManager(letters: LetterFacts[], activeMatters: Matter[]): ManagerRow[] {
  const groups = new Map<string, LetterFacts[]>();
  for (const l of letters) {
    const key = l.manager ?? NO_MANAGER;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const rows: ManagerRow[] = [];
  for (const [name, list] of groups) {
    const depts = new Map<string, number>();
    for (const l of list) if (l.department) depts.set(l.department, (depts.get(l.department) ?? 0) + 1);
    const department = [...depts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const sent = list.filter((l) => l.daysToSend != null).map((l) => l.daysToSend as number);
    const r = strongRate(list);
    const matterIds = new Set(list.map((l) => l.draft.matterId).filter(Boolean) as string[]);
    rows.push({
      name,
      department,
      letters: list.length,
      avgDaysToSend: avg(sent) ?? null,
      compliance: r.scored ? r.percent : null,
      openMatters: activeMatters.filter((m) => matterIds.has(m.id)).length,
    });
  }
  return rows.sort((a, b) => {
    if ((a.name === NO_MANAGER) !== (b.name === NO_MANAGER)) return a.name === NO_MANAGER ? 1 : -1;
    return b.letters - a.letters || a.name.localeCompare(b.name);
  });
}

export type FailingRow = { id: string; label: string; description: string; count: number; where: string };

/** "Warning letters", "Warning and Offer letters", "Hearing invitations and 2 more". */
function typesSentence(labels: string[]): string {
  const uniq = [...new Set(labels)];
  if (uniq.length === 0) return "";
  if (uniq.length === 1) return uniq[0];
  if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]}`;
  return `${uniq[0]}, ${uniq[1]} and ${uniq.length - 2} more`;
}

export function failingChecks(letters: LetterFacts[]): FailingRow[] {
  const drafts = letters.map((l) => l.draft);
  const label = new Map(letters.map((l) => [l.draft.id, l.typeLabel]));
  return HEALTH_CHECKS.map((c) => {
    const failing = failingDraftsForCheck(drafts, c.id);
    const where =
      typesSentence(failing.map((f) => label.get(f.draft.id) ?? "")) || (failing[0]?.reason ?? c.description);
    return { id: c.id, label: c.label, description: c.description, count: failing.length, where };
  })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

/* ─── Time to resolve (kept from the old Operations card) ──────────── */

export type Resolution = { count: number; medianDays: number; p90Days: number };

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return Math.round(sorted[0]);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return Math.round(sorted[lo] * (1 - frac) + sorted[hi] * frac);
}

export function timeToResolve(matters: Matter[]): Resolution {
  // Closed and archived both count as resolved (bug #8).
  const durations: number[] = [];
  for (const m of matters) {
    if (m.status === "active") continue;
    const closed = m.archivedAt ?? m.updatedAt;
    if (!closed || !m.createdAt) continue;
    const days = differenceInCalendarDays(new Date(closed), new Date(m.createdAt));
    if (days >= 0) durations.push(days);
  }
  if (durations.length === 0) return { count: 0, medianDays: 0, p90Days: 0 };
  durations.sort((a, b) => a - b);
  return { count: durations.length, medianDays: percentile(durations, 0.5), p90Days: percentile(durations, 0.9) };
}

/* ─── CSV ──────────────────────────────────────────────────────────── */

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv({
  workspace,
  period,
  department,
  now,
  tiles,
  bars,
  types,
  managers,
  failing,
}: {
  workspace: string;
  period: string;
  department: string;
  now: number;
  tiles: ReportTiles;
  bars: ChartBar[];
  types: TypeRow[];
  managers: ManagerRow[];
  failing: FailingRow[];
}): string {
  const rows: Array<Array<string | number | null | undefined>> = [
    ["Report", `${workspace} letters`],
    ["Period", period],
    ["Department", department],
    ["Worked out", format(new Date(now), "d MMMM yyyy HH:mm")],
    [],
    ["Figure", "Value"],
    ["Letters sent this month", tiles.sentThisMonth],
    [`Change vs this point in ${tiles.lastMonthName}`, tiles.sentDelta],
    ["Compliance rate (%)", tiles.compliance.percent],
    ["Compliance change (pts)", tiles.compliance.deltaPts],
    ["High-risk matters open", tiles.highRisk.open],
    ["High-risk matters new this week", tiles.highRisk.newThisWeek],
    ["Average time to send (days)", tiles.timeToSend.days == null ? null : oneDp(tiles.timeToSend.days)],
    [],
    ["Period", "Letters sent", "Letters drafted", "Compliance (%)"],
    ...bars.map((b) => [b.long, b.sent, b.drafted, b.compliance]),
    [],
    ["Letter type", "Letters"],
    ...types.map((t) => [t.label, t.count]),
    [],
    ["Manager", "Department", "Letters", "Average time to send (days)", "Compliance (%)", "Open matters"],
    ...managers.map((m) => [
      m.name,
      m.department,
      m.letters,
      m.avgDaysToSend == null ? null : oneDp(m.avgDaysToSend),
      m.compliance,
      m.openMatters,
    ]),
    [],
    ["Failing check", "Letters failing", "Where"],
    ...failing.map((f) => [f.label, f.count, f.where]),
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** "just now", "5 minutes ago", "2 hours ago". */
export function updatedWords(at: number, now: number): string {
  const m = Math.floor((now - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  return format(new Date(at), "d MMM 'at' HH:mm");
}
