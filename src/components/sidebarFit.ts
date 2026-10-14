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
 * its chevron; when even that one does not fit, both fold.
 *
 * The chevrons say which lists the person wants (`want`). Opening one with
 * its chevron makes it the list to keep (`keep`): when the two do not fit
 * together, the other folds rather than pushing Experts and Reports under
 * the footer (FOUNDATION-X11). Opening the folded one swaps them.
 *
 * A long list of matters never pushes rows out of view either: it shows as
 * many matters as fit, then "View all" (`matterLimit` counts the nested
 * rows to show, "View all" included). With 13 matters at 1366x768 opening
 * Matters used to push Employees, Templates, Experts and Reports under the
 * footer (FOUNDATION-X15). The letters list is at most three letters and
 * "View all", so it needs no limit.
 */

export const SIDEBAR_ROW_H = 40;
export const SIDEBAR_ROW_GAP = 2;
export const SIDEBAR_SUB_ROW_H = 34;
/** mt-0.5 + mb-1.5 on the nested list. */
export const SIDEBAR_SUB_LIST_EXTRA = 8;

export type SubListPlan = {
  letters: boolean;
  matters: boolean;
  /** Nested matter rows to show, "View all" included, when not all fit. */
  matterLimit?: number;
};

/** The fewest nested matter rows worth showing: two matters and "View all". */
export const MIN_MATTER_ROWS = 3;

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
  /** The lists the person has not folded with their chevrons (default both). */
  want?: SubListPlan;
  /** The list the person last opened with its chevron: it stays open. */
  keep?: "letters" | "matters" | null;
}): SubListPlan {
  const { available, rows, letterRows, matterRows, prefer } = input;
  const want = { letters: input.want?.letters ?? true, matters: input.want?.matters ?? true };
  const keep = input.keep && want[input.keep] ? input.keep : null;
  if (!(available > 0)) return { ...want };
  const base = rows * SIDEBAR_ROW_H + Math.max(0, rows - 1) * SIDEBAR_ROW_GAP;
  const height = { letters: subListHeight(letterRows), matters: subListHeight(matterRows) };
  // Matters can be cut down to fit, so they need only their shortest form.
  const least = { letters: height.letters, matters: subListHeight(Math.min(matterRows, MIN_MATTER_ROWS)) };

  /** Open these lists, with the matters cut to the room the letters leave. */
  const open = (letters: boolean, matters: boolean): SubListPlan => {
    if (!matters) return { letters, matters };
    const room = available - base - (letters ? height.letters : 0);
    const fit = Math.floor((room - SIDEBAR_SUB_LIST_EXTRA) / SIDEBAR_SUB_ROW_H);
    return matterRows <= fit ? { letters, matters } : { letters, matters, matterLimit: Math.max(MIN_MATTER_ROWS, fit) };
  };
  const fits = (letters: boolean, matters: boolean) =>
    base + (letters ? least.letters : 0) + (matters ? least.matters : 0) <= available;

  if (want.letters && want.matters && base + height.letters + height.matters <= available) {
    return { letters: true, matters: true };
  }
  // The person opened Matters: give it the room, folding Letters.
  if (keep === "matters") return open(false, true);
  // Both, with the matters cut to fit.
  if (want.letters && want.matters && fits(true, true)) return open(true, true);
  // The person opened Letters: keep it, fold Matters.
  if (keep === "letters") return open(true, false);
  const first = prefer;
  const second = prefer === "matters" ? "letters" : "matters";
  const only = (list: "letters" | "matters") => open(list === "letters", list === "matters");
  if (want[first] && fits(first === "letters", first === "matters")) return only(first);
  if (want[second] && fits(second === "letters", second === "matters")) return only(second);
  return { letters: false, matters: false };
}
