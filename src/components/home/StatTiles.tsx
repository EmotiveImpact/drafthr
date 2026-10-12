/**
 * Four soft stat tiles (design 7B): a label with an icon, a big serif number,
 * an optional sparkline and a one-line footer. Every number is passed in by
 * Home from data it already holds; this file only draws.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTileProps = {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  /** Weekly (or similar) series for the sparkline. Hidden when flat. */
  series?: number[];
  sparkLabel?: string;
  footer?: ReactNode;
};

export function StatTiles({ tiles, className }: { tiles: StatTileProps[]; className?: string }) {
  return (
    <div className={cn("@container w-full min-w-0", className)}>
      <div className="grid grid-cols-2 gap-3 @[760px]:grid-cols-4">
        {tiles.map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, icon: Icon, value, series, sparkLabel, footer }: StatTileProps) {
  const showSpark = series && series.length > 1 && series.some((v) => v !== series[0]);
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--ds-r-l)] bg-[var(--ds-surface-2)] px-4 pt-4 pb-[15px] sm:px-[18px]">
      <div className="flex items-center justify-between gap-2 text-[12.5px] text-[var(--ds-muted)]">
        <span className="truncate">{label}</span>
        <Icon className="size-[15px] shrink-0" aria-hidden />
      </div>
      <div className="mt-2.5 flex min-h-[42px] items-end justify-between gap-3">
        <span className="ds-title text-[34px] leading-none whitespace-nowrap sm:text-[40px]">{value}</span>
        {showSpark && <Sparkline series={series!} label={sparkLabel} />}
      </div>
      {footer && (
        <div className="mt-3 flex min-h-5 min-w-0 items-center gap-1.5 overflow-hidden text-[12px] whitespace-nowrap text-[var(--ds-muted)]">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Up / down chip as in the prototype: "↑ 5" in green, "↓ 2" in muted. */
export function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-[var(--ds-r-s)] pr-1.5 pl-1 text-[11.5px] font-semibold",
        up ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]" : "bg-[var(--ds-chip)] text-[var(--ds-body)]"
      )}
    >
      {up ? <ArrowUp className="size-3" strokeWidth={2.2} /> : <ArrowDown className="size-3" strokeWidth={2.2} />}
      <span className="ds-mono">{Math.abs(delta)}</span>
    </span>
  );
}

export function FooterDot({ tone, children }: { tone: "red" | "amber" | "green"; children: ReactNode }) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium"
      style={{ color: `var(--ds-${tone}-fg)` }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: tone === "amber" ? "var(--ds-amber-dot)" : `var(--ds-${tone}-fg)` }} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/* Smooth path through points (Catmull-Rom to cubic Bezier), as drawn in the
 * prototype's 7B sparkline. */
function smooth(pts: [number, number][]): string {
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

function Sparkline({ series, label }: { series: number[]; label?: string }) {
  const W = 100;
  const H = 34;
  const n = series.length;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const pts = series.map(
    (v, i) => [(i / (n - 1)) * W, H - 2 - ((v - min) / span) * (H - 4)] as [number, number]
  );
  const d = smooth(pts);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-[34px] w-24 max-w-[55%] shrink overflow-visible"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="var(--ds-ink)" opacity={0.05} />
      <path
        d={d}
        fill="none"
        stroke="var(--ds-ink)"
        strokeWidth={1.6}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
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
