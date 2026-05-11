import type { Draft, Matter, MatterColor, Mode } from "./letters/types";

/**
 * Matters utilities — auto-grouping for Home (state 3 from the mockup),
 * helpers for matter-aware filtering elsewhere.
 *
 * The Matter concept is opt-in. Drafts without a matterId are surfaced
 * via auto-grouping (by employer in employee mode, by employee in HR
 * mode). When a user clicks "Make this a Matter →" on an auto-group,
 * we promote it via store.upgradeGroupToMatter.
 */

export type AutoGroup = {
  /** Stable id for this auto-group — derived from the primary name. */
  key: string;
  /** Primary party name (employer in employee mode, employee in HR mode). */
  primaryName: string;
  /** Context line (department / role / jurisdiction). */
  primaryContext?: string;
  /** Drafts in this group (unaffiliated drafts only — those with a
   * matterId are filtered out before grouping). */
  drafts: Draft[];
};

/**
 * Group unaffiliated drafts (no matterId) by their party-context.
 *
 *   employee mode → group by draft.employer.legalName
 *   HR mode      → group by draft.employee.legalName
 *
 * Drafts with NO party name fall into a single "Unsorted" group with
 * key="_unsorted".
 */
export function groupDraftsForAutoMatters(drafts: Draft[], mode: Mode): AutoGroup[] {
  const unaffiliated = drafts.filter((d) => !d.matterId);
  const buckets = new Map<string, AutoGroup>();

  for (const d of unaffiliated) {
    const rawName =
      mode === "employer"
        ? (d.employee.legalName ?? "").trim()
        : (d.employer.legalName ?? "").trim();

    const key = rawName ? rawName.toLowerCase() : "_unsorted";
    const primaryName = rawName || "Unsorted";
    const primaryContext =
      mode === "employer"
        ? d.employee.department || d.employee.jobTitle || undefined
        : d.context?.jurisdiction;

    const existing = buckets.get(key);
    if (existing) {
      existing.drafts.push(d);
      // Prefer the most-specific context (first non-undefined wins).
      if (!existing.primaryContext && primaryContext) {
        existing.primaryContext = primaryContext;
      }
    } else {
      buckets.set(key, {
        key,
        primaryName,
        primaryContext,
        drafts: [d],
      });
    }
  }

  // Sort: most-recently-updated group first, _unsorted last.
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.key === "_unsorted") return 1;
    if (b.key === "_unsorted") return -1;
    const aMax = Math.max(...a.drafts.map((d) => d.updatedAt));
    const bMax = Math.max(...b.drafts.map((d) => d.updatedAt));
    return bMax - aMax;
  });
}

/**
 * Suggest a swatch colour for a new matter based on its drafts' activity
 * / risk profile. Pure heuristic, user can change on creation.
 */
export function suggestColorForGroup(drafts: Draft[]): MatterColor {
  // If any draft has a high-risk export (per metadata or counsel-review
  // requirement), suggest red. Otherwise blue for fresh groups, amber
  // for active multi-letter groups, green for everything else.
  const hasHighRisk = drafts.some(
    (d) => d.context?.counselReviewRequired === true
  );
  if (hasHighRisk) return "red";
  if (drafts.length >= 3) return "amber";
  if (drafts.length === 2) return "blue";
  return "green";
}

/**
 * Drafts belonging to a specific matter, sorted by createdAt ascending
 * so the matter's narrative reads chronologically.
 */
export function draftsInMatter(drafts: Draft[], matterId: string): Draft[] {
  return drafts
    .filter((d) => d.matterId === matterId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Active matters for a given mode, sorted by most-recently-updated.
 */
export function activeMatters(matters: Matter[], mode: Mode): Matter[] {
  return matters
    .filter((m) => m.mode === mode && m.status === "active")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Closed matters for a given mode.
 */
export function closedMatters(matters: Matter[], mode: Mode): Matter[] {
  return matters
    .filter((m) => m.mode === mode && m.status !== "active")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Tailwind colour classes per MatterColor — used by both the matter
 * swatch (filled bg) and the sidebar dot (small filled circle).
 */
export const MATTER_COLOR_CLASSES: Record<
  MatterColor,
  { swatch: string; dot: string; ring: string }
> = {
  red: { swatch: "bg-[#dc2626]", dot: "bg-[#dc2626]", ring: "ring-[#dc2626]/30" },
  amber: { swatch: "bg-[#d97706]", dot: "bg-[#d97706]", ring: "ring-[#d97706]/30" },
  blue: { swatch: "bg-[#2563eb]", dot: "bg-[#2563eb]", ring: "ring-[#2563eb]/30" },
  violet: { swatch: "bg-[#7c3aed]", dot: "bg-[#7c3aed]", ring: "ring-[#7c3aed]/30" },
  green: { swatch: "bg-[#16a34a]", dot: "bg-[#16a34a]", ring: "ring-[#16a34a]/30" },
  slate: { swatch: "bg-[#475569]", dot: "bg-[#475569]", ring: "ring-[#475569]/30" },
};

/**
 * Initial-letter helper for the matter swatch — uppercase first letter
 * of the matter name, or "M" fallback.
 */
export function matterInitial(matter: Matter): string {
  const m = matter.name?.trim()?.[0];
  return m ? m.toUpperCase() : "M";
}
