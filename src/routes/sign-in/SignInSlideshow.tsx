import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrandMark, Wordmark } from "@/components/ds";

/**
 * Crossfade slideshow that lives in the left column of the /sign-in and
 * /sign-in/signup pages at lg: and up. Each slide is a small fan of 6B
 * pastel letter thumbnails with a serif headline and a sub-line, on the
 * warm off-white ground. The DraftHR lockup is rendered once outside the
 * slide stack so it doesn't flicker between transitions.
 *
 * Auto-advances every 6s. Pauses while focus or hover is inside the panel
 * so a curious user can read a slide without it changing under them.
 * Respects `prefers-reduced-motion`: no auto-advance, instant slide swaps.
 *
 * Hidden below lg: by the parent shell.
 */

type Tint = "lavender" | "mint" | "peach" | "butter" | "sky" | "rose";

type Thumb = { title: string; meta: string; tint: Tint };

type Slide = {
  id: string;
  headline: string;
  subline: string;
  thumbs: [Thumb, Thumb, Thumb];
};

const SLIDES: readonly Slide[] = [
  {
    id: "hard-letters",
    headline: "The hard letters, written well.",
    subline: "For the conversations no one wants to draft alone.",
    thumbs: [
      { title: "Grievance outcome", meta: "UK, 6 min", tint: "lavender" },
      { title: "Final written warning", meta: "UK, 5 min", tint: "rose" },
      { title: "Probation review", meta: "UK and US, 4 min", tint: "mint" },
    ],
  },
  {
    id: "tribunal-grade",
    headline: "Tribunal-grade. Audit-defensible.",
    subline: "Cited clauses, signed exports, full audit chain.",
    thumbs: [
      { title: "Hearing invite", meta: "UK, 3 min", tint: "butter" },
      { title: "Dismissal letter", meta: "UK, 8 min", tint: "sky" },
      { title: "Appeal outcome", meta: "UK, 6 min", tint: "peach" },
    ],
  },
  {
    id: "minutes",
    headline: "HR letters, done in minutes.",
    subline: "AI-assisted drafting for HR teams across the UK and US.",
    thumbs: [
      { title: "Return to work", meta: "UK, 3 min", tint: "mint" },
      { title: "Offer letter", meta: "UK and US, 4 min", tint: "butter" },
      { title: "Flexible working reply", meta: "UK, 5 min", tint: "sky" },
    ],
  },
];

const INTERVAL_MS = 6000;
const FADE_MS = 900;

/** Fan positions for the three thumbnails: back left, front centre, back right. */
const FAN = [
  "left-0 top-[46px] origin-bottom-right scale-[0.92] -rotate-[7deg]",
  "left-1/2 top-0 z-10 -translate-x-1/2",
  "right-0 top-[46px] origin-bottom-left scale-[0.92] rotate-[7deg]",
] as const;

export function SignInSlideshow() {
  const [index, setIndex] = useState(0);
  const reduceMotion = usePrefersReducedMotion();
  const paused = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance, only on lg: viewports and only when motion is allowed.
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

  // Reset the timer when the user jumps to a slide, so they get a fresh
  // 6 seconds with the slide they chose.
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
      className="relative h-full w-full overflow-hidden bg-[var(--ds-canvas)] text-[var(--ds-ink)]"
    >
      {SLIDES.map((slide, i) => (
        <div
          key={slide.id}
          aria-hidden={i !== index}
          className="absolute inset-0 flex flex-col justify-center px-12 pb-24 pt-28 xl:px-16"
          style={{
            opacity: i === index ? 1 : 0,
            transition: reduceMotion ? "none" : `opacity ${FADE_MS}ms ease`,
          }}
        >
          <div className="relative mx-auto h-[300px] w-full max-w-[560px]">
            {slide.thumbs.map((t, j) => (
              <LetterThumb key={t.title} thumb={t} className={FAN[j]} />
            ))}
          </div>
          <div className="mx-auto mt-12 w-full max-w-[520px]">
            <h2 className="ds-title m-0 text-[34px] leading-[1.12]">{slide.headline}</h2>
            <p className="m-0 mt-3 max-w-[440px] text-[15px] leading-[1.55] text-[var(--ds-muted)]">
              {slide.subline}
            </p>
          </div>
        </div>
      ))}

      {/* Persistent brand lockup over the slide stack, never fades. */}
      <Link
        to="/"
        aria-label="DraftHR home"
        className="absolute left-10 top-9 z-20 inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
      >
        <BrandMark size={32} />
        <Wordmark size={22} />
      </Link>

      {/* Pagination: bottom-left, aligned with the footer line on the right. */}
      <div className="absolute bottom-10 left-10 z-20 flex gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Show slide ${i + 1} of ${SLIDES.length}`}
            aria-current={i === index ? "true" : undefined}
            className={`h-[3px] w-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-canvas)] ${
              i === index ? "bg-[var(--ds-ink)]" : "bg-[var(--ds-line-strong)] hover:bg-[var(--ds-subtle)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** 6B pastel preview card: tinted top holding a small paper page, then a title. */
function LetterThumb({ thumb, className }: { thumb: Thumb; className?: string }) {
  const bg = `var(--ds-tint-${thumb.tint})`;
  const ink = `var(--ds-tint-${thumb.tint}-ink)`;
  return (
    <div
      className={`absolute w-[210px] rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-1.5 shadow-[var(--ds-shadow-l)] ${className ?? ""}`}
    >
      <div
        className="relative grid h-[150px] place-items-end overflow-hidden rounded-[calc(var(--ds-r-l)-5px)] px-6"
        style={{ background: bg }}
      >
        <div className="h-[124px] w-full rounded-t-[3px] bg-[var(--ds-surface)] px-4 pt-4 shadow-[var(--ds-shadow-s)]">
          <span className="mb-2 block size-2.5 rounded-[2px]" style={{ background: ink }} />
          <span className="mb-1.5 block h-[3px] w-3/5 rounded-full bg-[var(--ds-line-strong)]" />
          <span className="mb-1.5 block h-[3px] w-full rounded-full bg-[var(--ds-line)]" />
          <span className="mb-1.5 block h-[3px] w-full rounded-full bg-[var(--ds-line)]" />
          <span className="mb-1.5 block h-[3px] w-4/5 rounded-full bg-[var(--ds-line)]" />
          <span className="mb-1.5 block h-[3px] w-full rounded-full bg-[var(--ds-line)]" />
          <span className="block h-[3px] w-2/3 rounded-full bg-[var(--ds-line)]" />
        </div>
      </div>
      <div className="px-2.5 pb-2 pt-2.5">
        <div className="truncate text-[13.5px] font-semibold text-[var(--ds-ink)]">{thumb.title}</div>
        <div className="mt-0.5 text-[12px] text-[var(--ds-muted)]">{thumb.meta}</div>
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
