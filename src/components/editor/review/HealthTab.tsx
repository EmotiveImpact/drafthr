import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ScoreRing } from "@/components/finalize/ScoreRing";
import { FixThisFirst } from "@/components/finalize/FixThisFirst";
import {
  runHealthChecks,
  computeHealthScore,
  topFixes,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  type Fix,
} from "@/lib/finalize/healthChecks";
import type { Draft } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { AllChecks, type RailCheckRow } from "./AllChecks";

/**
 * HEALTH tab — the "is this letter ready?" assessment.
 *
 * Layout:
 *   1. Score ring summary (overall + 3 dimension sub-rings + band chip)
 *   2. Fix-this-first card (top 3 prioritised fixes)
 *   3. All checks list (legacy ReviewRail rows: completeness, template
 *      quality, statutory compliance, evidence, comments etc.)
 *
 * Reuses `ScoreRing` and `FixThisFirst` verbatim from `components/finalize/`
 * so the look is identical between Review and Finalize. Health checks come
 * from the shared `lib/finalize/healthChecks` engine.
 */

const BAND_LABEL: Record<"strong" | "adequate" | "weak", string> = {
  strong: "Strong",
  adequate: "Adequate",
  weak: "Weak",
};

const BAND_CLASSES: Record<
  "strong" | "adequate" | "weak",
  { bg: string; text: string }
> = {
  strong: { bg: "bg-[var(--ds-green-bg)]", text: "text-[var(--ds-green-fg)]" },
  adequate: { bg: "bg-[var(--ds-amber-bg)]", text: "text-[var(--ds-amber-fg)]" },
  weak: { bg: "bg-[var(--ds-red-bg)]", text: "text-[var(--ds-red-fg)]" },
};

export function HealthTab({
  draft,
  rows,
}: {
  draft: Draft;
  rows: RailCheckRow[];
}) {
  const nav = useNavigate();

  // Re-derive checks/score/fixes from the draft. useMemo prevents the work
  // being repeated every parent re-render — the checks engine is pure and
  // only depends on the draft reference.
  const checks = useMemo(() => runHealthChecks(draft), [draft]);
  const scoreData = useMemo(() => computeHealthScore(checks), [checks]);
  const fixes = useMemo(() => topFixes(checks, 3), [checks]);

  // Route the Fix-this-first action through react-router. The check's
  // actionRoute enum is "editor" | "evidence" | "settings" — we compose
  // the final URL here because only the page knows the current draftId.
  const onFix = (fix: Fix) => {
    switch (fix.check.actionRoute) {
      case "evidence":
        nav(`/editor/${draft.id}/evidence`);
        return;
      case "settings":
        nav("/settings");
        return;
      case "editor":
      default:
        nav(`/editor/${draft.id}`);
        return;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="space-y-4"
    >
      {/* Score summary — overall ring on the left, band + verdict + sub-rings on the right. */}
      <div className="rounded-xl border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
        <div className="flex items-start gap-3">
          <ScoreRing score={scoreData.score} band={scoreData.band} size={72} />
          <div className="flex-1 min-w-0">
            <span
              className={cn(
                "inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider mb-1",
                BAND_CLASSES[scoreData.band].bg,
                BAND_CLASSES[scoreData.band].text,
              )}
            >
              {BAND_LABEL[scoreData.band]}
            </span>
            <p className="text-[12.5px] font-semibold text-[var(--ds-ink)] m-0 leading-snug">
              {scoreData.oneLiner}
            </p>
            <p className="text-[11px] text-[var(--ds-muted)] mt-0.5">
              {scoreData.passCount} of {scoreData.totalCount} checks pass
              {scoreData.warnCount > 0 &&
                ` · ${scoreData.warnCount} warning${scoreData.warnCount === 1 ? "" : "s"}`}
              {scoreData.failCount > 0 &&
                ` · ${scoreData.failCount} blocker${scoreData.failCount === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        {/* Three dimension sub-rings — staggered count-up so the eye tracks
         * across them. The rail is narrow so we use a 3-column grid with
         * fixed equal width, not a flex row. */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {scoreData.dimensions.map((d, i) => (
            <div
              key={d.dimension}
              title={DIMENSION_DESCRIPTIONS[d.dimension]}
              className="flex flex-col items-center gap-1 min-w-0"
            >
              <ScoreRing
                score={d.score}
                band={d.band}
                size={44}
                delay={0.2 + i * 0.1}
                label={DIMENSION_LABELS[d.dimension]}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Top fixes — only renders if there are actionable issues. */}
      {fixes.length > 0 && <FixThisFirst fixes={fixes} onAction={onFix} />}

      {/* All other checks (template quality, statutory, evidence, etc.) */}
      <div>
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ds-muted)] mb-2 px-1">
          All checks
        </h3>
        <AllChecks rows={rows} />
      </div>
    </motion.div>
  );
}
