/**
 * Small presentational parts shared by the reports, billing, matters,
 * employees, approvals and bulk screens: the 7B stat tile, the 13B paper
 * thumbnail and status pill, and the plain white section card.
 *
 * Styling only. Nothing here fetches data or holds state.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatterColor } from "@/lib/letters/types";

/* ---------------------------------------------------------------- 7B tiles */

export function StatTileGrid({
  children,
  className,
  cols = 4,
}: {
  children: ReactNode;
  className?: string;
  cols?: 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * One 7B stat tile: label and icon on top, a big serif number, then a quiet
 * foot line. Pass `series` for the sparkline beside the number.
 */
export function StatTile({
  label,
  icon: Icon,
  value,
  unit,
  foot,
  series,
  tone,
  className,
  testId,
}: {
  label: string;
  icon?: LucideIcon;
  value: ReactNode;
  /** Small suffix after the number ("/100", "%"). */
  unit?: ReactNode;
  foot?: ReactNode;
  series?: number[];
  /** Colours the number for at-risk figures. */
  tone?: "danger" | "warn" | "ok";
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex min-w-0 flex-col rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-[18px] pb-[15px] pt-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 text-[12.5px] leading-snug text-[var(--ds-muted)]">
        <span className="min-w-0 sm:truncate">{label}</span>
        {Icon && <Icon className="size-[15px] shrink-0" aria-hidden />}
      </div>
      <div className="mt-2.5 flex min-h-[42px] items-end justify-between gap-3">
        <span
          className={cn(
            "ds-title text-[34px] leading-none sm:text-[40px]",
            tone === "danger" && "!text-[var(--ds-red-fg)]",
            tone === "warn" && "!text-[var(--ds-amber-fg)]",
            tone === "ok" && "!text-[var(--ds-green-fg)]"
          )}
        >
          {value}
          {unit != null && (
            <span className="ml-1 font-sans text-[13px] text-[var(--ds-muted)]">{unit}</span>
          )}
        </span>
        {series && series.length > 1 && <Sparkline series={series} />}
      </div>
      {foot != null && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] leading-snug text-[var(--ds-muted)] sm:flex-nowrap sm:truncate">
          {foot}
        </div>
      )}
    </div>
  );
}

/** Green delta chip used in a tile foot ("+5"). */
export function DeltaChip({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-[var(--ds-r-s)] px-1.5 text-[11.5px] font-semibold",
        tone === "ok"
          ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
          : "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]"
      )}
    >
      {children}
    </span>
  );
}

