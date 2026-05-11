import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import {
  buildTemplateQualityReport,
  type TemplateRequirementStatus,
} from "@/lib/template-quality";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<TemplateRequirementStatus, string> = {
  covered: "Covered",
  missing: "Missing",
  needs_review: "Check",
  guardrail: "Guardrail",
};

export function TemplateQualityInspector({ draft }: { draft: Draft }) {
  const report = buildTemplateQualityReport(draft);
  const requirements = report.sections.flatMap((section) => section.requirements);
  const hasRequirements = requirements.length > 0 || report.compliance.length > 0;

  if (!hasRequirements) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-[var(--ds-muted)]" />
          <h4 className="m-0 text-[12px] font-semibold text-[var(--ds-ink)]">
            Template quality
          </h4>
        </div>
        <span className="rounded-full bg-[var(--ds-line-2)] px-2 py-0.5 text-[10px] text-[var(--ds-muted)]">
          {report.summary.covered} covered · {report.summary.needsReview + report.summary.missing} check
        </span>
      </div>

      <div className="space-y-2">
        {report.sections.map(({ section, requirements: sectionRequirements }) => {
          if (sectionRequirements.length === 0) return null;
          return (
            <details
              key={section.id}
              className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] p-2"
            >
              <summary className="cursor-pointer list-none text-[12px] font-medium text-[var(--ds-ink)]">
                <span className="inline-flex max-w-full items-center gap-2">
                  <span className="truncate">{section.title}</span>
                  <span className="shrink-0 text-[10px] font-normal text-[var(--ds-muted)]">
                    {sectionRequirements.length}
                  </span>
                </span>
              </summary>
              <ul className="mt-2 space-y-1.5">
                {sectionRequirements.map((requirement) => (
                  <li
                    key={requirement.id}
                    className="rounded-md bg-[var(--ds-line-2)] px-2 py-1.5 text-[11px] leading-relaxed text-[var(--ds-body)]"
                  >
                    <div className="flex items-start gap-2">
                      {iconFor(requirement.status)}
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "mb-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em]",
                            requirement.status === "covered" &&
                              "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
                            requirement.status === "missing" &&
                              "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
                            requirement.status === "needs_review" &&
                              "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
                            requirement.status === "guardrail" &&
                              "bg-[var(--ds-line)] text-[var(--ds-muted)]"
                          )}
                        >
                          {STATUS_LABEL[requirement.status]}
                        </span>
                        <p className="m-0">{requirement.text}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function iconFor(status: TemplateRequirementStatus) {
  const cls = "mt-1 size-3.5 shrink-0";
  if (status === "covered") return <CheckCircle2 className={cn(cls, "text-[var(--ds-green-fg)]")} />;
  if (status === "missing") return <AlertTriangle className={cn(cls, "text-[var(--ds-red-fg)]")} />;
  if (status === "guardrail") return <ShieldAlert className={cn(cls, "text-[var(--ds-muted)]")} />;
  return <AlertTriangle className={cn(cls, "text-[var(--ds-amber-fg)]")} />;
}
