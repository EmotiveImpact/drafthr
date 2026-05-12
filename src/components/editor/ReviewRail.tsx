import { useMemo } from "react";
import type { Draft } from "@/lib/letters/types";
import { buildTemplateQualityReport } from "@/lib/template-quality";
import { exportRequiresCounselGate } from "@/lib/letters/disclaimers";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  ShieldCheck,
  Paperclip,
  CalendarClock,
  FileEdit,
  Users,
} from "lucide-react";

type CheckStatus = "ok" | "warn" | "missing";

type CheckRow = {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
  icon: React.ElementType;
  jumpTo?: () => void;
};

/**
 * Right rail on the Review step. Pulls every "is this letter ready?"
 * signal into a single panel so the centre canvas can stay focused on
 * the actual letter preview.
 *
 * Replaces the old ReviewPanel layout where the verdict + checks took
 * the centre canvas and the letter itself was nowhere to be seen until
 * export. Now the user sees the letter on Review.
 *
 * Removed from this rail (vs. the old ReviewPanel):
 *   - The big Export button — lives in the topbar primary-CTA slot
 *   - The 4-col section grid — left rail (WizardSidebar) already
 *     lists every section
 */
export function ReviewRail({
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
}) {
  const quality = useMemo(() => buildTemplateQualityReport(draft), [draft]);
  const requiresCounsel = exportRequiresCounselGate(draft);

  const sections = draft.sections;
  const ready = sections.filter((s) => s.status === "ready").length;
  const edited = sections.filter((s) => s.status === "edited").length;
  const empty = sections.filter((s) => s.status === "empty").length;
  const requiredEmpty = sections.filter(
    (s) => s.required && s.status === "empty"
  );

  const evidence = draft.evidence ?? [];
  const evidenceImages = evidence.filter(
    (e) => e.kind === "screenshot" || e.mimeType?.startsWith("image/")
  ).length;

  const deadline = draft.context.protectedDeadline;
  const deadlineDays = deadline?.iso ? daysUntilDateOnly(deadline.iso) : undefined;

  const rows: CheckRow[] = [];

  rows.push({
    id: "completeness",
    label: "Section completeness",
    detail:
      requiredEmpty.length > 0
        ? `${requiredEmpty.length} required section${requiredEmpty.length === 1 ? "" : "s"} still empty`
        : `${ready} ready · ${edited} edited · ${empty} not started`,
    status: requiredEmpty.length > 0 ? "missing" : empty > 0 ? "warn" : "ok",
    icon: FileEdit,
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
    icon: CheckCircle2,
  });

  rows.push({
    id: "compliance",
    label: "Statutory compliance",
    detail:
      quality.summary.complianceMissing > 0
        ? `${quality.summary.complianceMissing} rule${quality.summary.complianceMissing === 1 ? "" : "s"} flagged`
        : `All ${quality.compliance.length} rules satisfied`,
    status: quality.summary.complianceMissing > 0 ? "warn" : "ok",
    icon: ShieldCheck,
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
      icon: Paperclip,
      jumpTo: onJumpToEvidence,
    });
  }

  const expected = buildExpectedEvidenceStatus(draft);
  if (expected.length > 0) {
    const requiredMissing = expected.filter(
      (e) => e.expectation.required && !e.ok
    );
    const optionalMissing = expected.filter(
      (e) => !e.expectation.required && !e.ok
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
      icon: Paperclip,
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
      icon: CalendarClock,
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
      icon: ShieldCheck,
    });
  }

  if (unresolvedComments > 0) {
    rows.push({
      id: "comments",
      label: "Unresolved comments",
      detail: `${unresolvedComments} thread${unresolvedComments === 1 ? "" : "s"} still open`,
      status: "warn",
      icon: Users,
    });
  }

  const blocking = rows.filter((r) => r.status === "missing").length;
  const warnings = rows.filter((r) => r.status === "warn").length;
  const okCount = rows.filter((r) => r.status === "ok").length;

  const overall: CheckStatus =
    blocking > 0 ? "missing" : warnings > 0 ? "warn" : "ok";
  const overallLabel =
    overall === "ok"
      ? "Ready to export"
      : overall === "warn"
        ? "Export with caution"
        : "Action required";

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Verdict banner — colour-coded, sticky-feeling at the top of the rail. */}
      <div
        className={
          "border-b px-4 py-3 " +
          (overall === "ok"
            ? "bg-[var(--ds-green-bg)] border-[var(--ds-green-bg)]"
            : overall === "warn"
              ? "bg-[var(--ds-amber-bg)] border-[var(--ds-amber-bg)]"
              : "bg-[var(--ds-red-bg)] border-[var(--ds-red-bg)]")
        }
      >
        <div className="flex items-center gap-2">
          {overall === "ok" && (
            <CheckCircle2 className="size-4 text-[var(--ds-green-fg)] shrink-0" />
          )}
          {overall === "warn" && (
            <CircleAlert className="size-4 text-[var(--ds-amber-fg)] shrink-0" />
          )}
          {overall === "missing" && (
            <CircleAlert className="size-4 text-[var(--ds-red-fg)] shrink-0" />
          )}
          <h2
            className={
              "text-[13px] font-semibold " +
              (overall === "ok"
                ? "text-[var(--ds-green-fg)]"
                : overall === "warn"
                  ? "text-[var(--ds-amber-fg)]"
                  : "text-[var(--ds-red-fg)]")
            }
          >
            {overallLabel}
          </h2>
        </div>
        <p
          className={
            "text-[11px] mt-1 " +
            (overall === "ok"
              ? "text-[var(--ds-green-fg)]"
              : overall === "warn"
                ? "text-[var(--ds-amber-fg)]"
                : "text-[var(--ds-red-fg)]")
          }
        >
          {okCount} ok · {warnings} warning{warnings === 1 ? "" : "s"} ·{" "}
          {blocking} blocker{blocking === 1 ? "" : "s"}
        </p>
      </div>

      {/* Checks list — scrolls within the rail. */}
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.id}
              className="flex items-start gap-2 p-3 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)]"
            >
              <div
                className={
                  "shrink-0 mt-0.5 size-5 rounded-full grid place-items-center " +
                  (row.status === "ok"
                    ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
                    : row.status === "warn"
                      ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                      : "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]")
                }
              >
                {row.status === "ok" ? (
                  <CheckCircle2 className="size-3" />
                ) : row.status === "warn" ? (
                  <CircleAlert className="size-3" />
                ) : (
                  <CircleDashed className="size-3" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <Icon className="size-3 text-[var(--ds-muted)] shrink-0" />
                  <h3 className="text-[12px] font-medium text-[var(--ds-ink)]">
                    {row.label}
                  </h3>
                </div>
                <p className="text-[11px] text-[var(--ds-body)] mt-0.5 leading-relaxed">
                  {row.detail}
                </p>
                {row.jumpTo && (
                  <button
                    type="button"
                    onClick={row.jumpTo}
                    className="mt-1 text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:underline"
                  >
                    Fix →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
