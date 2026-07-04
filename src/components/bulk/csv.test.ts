import { describe, expect, it } from "vitest";
import { parseCsv, sampleHeadersFor } from "./csv";

describe("sampleHeadersFor", () => {
  it("includes currency-type fields as columns (consistent with placeholderKeysFor)", () => {
    // Regression: scalarQuestionsFor omitted "currency", so currency fields
    // never appeared in the sample CSV nor mapped in rowToAnswers, even though
    // placeholderKeysFor advertised them as valid {{...}} placeholders.
    const headers = sampleHeadersFor("offer");
    expect(headers).toContain("baseSalary");
  });
});

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

  it("warns with the physical file row number, not the data-row index", () => {
    // Header is file row 1; the first data record is file row 2. A missing name
    // on that record must point the user at row 2, not row 1 (the header).
    const r = parseCsv("employee_name,employee_job_title\r\n,Engineer\r\nJane,Analyst");
    expect(r.rows).toEqual([{ employee_name: "Jane", employee_job_title: "Analyst" }]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].rowIndex).toBe(2);
    expect(r.warnings[0].message).toMatch(/Row 2 missing 'employee_name'/);
  });
});
