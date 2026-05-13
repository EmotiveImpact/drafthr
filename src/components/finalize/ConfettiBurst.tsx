import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * One-shot celebratory particle burst used on the Finalize page when the
 * user clicks "Mark as sent". Renders ~40 absolutely-positioned divs that
 * fan out from the centre with random angle/distance/rotation, fade out,
 * then unmount via the onDone callback.
 *
 * Zero dependencies beyond framer-motion (already in the bundle). Skipped
 * entirely when the user prefers reduced motion — the success state still
 * lands, just without the spectacle.
 */
type Props = {
  /** Called when the burst animation finishes (so the parent can unmount). */
  onDone: () => void;
};

const PARTICLE_COUNT = 42;
const COLOURS = [
  "var(--ds-green-fg, #16a34a)",
  "var(--ds-amber-fg, #f59e0b)",
  "var(--ds-blue-fg, #3b82f6)",
  "var(--ds-ink, #0f172a)",
  "#ec4899", // accent pink, no token equivalent
  "#a855f7", // accent violet
];

type Particle = {
  id: number;
  angle: number; // radians
  distance: number; // px
  size: number; // px
  rotate: number; // deg
  duration: number; // s
  delay: number; // s
  colour: string;
};

function makeParticles(): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    out.push({
      id: i,
      angle: Math.random() * Math.PI * 2,
      distance: 100 + Math.random() * 160,
      size: 6 + Math.random() * 6,
      rotate: (Math.random() - 0.5) * 720,
      duration: 0.9 + Math.random() * 0.5,
      delay: Math.random() * 0.08,
      colour: COLOURS[i % COLOURS.length],
    });
  }
  return out;
}

export function ConfettiBurst({ onDone }: Props) {
  const prefersReduced = useReducedMotion();
  // Memoise so particles don't regenerate on re-render mid-flight.
  const particles = useMemo(() => makeParticles(), []);

  useEffect(() => {
    if (prefersReduced) {
      onDone();
      return;
    }
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone, prefersReduced]);

  if (prefersReduced) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 0,
          height: 0,
        }}
      >
        {particles.map((p) => {
          const x = Math.cos(p.angle) * p.distance;
          const y = Math.sin(p.angle) * p.distance;
          return (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
              animate={{
                x,
                y: y + 80, // gravity drop after fan-out
                opacity: 0,
                rotate: p.rotate,
                scale: 1,
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.22, 0.36, 0.18, 1],
              }}
              style={{
                position: "absolute",
                width: p.size,
                height: p.size * 0.4,
                background: p.colour,
                borderRadius: 2,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
