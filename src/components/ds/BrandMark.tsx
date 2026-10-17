import { cn } from "@/lib/utils";
import { MONOGRAM_D } from "./logoPaths";

// The D sits as in the 32px browser tab icon: capitals 21 of 32 tall, the
// stem's left edge (163 units in from the serif) on 8, the baseline on 26.
const SCALE = 21 / MONOGRAM_D.top;
const PLACE = `translate(${8 - 163 * SCALE} 26) scale(${SCALE})`;

/**
 * The square DraftHR mark: the logo's D in white on a near-black tile, the
 * same as the app icon and the browser tab icon. Use it only where the
 * <Wordmark/> will not fit (a phone top bar, a reviewer's header).
 *
 * Use:
 *   <BrandMark />                // default 32px
 *   <BrandMark size={26} />      // smaller headers
 *   <BrandMark size={28} bare /> // the D alone in the current text colour,
 *                                // for dark grounds (the collapsed sidebar)
 */
export function BrandMark({
  size = 32,
  bare = false,
  className,
}: {
  size?: number;
  bare?: boolean;
  className?: string;
}) {
  return (
    <svg
      role="img"
      aria-label="DraftHR"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("block shrink-0 select-none", bare && "fill-current", className)}
    >
      {!bare && <rect width="32" height="32" rx="7" fill="#111110" />}
      <path transform={PLACE} d={MONOGRAM_D.d} fill={bare ? undefined : "#ffffff"} />
    </svg>
  );
}
