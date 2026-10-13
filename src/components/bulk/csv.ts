/**
 * CSV helpers for Bulk Operations.
 *
 * The parser follows RFC 4180:
 *  - fields may be wrapped in double quotes, and a quoted field may contain
 *    commas, line breaks (LF or CRLF) and escaped quotes (`""`);
 *  - records end at an unquoted LF or CRLF;
 *  - a BOM at the start of the file is stripped;
 *  - surrounding whitespace on each cell is trimmed (line breaks inside a
 *    quoted cell are kept);
 *  - blank records are skipped.
 */

import { letterStepsFor, type Question } from "@/lib/letters/questions";
import { foldKey } from "@/lib/bulk/keys";

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  /**
   * Spreadsheet row number (header = row 1) for each entry in `rows`, so
   * warnings can point at the record the user sees in Excel or Sheets.
   */
  rowNumbers?: number[];
  /** Row-level warnings, e.g. missing required field. */
  warnings: { rowIndex: number; message: string }[];
  /** Hard error — parse couldn't continue. */
  error?: string;
};

const BOM = "﻿";

/**
 * Split CSV text into records of raw cells. Returns an error message for an
 * unterminated quoted field, which would otherwise swallow the rest of the
 * file into one cell.
 */
export function parseCsvRecords(text: string): { records: string[][]; error?: string } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quotedStartRecord = 0;

  const endCell = () => {
    record.push(cell);
    cell = "";
  };
  const endRecord = () => {
    endCell();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      // Only a quote that opens a field starts a quoted value. A stray quote
      // inside an unquoted value (12" monitor) is kept as a character, as
      // Excel does, instead of swallowing the rest of the file.
      cell = "";
      inQuotes = true;
      quotedStartRecord = records.length + 1;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\n") {
      endRecord();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRecord();
    } else {
      cell += ch;
    }
  }
  if (inQuotes) {
    return {
      records: [],
      error: `Row ${quotedStartRecord} has a quoted value with no closing quote.`,
    };
  }
  if (cell.length > 0 || record.length > 0) endRecord();
  return { records };
}

function isBlankRecord(cells: string[]): boolean {
  return cells.every((c) => c.trim() === "");
}

/** Parse a raw CSV string. Validates header row + that at least one
 *  data row has a non-empty `employee_name` field. */
export function parseCsv(raw: string): CsvParseResult {
  const cleaned = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const { records: allRecords, error: syntaxError } = parseCsvRecords(cleaned);
  if (syntaxError) {
    return { headers: [], rows: [], warnings: [], error: syntaxError };
  }
  // Keep each record's spreadsheet row number (1-based) before dropping blanks.
  const records = allRecords
    .map((cells, idx) => ({ cells: cells.map((c) => c.trim()), fileRow: idx + 1 }))
    .filter((r) => !isBlankRecord(r.cells));

  if (records.length === 0) {
    return { headers: [], rows: [], warnings: [], error: "This file is empty. It needs a header row and at least one row of data." };
  }
  if (records.length < 2) {
    return {
      headers: [],
      rows: [],
      warnings: [],
      error: "CSV needs a header row and at least one data row.",
    };
  }

  const columns = records[0].cells.map((h) => h.toLowerCase());
  // Spreadsheets often export trailing columns with no name; ignore them
  // rather than reporting them as duplicate '' columns.
  const headers = columns.filter((h) => h !== "");
  if (!headers.includes("employee_name")) {
    return {
      headers,
      rows: [],
      warnings: [],
      error: "CSV must include an 'employee_name' column.",
    };
  }
  // Reject duplicate columns. With two same-named headers, the second cell
  // (often empty) overwrote the first in the row object — silently clobbering
  // populated data, or skipping a row as "missing employee_name" when the name
  // was actually present (bug #7). Surfacing the malformed file is safer than
  // guessing first-or-last.
  const seen = new Set<string>();
  const duplicate = headers.find((h) => (seen.has(h) ? true : (seen.add(h), false)));
  if (duplicate) {
    return {
      headers,
      rows: [],
      warnings: [],
      error: `Duplicate column '${duplicate}'. Column names must be unique.`,
    };
  }

  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  const warnings: { rowIndex: number; message: string }[] = [];

  for (const { cells, fileRow } of records.slice(1)) {
    const row: Record<string, string> = {};
    columns.forEach((h, idx) => {
      if (h) row[h] = cells[idx] ?? "";
    });
    if (!row.employee_name) {
      // fileRow is the record's spreadsheet row (header = row 1), so the user
      // is sent to the offending record rather than the header.
      warnings.push({
        rowIndex: fileRow,
        message: `Row ${fileRow} missing 'employee_name', so it will be skipped.`,
      });
      continue;
    }
    rows.push(row);
    rowNumbers.push(fileRow);
  }

  return { headers, rows, rowNumbers, warnings };
}

export type MissingMergeValues = {
  /** Spreadsheet row number (header = row 1). */
  rowNumber: number;
  employeeName: string;
  /** Placeholder names (snake_case) with no value in this row. */
  fields: string[];
};

/**
 * Rows that have no value for one or more placeholders, so the generated
 * letter would read "[field not set]". Run before generation, against the
 * CSV columns (every column is offered to the generator as a placeholder)
 * and again against the placeholders the template actually uses.
 */
