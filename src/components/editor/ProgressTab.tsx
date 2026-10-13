import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  FileArchive,
  FileText,
  FileType2,
  Paperclip,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { Draft, ExportEvent } from "@/lib/letters/types";
import type { WorkspaceRole } from "@/lib/profile";
import type { JourneyInfo } from "@/lib/journey/stage";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { rulesFor, ruleSatisfied } from "@/lib/letters/compliance";
import { daysUntilDateOnly, formatDateOnly } from "@/lib/date-only";
import { JourneyPanel } from "@/components/journey/JourneyPanel";
import { cn } from "@/lib/utils";
import { CompliancePanel } from "./CompliancePanel";
import { EmployeeRail } from "./EmployeeRail";
import { EvidenceRequirementsList } from "./EvidenceRequirementsList";
import { CiteMarker } from "./Citations";
import { LetterHealthCard } from "./LetterHealthCard";

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
 * Progress tab of the letter side panel (mocks f1 to f8): the journey panel
 * (four-step tracker, what to do now, the stage's own content, the Letter
 * health card), then the rest of the letter's working detail folded away:
 * the compliance or rights checklist, the evidence checklist, counsel
 * review for high-risk letters, the tribunal deadline for employee letters,
 * past outputs, and the second opinion on the Review step.
 */
export function ProgressTab({
  draft,
  journey,
  viewerIsApprover,
  viewerIsReviewer,
  tickStep,
  role,
  counselNeeded,
  counselReview,
  canFix,
  onOpenEvidence,
  onOpenCounsel,
  onGoReview,
  onFinalise,
}: {
  draft: Draft;
  journey: JourneyInfo;
  viewerIsApprover: boolean;
  /** The named teammate reviewer is looking (their own review). */
  viewerIsReviewer?: boolean;
  /** The tracker step that just completed (its tick draws), or null. */
  tickStep: number | null;
  role: WorkspaceRole | undefined;
  counselNeeded: boolean;
  counselReview: { reviewedBy: string; reviewedOn: string } | null;
  /** The person can edit the letter now (Fix buttons show). */
  canFix: boolean;
  onOpenEvidence: () => void;
  onOpenCounsel: () => void;
  onGoReview: () => void;
  onFinalise: () => void;
}) {
  const evidenceStatus = useMemo(() => buildExpectedEvidenceStatus(draft), [draft]);
  const compliance = useMemo(() => {
    const text = draft.sections.map((s) => s.html).join("\n");
    const rules = rulesFor(draft.letterType, draft.context.jurisdiction, draft.context.usState);
    const met = rules.filter((r) => ruleSatisfied(r, text)).length;
    return { met, total: rules.length };
  }, [draft.sections, draft.letterType, draft.context.jurisdiction, draft.context.usState]);

  const evidenceRequired = evidenceStatus.filter((e) => e.expectation.required);
  const evidenceMissing = evidenceRequired.filter((e) => !e.ok).length;
  const exports = (draft.exports ?? []).slice().sort((a, b) => b.exportedAt - a.exportedAt);
  const deadline = draft.mode === "employee" ? draft.context.protectedDeadline : undefined;
  const days = deadline ? daysUntilDateOnly(deadline.iso) : null;
  const early = journey.stage === "draft" || journey.stage === "review" || journey.stage === "approve";
  // Send and Sent (f7, f8) show only the step and What's next: the counsel
  // gate is in the Send step, evidence in the document bar, all checks and
  // outputs on the full Finalise page and in Activity.
  const late = journey.stage === "send" || journey.stage === "sent";

  return (
    <div
      className="lw-progress flex min-w-0 flex-col gap-3.5 px-4 pb-5 pt-4"
      aria-label="Letter progress"
      data-tick-step={tickStep ?? undefined}
    >
      <JourneyPanel
        draftId={draft.id}
        viewerIsApprover={viewerIsApprover}
        viewerIsReviewer={viewerIsReviewer}
        health={early ? <LetterHealthCard draft={draft} journey={journey} canFix={canFix} /> : false}
      />

      {/* The tribunal claim deadline stays in view for employee letters. */}
      {deadline && days !== null && (
        <div
          className={cn(
            "rounded-[12px] px-4 py-3.5",
            days < 14 ? "bg-[var(--ds-red-bg)]" : days < 30 ? "bg-[var(--ds-amber-bg)]" : "bg-[var(--ds-surface-2)]"
          )}
        >
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--ds-ink)]">
            <CalendarClock className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">Tribunal claim deadline</span>
            <b className="ds-mono shrink-0 font-medium">{days < 0 ? "Passed" : `${days} day${days === 1 ? "" : "s"} left`}</b>
          </div>
          <div className="mt-1.5 text-[13px] leading-snug text-[var(--ds-body)]">
            {formatDateOnly(deadline.iso, { day: "numeric", month: "long", year: "numeric" })}
            <CiteMarker n={1} label="Legal basis" title="How DraftHR worked out this date" quote={deadline.basis} />
          </div>
        </div>
      )}

      {/* Counsel review for high-risk letters. */}
      {counselNeeded && !late && (
        <div className="flex items-center gap-2.5 rounded-[12px] border border-[var(--ds-line)] px-3.5 py-3">
          <ShieldCheck className={cn("size-4 shrink-0", counselReview ? "text-[var(--ds-green-fg)]" : "text-[var(--ds-amber-fg)]")} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[var(--ds-ink)]">Counsel review</div>
            <p className="m-0 text-[12.5px] leading-snug text-[var(--ds-muted)]">
              {counselReview
                ? `Reviewed by ${counselReview.reviewedBy} on ${counselReview.reviewedOn}`
                : "Needed before this letter can be exported"}
            </p>
          </div>
          {role !== "viewer" && <QuietButton onClick={onOpenCounsel}>{counselReview ? "Update" : "Mark reviewed"}</QuietButton>}
        </div>
      )}

      {!late && (
        <div className="flex flex-col border-t border-[var(--ds-line-2)]">
          <Folded
            title={draft.mode === "employee" ? "Your rights checklist" : "Compliance checks"}
            meta={compliance.total > 0 ? `${compliance.met} of ${compliance.total}` : undefined}
          >
            <div className="-mx-3">{draft.mode === "employee" ? <EmployeeRail draft={draft} /> : <CompliancePanel draft={draft} />}</div>
          </Folded>
          <Folded
            title="Evidence"
            meta={evidenceRequired.length > 0 ? (evidenceMissing > 0 ? `${evidenceMissing} missing` : "All attached") : `${draft.evidence?.length ?? 0} attached`}
            attention={evidenceMissing > 0}
          >
            <div className="-mx-2">
              <EvidenceRequirementsList draft={draft} />
            </div>
            <QuietButton onClick={onOpenEvidence} className="mt-2">
              <Paperclip className="size-3.5" /> Open evidence{draft.evidence?.length ? ` (${draft.evidence.length})` : ""}
            </QuietButton>
          </Folded>
          {exports.length > 0 && (
            <Folded title="Outputs" meta={`${exports.length}`}>
              <div className="flex flex-wrap gap-1.5">
                {exports.slice(0, 8).map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[9px] text-[12.5px] text-[var(--ds-body)]"
                    title={e.reviewedBy ? `Counsel: ${e.reviewedBy}, ${e.reviewedOn}` : undefined}
                  >
                    <OutputIcon format={e.format} />
                    <span className="truncate">{FORMAT_LABEL[e.format]}</span>
                    <span className="text-[var(--ds-muted)]">{shortDate(e.exportedAt)}</span>
                  </span>
                ))}
              </div>
            </Folded>
          )}
          {!draft.isTemplateSource && (
            <Folded title="Second opinion and full review">
              <p className="m-0 text-[12.5px] leading-snug text-[var(--ds-muted)]">
                Ask DraftHR to read it as tribunal counsel, an employee advocate or a DEI lead (1 credit), get an expert, or open the full checks.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <QuietButton onClick={onGoReview} ariaLabel="Next: Review">
                  Review step <ArrowRight className="size-3.5" />
                </QuietButton>
                {role !== "viewer" && (
                  <QuietButton onClick={onFinalise}>
                    Finalise page <ArrowRight className="size-3.5" />
                  </QuietButton>
                )}
              </div>
            </Folded>
          )}
        </div>
      )}
    </div>
  );
}

