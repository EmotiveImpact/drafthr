import { ShieldAlert } from "lucide-react";
import type { RiskBand } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Small chip rendering a Matter's risk band. Returns null when undefined
 * so callers can drop it inline without guards.
 *
 * Colour mapping:
 *   low      → green
 *   moderate → amber
 *   high     → orange (amber-ish — we use --ds-amber tokens with a brighter ring)
 *   critical → red
 */
const TONE: Record<
  RiskBand,
  { bg: string; fg: string; ring: string; label: string }
> = {
  low: {
    bg: "bg-[var(--ds-green-bg)]",
    fg: "text-[var(--ds-green-fg)]",
    ring: "ring-[color:var(--ds-green-fg)]/15",
    label: "Low",
  },
  moderate: {
    bg: "bg-[var(--ds-amber-bg)]",
    fg: "text-[var(--ds-amber-fg)]",
    ring: "ring-[color:var(--ds-amber-fg)]/15",
    label: "Moderate",
  },
  high: {
    bg: "bg-[#fff4e5]",
    fg: "text-[#c2410c]",
    ring: "ring-[#c2410c]/20",
    label: "High",
  },
  critical: {
    bg: "bg-[var(--ds-red-bg)]",
    fg: "text-[var(--ds-red-fg)]",
    ring: "ring-[color:var(--ds-red-fg)]/20",
    label: "Critical",
  },
};

export function MatterRiskBadge({ band }: { band?: RiskBand }) {
  if (!band) return null;
  const tone = TONE[band];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] px-2 py-[2px] rounded-full font-medium ring-1",
        tone.bg,
        tone.fg,
        tone.ring
      )}
      title={`Risk band: ${tone.label}`}
    >
      <ShieldAlert className="size-3" />
      Risk: {tone.label}
    </span>
  );
}
