import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses a basic CSV with employee_name", () => {
    const r = parseCsv("employee_name,employee_job_title\r\nJane Patel,Engineer");
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([{ employee_name: "Jane Patel", employee_job_title: "Engineer" }]);
  });

  it("requires an employee_name column", () => {
    const r = parseCsv("foo,bar\r\n1,2");
    expect(r.error).toMatch(/employee_name/);
    expect(r.rows).toEqual([]);
  });

  it("#7: rejects a duplicate column instead of silently clobbering row data", () => {
    // Previously the empty 2nd cell overwrote the 1st column → row skipped as
    // 'missing employee_name' even though it was present.
    const r = parseCsv("employee_name,employee_name\r\nJane Patel,");
    expect(r.error).toMatch(/Duplicate column 'employee_name'/i);
    expect(r.rows).toEqual([]);
  });

  it("#7: rejects a duplicate non-key column too (silent data loss case)", () => {
    const r = parseCsv("employee_name,employee_job_title,employee_job_title\r\nJane,Engineer,");
    expect(r.error).toMatch(/Duplicate column 'employee_job_title'/i);
  });
});