export function Sparkline({ series, className }: { series: number[]; className?: string }) {
  const W = 96;
  const H = 34;
  const n = series.length;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => [(i / (n - 1)) * W, H - 2 - ((v - min) / span) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("block h-[34px] w-[96px] max-w-[55%] overflow-visible", className)}
    >
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="var(--ds-ink)" opacity={0.05} />
      <path d={line} fill="none" stroke="var(--ds-ink)" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------- 13B paper + pills */

const PAPER_TINTS = [
  "var(--ds-tint-lavender-ink)",
  "var(--ds-tint-peach-ink)",
  "var(--ds-tint-butter-ink)",
  "var(--ds-tint-mint-ink)",
  "var(--ds-tint-sky-ink)",
  "var(--ds-tint-rose-ink)",
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The 13B stacked paper thumbnail that leads a letter row. */
export function PaperThumb({ seed = "", className }: { seed?: string; className?: string }) {
  const ink = PAPER_TINTS[hash(seed) % PAPER_TINTS.length];
  return (
    <span aria-hidden className={cn("relative ml-1 block h-10 w-8 shrink-0", className)}>
      <span className="absolute inset-0 translate-x-[4px] -translate-y-[3px] rotate-[4deg] rounded-[2px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)]" />
      <span className="absolute inset-0 flex flex-col gap-[3px] overflow-hidden rounded-[2px] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-[5px] pt-[7px] shadow-[var(--ds-shadow-s)]">
        <span className="mb-px size-1.5 rounded-[1.5px]" style={{ background: ink }} />
        <span className="block h-0.5 w-full rounded-[1px] bg-[var(--ds-line)]" />
        <span className="block h-0.5 w-full rounded-[1px] bg-[var(--ds-line)]" />
        <span className="block h-0.5 w-3/4 rounded-[1px] bg-[var(--ds-line)]" />
        <span className="block h-0.5 w-full rounded-[1px] bg-[var(--ds-line)]" />
      </span>
    </span>
  );
}

export type PillTone = "warn" | "info" | "neutral" | "ok" | "danger" | "violet";

const PILL: Record<PillTone, string> = {
  warn: "bg-[var(--ds-surface)] text-[var(--ds-amber-fg)] shadow-[inset_0_0_0_1px_var(--ds-amber-dot)]",
  info: "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]",
  neutral: "bg-[var(--ds-chip)] text-[var(--ds-body)]",
  ok: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
  danger: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
  violet: "bg-[var(--ds-violet-bg)] text-[var(--ds-violet-fg)]",
};

const PILL_DOT: Record<PillTone, string> = {
  warn: "bg-[var(--ds-amber-dot)]",
  info: "bg-[var(--ds-blue-fg)]",
  neutral: "bg-[var(--ds-faint)]",
  ok: "bg-[var(--ds-green-fg)]",
  danger: "bg-[var(--ds-red-fg)]",
  violet: "bg-[var(--ds-violet-fg)]",
};

/** 13B status pill: rounded, dot, 12px medium. */
export function StatusPill({
  tone,
  children,
  dot = true,
  size = "md",
  className,
}: {
  tone: PillTone;
  children: ReactNode;
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "h-5 px-2 text-[11.5px]" : "h-6 px-[9px] text-[12px]",
        PILL[tone],
        className
      )}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", PILL_DOT[tone])} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* --------------------------------------------------------- section cards */

/** Plain white card with a hairline border: the settings / detail panel. */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  id,
  testId,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
  testId?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      className={cn(
        "min-w-0 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 sm:p-6",
        className
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold text-[var(--ds-ink)]">
                {Icon && <Icon className="size-4 text-[var(--ds-muted)]" aria-hidden />}
                {title}
              </h2>
            )}
            {description && (
              <p className="m-0 mt-1 max-w-[62ch] text-[13px] leading-relaxed text-[var(--ds-muted)]">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Small uppercase-free section heading used above row lists. */
export function SectionLabel({
  children,
  hint,
  actions,
  className,
}: {
  children: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-2", className)}>
      <div className="min-w-0">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--ds-ink)]">{children}</h2>
        {hint && <p className="m-0 mt-0.5 text-[12.5px] text-[var(--ds-muted)]">{hint}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Page wrapper for the restyled screens: consistent gutters and width. */
export function PageShell({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: "wide" | "medium" | "narrow";
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 px-4 py-6 sm:px-8 sm:py-10 lg:px-11",
        width === "wide" && "max-w-[1180px]",
        width === "medium" && "max-w-[980px]",
        width === "narrow" && "max-w-[760px]",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Near-black primary button classes for hand-rolled buttons and links. */
export const PRIMARY_BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] px-3.5 text-[13.5px] font-medium text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)] disabled:opacity-50 disabled:pointer-events-none";

/** White outline button classes. */
export const OUTLINE_BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--ds-r-s)] border border-[var(--ds-line-strong)] bg-[var(--ds-surface)] px-3.5 text-[13.5px] font-medium text-[var(--ds-ink)] hover:bg-[var(--ds-surface-2)] disabled:opacity-50 disabled:pointer-events-none";

/** Pastel tint and ink for each matter colour (6B folder cards, tiles). */
export const MATTER_TINT: Record<MatterColor, [string, string]> = {
  red: ["var(--ds-tint-rose)", "var(--ds-tint-rose-ink)"],
  amber: ["var(--ds-tint-butter)", "var(--ds-tint-butter-ink)"],
  blue: ["var(--ds-tint-sky)", "var(--ds-tint-sky-ink)"],
  violet: ["var(--ds-tint-lavender)", "var(--ds-tint-lavender-ink)"],
  green: ["var(--ds-tint-mint)", "var(--ds-tint-mint-ink)"],
  slate: ["var(--ds-surface-3)", "var(--ds-body)"],
};
