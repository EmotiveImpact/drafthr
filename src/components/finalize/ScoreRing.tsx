import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HealthBand } from "@/lib/finalize/healthChecks";

/**
 * Big animated score ring used at the top of the Finalize page.
 *
 * Animates from 0 → score over ~1100ms with a smooth ease-out, while the
 * surrounding conic-gradient fills in lockstep. The "dopamine hit" comes
 * from both at once: the number climbs, the ring fills, and the band
 * label badges in last with a tiny pop.
 *
 * Respects `prefers-reduced-motion` — falls back to a static render.
 */
type Props = {
  /** Final score in [0,100]. */
  score: number;
  /** Drives the ring colour. */
  band: HealthBand;
  /** Tweak the diameter (default 84). */
  size?: number;
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

export function ScoreRing({ score, band, size = 84 }: Props) {
  const prefersReduced = useReducedMotion();
  const styles = BAND_STYLES[band];
  const [display, setDisplay] = useState(prefersReduced ? score : 0);
  const rafRef = useRef<number | null>(null);

  // requestAnimationFrame-based count-up. Each frame eases toward the target.
  // We tween the display number; the conic-gradient picks it up via inline
  // style so number and ring fill stay in lockstep.
  useEffect(() => {
    if (prefersReduced) {
      setDisplay(score);
      return;
    }
    const start = performance.now();
    const from = 0;
    const to = score;
    const duration = 1100;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic — fast start, gentle landing.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [score, prefersReduced]);

  const ring = `conic-gradient(${styles.ring} ${display}%, var(--ds-line-2) 0)`;

  return (
    <motion.div
      initial={prefersReduced ? false : { scale: 0.94, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
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
      aria-label={`Letter health score ${score} out of 100`}
    >
      <div
        style={{
          position: "absolute",
          inset: 8,
          background: "var(--ds-surface, #fff)",
          borderRadius: "50%",
        }}
        aria-hidden
      />
      <span
        style={{
          position: "relative",
          fontSize: Math.round(size * 0.27),
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: styles.text,
        }}
      >
        {display}
      </span>
    </motion.div>
  );
}
