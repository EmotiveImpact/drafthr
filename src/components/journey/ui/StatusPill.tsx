import type { ReactNode } from "react";
import { Pill } from "@/components/ds/Pill";
import type { JourneyPillTone } from "@/lib/journey/stage";

/**
 * The letter's status pill (document bar, lists, cards). Same colour, same
 * meaning everywhere: amber needs you, lilac someone else has it, green done,
 * blue neutral info, red only for errors, grey for a plain draft.
 *
 *   <StatusPill tone={journey.statusTone}>{journey.statusLabel}</StatusPill>
 */
export function StatusPill({
  tone,
  children,
  className,
  dot = true,
}: {
  tone: JourneyPillTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <Pill tone={tone} dot={dot} className={className}>
      {children}
    </Pill>
  );
}