export function findMissingMergeValues(
  rows: Record<string, string | number | undefined>[],
  placeholders: string[],
  rowNumbers?: number[],
): MissingMergeValues[] {
  const wanted = Array.from(new Set(placeholders.map(foldKey))).filter(Boolean);
  if (wanted.length === 0) return [];
  const out: MissingMergeValues[] = [];
  rows.forEach((row, i) => {
    const present = new Set<string>();
    for (const [k, v] of Object.entries(row)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") present.add(foldKey(k));
    }
    const fields = wanted.filter((key) => !present.has(key));
    if (fields.length > 0) {
      out.push({
        rowNumber: rowNumbers?.[i] ?? i + 2,
        employeeName: String(row.employee_name ?? "").trim(),
        fields,
      });
    }
  });
  return out;
}

/** Walk every question step for a letter type and return the scalar-type
 *  questions (text / textarea / number / date / currency) suitable for a CSV
 *  column. `currency` must be included to stay consistent with
 *  placeholderKeysFor (mailmerge.ts), which advertises currency placeholders to
 *  the template AI — omitting it here dropped currency columns from the sample
 *  headers and never mapped them in rowToAnswers. */
function scalarQuestionsFor(letterType: string): Question[] {
  const steps = letterStepsFor(letterType as Parameters<typeof letterStepsFor>[0]);
  const scalars: Question[] = [];
  for (const step of steps) {
    for (const q of step.questions) {
      if (
        q.type === "text" ||
        q.type === "textarea" ||
        q.type === "number" ||
        q.type === "date" ||
        q.type === "currency"
      ) {
        scalars.push(q);
      }
    }
  }
  return scalars;
}

/** Produce sample CSV headers for the picked template. Always begins
 *  with `employee_name` + a few universal common fields, then template-
 *  specific scalar questions. */
export function sampleHeadersFor(letterType: string): string[] {
  const base = ["employee_name", "employee_job_title", "employee_start_date", "employee_email"];
  // snake_case, exactly the {{placeholder}} names the generator emits
  // (placeholderKeysFor folds wizard ids the same way), so a column header
  // reads the same as the token in the template.
  const extras = scalarQuestionsFor(letterType).map((q) => foldKey(q.id));
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const h of [...base, ...extras]) {
    const key = h.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(h);
  }
  return merged;
}

/** Produce a small sample CSV (header + 2 example rows) for the user
 *  to download as a template. Values are placeholder strings. */
export function sampleCsvFor(letterType: string): string {
  const headers = sampleHeadersFor(letterType);
  const exampleRow = headers.map((h) => {
    if (h === "employee_name") return "Jane Patel";
    if (h === "employee_job_title") return "Engineer";
    if (h === "employee_email") return "jane.patel@example.com";
    if (h.toLowerCase().includes("date")) return "2026-01-15";
    return "";
  });
  const exampleRow2 = headers.map((h) => {
    if (h === "employee_name") return "Marcus Khan";
    if (h === "employee_job_title") return "Customer Success";
    if (h === "employee_email") return "marcus@example.com";
    if (h.toLowerCase().includes("date")) return "2025-09-01";
    return "";
  });
  return [headers, exampleRow, exampleRow2].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Quote a cell when it holds a comma, quote or line break (RFC 4180). */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Map a CSV row's columns onto a wizard-shaped answers object. Header
 *  names are matched case-insensitively to question ids. Two common
 *  aliases are folded in (employee_name -> employeeLegalName) so the
 *  preview matches user expectations. */
export function rowToAnswers(
  row: Record<string, string>,
  letterType: string
): Record<string, string | number | boolean> {
  const answers: Record<string, string | number | boolean> = {};
  const scalars = scalarQuestionsFor(letterType);
  // Match on the folded key so both the snake_case sample headers and the
  // older camelCase headers (reviewMeetingDate) map onto the question.
  const scalarByKey = new Map(scalars.map((q) => [foldKey(q.id), q]));
  const scalarByLower = new Map(scalars.map((q) => [q.id.toLowerCase(), q]));

  for (const [rawKey, value] of Object.entries(row)) {
    if (!value) continue;
    const key = foldKey(rawKey);

    // Common aliases first — these are *the* fields the bulk skeleton
    // expects every CSV to carry.
    if (key === "employee_name") {
      answers.employeeLegalName = value;
      continue;
    }
    if (key === "employee_job_title") {
      answers.employeeJobTitle = value;
      continue;
    }
    if (key === "employee_email") {
      answers.employeeEmail = value;
      continue;
    }
    if (key === "employee_start_date") {
      answers.employeeStartDate = value;
      continue;
    }

    // Folded-id match against the template's scalar questions (headers are
    // lowercased on parse, so also accept a lowercased camelCase id).
    const q = scalarByKey.get(key) ?? scalarByLower.get(rawKey.toLowerCase());
    if (q) {
      // Preserve the original camelCase id from the schema.
      if (q.type === "number") {
        const n = Number(value);
        if (!Number.isNaN(n)) answers[q.id] = n;
      } else {
        answers[q.id] = value;
      }
    }
  }

  return answers;
}
