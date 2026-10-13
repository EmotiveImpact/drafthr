/**
 * Which of the sidebar's nested lists (recent letters under Letters, the
 * matters under Matters) can stay open without pushing the main rows out of
 * view. On a 1366x768 laptop the middle of the sidebar has about 480px: all
 * seven rows and both lists need about 546px, so Experts and Reports slid
 * under the Settings and Help footer and looked missing (FOUNDATION-X1).
 *
 * The heights are the sidebar's own (40px rows with a 2px gap, 34px nested
 * rows, 8px around each nested list), so the answer is exact and does not
 * depend on measuring the lists themselves. When both lists do not fit, the
 * list for the section the person is in stays open and the other folds to
 * its chevron; when even that one does not fit, both fold. The person can
 * still open either with its chevron (the middle then scrolls).
 */

export const SIDEBAR_ROW_H = 40;
export const SIDEBAR_ROW_GAP = 2;
export const SIDEBAR_SUB_ROW_H = 34;
/** mt-0.5 + mb-1.5 on the nested list. */
export const SIDEBAR_SUB_LIST_EXTRA = 8;

export type SubListPlan = { letters: boolean; matters: boolean };

export function subListHeight(rows: number): number {
  return rows > 0 ? rows * SIDEBAR_SUB_ROW_H + SIDEBAR_SUB_LIST_EXTRA : 0;
}

export function fitSubLists(input: {
  /** Height of the sidebar's middle area, in px. 0 or less means not measured yet. */
  available: number;
  /** Main rows in the middle area (7 for HR, 4 for employees). */
  rows: number;
  /** Nested rows each list would show when open. */
  letterRows: number;
  matterRows: number;
  /** The section the current page belongs to keeps its list first. */
  prefer: "letters" | "matters";
}): SubListPlan {
  const { available, rows, letterRows, matterRows, prefer } = input;
  if (!(available > 0)) return { letters: true, matters: true };
  const base = rows * SIDEBAR_ROW_H + Math.max(0, rows - 1) * SIDEBAR_ROW_GAP;
  const letters = subListHeight(letterRows);
  const matters = subListHeight(matterRows);
  if (base + letters + matters <= available) return { letters: true, matters: true };
  const first = prefer === "matters" ? matters : letters;
  const second = prefer === "matters" ? letters : matters;
  if (base + first <= available) {
    return prefer === "matters" ? { letters: false, matters: true } : { letters: true, matters: false };
  }
  // Only the other list fits (the current section's list is very long).
  if (base + second <= available) {
    return prefer === "matters" ? { letters: true, matters: false } : { letters: false, matters: true };
  }
  return { letters: false, matters: false };
}
