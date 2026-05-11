import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import type { Mode } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Compact step indicator that sits at the top of the sections rail. Shows
 * the user where they are in the editor wizard without moving the primary
 * Next-step CTA out of the topbar.
 *
 *   Edit  ─  Evidence  ─  Review     (employee mode)
 *   Edit  ─  Review                  (employer mode — skips evidence)
 *
 * Steps are links: clicking the current step is a no-op; clicking a future
 * step navigates forward (matches the topbar CTA). The Edit step routes
 * back to /editor/:draftId without losing scroll position.
 */
type Step = "edit" | "evidence" | "review";

type Props = {
  draftId: string;
  mode: Mode;
  current: Step;
  disabled?: boolean;
};

export function WizardProgress({ draftId, mode, current, disabled }: Props) {
  const steps: { id: Step; label: string; href: string }[] =
    mode === "employee"
      ? [
          { id: "edit", label: "Edit", href: `/editor/${draftId}` },
          { id: "evidence", label: "Evidence", href: `/editor/${draftId}/evidence` },
          { id: "review", label: "Review", href: `/editor/${draftId}/review` },
        ]
      : [
          { id: "edit", label: "Edit", href: `/editor/${draftId}` },
          { id: "review", label: "Review", href: `/editor/${draftId}/review` },
        ];

  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <nav
      aria-label="Editor progress"
      className="px-3 pt-3 pb-2 border-b border-[var(--ds-line-2)]"
    >
      <div className="flex items-center justify-between">
        {steps.map((step, i) => {
          const state =
            i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          const isLast = i === steps.length - 1;
          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none min-w-0">
              <Link
                to={step.href}
                aria-current={state === "current" ? "step" : undefined}
                aria-disabled={disabled}
                onClick={(e) => {
                  if (disabled) e.preventDefault();
                }}
                className={cn(
                  "flex items-center gap-1.5 min-w-0 group rounded-md px-1 py-1 -mx-1 transition",
                  disabled ? "opacity-50 pointer-events-none" : "hover:bg-[var(--ds-line-2)]"
                )}
              >
                <span
                  className={cn(
                    "shrink-0 size-4 rounded-full grid place-items-center text-[9px] font-bold transition",
                    state === "done" &&
                      "bg-[var(--ds-green-fg)] text-white",
                    state === "current" &&
                      "bg-[var(--ds-ink)] text-white ring-2 ring-[var(--ds-ink)]/15",
                    state === "upcoming" &&
                      "bg-[var(--ds-line-2)] text-[var(--ds-muted)]"
                  )}
                >
                  {state === "done" ? <Check className="size-2.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium truncate",
                    state === "current"
                      ? "text-[var(--ds-ink)]"
                      : state === "done"
                        ? "text-[var(--ds-body)]"
                        : "text-[var(--ds-muted)]"
                  )}
                >
                  {step.label}
                </span>
              </Link>
              {!isLast && (
                <span
                  className={cn(
                    "h-px flex-1 mx-1.5 transition-colors",
                    state === "done"
                      ? "bg-[var(--ds-green-fg)]"
                      : "bg-[var(--ds-line)]"
                  )}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
