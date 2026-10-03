import type { HealthBand } from "@/lib/finalize/healthChecks";

/**
 * Static health score ring. The score is readable immediately on page load.
 */
type Props = {
  /** Final score in [0,100]. */
  score: number;
  /** Drives the ring colour. */
  band: HealthBand;
  /** Tweak the diameter (default 84). */
  size?: number;
  /** Optional caption rendered under the ring (e.g. dimension name).
   * The component returns a column flex layout when this is set. */
  label?: string;
};

const BAND_STYLES: Record<HealthBand, { ring: string; text: string; bg: string }> = {
  strong: {
    ring: "var(--ds-green-fg, #166534)",
    text: "var(--ds-green-fg, #166534)",
    bg: "var(--ds-green-bg, #dcfce7)",
  },
  adequate: {
    ring: "var(--ds-amber-fg, #92400e)",
    text: "var(--ds-amber-fg, #92400e)",
    bg: "var(--ds-amber-bg, #fef3c7)",
  },
  weak: {
    ring: "var(--ds-red-fg, #991b1b)",
    text: "var(--ds-red-fg, #991b1b)",
    bg: "var(--ds-red-bg, #fee2e2)",
  },
};

export function ScoreRing({
  score,
  band,
  size = 84,
  label,
}: Props) {
  const styles = BAND_STYLES[band];
  const ring = `conic-gradient(${styles.ring} ${score}%, var(--ds-line-2) 0)`;
  // Scale the inner hole with the diameter so small rings don't look like
  // chunky donuts and large rings don't look like thin halos.
  const inset = Math.max(4, Math.round(size * 0.095));

  const dial = (
    <div
      style={{
        width: size,
        height: size,
        background: ring,
        borderRadius: "50%",
        position: "relative",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
      aria-label={
        label
          ? `${label} score ${score} out of 100`
          : `Letter health score ${score} out of 100`
      }
    >
      <div
        style={{
          position: "absolute",
          inset,
          background: "var(--ds-surface, #fff)",
          borderRadius: "50%",
        }}
        aria-hidden
      />
      <span
        style={{
          position: "relative",
          fontSize: Math.round(size * 0.3),
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: styles.text,
          lineHeight: 1,
        }}
      >
        {score}
      </span>
    </div>
  );

  if (!label) return dial;

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      {dial}
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--ds-muted, #64748b)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
    </div>
  );
}
