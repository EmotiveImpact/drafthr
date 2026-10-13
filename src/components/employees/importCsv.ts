/**
 * Import CSV for the employee directory: reads a spreadsheet export with the
 * bulk letters' RFC 4180 parser, maps its columns to employee fields and
 * checks each row. Rows with no name, or a person already in the directory
 * (or earlier in the same file), are skipped; a start date that cannot be
 * read is left blank and an unknown status falls back to Active, each with
 * a warning shown in the preview.
 */
import type { EmploymentStatus, WorkerClass } from "@/lib/letters/types";
import { parseCsvRecords } from "@/components/bulk/csv";
import type { EmployeeFormValues } from "./EmployeeForm";

export const EMPLOYEE_CSV_COLUMNS = ["legal_name", "preferred_name", "email", "job_title", "department", "start_date", "status", "manager", "worker_class"];

/** The header row offered as "Download template". */
export function employeeCsvTemplate(): string {
  return EMPLOYEE_CSV_COLUMNS.join(",") + "\n";
}

type Field = "legalName" | "preferredName" | "email" | "jobTitle" | "department" | "startDate" | "status" | "managerName" | "workerClass";

const ALIASES: Record<Field, string[]> = {
  legalName: ["legal_name", "name", "full_name", "employee_name", "employee"],
  preferredName: ["preferred_name", "known_as", "nickname"],
  email: ["email", "email_address", "work_email"],
  jobTitle: ["job_title", "title", "role", "position"],
  department: ["department", "dept", "team"],
  startDate: ["start_date", "started", "start", "date_started", "hire_date"],
  status: ["status", "employment_status"],
  managerName: ["manager", "manager_name", "line_manager", "reports_to"],
  workerClass: ["worker_class", "worker_type", "type", "contract_type"],
};

const key = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** ISO date from "2023-03-03", "03/03/2023" (UK day first), "3 Mar 2023" or "3 March 2023". */
export function readDate(raw: string): string | null {
  const s = raw.trim();
  const iso = (y: number, m: number, d: number) => {
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return iso(+m[3], mi + 1, +m[1]);
  }
  return null;
}

function readStatus(raw: string): EmploymentStatus | null {
  const s = norm(raw).replace(/[_-]/g, " ");
  if (!s) return "active";
  if (["active", "current", "employed"].includes(s)) return "active";
  if (["notice", "on notice", "serving notice"].includes(s)) return "notice";
  if (["on leave", "leave", "onleave", "absent"].includes(s)) return "on-leave";
  if (["left", "leaver", "former", "terminated", "inactive"].includes(s)) return "left";
  return null;
}

function readWorker(raw: string): WorkerClass | undefined {
  const s = norm(raw);
  if (s === "employee" || s === "worker" || s === "contractor" || s === "casual") return s;
  return undefined;
}

export type ImportRow = {
  /** Spreadsheet row number (header = row 1). */
  line: number;
  name: string;
  values: EmployeeFormValues | null;
  warnings: string[];
  skip: boolean;
};

export type ImportPreview = { rows: ImportRow[]; error?: string };

export const UNREADABLE = "We couldn't read this file. Try saving it as plain CSV.";

/** Read the file text into rows to import, checked against the names already in the directory. */
export function readEmployeesCsv(text: string, existingNames: Iterable<string>): ImportPreview {
  const cleaned = text.replace(/^﻿/, "");
  if (!cleaned.trim() || cleaned.includes("\u0000")) return { rows: [], error: UNREADABLE };
  const { records, error } = parseCsvRecords(cleaned);
  if (error) return { rows: [], error: UNREADABLE };
  const recs = records.map((cells, i) => ({ cells: cells.map((c) => c.trim()), line: i + 1 })).filter((r) => r.cells.some((c) => c !== ""));
  if (recs.length < 2) return { rows: [], error: "This file has no rows to import. Put the column names in the first row and one person on each row below." };

  const headers = recs[0].cells.map(key);
  const col: Partial<Record<Field, number>> = {};
  for (const f of Object.keys(ALIASES) as Field[]) {
    const idx = headers.findIndex((h) => ALIASES[f].includes(h));
    if (idx >= 0) col[f] = idx;
  }
  if (col.legalName === undefined) return { rows: [], error: "This file has no name column. Add a legal_name (or name) column and try again." };

  const seen = new Set<string>();
  const existing = new Set([...existingNames].map(norm));
  const rows: ImportRow[] = recs.slice(1).map(({ cells, line }) => {
    const get = (f: Field) => (col[f] === undefined ? "" : (cells[col[f]!] ?? "").trim());
    const name = get("legalName").replace(/\s+/g, " ");
    const warnings: string[] = [];
    if (!name) return { line, name: "", values: null, warnings: ["No name, so this row is skipped"], skip: true };
    const k = norm(name);
    if (existing.has(k)) return { line, name, values: null, warnings: ["Already in the directory, so this row is skipped"], skip: true };
    if (seen.has(k)) return { line, name, values: null, warnings: ["Listed twice in this file, so this row is skipped"], skip: true };
    seen.add(k);

    const rawDate = get("startDate");
    let startDate: string | undefined;
    if (rawDate) {
      const d = readDate(rawDate);
      if (d) startDate = d;
      else warnings.push(`Start date "${rawDate}" could not be read, so it is left blank`);
    }
    const rawStatus = get("status");
    let status = readStatus(rawStatus);
    if (!status) {
      warnings.push(`Status "${rawStatus}" is not one we know, so it is set to Active`);
      status = "active";
    }
    const values: EmployeeFormValues = {
      legalName: name,
      preferredName: get("preferredName") || undefined,
      email: get("email") || undefined,
      jobTitle: get("jobTitle") || undefined,
      department: get("department") || undefined,
      managerName: get("managerName") || undefined,
      startDate,
      status,
      workerClass: readWorker(get("workerClass")) ?? "employee",
    };
    return { line, name, values, warnings, skip: false };
  });
  return { rows };
}
