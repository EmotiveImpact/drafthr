/**
 * The names the sidebar gives its recent letters: the short form from the
 * mocks ("Warning letter · J. Hale"), told apart when two would read the
 * same (FOUNDATION-X9).
 */
import { briefTitleFor } from "@/lib/letters/display";
import type { Draft } from "@/lib/letters/types";

/** "J. Hale" from "Jordan Hale". */
export function shortName(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

/** A warning's level, short enough for a nested row. */
const WARNING_LEVEL: Record<string, string> = {
  verbal: "Verbal warning",
  written: "Written warning",
  final_written: "Final warning",
};

/**
 * The short name a recent letter goes by: "Offer letter", or for a warning
 * with its level chosen "Final warning", so two warnings for the same person
 * read apart (FOUNDATION-X9). A name the person gave the letter is kept.
 */
function recentTitle(d: Draft): string {
  if (!d.title?.trim() && d.letterType === "warning") {
    const level = String((d.answers as Record<string, unknown> | undefined)?.warningLevel ?? "");
    if (WARNING_LEVEL[level]) return WARNING_LEVEL[level];
  }
  return briefTitleFor(d);
}

function recentWho(d: Draft): string | undefined {
  return d.mode === "employer" ? shortName(d.employee.legalName) : d.employer.legalName?.trim();
}

/**
 * "Warning letter · J. Hale" for each recent letter. Two that would still
 * read the same (same kind of letter, same person, no level or name to tell
 * them apart) are numbered in the order they were started ("Warning letter
 * 1 · J. Hale", "Warning letter 2 · J. Hale"), so no two rows look identical.
 */
export function recentLabels(list: Draft[]): string[] {
  const titles = list.map(recentTitle);
  const whos = list.map(recentWho);
  const keyOf = (i: number) => `${titles[i]}\u0000${whos[i] ?? ""}`;
  const groups = new Map<string, number[]>();
  list.forEach((_, i) => groups.set(keyOf(i), [...(groups.get(keyOf(i)) ?? []), i]));
  const number = new Map<number, number>();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    [...idx]
      .sort((a, b) => list[a].createdAt - list[b].createdAt || list[a].id.localeCompare(list[b].id))
      .forEach((i, n) => number.set(i, n + 1));
  }
  return list.map((_, i) => {
    const title = number.has(i) ? `${titles[i]} ${number.get(i)}` : titles[i];
    return whos[i] ? `${title} · ${whos[i]}` : title;
  });
}
