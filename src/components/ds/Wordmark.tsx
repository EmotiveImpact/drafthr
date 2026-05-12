import { cn } from "@/lib/utils";

/**
 * The DRAFTHR wordmark — "DraftHR" set in Playfair Display.
 * Pairs with <BrandMark/> to form the brand lockup. Use the wordmark on its
 * own for headers where the glyph would feel redundant.
 *
 * Use:
 *   <Wordmark />               // default 18px
 *   <Wordmark size={22} />     // larger headers
 *   <Wordmark tone="muted" />  // subdued contexts
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
  return (
    <span
      className={cn(
        "inline-block leading-none select-none whitespace-nowrap",
        tone === "ink" && "text-[var(--ds-ink)]",
        tone === "muted" && "text-[var(--ds-muted)]",
        className
      )}
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: size,
        letterSpacing: "0.01em",
        // Playfair's cap-height sits low in its em-box. Nudge up so the
        // optical center of the wordmark lines up with the BrandMark chip
        // when both are placed in a flex row with items-center.
        transform: "translateY(-0.02em)",
      }}
      aria-label="DraftHR"
    >
      Draft<span style={{ letterSpacing: "0.03em" }}>HR</span>
    </span>
  );
}
