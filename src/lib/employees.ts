/* ============================================================================
 * Employee derivation helpers
 *
 * Pure functions — no React, no Zustand. Used to migrate the existing
 * denormalized Draft.employee blocks (HR-mode only) into a workspace-level
 * Employee directory.
 *
 * Flow: deriveEmployeesFromDrafts() scans every HR-mode draft, groups by
 * normalized legalName, and returns one suggestion per unique person. The
 * UI can then offer "We found 12 unique employees — create records?". On
 * accept, the caller creates Employee records via the store and (later)
 * back-links drafts via Matter.participants[].
 *
 * Matching is deliberately simple: case-insensitive equality after trim +
 * whitespace collapse. We avoid Levenshtein / fuzzy distance here because
 * for the migration use-case the cost of a false merge ("Jon Patel" vs
 * "Jen Patel" → one record) is far worse than the cost of a duplicate the
 * user can merge by hand.
 * ==========================================================================*/

import type { Draft, Employee, EmploymentStatus } from "./letters/types";

/**
 * Suggestion shape — same fields as a future Employee record, plus
 * derivation metadata so the UI can show "appears in N drafts, last
 * touched 3 days ago".
 */
export type EmployeeSuggestion = Omit<
  Employee,
  "id" | "createdAt" | "updatedAt"
> & {
  /** How many drafts reference this person. */
  draftCount: number;
  /** Most recent draft updatedAt — for sort. */
  lastSeenAt: number;
};

/** Normalize a legal name for grouping: trim, lowercase, collapse whitespace. */
function normalizeName(name: string | undefined | null): string {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Derive Employee suggestions from the existing Draft store.
 *
 * Only employer-mode drafts contribute (HR owns the directory). One
 * suggestion per unique normalized legalName. Field values (jobTitle,
 * email, department, startDate) come from the most recent draft to
 * mention the person — drafts disagree all the time as roles change.
 */
export function deriveEmployeesFromDrafts(
  drafts: Record<string, Draft>
): EmployeeSuggestion[] {
  // Group drafts by normalized employee legal name.
  const groups = new Map<string, Draft[]>();
  for (const draft of Object.values(drafts)) {
    if (draft.mode !== "employer") continue;
    const key = normalizeName(draft.employee?.legalName);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(draft);
    else groups.set(key, [draft]);
  }

  const suggestions: EmployeeSuggestion[] = [];
  for (const bucket of groups.values()) {
    // Most recent draft is the canonical source for current role / details.
    const sorted = [...bucket].sort((a, b) => b.updatedAt - a.updatedAt);
    const latest = sorted[0];
    const emp = latest.employee;
    const status: EmploymentStatus = "active";
    suggestions.push({
      legalName: emp.legalName.trim().replace(/\s+/g, " "),
      preferredName: emp.preferredName,
      jobTitle: emp.jobTitle || undefined,
      department: emp.department,
      email: emp.email,
      startDate: emp.startDate || undefined,
      workerClass: latest.context.workerClass,
      status,
      draftCount: bucket.length,
      lastSeenAt: latest.updatedAt,
    });
  }

  // Sort by most-recently-seen first so the UI shows live people up top.
  suggestions.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return suggestions;
}

/**
 * Match an existing employee record to a draft's employee block by
 * normalized legalName. Returns the matching employee id, or null.
 *
 * Deliberately strict: equality only after normalization. The caller
 * should treat "no match" as "offer to create a new record", not as
 * "merge into the closest existing one".
 */
export function matchEmployeeForDraft(
  draft: Draft,
  employees: Record<string, Employee>
): string | null {
  const key = normalizeName(draft.employee?.legalName);
  if (!key) return null;
  for (const emp of Object.values(employees)) {
    if (normalizeName(emp.legalName) === key) return emp.id;
  }
  return null;
}
