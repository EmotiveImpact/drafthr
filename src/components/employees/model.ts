/**
 * What the employee list and the employee page show for each person, built
 * from the store: the letters about them (matched by name, as
 * `matchEmployeeForDraft` does), the matters they are part of (a
 * participant, or the named primary party of a legacy matter), counts and
 * the last activity. Plus labels, tones, dates and the CSV export.
 */
import { useMemo } from "react";
import { differenceInMonths, format } from "date-fns";
import type { Draft, Employee, EmploymentStatus, Matter, WorkerClass } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { matchEmployeeForDraft } from "@/lib/employees";
import { parseDateOnly } from "@/lib/date-only";
import type { PillTone } from "@/components/ds";
import { csvLine } from "@/components/letters/parts";

export const STATUS_LABEL: Record<EmploymentStatus, string> = {
  active: "Active",
  notice: "Notice",
  "on-leave": "On leave",
  left: "Left",
};

export const STATUS_TONE: Record<EmploymentStatus, PillTone> = {
  active: "green",
  notice: "amber",
  "on-leave": "blue",
  left: "grey",
};

export const WORKER_LABEL: Record<WorkerClass, string> = {
  employee: "Employee",
  worker: "Worker",
  contractor: "Contractor",
  casual: "Casual",
};

const norm = (s?: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Is this person part of the matter (a participant, or its named primary party)? */
export function inMatter(m: Matter, e: Employee): boolean {
  if (m.participants?.some((p) => p.employeeId === e.id)) return true;
  const primary = norm(m.parties?.primaryName);
  return !!primary && primary === norm(e.legalName);
}

export type EmployeeRow = {
  employee: Employee;
  /** Letters about this person, newest first. */
  letters: Draft[];
  /** Every matter they are part of; active first, then newest. */
  matters: Matter[];
  openMatters: Matter[];
  lastActivityAt: number;
};

export function buildEmployeeRow(e: Employee, drafts: Draft[], matters: Matter[]): EmployeeRow {
  const only = { [e.id]: e };
  const letters = drafts.filter((d) => matchEmployeeForDraft(d, only) === e.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const mine = matters
    .filter((m) => inMatter(m, e))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.updatedAt - a.updatedAt);
  return {
    employee: e,
    letters,
    matters: mine,
    openMatters: mine.filter((m) => m.status === "active"),
    lastActivityAt: Math.max(e.updatedAt, letters[0]?.updatedAt ?? 0),
  };
}

/** Rows for every employee in the directory. */
export function useEmployeeRows(): EmployeeRow[] {
  const employees = useDraftStore((s) => s.employees);
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  return useMemo(() => {
    const ds = Object.values(drafts).filter((d) => !d.isTemplateSource && d.mode === "employer");
    const ms = Object.values(matters).filter((m) => m.mode === "employer");
    return Object.values(employees).map((e) => buildEmployeeRow(e, ds, ms));
  }, [employees, drafts, matters]);
}

/** "3 Mar 2023", or undefined. */
export function startDateLabel(iso?: string): string | undefined {
  const d = iso ? parseDateOnly(iso) : null;
  return d ? format(d, "d MMM yyyy") : undefined;
}

/** "3 yrs 7 mths" from a start date, or undefined before the start. */
export function tenureLabel(iso?: string, now = new Date()): string | undefined {
  const d = iso ? parseDateOnly(iso) : null;
  if (!d || d > now) return undefined;
  const months = differenceInMonths(now, d);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return "Under a month";
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? "yr" : "yrs"}`);
  if (m) parts.push(`${m} ${m === 1 ? "mth" : "mths"}`);
  return parts.join(" ");
}

export function displayName(e: Employee): string {
  return e.preferredName && norm(e.preferredName) !== norm(e.legalName) ? `${e.legalName} (${e.preferredName})` : e.legalName;
}

export function firstName(e: Employee): string {
  return (e.preferredName || e.legalName).trim().split(/\s+/)[0] ?? e.legalName;
}

/** CSV of the given people (Export CSV on the bulk bar). */
export function employeesCsv(rows: EmployeeRow[]): string {
  const head = csvLine(["Legal name", "Preferred name", "Email", "Job title", "Department", "Start date", "Status", "Worker type", "Manager", "Open matters", "Letters"]);
  const lines = rows.map(({ employee: e, openMatters, letters }) =>
    csvLine([
      e.legalName,
      e.preferredName,
      e.email,
      e.jobTitle,
      e.department,
      e.startDate,
      STATUS_LABEL[e.status],
      e.workerClass ? WORKER_LABEL[e.workerClass] : "",
      e.managerName,
      openMatters.length,
      letters.length,
    ])
  );
  return [head, ...lines].join("\n");
}

/** Answers that fill in this person's details on a new letter. */
export function employeeAnswers(e: Employee | undefined): Record<string, string> {
  if (!e) return {};
  const out: Record<string, string> = { employeeLegalName: e.legalName };
  if (e.jobTitle) out.employeeJobTitle = e.jobTitle;
  if (e.department) out.employeeDepartment = e.department;
  if (e.startDate) out.employeeStartDate = e.startDate;
  return out;
}
