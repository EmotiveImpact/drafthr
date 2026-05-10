import { cn } from "@/lib/utils";

/**
 * The DRAFTHR brand mark — a 32×32 ink chip with a serif "D".
 * Replaces every occurrence of the lucide ScrollText icon. Has presence
 * at small sizes and reads as a real logomark.
 *
 * Use:
 *   <BrandMark />               // default 32px ink chip
 *   <BrandMark size={28} />     // smaller (sidebar header)
 *   <BrandMark variant="outline" />  // ink-on-paper ring (rare)
 */
export function BrandMark({
  size = 32,
  variant = "solid",
  className,
}: {
  size?: number;
  variant?: "solid" | "outline";
  className?: string;
}) {
  const fontSize = Math.round(size * 0.56);
  return (
    <span
      className={cn(
        "inline-grid place-items-center shrink-0 select-none rounded-md",
        variant === "solid"
          ? "bg-[var(--ds-ink)] text-white"
          : "bg-white text-[var(--ds-ink)] ring-1 ring-[var(--ds-ink)]",
        className
      )}
      style={{
        width: size,
        height: size,
        fontFamily: "var(--font-serif)",
        fontWeight: 600,
        fontSize,
        letterSpacing: "-0.04em",
        lineHeight: 1,
      }}
      aria-label="DRAFTHR"
    >
      D
    </span>
  );
}
