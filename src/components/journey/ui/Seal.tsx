import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The green seal that draws onto the letter when it is sent (mock f8,
 * letter-live.html "Deep" motion): a ring draws in 0.8s, the tick follows,
 * then the "Sent · 14 Oct 2026" label fades in. No bounce. With
 * prefers-reduced-motion it shows the finished seal straight away.
 *
 * `animate` draws it once (pass true right after sending); otherwise it
 * renders drawn. Place it absolutely over the page (top right, tilted), as
 * in the mock: the default classes do that inside a relative parent.
 */
export function Seal({
  date,
  label,
  animate = false,
  size = 96,
  className,
  placed = true,
}: {
  /** The sent date. */
  date: Date | number | string;
  /** Overrides the "Sent · <date>" label. */
  label?: string;
  animate?: boolean;
  size?: number;
  /** Absolute, tilted, top right of a relative parent (as in the mock). */
  placed?: boolean;
  className?: string;
}) {
  const d = new Date(date);
  const text =
    label ??
    `Sent · ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  // Start undrawn for one frame so the draw runs after mount.
  const [run, setRun] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const id = requestAnimationFrame(() => setRun(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);
  return (
    <div
      role="img"
      aria-label={text}
      data-slot="seal"
      data-animate={animate && run ? "true" : undefined}
      data-drawn={!animate ? "true" : undefined}
      className={cn(
        "ds-seal pointer-events-none flex flex-col items-center gap-1",
        placed && "absolute top-[118px] right-14 -rotate-[8deg]",
        className
      )}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <circle
          className="ds-seal-ring"
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke="var(--ds-green-solid)"
          strokeWidth="2"
        />
        <circle cx="50" cy="50" r="37" fill="none" stroke="var(--ds-green-solid)" strokeWidth="1" opacity=".5" />
        <path
          className="ds-seal-tick"
          d="M36 51 l9 9 l19 -21"
          fill="none"
          stroke="var(--ds-green-solid)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="ds-seal-label font-sans text-[10.5px] font-medium tracking-[0.08em] text-[var(--ds-green-solid)] uppercase">
        {text}
      </span>
    </div>
  );
}
