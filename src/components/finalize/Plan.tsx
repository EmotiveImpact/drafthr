import type { ReactNode } from "react";
import { Check, CircleCheck, CircleAlert, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import { tintStyle, type Tint } from "@/components/templates/tints";

/**
 * Small presentational pieces shared by the start and the end of creating a
 * letter (wizard, Review, Finalise, Exported, templates):
 *
 *   PlanCard / PlanStep   the 4B "DraftHR's plan" card: title, meta chip,
 *                         thin progress bar, then a ticked step list
 *   OutputChip            4B output file chip
 *   PaperThumb            6B tinted top with a drawn letter page
 *   PaperIcon             13B tiny paper thumbnail for list rows
 *   Pill                  small status / tag pill on the stone tokens
 */

/* ------------------------------------------------------------------ */
/* 4B plan card                                                        */
/* ------------------------------------------------------------------ */

export function PlanCard({
  title,
  sub,
  meta,
  progress,
  children,
  className,
  headerAside,
}: {
  title: ReactNode;
  sub?: ReactNode;
  /** Small chip on the right, e.g. "4 of 5". */
  meta?: ReactNode;
  /** 0..1 — renders the thin progress bar when given. */
  progress?: number;
  children?: ReactNode;
  className?: string;
  /** Replaces the meta chip (e.g. a small score ring). */
  headerAside?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--ds-r-m)] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-[18px] py-4 shadow-[var(--ds-shadow-m)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[14px] font-semibold leading-snug text-[var(--ds-ink)]">{title}</h2>
          {sub && <p className="m-0 mt-px truncate text-[12.5px] text-[var(--ds-muted)]">{sub}</p>}
        </div>
        {headerAside ??
          (meta != null && (
            <span className="ds-mono inline-flex h-[22px] shrink-0 items-center rounded-[var(--ds-r-s)] bg-[var(--ds-chip)] px-2 text-[12px] font-medium text-[var(--ds-body)]">
              {meta}
            </span>
          ))}
      </div>
      {progress != null && (
        <div
          className="mb-1 mt-3 h-[3px] overflow-hidden rounded-full bg-[var(--ds-line)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.max(0, Math.min(1, progress)) * 100)}
        >
          <span
            className="block h-full rounded-full bg-[var(--ds-ink)] transition-[width] duration-500"
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </div>
      )}
      {children}
    </section>
  );
}

export type PlanStepState = "done" | "now" | "todo" | "warn" | "fail" | "ok";

/** One row of the plan list. `done` strikes through (a finished plan step);
 * `ok` ticks without striking (a passed check). */
export function PlanStep({
  state,
  children,
  sub,
  aside,
  onClick,
  title,
  className,
}: {
  state: PlanStepState;
  children: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const body = (
    <>
      <StepMark state={state} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[13px] leading-[19px] [overflow-wrap:anywhere]",
            state === "done" &&
              "text-[var(--ds-faint)] line-through decoration-[var(--ds-faint)]",
            state === "now" && "font-medium text-[var(--ds-ink)]",
            state === "todo" && "text-[var(--ds-subtle)]",
            (state === "ok" || state === "warn" || state === "fail") && "text-[var(--ds-ink)]",
          )}
        >
          {children}
        </span>
        {sub && (
          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--ds-muted)]">{sub}</span>
        )}
      </span>
      {aside && <span className="ml-auto flex shrink-0 items-center self-center">{aside}</span>}
    </>
  );
  const cls = cn(
    "flex w-full items-start gap-2.5 border-t border-[var(--ds-line)] py-[11px] text-left first:border-t-0",
    className,
  );
  if (onClick) {
    return (
      <li className="list-none">
        <button
          type="button"
          onClick={onClick}
          title={title}
          className={cn(cls, "-mx-2 w-[calc(100%+16px)] rounded-[var(--ds-r-s)] px-2 hover:bg-[var(--ds-surface-2)]")}
        >
          {body}
        </button>
      </li>
    );
  }
  return (
    <li className={cn(cls, "list-none")} title={title}>
      {body}
    </li>
  );
}

export function PlanSteps({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("m-0 mt-2 p-0", className)}>{children}</ul>;
}

function StepMark({ state }: { state: PlanStepState }) {
  const box = "mt-[1.5px] grid size-4 shrink-0 place-items-center";
  switch (state) {
    case "done":
    case "ok":
      return (
        <span className={cn(box, "text-[var(--ds-green-fg)]")} aria-label="Done">
          <CircleCheck className="size-4" strokeWidth={1.75} />
        </span>
      );
    case "warn":
      return (
        <span className={cn(box, "text-[var(--ds-amber-dot)]")} aria-label="Needs attention">
          <CircleAlert className="size-4" strokeWidth={1.75} />
        </span>
      );
    case "fail":
      return (
        <span className={cn(box, "text-[var(--ds-red-fg)]")} aria-label="Blocking">
          <CircleX className="size-4" strokeWidth={1.75} />
        </span>
      );
    case "now":
      return (
        <span className={box} aria-label="In progress">
          <span className="size-[13px] rounded-full border-[1.75px] border-[var(--ds-line-strong)] border-t-[var(--ds-ink)]" />
        </span>
      );
    default:
      return (
        <span className={box} aria-label="To do">
          <span className="size-[13px] rounded-full border-[1.5px] border-dashed border-[var(--ds-faint)]" />
        </span>
      );
  }
}

