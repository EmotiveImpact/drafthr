import type { Draft } from "@/lib/letters/types";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { CheckCircle2, CircleDashed, CircleAlert } from "lucide-react";

/**
 * "What this letter type expects" checklist. Surfaces template-declared
 * expected evidence on the Evidence step so the user knows what to gather
 * before drafting — and on the Review step (re-used) to flag gaps before
 * export.
 *
 * Templates that don't declare expectedEvidence render nothing, so this
 * component is safe to drop in everywhere.
 */
export function ExpectedEvidenceChecklist({
  draft,
  variant = "panel",
}: {
  draft: Draft;
  /** "panel" = full card with title; "compact" = lean row for Review pane. */
  variant?: "panel" | "compact";
}) {
  const status = buildExpectedEvidenceStatus(draft);
  if (status.length === 0) return null;

  const ok = status.filter((s) => s.ok).length;
  const total = status.length;
  const requiredMissing = status.filter((s) => s.expectation.required && !s.ok).length;

  if (variant === "compact") {
    return (
      <div className="text-[12px] text-[var(--ds-muted)]">
        Expected: <strong className="text-[var(--ds-ink)]">{ok}/{total}</strong>
        {requiredMissing > 0 && (
          <span className="ml-2 text-[var(--ds-red-fg)]">
            {requiredMissing} required missing
          </span>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-muted)] m-0">
          What this letter type expects
        </h2>
        <span className="text-[11px] text-[var(--ds-muted)] tabular-nums">
          {ok} of {total} added
        </span>
      </div>

      <ul className="space-y-1.5 list-none m-0 p-0">
        {status.map(({ expectation, ok: isOk, satisfiedBy }) => {
          const Icon = isOk ? CheckCircle2 : expectation.required ? CircleAlert : CircleDashed;
          const tone = isOk
            ? "text-[var(--ds-green-fg)]"
            : expectation.required
            ? "text-[var(--ds-amber-fg)]"
            : "text-[var(--ds-muted)]";
          return (
            <li
              key={expectation.key}
              className="flex items-start gap-2 text-[12.5px] leading-relaxed"
            >
              <Icon className={"size-4 shrink-0 mt-0.5 " + tone} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium text-[var(--ds-ink)]">
                    {expectation.label}
                  </span>
                  {expectation.required && !isOk && (
                    <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-amber-fg)]">
                      Required
                    </span>
                  )}
                  {isOk && (
                    <span className="text-[11px] text-[var(--ds-muted)]">
                      · {satisfiedBy.length} match{satisfiedBy.length === 1 ? "" : "es"}
                    </span>
                  )}
                </div>
                {expectation.description && (
                  <p className="text-[11px] text-[var(--ds-muted)] mt-0.5 leading-relaxed m-0">
                    {expectation.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
