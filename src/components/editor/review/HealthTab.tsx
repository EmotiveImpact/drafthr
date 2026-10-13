import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import type { HealthCheck } from "@/lib/finalize/healthChecks";
import type { Draft } from "@/lib/letters/types";
import { useJourney } from "@/lib/journey/stage";
import { useProfileStore } from "@/lib/profile";
import { canEditDraft } from "@/lib/permissions";
import { LetterHealthCard } from "@/components/editor/LetterHealthCard";
import { AllChecks, type RailCheckRow } from "./AllChecks";

/**
 * HEALTH tab — the "is this letter ready?" assessment.
 *
 * Layout:
 *   1. The letter health card (score, three bars, checks to fix), the
 *      same card as the workspace's Progress tab
 *   2. All checks list (legacy ReviewRail rows: completeness, template
 *      quality, statutory compliance, evidence, comments etc.)
 *
 * Health checks come from the shared `lib/finalize/healthChecks` engine.
 */
export function HealthTab({
  draft,
  rows,
}: {
  draft: Draft;
  rows: RailCheckRow[];
}) {
  const nav = useNavigate();
  const journey = useJourney(draft.id);
  const role = useProfileStore((st) => st.profile.workspaceRole);
  const canFix = Boolean(journey) && canEditDraft(role, draft.reviewStatus ?? "draft") && !journey?.locked;

  // Route a Fix through react-router. The check's
  // actionRoute enum is "editor" | "evidence" | "settings" — we compose
  // the final URL here because only the page knows the current draftId.
  const onFix = (check: HealthCheck) => {
    switch (check.actionRoute) {
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
      {/* The same letter health card as the workspace's Progress tab (the
       * score, the three bars and the checks to fix), so the old review
       * address no longer shows a second, older design. */}
      {journey && <LetterHealthCard draft={draft} journey={journey} canFix={canFix} onFix={onFix} />}

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
