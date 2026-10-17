import { cn } from "@/lib/utils";

/**
 * The DRAFTHR brand mark — renders /logo.png at a fixed square size.
 *
 * Use:
 *   <BrandMark />               // default 32px
 *   <BrandMark size={28} />     // smaller (sidebar header, message avatar)
 *   <BrandMark variant="outline" />  // ink-on-paper ring (rare)
 *   <BrandMark onDark />        // on a dark ground: a solid white D and a
 *                               // faint ring (/logo-on-dark.png), since the
 *                               // usual D is a see-through cut-out
 */
export function BrandMark({
  size = 32,
  variant = "solid",
  onDark = false,
  className,
}: {
  size?: number;
  variant?: "solid" | "outline";
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid place-items-center shrink-0 select-none rounded-md overflow-hidden",
        variant === "outline" && "bg-white ring-1 ring-[var(--ds-ink)]",
        className
      )}
      style={{ width: size, height: size }}
      aria-label="DRAFTHR"
    >
      <img
        src={onDark ? "/logo-on-dark.png" : "/logo.png"}
        alt="DRAFTHR"
        width={size}
        height={size}
        draggable={false}
        className="w-full h-full object-contain"
      />
    </span>
  );
}
