import { cn } from "@/lib/utils";
import { WORDMARK_DISPLAY, WORDMARK_SMALL } from "./logoPaths";

/**
 * The DraftHR logo: the "Joined" wordmark, DraftHR in Newsreader with the f
 * and t sharing one crossbar. It is drawn artwork (see logoPaths.ts) in the
 * current text colour, so it follows the tone and turns white on dark grounds.
 * It stands on its own; <BrandMark/> is the square D for tight spots.
 *
 * `size` is the type size it is set at, in px: the capitals are two thirds of
 * it and the mark is about 3.8 times as wide. Below 36px it switches to the
 * small cut, which is drawn sturdier for small sizes.
 *
 * Use:
 *   <Wordmark />                // default 18px
 *   <Wordmark size={40} />      // sign-in pages
 *   <Wordmark tone="muted" />   // subdued contexts
 *   <Wordmark tone="inherit" /> // the parent's colour (white over photos)
 */
export function Wordmark({
  size = 18,
  tone = "ink",
  className,
}: {
  size?: number;
  tone?: "ink" | "muted" | "inherit";
  className?: string;
}) {
  const art = size >= 36 ? WORDMARK_DISPLAY : WORDMARK_SMALL;
  const height = art.top + art.bottom;
  const scale = size / 2000;
  return (
    <svg
      role="img"
      aria-label="DraftHR"
      viewBox={`0 ${-art.top} ${art.w} ${height}`}
      width={Math.round(art.w * scale * 100) / 100}
      height={Math.round(height * scale * 100) / 100}
      className={cn(
        "inline-block shrink-0 select-none fill-current",
        tone === "ink" && "text-[var(--ds-ink)]",
        tone === "muted" && "text-[var(--ds-muted)]",
        className
      )}
    >
      <path d={art.d} />
    </svg>
  );
}
