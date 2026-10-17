/**
 * Column widths for the Employees table, worked out from what the rows hold
 * and how wide the table is (LISTS-X27).
 *
 * Fixed percentages cut the job titles, departments, start dates and every
 * email at 1280, and "Customer service" even at 1440. Instead each column
 * gets what its longest value needs (a single very long value is capped and
 * ends in an ellipsis, full text on hover), the name column takes the rest,
 * and when the table is too narrow it makes room in this order:
 *
 *   1. the department moves under the job title (as the email sits under
 *      the name), so the Department column goes but nothing is lost;
 *   2. the Start date column goes (it stays on the person's page and in the
 *      "Start date" sort);
 *   3. the Letters count goes, then the Open matters count (both stay on the
 *      person's page and in the "Has open matter" filter).
 *
 * Pure: the caller measures text (see makeMeasure in letters/tableLayout).
 */
import type { Measure } from "@/components/letters/tableLayout";

export type EmployeeColumn = "select" | "name" | "job" | "department" | "start" | "matters" | "letters" | "status" | "actions";

export const EMPLOYEE_COLUMNS: EmployeeColumn[] = ["select", "name", "job", "department", "start", "matters", "letters", "status", "actions"];

export type EmployeeLayoutRow = {
  name: string;
  email?: string;
  job?: string;
  department?: string;
  start?: string;
};

export type EmployeeTableLayout = {
  columns: EmployeeColumn[];
  /** Width in px for every shown column but the name column, which takes the rest. */
  widths: Partial<Record<EmployeeColumn, number>>;
  /** The department sits under the job title instead of in its own column. */
  departmentInJob: boolean;
};

/** Cell padding, left and right (px-2.5). */
const PAD = 20;
/** Avatar (32) and the 12px gap. */
const NAME_CHROME = PAD + 32 + 12;
const SELECT_W = 40;
const ACTIONS_W = 40;
/** The widest status pill ("On leave") with its padding. */
const STATUS_W = 104;
const CAP = { name: 320, job: 240, department: 190, start: 130 };

const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0);

/** The ways of making room, best first. */
const PLANS: { drop: EmployeeColumn[]; fold: boolean }[] = [
  { drop: [], fold: false },
  { drop: ["department"], fold: true },
  { drop: ["department", "start"], fold: true },
  { drop: ["department", "start", "letters"], fold: true },
  { drop: ["department", "start", "letters", "matters"], fold: true },
];

export function employeeTableLayout({
  width,
  rows,
  measure,
}: {
  /** The table's width in px; 0 or less when not measured yet. */
  width: number;
  rows: EmployeeLayoutRow[];
  measure: Measure;
}): EmployeeTableLayout {
  const longest = (texts: (string | undefined)[], style: Parameters<Measure>[1]) =>
    Math.ceil(max(texts.filter((t): t is string => !!t).map((t) => measure(t, style))));
  const header = (h: string) => longest([h], "where");

  const job = (fold: boolean) =>
    Math.min(
      CAP.job,
      PAD +
        Math.max(
          header("Job title"),
          longest(rows.map((r) => r.job), "date"),
          fold ? longest(rows.map((r) => r.department), "small") : 0
        )
    );
  const need: Record<Exclude<EmployeeColumn, "job">, number> = {
    select: SELECT_W,
    name: Math.min(CAP.name, Math.max(NAME_CHROME + longest(rows.map((r) => r.name), "name"), NAME_CHROME + longest(rows.map((r) => r.email), "small"))),
    department: Math.min(CAP.department, PAD + Math.max(header("Department"), longest(rows.map((r) => r.department), "date"))),
    start: Math.min(CAP.start, PAD + Math.max(header("Start date"), longest(rows.map((r) => r.start), "date"))),
    matters: PAD + header("Open matters"),
    letters: PAD + header("Letters"),
    status: STATUS_W,
    actions: ACTIONS_W,
  };
  const widthOf = (c: EmployeeColumn, fold: boolean) => (c === "job" ? job(fold) : need[c]);

  const fits = (p: (typeof PLANS)[number]) =>
    EMPLOYEE_COLUMNS.filter((c) => !p.drop.includes(c)).reduce((s, c) => s + widthOf(c, p.fold), 0) <= width;
  const plan = width > 0 ? (PLANS.find(fits) ?? PLANS[PLANS.length - 1]) : PLANS[0];
  const columns = EMPLOYEE_COLUMNS.filter((c) => !plan.drop.includes(c));
  const widths: Partial<Record<EmployeeColumn, number>> = {};
  for (const c of columns) if (c !== "name") widths[c] = widthOf(c, plan.fold);
  return { columns, widths, departmentInJob: plan.fold };
}
