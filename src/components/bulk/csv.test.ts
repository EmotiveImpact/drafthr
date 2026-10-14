import { describe, expect, it } from "vitest";
import { findMissingMergeValues, parseCsv, rowSummary, rowToAnswers, sampleCsvFor, sampleHeadersFor } from "./csv";
import { placeholderKeysFor } from "@/lib/bulk/mailmerge";

describe("sampleHeadersFor", () => {
  it("includes currency-type fields as columns (consistent with placeholderKeysFor)", () => {
    // Regression: scalarQuestionsFor omitted "currency", so currency fields
    // never appeared in the sample CSV nor mapped in rowToAnswers, even though
    // placeholderKeysFor advertised them as valid {{...}} placeholders.
    const headers = sampleHeadersFor("offer");
    expect(headers).toContain("base_salary");
  });
});

describe("parseCsv: RFC 4180 quoted fields", () => {
  it("keeps embedded commas, escaped quotes and line breaks inside quoted cells", () => {
    const csv = [
      "employee_name,reason,notes",
      '"Patel, Jane","Said ""no"" twice","Line one',
      'line two, still notes"',
      'Marcus Khan,Late,"a\r\nb"',
    ].join("\r\n");
    const r = parseCsv(csv);
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([
      { employee_name: "Patel, Jane", reason: 'Said "no" twice', notes: "Line one\r\nline two, still notes" },
      { employee_name: "Marcus Khan", reason: "Late", notes: "a\r\nb" },
    ]);
    // The second record starts on physical line 4 but is spreadsheet row 3.
    expect(r.rowNumbers).toEqual([2, 3]);
  });

  it("handles LF-only files, a BOM and a trailing newline", () => {
    const r = parseCsv("﻿employee_name,role\nJane,Engineer\n");
    expect(r.rows).toEqual([{ employee_name: "Jane", role: "Engineer" }]);
  });

  it("keeps a stray quote inside an unquoted value as a character", () => {
    const r = parseCsv('employee_name,notes\nJane,Needs a 12" monitor\nMarcus,"ok, thanks"');
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([
      { employee_name: "Jane", notes: 'Needs a 12" monitor' },
      { employee_name: "Marcus", notes: "ok, thanks" },
    ]);
  });

  it("ignores unnamed trailing columns that spreadsheets export", () => {
    const r = parseCsv("employee_name,role,,\nJane,Engineer,,\n");
    expect(r.error).toBeUndefined();
    expect(r.headers).toEqual(["employee_name", "role"]);
    expect(r.rows).toEqual([{ employee_name: "Jane", role: "Engineer" }]);
  });

  it("reports an unterminated quoted field instead of swallowing the file", () => {
    const r = parseCsv('employee_name,notes\nJane,"never closed\nMarcus,x');
    expect(r.error).toMatch(/no closing quote/i);
  });
});

describe("findMissingMergeValues", () => {
  it("lists each row and the placeholder fields it has no value for", () => {
    const r = parseCsv("employee_name,salary,review_date\nJane,30000,\nMarcus,,2026-02-01\nAisha,1,2026-01-01");
    const missing = findMissingMergeValues(r.rows, r.headers, r.rowNumbers);
    expect(missing).toEqual([
      { rowNumber: 2, employeeName: "Jane", fields: ["review_date"] },
      { rowNumber: 3, employeeName: "Marcus", fields: ["salary"] },
    ]);
  });

  it("matches camelCase placeholders to snake_case columns", () => {
    const missing = findMissingMergeValues([{ employee_name: "Jane", review_meeting_date: "2026-01-01" }], [
      "reviewMeetingDate",
      "outcome",
    ]);
    expect(missing).toEqual([{ rowNumber: 2, employeeName: "Jane", fields: ["outcome"] }]);
  });
});

describe("sample CSV matches the generator's placeholders", () => {
  it("uses exactly the placeholder names placeholderKeysFor advertises", () => {
    for (const letterType of ["offer", "probation_outcome", "warning"]) {
      expect(new Set(sampleHeadersFor(letterType))).toEqual(new Set(placeholderKeysFor(letterType, [])));
    }
  });

  it("round-trips through the parser, and its columns map onto wizard answers", () => {
    const r = parseCsv(sampleCsvFor("offer"));
    expect(r.error).toBeUndefined();
    expect(r.headers).toEqual(sampleHeadersFor("offer"));
    const answers = rowToAnswers({ employee_name: "Jane", base_salary: "45000" }, "offer");
    expect(answers.employeeLegalName).toBe("Jane");
    expect(answers.baseSalary).toBe("45000");
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

describe("rowSummary", () => {
  const headers = ["employee_name", "department", "effective_date", "employee_job_title"];

  it("puts the job title first and leaves the name out", () => {
    const row = { employee_name: "Jordan Hale", department: "Operations", effective_date: "2026-11-01", employee_job_title: "Shift lead" };
    expect(rowSummary(row, headers)).toBe("Shift lead · Operations · 2026-11-01");
  });

  it("shows the values a row has and names what it is missing", () => {
    const row = { employee_name: "Priya Shah", department: "Finance", effective_date: "2026-11-01", employee_job_title: "" };
    expect(rowSummary(row, headers, ["employee_job_title"])).toBe("Finance · 2026-11-01 · no job title");
  });

  it("is empty when the row only has a name", () => {
    expect(rowSummary({ employee_name: "Sam" }, ["employee_name"])).toBe("");
  });
});
