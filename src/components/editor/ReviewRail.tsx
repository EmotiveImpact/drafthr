import { useMemo } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { ArrowRight } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { buildTemplateQualityReport } from "@/lib/template-quality";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { cn } from "@/lib/utils";
import { CheckIcons, type RailCheckRow } from "./review/AllChecks";
import { HealthTab } from "./review/HealthTab";
import { ImproveTab } from "./review/ImproveTab";

/**
 * Right rail on the Review step. Two tabs:
 *
 *   1. HEALTH  — Is this letter ready? Score ring + Fix-this-first + all checks.
 *   2. IMPROVE — Get eyes on it. AI specialist / Team / External consultant.
 *
 * Note: the CONSULT marketplace surface moved to Finalise — it's the last
 * upsell moment before the letter ships, so it reads more deliberately
 * there than buried in a Review tab.
 *
 * The "All checks" rows (template quality, statutory compliance, evidence,
 * counsel review, comments) are still computed here so the tab can render
 * them — Health imports them as a prop.
 *
 * A sticky-style "Continue to Finalise →" CTA lives at the bottom of the
 * rail across all tabs so the user always knows the next step out.
 */
export function ReviewRail({
  draft,
  counselReviewedBy,
  unresolvedComments,
  onJumpToSection,
  onJumpToEvidence,
  onContinueToFinalize,
}: {
  draft: Draft;
  counselReviewedBy?: { reviewedBy: string; reviewedOn: string } | null;
  unresolvedComments: number;
  onJumpToSection: (sectionId: string) => void;
  onJumpToEvidence: () => void;
  onContinueToFinalize: () => void;
}) {
  // The "All checks" list — derived from the draft and the same helpers the
  // old flat ReviewRail used. Wrapped in useMemo because the tab content is
  // remounted on tab switch and we don't want to re-do the template-quality
  // walk every time.
  const rows = useMemo<RailCheckRow[]>(
    () =>
      buildRailRows({
        draft,
        counselReviewedBy,
        unresolvedComments,
        onJumpToSection,
        onJumpToEvidence,
      }),
    [
      draft,
      counselReviewedBy,
      unresolvedComments,
      onJumpToSection,
      onJumpToEvidence,
    ],
  );

  // Health-tab badge count = blockers + warnings, so a "3" on the tab maps
  // to "3 things to look at." Pure ok states don't bump the count.
  const issueCount = useMemo(
    () => rows.filter((r) => r.status !== "ok").length,
    [rows],
  );

  return (
    <TabsPrimitive.Root
      defaultValue="health"
      className="flex flex-col min-h-0 h-full"
    >
      {/* Underline-style tab list. The active tab gets the ink color + bold
       * weight + a 2px underline; inactive tabs sit in muted grey. Matches
       * Design D's tab strip. */}
      <TabsPrimitive.List
        className="flex shrink-0 items-stretch border-b border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 gap-0"
        aria-label="Review tabs"
      >
        <RailTab value="health" label="Health" badge={issueCount} />
        <RailTab value="improve" label="Improve" />
      </TabsPrimitive.List>

      {/* Tab bodies — scrollable within the rail. */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <TabsPrimitive.Content value="health" className="outline-none">
          <HealthTab draft={draft} rows={rows} />
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="improve" className="outline-none">
          <ImproveTab />
        </TabsPrimitive.Content>
      </div>

      {/* Continue-to-Finalise CTA — same across tabs. Sits at the bottom
       * of the rail with a border-top separator so it reads as a footer
       * action rather than part of any single tab's content. */}
      <div className="shrink-0 border-t border-[var(--ds-line)] bg-[var(--ds-surface)] p-3">
        <button
          type="button"
          onClick={onContinueToFinalize}
          className="inline-flex items-center justify-center gap-1.5 w-full h-9 px-3 rounded-md bg-[var(--ds-ink)] text-white text-[12.5px] font-semibold hover:opacity-90 transition"
        >
          Continue to Finalise
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </TabsPrimitive.Root>
  );
}

/* ============================================================================
 * Internal helpers
 * ==========================================================================*/

function RailTab({
  value,
  label,
  badge,
}: {
  value: string;
  label: string;
  badge?: number;
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium",
        "text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition-colors",
        "data-[state=active]:text-[var(--ds-ink)] data-[state=active]:font-semibold",
        // Underline indicator — sits at the bottom of the trigger, visible
        // only on the active tab. -bottom-px lines up over the rail's
        // border-b so the active tab feels continuous with the content.
        "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-[var(--ds-ink)] after:opacity-0",
        "data-[state=active]:after:opacity-100 after:transition-opacity",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-ink)]/30 rounded-sm",
      )}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)] text-[10px] font-semibold tabular-nums">
          {badge}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}

/**
 * Build the normalised "all checks" row list. Identical logic to the old
 * flat ReviewRail body so we don't lose any signal during the refactor.
 *
 * Pulled out of the component so the tab + the issue-count badge can both
 * consume it without re-running the work.
 */
