import { describe, expect, it } from "vitest";
import type { Measure } from "@/components/letters/tableLayout";
import { EMPLOYEE_COLUMNS, employeeTableLayout, type EmployeeLayoutRow } from "./tableLayout";

const PER_CHAR = { name: 7.6, body: 7.1, small: 6.4, matter: 6.9, where: 6.7, date: 6.9 } as const;
const measure: Measure = (text, style) => text.length * PER_CHAR[style];

const ROWS: EmployeeLayoutRow[] = [
  { name: "Chris Doyle", email: "chris.doyle@harbourfoods.co.uk", job: "Production operative", department: "Production", start: "8 Jan 2018" },
  { name: "Sam Patel", email: "sam.patel@harbourfoods.co.uk", job: "Customer service advisor", department: "Customer service", start: "6 Apr 2026" },
  { name: "Maya Okafor", email: "maya.okafor@harbourfoods.co.uk", job: "Marketing executive", department: "Marketing", start: "12 Sep 2022" },
];
const sum = (w: Record<string, number | undefined>) => Object.values(w).reduce<number>((a, b) => a + (b ?? 0), 0);

describe("employeeTableLayout", () => {
  it("fits the longest job title, department and date on a wide table (LISTS-X27)", () => {
    const l = employeeTableLayout({ width: 1076, rows: ROWS, measure });
    expect(l.columns).toEqual(EMPLOYEE_COLUMNS);
    expect(l.widths.job).toBeGreaterThanOrEqual(Math.ceil(measure("Customer service advisor", "date")) + 20);
    expect(l.widths.department).toBeGreaterThanOrEqual(Math.ceil(measure("Customer service", "date")) + 20);
    expect(l.widths.start).toBeGreaterThanOrEqual(Math.ceil(measure("12 Sep 2022", "date")) + 20);
    // The name column takes the rest, which fits every email.
    expect(1076 - sum(l.widths)).toBeGreaterThanOrEqual(Math.ceil(measure("maya.okafor@harbourfoods.co.uk", "small")) + 64);
  });

  it("moves the department under the job title first when the table is narrower", () => {
    const wide = employeeTableLayout({ width: 4000, rows: ROWS, measure });
    const l = employeeTableLayout({ width: sum(wide.widths) + 200, rows: ROWS, measure });
    expect(l.departmentInJob).toBe(true);
    expect(l.columns).not.toContain("department");
    expect(l.columns).toContain("start");
  });

  it("then lets start date and the counts go, keeping name, job title and status", () => {
    const l = employeeTableLayout({ width: 660, rows: ROWS, measure });
    expect(l.columns).toEqual(["select", "name", "job", "status", "actions"]);
    expect(660 - sum(l.widths)).toBeGreaterThanOrEqual(Math.ceil(measure("maya.okafor@harbourfoods.co.uk", "small")) + 64);
  });

  it("never sets more width than the table has once it has made room", () => {
    for (const width of [1076, 916, 800, 660]) expect(sum(employeeTableLayout({ width, rows: ROWS, measure }).widths)).toBeLessThanOrEqual(width);
  });

  it("shows every column before the width is known", () => {
    expect(employeeTableLayout({ width: 0, rows: ROWS, measure }).columns).toEqual(EMPLOYEE_COLUMNS);
  });
});
