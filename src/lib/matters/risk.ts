/* ============================================================================
 * Auto-derive Matter.riskBand from the drafts inside the matter.
 *
 * Pure functions — no React, no Zustand. Used by the HR dashboard's Risk
 * panel and the MatterDetail header to surface a sensible default when no
 * one has manually tagged the matter. A manual `matter.riskBand` always
 * wins; this is the fallback.
 *
 * Heuristic:
 *   - Run runHealthChecks() across every draft in the matter.
 *   - Compliance fails and PII fails dominate (legal hazards).
 *   - Matter type nudges the floor up (tribunal/settlement start higher).
 *
 * Returns undefined when there are zero drafts AND no type signal — the
 * caller should leave the badge hidden rather than guess.
 * ==========================================================================*/

import type { Draft, MatterType, RiskBand } from "@/lib/letters/types";
import { runHealthChecks } from "@/lib/finalize/healthChecks";

const TYPE_FLOOR: Partial<Record<MatterType, RiskBand>> = {
  tribunal: "high",
  settlement: "high",
  grievance: "moderate",
  disciplinary: "moderate",
  investigation: "moderate",
  redundancy: "moderate",
};

const BAND_RANK: Record<RiskBand, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

function maxBand(a: RiskBand, b: RiskBand): RiskBand {
  return BAND_RANK[a] >= BAND_RANK[b] ? a : b;
}

/**
 * Aggregate health-check signals across every draft in the matter into a
 * single RiskBand. Counts:
 *   piiFails       — any draft with a PII pattern detected
 *   complianceFail — any compliance-dimension fail
 *   complianceWarn — any compliance-dimension warn
 *   totalWarns     — any-dimension warn count (proxy for general mess)
 */
export function deriveRiskBand(
  drafts: Draft[],
  type?: MatterType
): RiskBand | undefined {
  if (drafts.length === 0 && !type) return undefined;

  let piiFails = 0;
  let complianceFail = 0;
  let complianceWarn = 0;
  let totalWarns = 0;

  for (const draft of drafts) {
    try {
      const checks = runHealthChecks(draft);
      for (const c of checks) {
        if (c.id === "pii" && c.severity === "fail") piiFails += 1;
        if (c.dimension === "compliance" && c.severity === "fail") complianceFail += 1;
        if (c.dimension === "compliance" && c.severity === "warn") complianceWarn += 1;
        if (c.severity === "warn") totalWarns += 1;
      }
    } catch {
      // skip drafts that can't be scored yet
    }
  }

  let band: RiskBand;
  if (piiFails >= 1 && complianceFail >= 1) band = "critical";
  else if (piiFails >= 1 || complianceFail >= 2) band = "critical";
  else if (complianceFail >= 1) band = "high";
  else if (complianceWarn >= 1 || totalWarns >= 3) band = "moderate";
  else band = "low";

  const floor = type ? TYPE_FLOOR[type] : undefined;
  return floor ? maxBand(band, floor) : band;
}

/**
 * Convenience wrapper — read the manual riskBand if set, otherwise derive.
 * Lets call sites stay terse: `effectiveRiskBand(matter, drafts)`.
 */
export function effectiveRiskBand(
  matter: { riskBand?: RiskBand; type?: MatterType },
  drafts: Draft[]
): RiskBand | undefined {
  return matter.riskBand ?? deriveRiskBand(drafts, matter.type);
}
