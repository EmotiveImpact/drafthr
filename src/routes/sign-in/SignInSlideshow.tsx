import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrandMark, Wordmark } from "@/components/ds";

/**
 * Three-image crossfade slideshow that lives in the left column of the
 * /sign-in and /sign-in/signup pages at lg: and up. Each slide carries an
 * image + headline + sub-line; the DraftHR brand lockup is rendered once
 * outside the slide stack so it doesn't flicker between transitions.
 *
 * Auto-advances every 6s. Pauses while focus or hover is inside the panel
 * so a curious user can read a slide without it changing under them.
 * Respects `prefers-reduced-motion`: no auto-advance, instant slide swaps.
 *
 * Hidden below lg: — the parent shell uses `hidden lg:flex` so the <img>
 * tags are inside a display:none subtree on mobile and never trigger
 * fetches.
 */

type Slide = {
  src: string;
  headline: string;
  subline: string;
};

const SLIDES: readonly Slide[] = [
  {
    src: "/auth/slide-1.jpg",
    headline: "The hard letters, written well.",
    subline: "For the conversations no one wants to draft alone.",
  },
  {
    src: "/auth/slide-2.jpg",
    headline: "Tribunal-grade. Audit-defensible.",
    subline: "Cited clauses, signed exports, full audit chain.",
  },
  {
    src: "/auth/slide-3.jpg",
    headline: "HR letters, done in minutes.",
    subline: "AI-assisted drafting for HR teams across the UK and US.",
  },
];

const INTERVAL_MS = 6000;
const FADE_MS = 1100;

export function SignInSlideshow() {
  const [index, setIndex] = useState(0);
  const reduceMotion = usePrefersReducedMotion();
  const paused = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance — only on lg: viewports and only when motion is allowed.
  // matchMedia keeps us from burning a setInterval on a mobile device that
  // can't see the slideshow anyway (the parent shell is display:none below
  // lg:, so even if the timer fires, nothing visible changes).
  useEffect(() => {
    if (reduceMotion) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    const tick = () => {
      if (paused.current) return;
      setIndex((i) => (i + 1) % SLIDES.length);
    };
    timerRef.current = setInterval(tick, INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [reduceMotion]);

  // Reset the timer when the user jumps to a slide — so they get a fresh
  // 6 seconds with the slide they chose, not whatever was left in the cycle.
  const goTo = (i: number) => {
    setIndex(i);
    if (reduceMotion) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (paused.current) return;
      setIndex((cur) => (cur + 1) % SLIDES.length);
    }, INTERVAL_MS);
  };

  return (
    <div
      role="region"
      aria-label="Brand highlights"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={() => (paused.current = false)}
      className="relative h-full w-full overflow-hidden bg-[var(--ds-ink)]"
    >
      {/* Slide stack — each slide is absolutely positioned, opacity is the
       * only transitioning property so the crossfade stays GPU-friendly. */}
      {SLIDES.map((slide, i) => (
        <div
          key={slide.src}
          aria-hidden={i !== index}
          className="absolute inset-0"
          style={{
            opacity: i === index ? 1 : 0,
            transition: reduceMotion ? "none" : `opacity ${FADE_MS}ms ease`,
          }}
        >
          <img
            src={slide.src}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            // @ts-expect-error — fetchPriority lands in React's typing
            // in 18.3+; cast through to silence until we bump.
            fetchPriority={i === 0 ? "high" : undefined}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Bottom-anchored darkening so the headline always sits at
           * 4.5:1+ over any underlying image. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(10,11,13,0.15) 0%, rgba(10,11,13,0.55) 55%, rgba(10,11,13,0.92) 100%)",
            }}
          />
          {/* Per-slide copy. We render every slide's copy but fade them
           * with the image — keeps the headline tied to the photo it
           * was authored for, no cross-pairing during transitions. */}
          <div className="absolute bottom-[88px] left-9 right-9 z-10 text-white">
            {/* Single-line headline at lg:, allowed to wrap on extreme
             * narrow column widths. 26px keeps the longest tagline
             * ("Tribunal-grade. Audit-defensible.") on one row at the
             * 50/50 split. */}
            <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] whitespace-nowrap">
              {slide.headline}
            </h2>
            <p className="mt-2.5 text-[14px] leading-[1.5] text-white/80 max-w-[460px]">
              {slide.subline}
            </p>
          </div>
        </div>
      ))}

      {/* Persistent brand lockup — sits over the slide stack, never fades.
       * Wordmark is forced to white to read against the imagery. */}
      {/* Brand lockup sits on a soft white badge so the standard
       * /logo.png chip (which is designed for light surfaces) reads
       * consistently across all three slides — including the lighter
       * ceiling on slide 3 and the darker office on slide 1. */}
      <Link
        to="/"
        aria-label="DraftHR home"
        className="absolute left-9 top-9 z-20 inline-flex items-center gap-2.5 rounded-[12px] bg-white/95 pl-1.5 pr-3.5 py-1.5 shadow-[0_2px_10px_rgba(10,11,13,0.18)] hover:bg-white transition"
      >
        <BrandMark size={32} />
        <Wordmark size={20} />
      </Link>

      {/* Pagination dots — bottom-left, in line with the tagline column. */}
      <div className="absolute bottom-7 left-9 z-20 flex gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show slide ${i + 1} of ${SLIDES.length}`}
            aria-current={i === index ? "true" : undefined}
            className={`h-[3px] w-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-ink)] ${
              i === index ? "bg-white/95" : "bg-white/30 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}
