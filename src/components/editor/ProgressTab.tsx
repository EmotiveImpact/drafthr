import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  FileArchive,
  FileText,
  FileType2,
  Loader2,
  MessageSquareWarning,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Undo,
  CheckCircle2,
} from "lucide-react";
import type { Draft, ExportEvent } from "@/lib/letters/types";
import type { WorkspaceRole } from "@/lib/profile";
import { canApprove, canSubmitForReview } from "@/lib/permissions";
import { computeHealthScore, runHealthChecks, topFixes, type HealthActionRoute } from "@/lib/finalize/healthChecks";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { rulesFor, ruleSatisfied } from "@/lib/letters/compliance";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { ScoreRing } from "@/components/finalize/ScoreRing";
import { cn } from "@/lib/utils";
import { CompliancePanel } from "./CompliancePanel";
import { EmployeeRail } from "./EmployeeRail";
import { EvidenceRequirementsList } from "./EvidenceRequirementsList";
import { CiteMarker } from "./Citations";
import type { ReviewDialogKind } from "./ReviewDialog";

type StepState = "done" | "running" | "todo";
type Step = { id: string; text: string; detail?: string; state: StepState; action?: { label: string; onClick: () => void } };

const BAND_LABEL = { strong: "Strong", adequate: "Adequate", weak: "Weak" } as const;
const BAND_TONE = {
  strong: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
  adequate: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  weak: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
} as const;

const FORMAT_LABEL: Record<ExportEvent["format"], string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "Plain text",
  pack: "Evidence pack",
  "marked-sent": "Marked as sent",
};

function shortDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Progress tab of the letter side panel (14B). The letter's stage as a 4B
 * plan card (drafting, edits, checks, evidence, approval, finalise), then
 * the health score, the compliance checks, the evidence checklist, any
 * deadline, the approval controls and the Finalise step. Everything shown is
 * derived from the draft with the same engines the Review and Finalise
 * pages use; every button calls an existing handler passed in by the editor.
 */
