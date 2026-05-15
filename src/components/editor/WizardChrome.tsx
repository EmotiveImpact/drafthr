import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import type { Mode } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Compact step indicator that sits at the top of the editor's sections
 * rail. Shows the user where they are in the editor wizard without
 * moving the primary Next-step CTA out of the topbar.
 *
 *   Edit  ─  Review  ─  Finalise        (both employee and employer)
 *
 * Evidence is intentionally NOT part of the wizard stepper any more —
 * it's accessible as a drawer from anywhere in Edit, so it doesn't need
 * a numbered slot in the linear progression. Finalise IS a step now —
 * it's the explicit ship-gate destination at the end of the flow.
 *
 * Layout rules:
 *   - Each step label sizes to its content (no flex-1, no truncate) —
 *     longer labels like "Finalise" get the room they need.
 *     Prevents the cut-off bug where mid-length labels collide with the
 *     connector line in the 232px rail.
 *   - Connectors are the only flex children — they absorb leftover
 *     width, so the row stays balanced regardless of label length.
 *   - Steps are links; clicking the current step is a no-op, clicking
 *     a future step navigates forward (matches the topbar CTA).
 *   - `mode` is accepted for backwards-compat with all WizardSidebar
 *     callers but no longer affects the stepper — both employee and
 *     employer flows are Edit · Review · Finalise.
 */
type Step = "edit" | "evidence" | "review" | "finalize";

type Props = {
  draftId: string;
  mode: Mode;
  current: Step;
  /** Disable navigation (e.g. while AI is streaming). */
  disabled?: boolean;
};

export function WizardChrome({ draftId, mode: _mode, current, disabled }: Props) {
  // Same three steps for everyone — Evidence is a drawer now, not a step.
  // Finalise is the ship gate at the end of the flow.
  // Note: when `current` is "evidence" (legacy callers still pass it) it
  // won't match any step in this list, so no step renders as active —
  // that's correct: the evidence drawer isn't a wizard destination.
  const steps: { id: Step; label: string; href: string }[] = [
    { id: "edit", label: "Edit", href: `/editor/${draftId}` },
    { id: "review", label: "Review", href: `/editor/${draftId}/review` },
    { id: "finalize", label: "Finalise", href: `/editor/${draftId}/finalize` },
  ];

  const currentIndex = steps.findIndex((s) => s.id === current);

  return (
    <nav
      aria-label="Editor progress"
      className="px-3 pt-3 pb-2 border-b border-[var(--ds-line-2)]"
    >
      <div className="flex items-center">
        {steps.flatMap((step, i) => {
          const state =
            i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          const isLast = i === steps.length - 1;
          const node = (
            <Link
              key={step.id}
              to={step.href}
              aria-current={state === "current" ? "step" : undefined}
              aria-disabled={disabled}
              onClick={(e) => {
                if (disabled) e.preventDefault();
              }}
              className={cn(
                // shrink-0 keeps the label intact; the connector to the
                // right is the only thing that flexes, soaking up the
                // rail's leftover width.
                "shrink-0 flex items-center gap-1.5 group rounded-md px-1 py-1 transition",
                disabled
                  ? "opacity-50 pointer-events-none"
                  : "hover:bg-[var(--ds-line-2)]"
              )}
            >
              <span
                className={cn(
                  "shrink-0 size-4 rounded-full grid place-items-center text-[9px] font-bold transition",
                  state === "done" && "bg-[var(--ds-green-fg)] text-white",
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
                  "text-[11px] font-medium whitespace-nowrap",
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
          );
          if (isLast) return [node];
          return [
            node,
            <span
              key={`${step.id}-conn`}
              className={cn(
                // flex-1 makes the connector the ONLY element that grows
                // to fill leftover rail width. min-w-2 stops it
                // collapsing to zero when the rail is narrow.
                "flex-1 min-w-2 h-px mx-1 transition-colors",
                state === "done"
                  ? "bg-[var(--ds-green-fg)]"
                  : "bg-[var(--ds-line)]"
              )}
              aria-hidden
            />,
          ];
        })}
      </div>
    </nav>
  );
}
