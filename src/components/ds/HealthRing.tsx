import { cn } from "@/lib/utils";

/** Health bands from the design: green 85 and above, amber 70 to 84, red below 70. */
export type HealthTone = "good" | "mid" | "low";

export function healthTone(score: number): HealthTone {
  return score >= 85 ? "good" : score >= 70 ? "mid" : "low";
}

const STROKE: Record<HealthTone, string> = {
  good: "var(--ds-health-good)",
  mid: "var(--ds-health-mid)",
  low: "var(--ds-health-low)",
};

/**
 * The letter health ring. Two looks:
 *   inline (default)  24px ring, the score and "/ 100" beside it (list rows)
 *   big               a larger ring with the score inside it (health cards)
 */
export function HealthRing({
  score,
  size,
  stroke,
  variant = "inline",
  showOutOf = true,
  className,
  label,
}: {
  score: number;
  size?: number;
  stroke?: number;
  variant?: "inline" | "big";
  showOutOf?: boolean;
  className?: string;
  /** Accessible label; defaults to "Health <n> out of 100". */
  label?: string;
}) {
  const n = Math.max(0, Math.min(100, Math.round(score)));
  const px = size ?? (variant === "big" ? 46 : 24);
  const sw = stroke ?? (variant === "big" ? 3.5 : 2.25);
  const r = (px - sw) / 2 - (variant === "big" ? 1 : 0.75);
  const c = px / 2;
  const L = 2 * Math.PI * r;
  const tone = healthTone(n);
  const ring = (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden className="shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--ds-health-track)" strokeWidth={sw} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={STROKE[tone]}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${(L * n) / 100} ${L}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  );
  const aria = label ?? `Health ${n} out of 100`;
  if (variant === "big") {
    return (
      <span
        role="img"
        aria-label={aria}
        data-tone={tone}
        className={cn("relative inline-grid shrink-0 place-items-center", className)}
        style={{ width: px, height: px }}
      >
        {ring}
        <b className="ds-mono absolute inset-0 grid place-items-center text-[15px] font-medium text-[var(--ds-ink)]">
          {n}
        </b>
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={aria}
      data-tone={tone}
      className={cn("inline-flex items-center gap-2", className)}
    >
      {ring}
      <b className="ds-mono text-[13.5px] font-medium text-[var(--ds-ink)]">{n}</b>
      {showOutOf && <span className="-ml-1 text-[13px] text-[var(--ds-subtle)]">/ 100</span>}
    </span>
  );
}