function OutputIcon({ format }: { format: ExportEvent["format"] }) {
  if (format === "pack") return <FileArchive className="size-3.5 shrink-0 text-[var(--ds-muted)]" />;
  if (format === "docx") return <FileType2 className="size-3.5 shrink-0 text-[var(--ds-tint-sky-ink)]" />;
  if (format === "marked-sent") return <Send className="size-3.5 shrink-0 text-[var(--ds-muted)]" />;
  if (format === "pdf") return <FileText className="size-3.5 shrink-0 text-[var(--ds-red-fg)]" />;
  return <Paperclip className="size-3.5 shrink-0 text-[var(--ds-muted)]" />;
}

/** A quiet row that folds open (hairline under it). */
function Folded({
  title,
  meta,
  attention,
  children,
}: {
  title: string;
  meta?: string;
  attention?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="min-w-0 border-b border-[var(--ds-line-2)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-[6px] py-2.5 text-left transition-colors duration-[120ms] hover:text-[var(--ds-ink)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ds-ink)]">{title}</span>
        {meta && (
          <span className={cn("ds-mono shrink-0 text-[12px]", attention ? "text-[var(--ds-amber-fg)]" : "text-[var(--ds-subtle)]")}>{meta}</span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-[var(--ds-subtle)] transition-transform duration-[160ms]", open && "rotate-180")} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </section>
  );
}

function QuietButton({
  onClick,
  children,
  className,
  ariaLabel,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
        className
      )}
    >
      {children}
    </button>
  );
}
