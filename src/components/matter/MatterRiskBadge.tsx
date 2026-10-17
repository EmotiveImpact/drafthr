import type { RiskBand } from "@/lib/letters/types";
import { Pill } from "@/components/ds";
import { RISK_LABEL, RISK_TONE } from "./model";

/**
 * A matter's risk band as a pill: "Low risk" green, "Medium risk" amber,
 * "High risk" and "Critical risk" red. Renders nothing without a band.
 */
export function MatterRiskBadge({ band, className }: { band?: RiskBand; className?: string }) {
  if (!band) return null;
  return (
    <Pill tone={RISK_TONE[band]} className={className} title={`Risk band: ${RISK_LABEL[band]}`}>
      {RISK_LABEL[band]} risk
    </Pill>
  );
}
