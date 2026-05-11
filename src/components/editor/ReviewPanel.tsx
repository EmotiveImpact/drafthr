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
 * The Review surface — sits in the middle of the editor between Edit
 * and Preview. Surfaces every "is this draft ready to ship" signal in
 * one place: section completeness, required clauses, evidence count,
 * deadline status, counsel-review attestation, comments outstanding.
 *
 * Goal: the user looks at this once and clicks Export with confidence —
 * not "let me scroll through every section and check by eye."
 */
export function ReviewPanel({
  draft,
  counselReviewedBy,
  unresolvedComments,
  onJumpToSection,
  onJumpToEvidence,
  onExport,
}: {
  draft: Draft;
  counselReviewedBy?: { reviewedBy: string; reviewedOn: string } | null;
  unresolvedComments: number;
  onJumpToSection: (sectionId: string) => void;
  onJumpToEvidence: () => void;
  onExport: () => void;
}) {
  const quality = useMemo(() => buildTemplateQualityReport(draft), [draft]);
  const requiresCounsel = exportRequiresCounselGate(draft);

  const sections = draft.sections;
  const ready = sections.filter((s) => s.status === "ready").length;
  const edited = sections.filter((s) => s.status === "edited").length;
  const empty = sections.filter((s) => s.status === "empty").length;
  const requiredEmpty = sections.filter((s) => s.required && s.status === "empty");

  const evidence = draft.evidence ?? [];
  const evidenceImages = evidence.filter((e) => e.kind === "screenshot" || e.mimeType?.startsWith("image/")).length;

  const deadline = draft.context.protectedDeadline;
  const deadlineDays = deadline?.iso ? daysUntilDateOnly(deadline.iso) : undefined;

  // Build the check rows. Each row has an explicit status (ok/warn/missing)
  // so the UI can colour-code consistently.
  const rows: CheckRow[] = [];

  rows.push({
    id: "completeness",
    label: "Section completeness",
    detail:
      requiredEmpty.length > 0
        ? `${requiredEmpty.length} required section${requiredEmpty.length === 1 ? "" : "s"} still empty: ${requiredEmpty.map((s) => s.title).join(", ")}`
        : `${ready} ready · ${edited} edited · ${empty} not started`,
    status: requiredEmpty.length > 0 ? "missing" : empty > 0 ? "warn" : "ok",
    icon: FileEdit,
    jumpTo: requiredEmpty[0] ? () => onJumpToSection(requiredEmpty[0].id) : undefined,
  });

  rows.push({
    id: "quality",
    label: "Template-quality requirements",
    detail:
      quality.summary.missing > 0
        ? `${quality.summary.missing} missing · ${quality.summary.covered} covered · ${quality.summary.needsReview} need review`
        : `${quality.summary.covered} requirements covered`,
    status: quality.summary.missing > 0 ? "missing" : quality.summary.needsReview > 0 ? "warn" : "ok",
    icon: CheckCircle2,
  });

  rows.push({
    id: "compliance",
    label: "Statutory compliance checks",
    detail:
      quality.summary.complianceMissing > 0
        ? `${quality.summary.complianceMissing} rule${quality.summary.complianceMissing === 1 ? "" : "s"} flagged for this jurisdiction`
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
          ? "No evidence attached. Tribunals weigh evidence heavily — add screenshots / emails where they support your claim."
          : `${evidence.length} item${evidence.length === 1 ? "" : "s"} (${evidenceImages} image${evidenceImages === 1 ? "" : "s"})`,
      status: evidence.length === 0 ? "warn" : "ok",
      icon: Paperclip,
      jumpTo: onJumpToEvidence,
    });
  }

  // Template-declared expected evidence — only on letter types that
  // declared expectations. Required missing → blocker. Optional missing → warn.
  const expected = buildExpectedEvidenceStatus(draft);
  if (expected.length > 0) {
    const requiredMissing = expected.filter((e) => e.expectation.required && !e.ok);
    const optionalMissing = expected.filter((e) => !e.expectation.required && !e.ok);
    const ok = expected.filter((e) => e.ok).length;
    rows.push({
      id: "expected-evidence",
      label: "Expected evidence (template)",
      detail:
        requiredMissing.length > 0
          ? `Missing required: ${requiredMissing.map((e) => e.expectation.label).join(", ")}`
          : optionalMissing.length > 0
          ? `${ok} of ${expected.length} added · ${optionalMissing.length} optional gap${optionalMissing.length === 1 ? "" : "s"}`
          : `All ${expected.length} expectations met`,
      status:
        requiredMissing.length > 0 ? "missing" : optionalMissing.length > 0 ? "warn" : "ok",
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
          ? `Set: ${formatDateOnly(deadline.iso, { dateStyle: "long" })} · ${deadline.basis}`
          : deadlineDays < 0
          ? `Past due by ${Math.abs(deadlineDays)} day${Math.abs(deadlineDays) === 1 ? "" : "s"}`
          : deadlineDays === 0
          ? `Due today · ${deadline.basis}`
          : `${deadlineDays} day${deadlineDays === 1 ? "" : "s"} until deadline (${formatDateOnly(deadline.iso, { dateStyle: "long" })})`,
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
        : "This is a high-risk letter type — counsel review required before export.",
      status: counselReviewedBy ? "ok" : "missing",
      icon: ShieldCheck,
    });
  }

  if (unresolvedComments > 0) {
    rows.push({
      id: "comments",
      label: "Unresolved comments",
      detail: `${unresolvedComments} thread${unresolvedComments === 1 ? "" : "s"} still open. Resolve or address before exporting.`,
      status: "warn",
      icon: Users,
    });
  }

  const blocking = rows.filter((r) => r.status === "missing").length;
  const warnings = rows.filter((r) => r.status === "warn").length;
  const okCount = rows.filter((r) => r.status === "ok").length;

  const overall: CheckStatus = blocking > 0 ? "missing" : warnings > 0 ? "warn" : "ok";
  const overallLabel =
    overall === "ok"
      ? "Ready to export"
      : overall === "warn"
      ? "Export with caution"
      : "Action required before export";

  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-8 px-3 sm:px-6">
      {/* Header: overall verdict + counts */}
      <div
        className={
          "rounded-xl border p-5 mb-5 " +
          (overall === "ok"
            ? "bg-[var(--ds-green-bg)] border-[var(--ds-green-bg)]"
            : overall === "warn"
            ? "bg-[var(--ds-amber-bg)] border-[var(--ds-amber-bg)]"
            : "bg-[var(--ds-red-bg)] border-[var(--ds-red-bg)]")
        }
      >
        <div className="flex items-center gap-3">
          {overall === "ok" && <CheckCircle2 className="size-6 text-[var(--ds-green-fg)] shrink-0" />}
          {overall === "warn" && <CircleAlert className="size-6 text-[var(--ds-amber-fg)] shrink-0" />}
          {overall === "missing" && <CircleAlert className="size-6 text-[var(--ds-red-fg)] shrink-0" />}
          <div className="flex-1 min-w-0">
            <h2
              className={
                "text-[16px] font-semibold " +
                (overall === "ok"
                  ? "text-[var(--ds-green-fg)]"
                  : overall === "warn"
                  ? "text-[var(--ds-amber-fg)]"
                  : "text-[var(--ds-red-fg)]")
              }
            >
              {overallLabel}
            </h2>
            <p
              className={
                "text-[12.5px] mt-0.5 " +
                (overall === "ok"
                  ? "text-[var(--ds-green-fg)]"
                  : overall === "warn"
                  ? "text-[var(--ds-amber-fg)]"
                  : "text-[var(--ds-red-fg)]")
              }
            >
              {okCount} ok · {warnings} warning{warnings === 1 ? "" : "s"} · {blocking} blocker{blocking === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onExport}
            disabled={blocking > 0}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-medium bg-[var(--ds-ink)] text-white hover:bg-[#222] disabled:opacity-40 disabled:cursor-not-allowed transition"
            title={blocking > 0 ? "Resolve blockers first" : "Build and download export pack"}
          >
            Export pack →
          </button>
        </div>
      </div>

      {/* Check rows */}
      <div className="space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.id}
              className="flex items-start gap-3 p-4 rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)]"
            >
              <div
                className={
                  "shrink-0 mt-0.5 size-6 rounded-full grid place-items-center " +
                  (row.status === "ok"
                    ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
                    : row.status === "warn"
                    ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                    : "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]")
                }
              >
                {row.status === "ok" ? (
                  <CheckCircle2 className="size-4" />
                ) : row.status === "warn" ? (
                  <CircleAlert className="size-4" />
                ) : (
                  <CircleDashed className="size-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <Icon className="size-3.5 text-[var(--ds-muted)] shrink-0" />
                  <h3 className="text-[13.5px] font-medium text-[var(--ds-ink)]">{row.label}</h3>
                </div>
                <p className="text-[12.5px] text-[var(--ds-body)] mt-1 leading-relaxed">
                  {row.detail}
                </p>
              </div>
              {row.jumpTo && (
                <button
                  type="button"
                  onClick={row.jumpTo}
                  className="shrink-0 text-[12px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:underline"
                >
                  Fix →
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Section grid — at-a-glance view of every section's status */}
      <div className="mt-6">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ds-muted)] mb-2">
          Sections
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onJumpToSection(s.id)}
              className={
                "text-left p-2.5 rounded-md border text-[11.5px] transition " +
                (s.status === "ready"
                  ? "border-[var(--ds-green-bg)] bg-[var(--ds-green-bg)] hover:brightness-[0.98]"
                  : s.status === "edited"
                  ? "border-[var(--ds-amber-bg)] bg-[var(--ds-amber-bg)] hover:brightness-[0.98]"
                  : s.status === "streaming"
                  ? "border-[var(--ds-line)] bg-[var(--ds-line-2)]"
                  : "border-[var(--ds-line)] bg-[var(--ds-surface)] hover:bg-[var(--ds-line-2)]")
              }
              title={s.title}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9.5px] text-[var(--ds-muted)]">{String(i + 1).padStart(2, "0")}</span>
                <span
                  className={
                    "size-1.5 rounded-full " +
                    (s.status === "ready"
                      ? "bg-[var(--ds-green-fg)]"
                      : s.status === "edited"
                      ? "bg-[var(--ds-amber-fg)]"
                      : s.status === "streaming"
                      ? "bg-[var(--ds-ink)] animate-pulse"
                      : "bg-[var(--ds-line)]")
                  }
                />
              </div>
              <div className="mt-1 text-[var(--ds-ink)] font-medium truncate">{s.title}</div>
              {s.required && (
                <div className="text-[10px] text-[var(--ds-muted)] mt-0.5">required</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