export function ProgressTab({
  draft,
  streaming,
  pendingEdits,
  role,
  counselNeeded,
  counselReview,
  onRegenerateAll,
  onStop,
  onOpenEdits,
  onOpenEvidence,
  onFixRoute,
  onGoReview,
  onFinalise,
  onReviewAction,
  onWithdraw,
  onOpenFeedback,
  onOpenCounsel,
}: {
  draft: Draft;
  streaming: boolean;
  pendingEdits: number;
  role: WorkspaceRole | undefined;
  counselNeeded: boolean;
  counselReview: { reviewedBy: string; reviewedOn: string } | null;
  onRegenerateAll: () => void;
  onStop: () => void;
  onOpenEdits: () => void;
  onOpenEvidence: () => void;
  onFixRoute: (route: HealthActionRoute | undefined) => void;
  onGoReview: () => void;
  onFinalise: () => void;
  onReviewAction: (kind: ReviewDialogKind) => void;
  onWithdraw: () => void;
  onOpenFeedback: () => void;
  onOpenCounsel: () => void;
}) {
  const checks = useMemo(() => runHealthChecks(draft), [draft]);
  const score = useMemo(() => computeHealthScore(checks), [checks]);
  const fixes = useMemo(() => topFixes(checks, 3), [checks]);
  const evidenceStatus = useMemo(() => buildExpectedEvidenceStatus(draft), [draft]);
  const compliance = useMemo(() => {
    const text = draft.sections.map((s) => s.html).join("\n");
    const rules = rulesFor(draft.letterType, draft.context.jurisdiction, draft.context.usState);
    const met = rules.filter((r) => ruleSatisfied(r, text)).length;
    return { met, total: rules.length };
  }, [draft.sections, draft.letterType, draft.context.jurisdiction, draft.context.usState]);

  const reviewStatus = draft.reviewStatus ?? "draft";
  const written = draft.sections.filter((s) => s.html.trim()).length;
  const requiredMissing = draft.sections.filter((s) => s.required && !s.html.trim()).length;
  const evidenceRequired = evidenceStatus.filter((e) => e.expectation.required);
  const evidenceMissing = evidenceRequired.filter((e) => !e.ok).length;
  const exports = (draft.exports ?? []).slice().sort((a, b) => b.exportedAt - a.exportedAt);
  const sent = exports.some((e) => e.format === "marked-sent");

  const steps: Step[] = [
    {
      id: "draft",
      text: "Draft every section of the letter",
      detail: `${written} of ${draft.sections.length} sections written`,
      state: streaming ? "running" : requiredMissing === 0 && written > 0 ? "done" : "todo",
    },
    {
      id: "edits",
      text: "Decide on the suggested edits",
      detail: pendingEdits > 0 ? `${pendingEdits} waiting for you` : "No edits waiting",
      state: pendingEdits === 0 ? "done" : "todo",
      action: pendingEdits > 0 ? { label: "Review", onClick: onOpenEdits } : undefined,
    },
    {
      id: "checks",
      text: "Pass the letter checks",
      detail:
        score.failCount > 0
          ? `Score ${score.score}, ${score.failCount} to fix`
          : `Score ${score.score}, nothing blocking`,
      state: score.failCount === 0 ? "done" : "todo",
    },
    {
      id: "evidence",
      text: "Attach the evidence the letter relies on",
      detail:
        evidenceRequired.length === 0
          ? `${draft.evidence?.length ?? 0} attached, none required`
          : evidenceMissing > 0
            ? `${evidenceMissing} required item${evidenceMissing === 1 ? "" : "s"} missing`
            : "Required evidence attached",
      state: evidenceMissing === 0 ? "done" : "todo",
      action: evidenceMissing > 0 ? { label: "Add", onClick: onOpenEvidence } : undefined,
    },
    ...(!draft.isTemplateSource
      ? [
          {
            id: "approval",
            text: "Get approval",
            detail:
              reviewStatus === "approved"
                ? "Approved"
                : reviewStatus === "in_review"
                  ? "Waiting for the reviewer"
                  : reviewStatus === "changes_requested"
                    ? "Changes requested"
                    : "Not submitted yet",
            state: (reviewStatus === "approved"
              ? "done"
              : reviewStatus === "in_review"
                ? "running"
                : "todo") as StepState,
          },
          {
            id: "finalise",
            text: "Finalise, export and send",
            detail: sent ? "Marked as sent" : exports.length > 0 ? `${exports.length} export${exports.length === 1 ? "" : "s"} so far` : "Not sent yet",
            state: (sent ? "done" : "todo") as StepState,
            action: !sent ? { label: "Finalise", onClick: onFinalise } : undefined,
          },
        ]
      : []),
  ];
  const doneCount = steps.filter((s) => s.state === "done").length;
  const firstOpen = steps.findIndex((s) => s.state !== "done");

  const deadline = draft.mode === "employee" ? draft.context.protectedDeadline : undefined;
  const days = deadline ? daysUntilDateOnly(deadline.iso) : null;

  const reviewers = useMemo(() => {
    const latest = new Map<string, string>();
    for (const a of draft.approvals ?? []) {
      if (a.reviewerName?.trim()) latest.set(a.reviewerName.trim(), a.decision);
    }
    return [...latest.entries()];
  }, [draft.approvals]);

  return (
    <div className="flex min-w-0 flex-col gap-5 p-3.5">
      {/* 4B plan card */}
      <section className="rounded-[var(--ds-r-m)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[18px] pb-4 pt-4 shadow-[var(--ds-shadow-m)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[14px] font-semibold text-[var(--ds-ink)]">Letter progress</h3>
            <p className="m-0 mt-px truncate text-[12.5px] text-[var(--ds-muted)]">
              {streaming ? "DraftHR is writing the letter" : firstOpen === -1 ? "Every step is done" : `Next: ${steps[firstOpen].text.toLowerCase()}`}
            </p>
          </div>
          <span className="ds-mono inline-flex h-[22px] shrink-0 items-center rounded-[var(--ds-r-s)] bg-[var(--ds-chip)] px-2 text-[12px] font-medium text-[var(--ds-body)]">
            {doneCount} of {steps.length}
          </span>
        </div>
        <div
          className="mb-1 mt-3 h-[3px] overflow-hidden rounded-sm bg-[var(--ds-line)]"
          role="progressbar"
          aria-label="Letter progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
        >
          <span
            className="block h-full rounded-sm bg-[var(--ds-ink)] transition-[width] duration-500"
            style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
          />
        </div>
        <ol className="m-0 list-none p-0">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-2.5 border-t border-[var(--ds-line)] py-[11px] first:border-t-0"
            >
              <StepMark state={s.state} />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[13px] leading-snug",
                    s.state === "done"
                      ? "text-[var(--ds-faint)] line-through decoration-[var(--ds-faint)]"
                      : i === firstOpen || s.state === "running"
                        ? "font-medium text-[var(--ds-ink)]"
                        : "text-[var(--ds-muted)]",
                  )}
                >
                  {s.text}
                </div>
                {s.detail && s.state !== "done" && (
                  <div className="mt-0.5 text-[12px] text-[var(--ds-muted)]">{s.detail}</div>
                )}
              </div>
              {s.state === "running" ? (
                <span className="shrink-0 text-[11.5px] font-medium text-[var(--ds-muted)]">Now</span>
              ) : s.action ? (
                <button
                  type="button"
                  onClick={s.action.onClick}
                  className="shrink-0 rounded-[var(--ds-r-s)] px-2 py-1 text-[12px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
                >
                  {s.action.label}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-[var(--ds-line)] pt-3">
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
              aria-label="Stop generation"
            >
              <StopCircle className="size-3.5" /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onRegenerateAll}
              className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
              aria-label="Regenerate all sections"
            >
              <Sparkles className="size-3.5" /> Redraft every section
            </button>
          )}
        </div>
        {exports.length > 0 && (
          <div className="mt-3 border-t border-[var(--ds-line)] pt-3">
            <div className="mb-2 text-[12px] text-[var(--ds-muted)]">Outputs</div>
            <div className="flex flex-wrap gap-1.5">
              {exports.slice(0, 6).map((e) => (
                <span
                  key={e.id}
                  className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-[9px] text-[12.5px] text-[var(--ds-body)]"
                  title={e.reviewedBy ? `Counsel: ${e.reviewedBy}, ${e.reviewedOn}` : undefined}
                >
                  <OutputIcon format={e.format} />
                  <span className="truncate">{FORMAT_LABEL[e.format]}</span>
                  <span className="text-[var(--ds-muted)]">{shortDate(e.exportedAt)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Health score */}
      <PanelSection title="Letter health" action={{ label: "Full review", onClick: onGoReview }}>
        <div className="flex items-center gap-3.5">
          <ScoreRing score={score.score} band={score.band} size={56} />
          <div className="min-w-0 flex-1">
            <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium", BAND_TONE[score.band])}>
              {BAND_LABEL[score.band]}
            </span>
            <p className="m-0 mt-1 text-[12.5px] leading-snug text-[var(--ds-muted)]">{score.oneLiner}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {score.dimensions.map((d) => (
            <div key={d.dimension} className="rounded-[var(--ds-r-s)] bg-[var(--ds-surface-2)] px-2.5 py-2">
              <div className="text-[11.5px] capitalize text-[var(--ds-muted)]">{d.dimension}</div>
              <div className="ds-mono text-[15px] text-[var(--ds-ink)]">{d.score}</div>
            </div>
          ))}
        </div>
        {fixes.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[12px] text-[var(--ds-muted)]">Fix this first</div>
            <ul className="m-0 list-none p-0">
              {fixes.map((f) => (
                <li key={f.check.id} className="border-t border-[var(--ds-line)] first:border-t-0">
                  <button
                    type="button"
                    onClick={() => onFixRoute(f.check.actionRoute)}
                    className="flex w-full items-start gap-2 py-2 text-left"
                  >
                    <span
                      className={cn(
                        "mt-[5px] size-1.5 shrink-0 rounded-full",
                        f.check.severity === "fail" ? "bg-[var(--ds-red-fg)]" : "bg-[var(--ds-amber-dot)]",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-[var(--ds-ink)]">{f.check.label}</span>
                      {f.check.detail && (
                        <span className="mt-0.5 block text-[12px] leading-snug text-[var(--ds-muted)]">{f.check.detail}</span>
                      )}
                    </span>
                    {f.impact > 0 && (
                      <span className="ds-mono shrink-0 text-[11.5px] text-[var(--ds-green-fg)]">+{f.impact}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelSection>

      {/* Compliance / rights checks */}
      <Folded
        title={draft.mode === "employee" ? "Your rights checklist" : "Compliance checks"}
        meta={compliance.total > 0 ? `${compliance.met} of ${compliance.total}` : undefined}
        defaultOpen={compliance.total > 0 && compliance.met < compliance.total}
      >
        <div className="-mx-3">{draft.mode === "employee" ? <EmployeeRail draft={draft} /> : <CompliancePanel draft={draft} />}</div>
      </Folded>

      {/* Evidence */}
      <PanelSection
        title="Evidence"
        action={{ label: `Open evidence${draft.evidence?.length ? ` (${draft.evidence.length})` : ""}`, onClick: onOpenEvidence }}
      >
        <div className="-mx-2">
          <EvidenceRequirementsList draft={draft} />
        </div>
      </PanelSection>

      {/* Deadline */}
      {deadline && days !== null && (
        <PanelSection title="Deadline">
          <div
            className={cn(
              "rounded-[var(--ds-r-m)] px-4 py-3.5",
              days < 14 ? "bg-[var(--ds-red-bg)]" : days < 30 ? "bg-[var(--ds-amber-bg)]" : "bg-[var(--ds-surface-2)]",
            )}
          >
            <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--ds-ink)]">
              <CalendarClock className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">Tribunal claim deadline</span>
              <b className="ds-mono shrink-0 font-medium">
                {days < 0 ? "Passed" : `${days} day${days === 1 ? "" : "s"} left`}
              </b>
            </div>
            <div className="mt-1.5 text-[12.5px] leading-snug text-[var(--ds-body)]">
              {formatDateOnly(deadline.iso, { day: "numeric", month: "long", year: "numeric" })}
              <CiteMarker n={1} label="Legal basis" title="How DraftHR worked out this date" quote={deadline.basis} />
            </div>
          </div>
        </PanelSection>
      )}

      {/* Counsel review */}
      {counselNeeded && (
        <PanelSection title="Counsel review">
          <div className="flex items-center gap-2.5">
            <ShieldCheck
              className={cn("size-4 shrink-0", counselReview ? "text-[var(--ds-green-fg)]" : "text-[var(--ds-amber-fg)]")}
            />
            <p className="m-0 min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--ds-body)]">
              {counselReview
                ? `Reviewed by ${counselReview.reviewedBy} on ${counselReview.reviewedOn}`
                : "Needed before this letter can be exported"}
            </p>
            <button
              type="button"
              onClick={onOpenCounsel}
              className="h-7 shrink-0 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
            >
              {counselReview ? "Update" : "Mark reviewed"}
            </button>
          </div>
        </PanelSection>
      )}

      {/* Approval */}
      {!draft.isTemplateSource && (
        <PanelSection title="Approval">
          <p className="m-0 text-[12.5px] leading-snug text-[var(--ds-muted)]">
            {reviewStatus === "approved"
              ? "Approved. The letter is locked and clear to export."
              : reviewStatus === "in_review"
                ? "With the reviewer. The letter is read-only until they decide."
                : reviewStatus === "changes_requested"
                  ? "The reviewer asked for changes."
                  : "Send the letter to a reviewer before it goes out."}
          </p>
          {reviewers.length > 0 && (
            <ul className="m-0 mt-2 list-none p-0">
              {reviewers.map(([name, decision]) => (
                <li key={name} className="flex items-center justify-between gap-2 py-1 text-[12.5px]">
                  <span className="truncate text-[var(--ds-ink)]">{name}</span>
                  <span className="shrink-0 text-[var(--ds-muted)]">
                    {decision === "approved" ? "Approved" : decision === "changes_requested" ? "Asked for changes" : "Reviewing"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {(reviewStatus === "draft" || reviewStatus === "changes_requested") && canSubmitForReview(role) && (
              <QuietButton icon={<Send className="size-3.5" />} onClick={() => onReviewAction("submit")}>
                {reviewStatus === "changes_requested" ? "Re-submit for approval" : "Submit for approval"}
              </QuietButton>
            )}
            {reviewStatus === "changes_requested" && (
              <QuietButton icon={<MessageSquareWarning className="size-3.5" />} onClick={onOpenFeedback}>
                Read feedback
              </QuietButton>
            )}
            {reviewStatus === "in_review" && (
              <>
                <QuietButton icon={<Undo className="size-3.5" />} onClick={onWithdraw}>
                  Withdraw
                </QuietButton>
                {canApprove(role) && (
                  <>
                    <QuietButton icon={<CheckCircle2 className="size-3.5" />} onClick={() => onReviewAction("approve")}>
                      Approve
                    </QuietButton>
                    <QuietButton icon={<MessageSquareWarning className="size-3.5" />} onClick={() => onReviewAction("request_changes")}>
                      Request changes
                    </QuietButton>
                  </>
                )}
              </>
            )}
          </div>
        </PanelSection>
      )}

      {/* Finalise */}
      {!draft.isTemplateSource && (
        <section className="rounded-[var(--ds-r-m)] bg-[var(--ds-surface-2)] p-4">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--ds-ink)]">Finalise</h3>
          <p className="m-0 mt-1 text-[12.5px] leading-snug text-[var(--ds-muted)]">
            The ready-to-send checklist, counsel sign-off, every export and Mark as sent.
          </p>
          <button
            type="button"
            onClick={onFinalise}
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] text-[13.5px] font-medium text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]"
          >
            Finalise letter
            <ArrowRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={onGoReview}
            aria-label="Next: Review"
            className="mt-1.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--ds-r-s)] text-[12.5px] font-medium text-[var(--ds-body)] hover:bg-[var(--ds-surface-3)]"
          >
            Open the Review step
          </button>
        </section>
      )}
    </div>
  );
}

function StepMark({ state }: { state: StepState }) {
  if (state === "done") return <CircleCheck className="size-4 shrink-0 text-[var(--ds-green-fg)]" aria-label="Done" />;
  if (state === "running") return <Loader2 className="size-4 shrink-0 animate-spin text-[var(--ds-muted)]" aria-label="In progress" />;
  return <CircleDashed className="size-4 shrink-0 text-[var(--ds-faint)]" aria-label="To do" />;
}

function OutputIcon({ format }: { format: ExportEvent["format"] }) {
  if (format === "pack") return <FileArchive className="size-3.5 shrink-0 text-[var(--ds-muted)]" />;
  if (format === "docx") return <FileType2 className="size-3.5 shrink-0 text-[var(--ds-tint-sky-ink)]" />;
  if (format === "marked-sent") return <Send className="size-3.5 shrink-0 text-[var(--ds-muted)]" />;
  if (format === "pdf") return <FileText className="size-3.5 shrink-0 text-[var(--ds-red-fg)]" />;
  return <Paperclip className="size-3.5 shrink-0 text-[var(--ds-muted)]" />;
}

function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 px-0.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-semibold text-[var(--ds-ink)]">{title}</h3>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="-mr-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[12.5px] font-medium text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)]"
          >
            {action.label}
            <ArrowRight className="size-3" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Folded({
  title,
  meta,
  defaultOpen,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <section className="min-w-0 px-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <h3 className="m-0 flex-1 text-[13px] font-semibold text-[var(--ds-ink)]">{title}</h3>
        {meta && <span className="ds-mono text-[12px] text-[var(--ds-muted)]">{meta}</span>}
        <ChevronDown className={cn("size-4 text-[var(--ds-muted)] transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </section>
  );
}

function QuietButton({ icon, onClick, children }: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)]"
    >
      {icon}
      {children}
    </button>
  );
}
