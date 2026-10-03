import { useMemo } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { ArrowRight, Pin, PinOff, X } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { buildTemplateQualityReport } from "@/lib/template-quality";
import { formatDateOnly } from "@/lib/date-only";
import { getUnverifiedDeadlineReminder, needsFilingDeadlineWarning } from "@/lib/deadline-reminders";
import { getDraftReadiness } from "@/lib/finalize/readiness";
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
  isPinned,
  onPin,
  onUnpin,
  onClose,
}: {
  draft: Draft;
  counselReviewedBy?: { reviewedBy: string; reviewedOn: string } | null;
  unresolvedComments: number;
  onJumpToSection: (sectionId: string) => void;
  onJumpToEvidence: () => void;
  onContinueToFinalize: () => void;
  /** True when this rail is pinned as an inline grid column. */
  isPinned?: boolean;
  /** Called when the user clicks Pin (drawer mode → pinned). */
  onPin?: () => void;
  /** Called when the user clicks Unpin (pinned mode → pill). */
  onUnpin?: () => void;
  /** Called when the user clicks the X close button (drawer mode only). */
  onClose?: () => void;
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
      {/* Header bar — Pin/Unpin + optional Close, matches AIPanel's header
       * row. Only rendered when at least one action prop is supplied so the
       * component still works in bare/read-only embed contexts. */}
      {(onPin || onUnpin || onClose) && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--ds-line-2)] bg-[var(--ds-surface)] shrink-0">
          <span className="text-[12px] font-semibold text-[var(--ds-ink)] mr-auto select-none">
            Health
          </span>
          {(onPin || onUnpin) && (
            <button
              type="button"
              onClick={isPinned ? (onUnpin ?? onPin) : onPin}
              className={cn(
                "group inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-[0.04em] border transition-colors",
                isPinned
                  ? "bg-[var(--ds-violet-bg)] text-[var(--ds-violet-fg)] border-violet-200 hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] hover:border-[var(--ds-line)]"
                  : "bg-transparent text-[var(--ds-muted)] border-[var(--ds-line-2)] hover:text-[var(--ds-ink)]",
              )}
              title={
                isPinned
                  ? "Click to unpin (back to pill)"
                  : "Pin Health as an inline right rail"
              }
              aria-pressed={isPinned}
            >
              {isPinned ? (
                <>
                  <Pin className="size-3 group-hover:hidden" />
                  <PinOff className="size-3 hidden group-hover:inline" />
                  <span className="group-hover:hidden">Pinned</span>
                  <span className="hidden group-hover:inline">Unpin</span>
                </>
              ) : (
                <>
                  <Pin className="size-3" />
                  <span>Pin</span>
                </>
              )}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition"
              aria-label="Close Health rail"
              title="Close Health rail"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

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
          Finalise
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
export function buildRailRows({
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
  const readiness = getDraftReadiness(draft, {
    counselAttestation: counselReviewedBy,
  });

  const evidence = draft.evidence ?? [];
  const evidenceImages = evidence.filter(
    (e) => e.kind === "screenshot" || e.mimeType?.startsWith("image/"),
  ).length;

  const deadline = getUnverifiedDeadlineReminder(draft);

  const rows: RailCheckRow[] = [];

  rows.push({
    id: "completeness",
    label: "Section completeness",
    detail:
      readiness.blockers.some((issue) => issue.id === "generation-active")
        ? "Generation in progress"
        : readiness.sections.requiredEmpty > 0
        ? `${readiness.sections.requiredEmpty} required section${readiness.sections.requiredEmpty === 1 ? "" : "s"} still empty`
        : `${readiness.sections.written} of ${readiness.sections.total} written${readiness.placeholders.count ? ` · ${readiness.placeholders.count} placeholders` : ""}`,
    status: readiness.sections.requiredEmpty > 0 || readiness.placeholders.count > 0 || readiness.blockers.some((issue) => issue.id === "generation-active" || issue.id === "no-sections")
      ? "missing"
      : readiness.sections.written < readiness.sections.total
        ? "warn"
        : "ok",
    icon: CheckIcons.FileEdit,
    jumpTo: readiness.blockers.find((issue) => issue.action === "editor")?.sectionIds?.[0]
      ? () => onJumpToSection(readiness.blockers.find((issue) => issue.action === "editor")!.sectionIds![0])
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

  if (readiness.evidence.brokenReferences > 0) {
    rows.push({
      id: "evidence-references",
      label: "Evidence references",
      detail: `${readiness.evidence.brokenReferences} reference${readiness.evidence.brokenReferences === 1 ? " has" : "s have"} no matching figure`,
      status: "missing",
      icon: CheckIcons.Paperclip,
      jumpTo: onJumpToEvidence,
    });
  }

  if (readiness.evidence.expected > 0) {
    rows.push({
      id: "expected-evidence",
      label: "Expected evidence",
      detail:
        readiness.evidence.requiredMissing > 0
          ? `${readiness.evidence.requiredMissing} required item${readiness.evidence.requiredMissing === 1 ? "" : "s"} missing`
          : readiness.evidence.optionalMissing > 0
            ? `${readiness.evidence.satisfied} of ${readiness.evidence.expected} added`
            : `All ${readiness.evidence.expected} expectations met`,
      status:
        readiness.evidence.requiredMissing > 0
          ? "missing"
          : readiness.evidence.optionalMissing > 0
            ? "warn"
            : "ok",
      icon: CheckIcons.Paperclip,
      jumpTo: onJumpToEvidence,
    });
  }

  if (needsFilingDeadlineWarning(draft) || deadline) {
    rows.push({
      id: "deadline",
      label: "Filing deadline not verified",
      detail: deadline
        ? `Unverified reminder: ${formatDateOnly(deadline.iso, { dateStyle: "medium" })}. Confirm the actual time limit with a qualified adviser.`
        : "No legal deadline calculated. Confirm the applicable time limits promptly with a qualified adviser.",
      status: "warn",
      icon: CheckIcons.CalendarClock,
    });
  }

  if (readiness.counsel.required) {
    rows.push({
      id: "counsel",
      label: "Counsel review",
      detail: readiness.counsel.attestation
        ? `Reviewed by ${readiness.counsel.attestation.reviewedBy} on ${readiness.counsel.attestation.reviewedOn}`
        : "Required before export",
      status: readiness.counsel.attested ? "ok" : "missing",
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
