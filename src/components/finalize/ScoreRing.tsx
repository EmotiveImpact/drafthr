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
 * Respects `prefers-reduced-motion`, falls back to a static render.
 */
type Props = {
  /** Final score in [0,100]. */
  score: number;
  /** Drives the ring colour. */
  band: HealthBand;
  /** Tweak the diameter (default 84). */
  size?: number;
  /** Stagger the count-up start (seconds). Used when several rings render
   * side-by-side so they cascade in instead of all firing at t=0. */
  delay?: number;
  /** Optional caption rendered under the ring (e.g. dimension name).
   * The component returns a column flex layout when this is set. */
  label?: string;
};

// The ring carries the band colour; the number stays ink.
const BAND_STYLES: Record<HealthBand, { ring: string; text: string; bg: string }> = {
  strong: {
    ring: "var(--ds-green-fg)",
    text: "var(--ds-ink)",
    bg: "var(--ds-green-bg)",
  },
  adequate: {
    ring: "var(--ds-amber-dot)",
    text: "var(--ds-ink)",
    bg: "var(--ds-amber-bg)",
  },
  weak: {
    ring: "var(--ds-red-fg)",
    text: "var(--ds-ink)",
    bg: "var(--ds-red-bg)",
  },
};

export function ScoreRing({
  score,
  band,
  size = 84,
  delay = 0,
  label,
}: Props) {
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
    setDisplay(0);
    const startAt = performance.now() + delay * 1000;
    const from = 0;
    const to = score;
    const duration = 1100;
    const tick = (now: number) => {
      if (now < startAt) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startAt) / duration);
      // ease-out cubic, fast start, gentle landing.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [score, delay, prefersReduced]);

  const ring = `conic-gradient(${styles.ring} ${display}%, var(--ds-line) 0)`;
  // Scale the inner hole with the diameter so small rings don't look like
  // chunky donuts and large rings don't look like thin halos.
  const inset = Math.max(3, Math.round(size * 0.075));
  // Big rings set the number in the light serif (a "big number"); small
  // rings use Geist Mono so the figure stays legible.
  const big = size >= 56;

  const dial = (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay, ease: [0.32, 0.72, 0, 1] }}
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
          background: "var(--ds-surface)",
          borderRadius: "50%",
        }}
        aria-hidden
      />
      <span
        style={{
          position: "relative",
          fontFamily: big ? "var(--font-title)" : "var(--font-mono)",
          fontSize: Math.round(size * (big ? 0.36 : 0.3)),
          fontWeight: big ? 300 : 500,
          letterSpacing: big ? "-0.02em" : undefined,
          fontVariantNumeric: "tabular-nums",
          color: styles.text,
          lineHeight: 1,
        }}
      >
        {display}
      </span>
    </motion.div>
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
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--ds-muted)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
