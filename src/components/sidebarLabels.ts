/**
 * The names the sidebar gives its recent letters: the short form from the
 * mocks ("Warning letter · J. Hale"), told apart when two would read the
 * same (FOUNDATION-X9, X12), with the person always in full (FOUNDATION-X14)
 * and the number that tells two apart never cut ("Final warning 1 · J. Hale").
 */
import { format } from "date-fns";
import { briefTitleFor, displayTitleFor } from "@/lib/letters/display";
import type { Draft } from "@/lib/letters/types";

/** "J. Hale" from "Jordan Hale". */
export function shortName(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

/**
 * A warning's level, as the marketplace, the export pack and the mocks name
 * it (FOUNDATION-X13). Used when two warnings for the same person are among
 * the recent letters, so they read apart.
 */
const WARNING_LEVEL: Record<string, string> = {
  verbal: "Verbal warning",
  written: "First written warning",
  final_written: "Final written warning",
};

/**
 * Shorter names for the warning levels, used only when the full one would be
 * cut ("Final written wa... 1 · J. Hale" read the same for two final
 * warnings). The full name stays on hover.
 */
const WARNING_LEVEL_COMPACT: Record<string, string> = {
  written: "Written warning",
  final_written: "Final warning",
};

/**
 * Shorter names for the letter types whose usual name, with the person,
 * is wider than a nested row (about 175px at 14px). Used only when the full
 * name would be cut; the full name stays on hover.
 */
const COMPACT_TITLE: Record<string, string> = {
  probation_outcome: "Probation",
  contract_amendment: "Contract change",
  right_to_work: "Right to work",
  reference_dispute: "Reference",
  settlement_cover: "Settlement",
  settlement_counter_offer: "Counter-offer",
  acas_ec_notification: "ACAS cover",
  right_to_disconnect: "Overtime",
  grievance: "Grievance",
  accommodation_request: "Adjustments",
  resignation_constructive: "Resignation",
  resignation_with_grievance: "Resignation",
  resignation_acceptance: "Resignation",
  resignation_withdrawal: "Withdrawal",
  subject_access_request: "Data request",
  redundancy_consultation_response: "Redundancy",
  sickness_notification: "Sickness",
};

/** "Harbour Foods" from "Harbour Foods Ltd": the legal suffix is noise in a short row. */
function orgShort(name: string): string {
  return name.replace(/\s+(ltd\.?|limited|plc|llp|inc\.?|llc)$/i, "").trim() || name;
}

export type RecentLabel = {
  /** The whole label, "Warning letter · J. Hale" (menus, toasts, tests). */
  text: string;
  /** The letter part, "Warning letter 2" or "Final written warning". */
  title: string;
  /** The letter part without its number, "Warning letter"; may end in an ellipsis. */
  stem: string;
  /** The number that tells two otherwise alike letters apart; never cut. */
  number?: number;
  /** A shorter `stem` for when it would be cut ("Probation", "Final warning"). */
  compact?: string;
  /** The person part, "J. Hale"; always shown in full. */
  who?: string;
  /**
   * The hover text, which tells two similar letters apart: the label with
   * the full name, where the letter is and when it was started
   * ("Warning letter 1 · Jordan Hale (Draft · 1 check to fix, started 12 Oct)").
   */
  hover: string;
};

function recentWho(d: Draft): { short?: string; full?: string } {
  if (d.mode === "employer") {
    const full = d.employee.legalName?.trim();
    return { short: shortName(full) || undefined, full: full || undefined };
  }
  const org = d.employer.legalName?.trim();
  return { short: org ? orgShort(org) : undefined, full: org || undefined };
}

/**
 * The recent letters' labels. Each is "<letter> · <person>". When two would
 * read the same (same kind of letter, same person), a warning's level tells
 * them apart ("First written warning", "Final written warning"); if that is
 * not enough (no level chosen, or the same level) they are numbered in the
 * order they were started ("Warning letter 1", "Warning letter 2"). The
 * number is kept apart from the name (`stem`, `number`) so the sidebar can
 * shorten the name and still show the number. A name the person gave the
 * letter is kept as it is.
 *
 * `whereOf` gives each letter's where line ("Draft · 1 check to fix"), for
 * the hover text.
 */
export function recentLabelParts(list: Draft[], whereOf?: (d: Draft) => string | undefined): RecentLabel[] {
  const whos = list.map(recentWho);
  const base = list.map(briefTitleFor);
  const key = (titles: string[], i: number) => `${titles[i]}\u0000${whos[i].short ?? ""}`;
  const clashes = (titles: string[]) => {
    const groups = new Map<string, number[]>();
    list.forEach((_, i) => groups.set(key(titles, i), [...(groups.get(key(titles, i)) ?? []), i]));
    return [...groups.values()].filter((g) => g.length > 1);
  };

  // A warning's level, only where it is needed to tell two apart.
  const titles = [...base];
  const compacts: (string | undefined)[] = list.map((d) => (d.title?.trim() ? undefined : COMPACT_TITLE[d.letterType]));
  for (const group of clashes(base)) {
    for (const i of group) {
      const d = list[i];
      if (d.title?.trim() || d.letterType !== "warning") continue;
      const level = String((d.answers as Record<string, unknown> | undefined)?.warningLevel ?? "");
      if (WARNING_LEVEL[level]) {
        titles[i] = WARNING_LEVEL[level];
        compacts[i] = WARNING_LEVEL_COMPACT[level];
      }
    }
  }
  // Still the same: number them in the order they were started.
  const number = new Map<number, number>();
  for (const group of clashes(titles)) {
    [...group]
      .sort((a, b) => list[a].createdAt - list[b].createdAt || list[a].id.localeCompare(list[b].id))
      .forEach((i, n) => number.set(i, n + 1));
  }

  return list.map((d, i) => {
    const n = number.get(i);
    const stem = titles[i];
    const title = n ? `${stem} ${n}` : stem;
    const compact = compacts[i];
    const who = whos[i].short;
    const where = whereOf?.(d);
    const started = d.createdAt > 0 ? `started ${format(new Date(d.createdAt), "d MMM")}` : "";
    const detail = [where, started].filter(Boolean).join(", ");
    const named = whos[i].full ? `${title} · ${whos[i].full}` : displayTitleFor(d);
    return {
      text: who ? `${title} · ${who}` : title,
      title,
      stem,
      number: n,
      compact: compact && compact !== stem ? compact : undefined,
      who,
      hover: detail ? `${named} (${detail})` : named,
    };
  });
}

/** Just the labels: "Warning letter · J. Hale" for each recent letter. */
export function recentLabels(list: Draft[]): string[] {
  return recentLabelParts(list).map((l) => l.text);
}
