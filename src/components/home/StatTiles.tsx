/**
 * Quiet number tiles (mock reports `stat`): an icon and label, the figure
 * (32px, weight 500) with an optional unit, an optional sparkline, and a
 * footer line. Every number is passed in; this file only draws.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Pill, type PillTone } from "@/components/ds";
import { cn } from "@/lib/utils";

export type StatTileProps = {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  unit?: ReactNode;
  /** Series for the sparkline. Hidden when flat or too short. */
  series?: number[];
  sparkLabel?: string;
  /** Sparkline colour (a token). */
  sparkColor?: string;
  footer?: ReactNode;
  testId?: string;
};

export function StatTiles({ tiles, className }: { tiles: StatTileProps[]; className?: string }) {
  return (
    <div className={cn("@container w-full min-w-0", className)}>
      <div className="grid grid-cols-1 gap-3.5 @[360px]:grid-cols-2 @[880px]:grid-cols-4">
        {tiles.map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>
    </div>
  );
}

export function StatTile({ label, icon: Icon, value, unit, series, sparkLabel, sparkColor, footer, testId }: StatTileProps) {
  const showSpark = series && series.length > 1 && series.some((v) => v !== series[0]);
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col rounded-[14px] bg-[var(--ds-surface-2)] px-4 pt-[15px] pb-3.5">
      <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-[var(--ds-muted)]">
        <Icon className="size-3.5 shrink-0 text-[var(--ds-subtle)]" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-3 flex min-w-0 items-end justify-between gap-3">
        <span className="text-[32px] leading-none font-medium tracking-[-0.03em] whitespace-nowrap text-[var(--ds-ink)]">
          {value}
          {unit != null && unit !== "" && (
            <span className="ml-1 text-[15px] font-normal tracking-[-0.01em] text-[var(--ds-muted)]">{unit}</span>
          )}
        </span>
        {showSpark && <Sparkline series={series!} label={sparkLabel} color={sparkColor} />}
      </div>
      {footer && (
        <div className="mt-2.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[12.5px] whitespace-nowrap text-[var(--ds-muted)]">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Footer pill ("+5", "1 new"), then a muted line. */
export function TileFoot({
  pill,
  tone = "grey",
  dot = false,
  children,
}: {
  pill?: ReactNode;
  tone?: PillTone;
  dot?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      {pill != null && (
        <Pill tone={tone} dot={dot} className="shrink-0">
          {pill}
        </Pill>
      )}
      {children && <span className="truncate">{children}</span>}
    </>
  );
}

/** Sparkline (mock reports `spark`): a 96 by 30 line with a dot at the end. */
export function Sparkline({ series, label, color = "var(--ds-av-1-fg)" }: { series: number[]; label?: string; color?: string }) {
  const w = 96;
  const h = 30;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)] as const);
  const d = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg
      width={w}
      height={h}
      viewBox={`-2 0 ${w + 4} ${h}`}
      className="-mb-0.5 shrink-0"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <circle cx={lx} cy={ly} r={2.6} fill={color} />
    </svg>
  );
}

/** Count of timestamps in each of the last `weeks` weeks, oldest first. */
export function weeklySeries(timestamps: number[], weeks = 12, now = Date.now()): number[] {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const out = new Array(weeks).fill(0) as number[];
  for (const t of timestamps) {
    const age = now - t;
    if (age < 0) continue;
    const idx = weeks - 1 - Math.floor(age / WEEK);
    if (idx >= 0) out[idx] += 1;
  }
  return out;
}
