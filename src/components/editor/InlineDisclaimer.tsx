import type { Draft } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { ShieldAlert, Info, AlertTriangle, Scale } from "lucide-react";

/**
 * Renders a tier-aware disclaimer banner inline in the editor (always visible
 * while drafting, not just at export). Item 14 in the production hardening list.
 *
 * Mode-aware:
 * - Employer mode: HR / counsel-review framing.
 * - Employee mode: tribunal-disclosure framing + free-advice resources.
 */
export function InlineDisclaimer({ draft }: { draft: Draft }) {
  const meta = getLetterMeta(draft.letterType);
  const j = draft.context.jurisdiction;

  if (draft.mode === "employee") {
    const tribunalBound = Boolean(meta.tribunalBound);
    const counselReq = meta.legalReviewRequired;

    if (tribunalBound || counselReq) {
      return (
        <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <Scale className="size-4 mt-0.5 shrink-0" />
          <div className="space-y-1 leading-relaxed">
            <p>
              <strong>Tribunal-bound letter.</strong> This letter may be disclosed in employment
              tribunal or court proceedings. Anything you write may be used as evidence by you or
              against you.
            </p>
            <p>
              We strongly recommend a qualified employment{" "}
              {j === "UK" ? "solicitor" : "attorney"} reviews this letter before sending. Free
              advice: {j === "UK" ? "ACAS 0300 123 1100" : "EEOC 1-800-669-4000"}.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-3 rounded-md border border-letter-rule bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="size-4 mt-0.5 shrink-0" />
        <p className="leading-relaxed">
          Drafted with an AI tool — not legal advice. Free advice:{" "}
          {j === "UK"
            ? "ACAS 0300 123 1100, Citizens Advice, Working Families."
            : "EEOC 1-800-669-4000, NLRB, your state DOL, lawhelp.org."}
        </p>
      </div>
    );
  }

  // Employer mode
  if (meta.riskClass === "high") {
    return (
      <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
        <ShieldAlert className="size-4 mt-0.5 shrink-0" />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong>High-risk letter.</strong> Counsel review is required before
            export.{" "}
            {j === "UK"
              ? "Failure to follow ACAS Code or s.86/98 ERA 1996 procedures may uplift tribunal awards by up to 25%."
              : "Failure to comply with WARN, OWBPA, Title VII, or state-specific final-pay rules can expose the organisation to penalties."}
          </p>
          <p>
            This drafting assistant is not legal advice. The platform provider
            accepts no liability for content used without legal review.
          </p>
        </div>
      </div>
    );
  }

  if (meta.riskClass === "medium") {
    return (
      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="size-4 mt-0.5 shrink-0" />
        <p className="leading-relaxed">
          <strong>Review recommended.</strong> This letter draws on general
          legal frameworks for {j}. Confirm compliance with your governing
          contract, applicable law, and any collective agreements before
          issuance.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-letter-rule bg-muted/40 p-3 text-xs text-muted-foreground">
      <Info className="size-4 mt-0.5 shrink-0" />
      <p className="leading-relaxed">
        Generated content should be reviewed by a qualified HR professional
        before issuance. Not legal advice.
      </p>
    </div>
  );
}
