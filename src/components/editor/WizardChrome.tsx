import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import type { Mode } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Shared horizontal step indicator that sits directly under the topbar
 * on every wizard page (Editor, Evidence, Review). Single source of
 * truth — replaces the various homegrown StepPill rows / progress
 * indicators that used to live inside each page's chrome.
 *
 *   Edit ─ Evidence ─ Review     (employee mode)
 *   Edit ─ Review                (employer mode — skips evidence)
 *
 * Steps are links: clicking the current step is a no-op; clicking a
 * different step navigates there. Optionally accepts a `context` string
 * shown right-aligned ("3 of 5 sections ready", "2 of 6 items collected",
 * "Counsel reviewed", etc) to give per-step orientation.
 */
type Step = "edit" | "evidence" | "review";

type Props = {
  draftId: string;
  mode: Mode;
  current: Step;
  /** Optional right-aligned status text, e.g. "3 of 5 ready". */
  context?: string;
  /** Disable navigation (e.g. while AI is streaming). */
  disabled?: boolean;
};

export function WizardChrome({ draftId, mode, current, context, disabled }: Props) {
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
      aria-label="Wizard progress"
      className="h-9 shrink-0 border-b border-[var(--ds-line)] bg-[var(--ds-surface-2)] flex items-center px-3 sm:px-4 gap-2 overflow-x-auto"
    >
      <div className="flex items-center gap-1 min-w-0">
        {steps.map((step, i) => {
          const state =
            i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          const isLast = i === steps.length - 1;
          return (
            <div key={step.id} className="flex items-center min-w-0">
              <Link
                to={step.href}
                aria-current={state === "current" ? "step" : undefined}
                aria-disabled={disabled}
                onClick={(e) => {
                  if (disabled) e.preventDefault();
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1.5 py-1 transition",
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
                      "bg-[var(--ds-ink)] text-white ring-[3px] ring-[var(--ds-ink)]/12",
                    state === "upcoming" &&
                      "bg-[var(--ds-line-2)] text-[var(--ds-muted)]"
                  )}
                >
                  {state === "done" ? <Check className="size-2.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[12px] font-medium whitespace-nowrap",
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
                    "w-6 sm:w-10 h-px shrink-0 mx-0.5 transition-colors",
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

      {context && (
        <span className="ml-auto text-[11px] text-[var(--ds-muted)] whitespace-nowrap pl-3">
          {context}
        </span>
      )}
    </nav>
  );
}
