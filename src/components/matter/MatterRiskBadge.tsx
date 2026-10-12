import { ShieldAlert } from "lucide-react";
import type { RiskBand } from "@/lib/letters/types";
import { cn } from "@/lib/utils";

/**
 * Small pill rendering a Matter's risk band. Returns null when undefined
 * so callers can drop it inline without guards.
 *
 * Colour mapping (status tokens):
 *   low      -> green
 *   moderate -> amber outline
 *   high     -> amber fill
 *   critical -> red
 */
const TONE: Record<RiskBand, { cls: string; label: string }> = {
  low: {
    cls: "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]",
    label: "Low",
  },
  moderate: {
    cls: "bg-[var(--ds-surface)] text-[var(--ds-amber-fg)] shadow-[inset_0_0_0_1px_var(--ds-amber-dot)]",
    label: "Moderate",
  },
  high: {
    cls: "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]",
    label: "High",
  },
  critical: {
    cls: "bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)]",
    label: "Critical",
  },
};

export function MatterRiskBadge({ band }: { band?: RiskBand }) {
  if (!band) return null;
  const tone = TONE[band];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12px] font-medium",
        tone.cls
      )}
      title={`Risk band: ${tone.label}`}
    >
      <ShieldAlert className="size-3" aria-hidden />
      Risk: {tone.label}
    </span>
  );
}
