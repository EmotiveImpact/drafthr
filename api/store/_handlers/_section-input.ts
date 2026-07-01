/**
 * Runtime validation for a client-supplied section row.
 *
 * TypeScript types are erased at runtime, so a malformed section (missing
 * title/html/status/position, wrong types) would otherwise reach the Drizzle
 * insert and trip a NOT NULL / type constraint → an unhandled 500. Validating
 * up front lets the store handlers return a clean 400 instead. sectionId is the
 * row key so it must be a non-empty string; title/html may be empty strings
 * (an "empty" section is legitimate) but must be present and string-typed.
 */
const SECTION_STATUSES = new Set(["empty", "streaming", "ready", "edited"]);

export function isValidSectionInput(s: unknown): boolean {
  if (typeof s !== "object" || s === null) return false;
  const v = s as Record<string, unknown>;
  return (
    typeof v.sectionId === "string" &&
    v.sectionId.trim().length > 0 &&
    typeof v.title === "string" &&
    typeof v.html === "string" &&
    typeof v.status === "string" &&
    SECTION_STATUSES.has(v.status) &&
    typeof v.position === "number" &&
    Number.isFinite(v.position)
  );
}
