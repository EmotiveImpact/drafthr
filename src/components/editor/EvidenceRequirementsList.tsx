import type { Draft } from "@/lib/letters/types";
import { buildExpectedEvidenceStatus } from "@/lib/evidence";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Required-evidence checklist rendered AS the Evidence step's left rail
 * (replacing the section list). Each row carries:
 *   - State icon: done / required-missing / optional-missing
 *   - Label + optional description
 *   - "required" pill for unmet required items
 *
 * Clicking a row is a no-op for now — there's no per-requirement
 * action surface in the canvas yet (the canvas is still
 * section-oriented). Future iteration: map requirements to evidence
 * kinds so a click scopes the Add Evidence form's defaults.
 *
 * Renders flat (no <aside> / no internal scroll) — the parent rail
 * provides the surface + scroll container.
 */
export function EvidenceRequirementsList({ draft }: { draft: Draft }) {
  const status = buildExpectedEvidenceStatus(draft);

  // No expectations declared by this template: show a neutral empty
  // state so the rail isn't blank.
  if (status.length === 0) {
    return (
      <div className="px-4 py-6 text-[11.5px] leading-relaxed text-[var(--ds-muted)]">
        This letter type doesn't declare specific required-evidence
        expectations. Add whatever the recipient should see — emails,
        notes, screenshots, calendar invites — from the panel on the right.
      </div>
    );
  }

  const ok = status.filter((s) => s.ok).length;
  const total = status.length;
  const requiredMissing = status.filter(
    (s) => s.expectation.required && !s.ok
  ).length;

  return (
    <>
      <div className="border-b border-[var(--ds-line-2)] px-4 py-3 flex items-center justify-between">
        <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
          Required evidence
        </h2>
        <span
          className="text-[10px] font-medium text-[var(--ds-muted)] tabular-nums shrink-0"
          title={
            requiredMissing > 0
              ? `${ok} of ${total} added · ${requiredMissing} required missing`
              : `${ok} of ${total} expectations met`
          }
        >
          {ok}/{total}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <ul className="p-2 m-0 list-none space-y-0.5">
          {status.map(({ expectation, ok: isOk, satisfiedBy }) => {
            const Icon = isOk
              ? CheckCircle2
              : expectation.required
                ? CircleAlert
                : CircleDashed;
            const iconTone = isOk
              ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
              : expectation.required
                ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
                : "bg-[var(--ds-line-2)] text-[var(--ds-muted)]";
            return (
              <li key={expectation.key} className="m-0">
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-2 min-w-0",
                    "hover:bg-[var(--ds-line-2)] transition-colors"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 mt-0.5 size-4 rounded-full grid place-items-center",
                      iconTone
                    )}
                  >
                    <Icon className="size-2.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[12px] font-medium text-[var(--ds-ink)] break-words">
                        {expectation.label}
                      </span>
                      {expectation.required && !isOk && (
                        <span className="shrink-0 text-[9px] uppercase tracking-[0.06em] font-semibold text-white bg-[var(--ds-amber-fg)] px-1.5 py-px rounded-full">
                          Required
                        </span>
                      )}
                      {isOk && (
                        <span className="shrink-0 text-[10px] text-[var(--ds-muted)] tabular-nums">
                          {satisfiedBy.length} match{satisfiedBy.length === 1 ? "" : "es"}
                        </span>
                      )}
                    </div>
                    {expectation.description && (
                      <p className="m-0 mt-0.5 text-[10.5px] text-[var(--ds-muted)] leading-relaxed break-words">
                        {expectation.description}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
