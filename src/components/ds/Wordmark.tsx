import { cn } from "@/lib/utils";

/**
 * The DraftHR wordmark, set in Manrope semibold like the rest of the UI (the
 * brief allows only Manrope and Newsreader).
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
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        fontSize: size,
        letterSpacing: "-0.02em",
      }}
      aria-label="DraftHR"
    >
      DraftHR
    </span>
  );
}