/* ------------------------------------------------------------------ */
/* 4B output chip                                                      */
/* ------------------------------------------------------------------ */

export function OutputChip({
  icon,
  name,
  ext,
  onClick,
  disabled,
  busy,
  title,
  done,
}: {
  icon: ReactNode;
  name: string;
  ext?: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  /** Show a small tick: this format has been exported before. */
  done?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-[9px] text-[12.5px] text-[var(--ds-body)] transition",
        "hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--ds-line)] disabled:hover:bg-[var(--ds-surface-2)]",
      )}
    >
      <span className={cn("inline-flex shrink-0", busy && "animate-pulse")}>{icon}</span>
      <span className="flex min-w-0">
        <span className="truncate">{busy ? "Preparing" : name}</span>
        {ext && !busy && <span className="shrink-0 text-[var(--ds-muted)]">{ext}</span>}
      </span>
      {done && !busy && <Check className="size-3 shrink-0 text-[var(--ds-green-fg)]" strokeWidth={2.5} aria-label="Exported before" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 6B tinted top with a drawn letter page                              */
/* ------------------------------------------------------------------ */

const LINES = ["94%", "100%", "82%", null, "100%", "90%", "64%"] as const;

export function PaperThumb({
  tint,
  height = 128,
  scale = 1,
  className,
  children,
}: {
  tint: Tint;
  height?: number;
  /** Shrinks the drawn page for small thumbnails. */
  scale?: number;
  className?: string;
  /** Optional overlay (e.g. an icon in the corner). */
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden
      style={{ ...tintStyle(tint), height }}
      className={cn(
        "group/paper relative overflow-hidden rounded-[calc(var(--ds-r-l)-5px)] bg-[var(--tint)]",
        className,
      )}
    >
      <span
        className="absolute bottom-0 left-1/2 block h-[98px] w-[108px] origin-bottom"
        style={{ transform: `translateX(-50%) scale(${scale})` }}
      >
        <span className="absolute inset-x-0 top-0 flex h-[124px] -rotate-[2.5deg] flex-col gap-[5px] rounded-[3px] bg-[var(--ds-surface)] px-[13px] pt-4 shadow-[var(--ds-shadow-m)] transition-transform duration-200 group-hover/card:-translate-y-1.5 group-hover/card:-rotate-1">
          <span className="absolute right-0 top-0 size-4 rounded-bl-[2px] bg-[linear-gradient(225deg,var(--tint)_50%,var(--ds-line)_50%)]" />
          <span className="mb-[3px] size-[9px] rounded-[2px] bg-[var(--tint-ink)] opacity-85" />
          <span className="mb-[3px] block h-1 w-[58%] shrink-0 rounded-[2px] bg-[var(--ds-ink)] opacity-55" />
          {LINES.map((w, i) =>
            w ? (
              <span key={i} className="block h-1 shrink-0 rounded-[2px] bg-[var(--ds-line)]" style={{ width: w }} />
            ) : (
              <span key={i} className="h-1 shrink-0" />
            ),
          )}
        </span>
      </span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 13B tiny paper thumbnail                                            */
/* ------------------------------------------------------------------ */

export function PaperIcon({ tint, className }: { tint: Tint; className?: string }) {
  return (
    <span aria-hidden style={tintStyle(tint)} className={cn("relative ml-1 block h-10 w-8 shrink-0", className)}>
      <span className="absolute inset-0 translate-x-1 -translate-y-[3px] rotate-[4deg] rounded-[2px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)]" />
      <span className="absolute inset-0 flex flex-col gap-[3px] overflow-hidden rounded-[2px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-[5px] pt-[7px] shadow-[var(--ds-shadow-s)]">
        <span className="mb-px size-1.5 rounded-[1.5px] bg-[var(--tint-ink)]" />
        {[100, 100, 80, 100, 64].map((w, i) => (
          <span key={i} className="block h-[2px] shrink-0 rounded-[1px] bg-[var(--ds-line)]" style={{ width: `${w}%` }} />
        ))}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Pills                                                               */
/* ------------------------------------------------------------------ */

export type PillTone = "neutral" | "green" | "amber" | "red" | "blue" | "violet" | "tint";

const PILL: Record<PillTone, string> = {
  neutral: "bg-[var(--ds-chip)] text-[var(--ds-body)]",
  green: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
  amber: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
  red: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
  blue: "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
  violet: "bg-[var(--ds-violet-bg)] text-[var(--ds-violet-fg)]",
  tint: "bg-[var(--tint)] text-[var(--tint-ink)]",
};

export function Pill({
  tone = "neutral",
  children,
  className,
  title,
  round,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
  title?: string;
  /** Fully rounded (status) instead of the 6px tag radius. */
  round?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap px-[7px] text-[11.5px] font-medium",
        round ? "rounded-full" : "rounded-[var(--ds-r-s)]",
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
