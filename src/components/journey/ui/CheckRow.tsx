import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One line of a stage checklist (mock f1, f2): a status mark, the text, and
 * either a quiet note or a small action button on the right.
 *   ok    green tick       wait  open ring (yours to do)       need  amber "!"
 */
export function CheckRow({
  state,
  children,
  note,
  action,
  className,
}: {
  state: "ok" | "wait" | "need";
  children: ReactNode;
  note?: ReactNode;
  action?: { label: string; onClick?: () => void; href?: string; disabled?: boolean };
  className?: string;
}) {
  return (
    <li
      data-slot="check-row"
      data-state={state}
      className={cn(
        "flex items-center gap-2.5 border-t border-[var(--ds-line-2)] py-[7px] text-[13.5px] text-[var(--ds-ink)] first:border-t-0",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-full text-[11px] font-semibold",
          state === "ok" && "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
          state === "wait" && "border-[1.5px] border-[var(--ds-ink)]",
          state === "need" && "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
        )}
      >
        {state === "ok" ? <Check className="size-[11px]" strokeWidth={2.6} /> : state === "need" ? "!" : null}
      </span>
      <span className="min-w-0 flex-1">
        {children}
        <span className="sr-only">{state === "ok" ? " (done)" : state === "need" ? " (needs you)" : " (to do)"}</span>
      </span>
      {action ? (
        action.href ? (
          <Link
            to={action.href}
            className="ml-auto shrink-0 whitespace-nowrap rounded-[7px] border border-[var(--ds-line)] px-[9px] py-[3px] text-[12.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)]"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className="ml-auto shrink-0 whitespace-nowrap rounded-[7px] border border-[var(--ds-line)] px-[9px] py-[3px] text-[12.5px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)] disabled:opacity-40"
          >
            {action.label}
          </button>
        )
      ) : note ? (
        <span className="ml-auto shrink-0 whitespace-nowrap text-[12.5px] text-[var(--ds-subtle)]">{note}</span>
      ) : null}
    </li>
  );
}

/** The list wrapper for CheckRow. */
export function CheckList({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Accessible name for the list ("Finish the draft"). */
  label?: string;
}) {
  return (
    <ul aria-label={label} className={cn("m-0 flex list-none flex-col p-0", className)}>
      {children}
    </ul>
  );
}
