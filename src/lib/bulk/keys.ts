/**
 * Canonical placeholder/column key: lowercase, with `.`/`-` AND camelCase
 * boundaries folded to `_`. This is the single normalisation every side of
 * the mail merge agrees on (the {{placeholders}} the generator advertises,
 * the sample CSV headers, CSV column matching and substitution). Without the
 * camelCase fold, a wizard scalar id like `reviewMeetingDate` could never
 * match a snake_case CSV column `review_meeting_date` (bug #18).
 *
 * Kept in its own module so the CSV helpers can use it without importing the
 * generation code (and the AI client) in mailmerge.ts.
 */
export function foldKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[.\-]/g, "_");
}
