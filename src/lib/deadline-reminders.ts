import { parseDateOnly } from "./date-only";
import type { Draft } from "./letters/types";
import { getLetterMeta } from "./letters/catalog";

export const UNVERIFIED_DEADLINE_NOTICE =
  "Unverified reminder only. Confirm the applicable deadline with a qualified adviser; this reminder does not establish a legal time limit.";

/** Calendar reminders accept a complete, real date, never a timestamp or prefix. */
export function isValidReminderDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && parseDateOnly(value) !== null;
}

/**
 * Preserve historical records without endorsing the old automatic calculation.
 * Deliberately expose only the date: a legacy `basis` can contain an obsolete
 * legal rule and must not be reused as advice or sent to the letter generator.
 */
export function getUnverifiedDeadlineReminder(draft: Pick<Draft, "context">): { iso: string } | null {
  const iso = draft.context.protectedDeadline?.iso;
  return isValidReminderDate(iso) ? { iso } : null;
}

/** Do not burden routine employee letters, but never hide the claim-time warning. */
export function needsFilingDeadlineWarning(draft: Draft): boolean {
  if (draft.context.protectedDeadline) return true;
  return draft.mode === "employee" && Boolean(
    draft.answers.actDate || getLetterMeta(draft.letterType).tribunalBound,
  );
}
