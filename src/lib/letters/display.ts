import type { Draft } from "./types";
import { getLetterMeta } from "./catalog";

/**
 * Compose the full display title for a draft — the single source of
 * truth used by every surface that lists drafts as a single line
 * without a separate recipient column (sidebar recents, search palette,
 * notifications, editor heading, browser tab).
 *
 * Precedence:
 *   1. draft.title (user-set override) — shown verbatim
 *   2. `${letter type} · ${recipient name}` — auto-compose so multiple
 *      drafts of the same type are immediately distinguishable
 *   3. `${letter type}` — fallback when there's no recipient name yet
 *
 *   Examples:
 *     Drafted "Performance Improvement Plan response" for James O'Connor →
 *       "Performance Improvement Plan response · James O'Connor"
 *
 *     "Grievance" sent to Acme Holdings Ltd →
 *       "Grievance · Acme Holdings Ltd"
 *
 *     User renames to "James PIP — Aug 2026" →
 *       "James PIP — Aug 2026"
 *
 * For tabular views that already render the recipient in its own
 * column, use briefTitleFor() instead to avoid duplication.
 */
export function displayTitleFor(draft: Draft): string {
  const override = draft.title?.trim();
  if (override) return override;

  const typeTitle = getLetterMeta(draft.letterType).title;
  const recipient = recipientNameFor(draft);
  return recipient ? `${typeTitle} · ${recipient}` : typeTitle;
}

/**
 * Compose the BRIEF title for a draft — used in tables/lists that
 * render the recipient name in a separate column or row so we don't
 * duplicate it inside the title cell.
 *
 *   1. draft.title (user override) — verbatim
 *   2. letter-type shortTitle if available, else full title
 */
export function briefTitleFor(draft: Draft): string {
  const override = draft.title?.trim();
  if (override) return override;

  const meta = getLetterMeta(draft.letterType);
  return meta.shortTitle ?? meta.title;
}

/**
 * The "who's this letter about?" name. Employer-side drafts have an
 * employee recipient; employee-side drafts are addressed to an employer.
 * Returns the trimmed legal name, or undefined if it isn't set yet.
 */
export function recipientNameFor(draft: Draft): string | undefined {
  const raw =
    draft.mode === "employer"
      ? draft.employee.legalName
      : draft.employer.legalName;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

/**
 * The letter-type label on its own — used as a small subtitle / chip
 * alongside the display title where there's room to show both.
 */
export function letterTypeLabelFor(draft: Draft): string {
  return getLetterMeta(draft.letterType).title;
}

/**
 * True when the draft has a user-set custom title (vs. relying on the
 * auto-composed default). Useful for showing an "auto" hint next to
 * the editable title field when the user hasn't renamed anything.
 */
export function hasCustomTitle(draft: Draft): boolean {
  return Boolean(draft.title?.trim());
}

/**
 * A section title as people read it. Letters started before the catalogue
 * dropped em dashes and ampersands keep the old titles on their sections
 * ("Subject — Formal Grievance", "Date & recipient"); this shows them the
 * new way ("Subject: formal grievance", "Date and recipient").
 */
export function sectionTitleText(title: string | undefined): string {
  let t = (title ?? "").trim();
  const dash = t.indexOf(" — ");
  if (dash > 0) {
    const left = t.slice(0, dash);
    const right = t
      .slice(dash + 3)
      .split(" ")
      .map((w) => (w.length > 1 && (w === w.toUpperCase() || /\d/.test(w)) ? w : w.toLowerCase()))
      .join(" ")
      .replace(/\s+—\s+/g, ", ");
    t = `${left}: ${right}`;
  }
  return t.replace(/\s+—\s+/g, ", ").replace(/\s&\s/g, " and ");
}

/**
 * A catalogue name in sentence case, for running text and lists
 * ("Offer of Employment" reads "Offer of employment"). Acronyms and words
 * with digits keep their case (PIP, ACAS, SAR, UK).
 */
export function sentenceCaseTitle(title: string | undefined): string {
  const t = (title ?? "").trim();
  let first = true;
  return t.replace(/[\p{L}][\p{L}'’]*/gu, (w) => {
    if (first) {
      first = false;
      return w;
    }
    if (w.length > 1 && w === w.toUpperCase()) return w;
    return w.toLowerCase();
  });
}
