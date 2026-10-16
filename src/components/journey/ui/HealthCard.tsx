import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { HealthRing, healthTone } from "@/components/ds/HealthRing";

/**
 * The compact Letter health card in the Progress panel (mocks f1 to f6): the
 * ring with the score, a one-line verdict, the checks count on the right,
 * Compliance / Quality / Risk bars, and in Draft the failing checks with a
 * Fix button each. Colours follow the health bands (green 85+, amber 70 to
 * 84, red under 70).
 */
export type HealthFix = {
  id: string;
  label: string;
  /** "Required · ACAS Code, para 21". */
  detail?: string;
  onFix?: () => void;
  href?: string;
  fixLabel?: string;
};

export function HealthCard({
  score,
  checksCount,
  line,
  dimensions,
  fixes,
  onOpenChecks,
  checksHref,
  className,
}: {
  score: number;
  checksCount: number;
  /** Under the title: "Fix 1 to reach 90 or more", "Locked while it's out for review". */
  line?: string;
  dimensions: Array<{ label: string; score: number }>;
  fixes?: HealthFix[];
  onOpenChecks?: () => void;
  checksHref?: string;
  className?: string;
}) {
  const checksLabel = `${checksCount} check${checksCount === 1 ? "" : "s"}`;
  const checksLink = checksHref ? (
    <Link to={checksHref} className="ml-auto self-start whitespace-nowrap rounded-[4px] text-[12.5px] text-[var(--ds-ink)] hover:underline underline-offset-[3px]">
      {checksLabel}
    </Link>
  ) : onOpenChecks ? (
    <button type="button" onClick={onOpenChecks} className="ml-auto self-start whitespace-nowrap rounded-[4px] text-[12.5px] text-[var(--ds-ink)] hover:underline underline-offset-[3px]">
      {checksLabel}
    </button>
  ) : (
    <span className="ml-auto self-start whitespace-nowrap text-[12.5px] text-[var(--ds-ink)]">{checksLabel}</span>
  );
  return (
    <section
      data-slot="health-card"
      aria-label="Letter health"
      className={cn("rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3.5 py-3", className)}
    >
      <div className="flex items-center gap-3">
        <HealthRing score={score} variant="big" />
        <div className="min-w-0">
          <b className="block text-[14px] font-medium text-[var(--ds-ink)]">Letter health</b>
          {line && <span className="block text-[12px] text-[var(--ds-muted)]">{line}</span>}
        </div>
        {checksLink}
      </div>
      {dimensions.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-2.5">
          {dimensions.map((d) => {
            const n = Math.max(0, Math.min(100, Math.round(d.score)));
            const t = healthTone(n);
            return (
              <div key={d.label} className="flex flex-col gap-1 text-[11.5px] text-[var(--ds-muted)]">
                <span className="flex justify-between gap-1">
                  <span className="truncate">{d.label}</span>
                  <em className="ds-mono text-[12px] not-italic text-[var(--ds-ink)]">{n}</em>
                </span>
                <i
                  className="block h-1 overflow-hidden rounded-[3px] bg-[var(--ds-surface-3)]"
                  role="meter"
                  aria-label={`${d.label} ${n} out of 100`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={n}
                >
                  <b
                    className={cn(
                      "block h-full rounded-[3px]",
                      t === "good" ? "bg-[var(--ds-health-good)]" : t === "mid" ? "bg-[var(--ds-health-mid)]" : "bg-[var(--ds-health-low)]"
                    )}
                    style={{ width: `${n}%` }}
                  />
                </i>
              </div>
            );
          })}
        </div>
      )}
      {fixes && fixes.length > 0 && (
        <ol className="m-0 list-none p-0">
          {fixes.map((f, i) => (
            <li
              key={f.id}
              className="mt-2.5 flex items-start gap-2.5 border-t border-[var(--ds-line-2)] pt-2.5 text-[13px] text-[var(--ds-ink)]"
            >
              <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-[var(--ds-surface-2)] text-[11px] font-medium text-[var(--ds-muted)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {f.label}
                {f.detail && <div className="mt-px text-[12px] text-[var(--ds-subtle)]">{f.detail}</div>}
              </div>
              {(f.onFix || f.href) &&
                (f.href ? (
                  <Link
                    to={f.href}
                    className="ml-auto shrink-0 whitespace-nowrap rounded-[6px] border border-[var(--ds-line)] px-2 py-0.5 text-[12px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)]"
                  >
                    {f.fixLabel ?? "Fix"}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={f.onFix}
                    className="ml-auto shrink-0 whitespace-nowrap rounded-[6px] border border-[var(--ds-line)] px-2 py-0.5 text-[12px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] active:bg-[var(--ds-surface-3)]"
                  >
                    {f.fixLabel ?? "Fix"}
                  </button>
                ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