function buildRailRows({
  draft,
  counselReviewedBy,
  unresolvedComments,
  onJumpToSection,
  onJumpToEvidence,
}: {
  draft: Draft;
  counselReviewedBy?: { reviewedBy: string; reviewedOn: string } | null;
  unresolvedComments: number;
  onJumpToSection: (sectionId: string) => void;
  onJumpToEvidence: () => void;
}): RailCheckRow[] {
  const quality = buildTemplateQualityReport(draft);
  const requiresCounsel = exportRequiresCounselGate(draft);

  const sections = draft.sections;
  const ready = sections.filter((s) => s.status === "ready").length;
  const edited = sections.filter((s) => s.status === "edited").length;
  const empty = sections.filter((s) => s.status === "empty").length;
  const requiredEmpty = sections.filter(
    (s) => s.required && s.status === "empty",
  );

  const evidence = draft.evidence ?? [];
  const evidenceImages = evidence.filter(
    (e) => e.kind === "screenshot" || e.mimeType?.startsWith("image/"),
  ).length;

  const deadline = draft.context.protectedDeadline;
  const deadlineDays = deadline?.iso
    ? daysUntilDateOnly(deadline.iso)
    : undefined;

  const rows: RailCheckRow[] = [];

  rows.push({
    id: "completeness",
    label: "Section completeness",
    detail:
      requiredEmpty.length > 0
        ? `${requiredEmpty.length} required section${requiredEmpty.length === 1 ? "" : "s"} still empty`
        : `${ready} ready · ${edited} edited · ${empty} not started`,
    status: requiredEmpty.length > 0 ? "missing" : empty > 0 ? "warn" : "ok",
    icon: CheckIcons.FileEdit,
    jumpTo: requiredEmpty[0]
      ? () => onJumpToSection(requiredEmpty[0].id)
      : undefined,
  });

  rows.push({
    id: "quality",
    label: "Template quality",
    detail:
      quality.summary.missing > 0
        ? `${quality.summary.missing} missing · ${quality.summary.covered} covered`
        : `${quality.summary.covered} requirements covered`,
    status:
      quality.summary.missing > 0
        ? "missing"
        : quality.summary.needsReview > 0
          ? "warn"
          : "ok",
    icon: CheckIcons.CheckCircle2,
  });

  rows.push({
    id: "compliance",
    label: "Statutory compliance",
    detail:
      quality.summary.complianceMissing > 0
        ? `${quality.summary.complianceMissing} rule${quality.summary.complianceMissing === 1 ? "" : "s"} flagged`
        : `All ${quality.compliance.length} rules satisfied`,
    status: quality.summary.complianceMissing > 0 ? "warn" : "ok",
    icon: CheckIcons.ShieldCheck,
  });

  if (draft.mode === "employee") {
    rows.push({
      id: "evidence",
      label: "Evidence attached",
      detail:
        evidence.length === 0
          ? "No evidence attached"
          : `${evidence.length} item${evidence.length === 1 ? "" : "s"} (${evidenceImages} image${evidenceImages === 1 ? "" : "s"})`,
      status: evidence.length === 0 ? "warn" : "ok",
      icon: CheckIcons.Paperclip,
      jumpTo: onJumpToEvidence,
    });
  }

  const expected = buildExpectedEvidenceStatus(draft);
  if (expected.length > 0) {
    const requiredMissing = expected.filter(
      (e) => e.expectation.required && !e.ok,
    );
    const optionalMissing = expected.filter(
      (e) => !e.expectation.required && !e.ok,
    );
    const ok = expected.filter((e) => e.ok).length;
    rows.push({
      id: "expected-evidence",
      label: "Expected evidence",
      detail:
        requiredMissing.length > 0
          ? `Missing: ${requiredMissing.map((e) => e.expectation.label).join(", ")}`
          : optionalMissing.length > 0
            ? `${ok} of ${expected.length} added`
            : `All ${expected.length} expectations met`,
      status:
        requiredMissing.length > 0
          ? "missing"
          : optionalMissing.length > 0
            ? "warn"
            : "ok",
      icon: CheckIcons.Paperclip,
      jumpTo: onJumpToEvidence,
    });
  }

  if (deadline?.iso) {
    rows.push({
      id: "deadline",
      label: "Statutory deadline",
      detail:
        deadlineDays === undefined
          ? formatDateOnly(deadline.iso, { dateStyle: "medium" })
          : deadlineDays < 0
            ? `Past due by ${Math.abs(deadlineDays)} day${Math.abs(deadlineDays) === 1 ? "" : "s"}`
            : deadlineDays === 0
              ? "Due today"
              : `${deadlineDays} day${deadlineDays === 1 ? "" : "s"} until deadline`,
      status:
        deadlineDays !== undefined && deadlineDays < 0
          ? "missing"
          : deadlineDays !== undefined && deadlineDays <= 7
            ? "warn"
            : "ok",
      icon: CheckIcons.CalendarClock,
    });
  }

  if (requiresCounsel) {
    rows.push({
      id: "counsel",
      label: "Counsel review",
      detail: counselReviewedBy
        ? `Reviewed by ${counselReviewedBy.reviewedBy} on ${counselReviewedBy.reviewedOn}`
        : "Required before export",
      status: counselReviewedBy ? "ok" : "missing",
      icon: CheckIcons.ShieldCheck,
    });
  }

  if (unresolvedComments > 0) {
    rows.push({
      id: "comments",
      label: "Unresolved comments",
      detail: `${unresolvedComments} thread${unresolvedComments === 1 ? "" : "s"} still open`,
      status: "warn",
      icon: CheckIcons.Users,
    });
  }

  return rows;
}
