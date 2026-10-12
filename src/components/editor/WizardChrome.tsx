import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import type { Mode } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Compact step indicator for the letter workspace: Edit, Review, Finalise.
 * Drawn as the Harvey pill track (design 2A): the current step is the
 * raised white pill, finished steps carry a green tick, later steps a
 * quiet number.
 *
 * Evidence is intentionally NOT part of the stepper: it is reachable as a
 * drawer from anywhere in Edit. Finalise IS a step: it is the explicit
 * ship gate at the end of the flow.
 *
 * Layout rules:
 *   - Each pill sizes to its content (no truncation) so "Finalise" always
 *     fits, including in the 232px editor rail.
 *   - Steps are links; clicking the current step is a no-op, clicking a
 *     future step navigates forward (matches the topbar CTA).
 *   - `mode` is accepted for backwards-compat with all callers but no
 *     longer affects the stepper.
 *   - `bare` drops the rail padding and divider so the track can sit
 *     inside a document bar.
 */
type Step = "edit" | "evidence" | "review" | "finalize";

type Props = {
  draftId: string;
  mode: Mode;
  current: Step;
  /** Disable navigation (e.g. while AI is streaming). */
  disabled?: boolean;
  /** Drop the rail padding and divider (for use inside a document bar). */
  bare?: boolean;
  className?: string;
};

export function WizardChrome({ draftId, mode: _mode, current, disabled, bare, className }: Props) {
  // When `current` is "evidence" (legacy callers still pass it) it won't
  // match any step in this list, so no step renders as active: the
  // evidence drawer isn't a wizard destination.
  const steps: { id: Step; label: string; href: string }[] = [
    { id: "edit", label: "Edit", href: `/editor/${draftId}` },
    { id: "review", label: "Review", href: `/editor/${draftId}/review` },
    { id: "finalize", label: "Finalise", href: `/editor/${draftId}/finalize` },
  ];

  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <nav
      aria-label="Editor progress"
      className={cn(
        bare ? "min-w-0" : "border-b border-[var(--ds-line-2)] px-3 pb-2.5 pt-3",
        className
      )}
    >
      <div className="inline-flex max-w-full items-center gap-0.5 rounded-[var(--ds-r-m)] bg-[var(--ds-chip)] p-[3px]">
        {steps.map((step, i) => {
          const state =
            i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          return (
            <Link
              key={step.id}
              to={step.href}
              aria-current={state === "current" ? "step" : undefined}
              aria-disabled={disabled}
              onClick={(e) => {
                if (disabled) e.preventDefault();
              }}
              className={cn(
                "inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[12.5px] font-medium transition",
                state === "current"
                  ? "bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s),0_0_0_1px_var(--ds-line)]"
                  : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]",
                disabled && "pointer-events-none opacity-50"
              )}
            >
              {state === "done" ? (
                <Check
                  className="size-3.5 shrink-0 text-[var(--ds-green-fg)]"
                  strokeWidth={2.5}
                  aria-hidden
                />
              ) : (
                <span
                  className={cn(
                    "ds-mono text-[11px]",
                    state === "current" ? "text-[var(--ds-muted)]" : "text-[var(--ds-faint)]"
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
              )}
              {step.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
