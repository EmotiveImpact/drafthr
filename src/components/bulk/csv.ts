/**
 * Tiny CSV helpers for the Bulk Operations skeleton.
 *
 * Limitations (intentional — real pipeline will use PapaParse):
 *  - Quoted fields with embedded commas: supported.
 *  - Quoted fields with embedded newlines: NOT supported (we split rows
 *    on raw newlines first).
 *  - Escaped double-quotes inside quoted fields (`""`): supported.
 *  - BOM stripped from start of file.
 *  - Trailing whitespace per cell trimmed.
 *  - Empty rows skipped.
 */

import { letterStepsFor, type Question } from "@/lib/letters/questions";

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  /** Row-level warnings, e.g. missing required field. */
  warnings: { rowIndex: number; message: string }[];
  /** Hard error — parse couldn't continue. */
  error?: string;
};

const BOM = "﻿";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Parse a raw CSV string. Validates header row + that at least one
 *  data row has a non-empty `employee_name` field. */
export function parseCsv(raw: string): CsvParseResult {
  const cleaned = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], warnings: [], error: "CSV is empty." };
  }
  if (lines.length < 2) {
    return {
      headers: [],
      rows: [],
      warnings: [],
      error: "CSV needs a header row and at least one data row.",
    };
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
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
      error: `Duplicate column '${duplicate}' — column names must be unique.`,
    };
  }

  const rows: Record<string, string>[] = [];
  const warnings: { rowIndex: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    if (!row.employee_name) {
      warnings.push({
        rowIndex: i,
        message: `Row ${i} missing 'employee_name' — will skip.`,
      });
      continue;
    }
    rows.push(row);
  }

  return { headers, rows, warnings };
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
  const extras = scalarQuestionsFor(letterType).map((q) => q.id);
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
  return [headers.join(","), exampleRow.join(","), exampleRow2.join(",")].join("\n");
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
  const scalarIds = new Set(scalars.map((q) => q.id.toLowerCase()));

  for (const [rawKey, value] of Object.entries(row)) {
    if (!value) continue;
    const key = rawKey.toLowerCase();

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

    // Exact-id match against the template's scalar questions.
    if (scalarIds.has(key)) {
      // Preserve the original camelCase id from the schema.
      const orig = scalars.find((q) => q.id.toLowerCase() === key);
      if (orig) {
        const q = orig;
        if (q.type === "number") {
          const n = Number(value);
          if (!Number.isNaN(n)) answers[q.id] = n;
        } else {
          answers[q.id] = value;
        }
      }
    }
  }

  return answers;
}
