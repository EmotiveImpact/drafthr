import type { Draft } from "./types";
import { getLetterMeta } from "./catalog";

/* ============================================================================
 * Employer-mode disclaimers (existing)
 * ==========================================================================*/

const TIER1 = `<p><em>This letter has been generated using a template-assisted drafting tool and should be reviewed by a qualified HR professional or employment-law adviser before issuance. It does not constitute legal advice.</em></p>`;

const TIER2 = (jurisdiction: string, region?: string) =>
  `<p><em>This letter draws on general legal frameworks for ${jurisdiction}${
    region ? ` (${region})` : ""
  }. Specific employment terms, collective agreements, and jurisdictional updates may affect its validity. Confirm compliance with your governing contract and applicable law.</em></p>`;

const TIER3 = `<p><strong>IMPORTANT:</strong> <em>This is a high-risk communication. It must be reviewed by qualified employment-law counsel before issuance. Failure to follow statutory procedures (UK: ACAS Code of Practice, Employment Rights Act 1996; US: WARN Act, OWBPA, Title VII, state-specific final-pay and notice rules) may expose the organisation to compensation awards, statutory penalties, or unfair-dismissal/discrimination claims. The platform provider accepts no liability for content used without legal review.</em></p>`;

/* ============================================================================
 * Employee-mode disclaimers (new)
 * ==========================================================================*/

const EMP_TIER1 = `<p><em>This letter has been drafted with an AI tool and is not legal advice. For complex situations, particularly before signing settlement agreements, lodging tribunal claims or making protected disclosures, obtain advice from a qualified employment solicitor (UK) or attorney (US).</em></p>`;

const EMP_TIER2_UK = `<p><em>Free advice in the UK: ACAS helpline 0300 123 1100 (acas.org.uk); Citizens Advice (citizensadvice.org.uk); Working Families (workingfamilies.org.uk); Equality Advisory & Support Service (equalityadvisoryservice.com); Law Centres Network (lawcentres.org.uk).</em></p>`;

const EMP_TIER2_US = `<p><em>Free advice in the US: EEOC 1-800-669-4000 (eeoc.gov); NLRB Information Officer (nlrb.gov); your State Department of Labor (find via dol.gov); legal aid via lawhelp.org and the National Employment Lawyers Association (nelahq.org).</em></p>`;

const EMP_TIER3 = `<p><strong>IMPORTANT:</strong> <em>This letter may be disclosed in employment tribunal or court proceedings. Anything you write may be used as evidence by you or against you. We strongly recommend a qualified employment solicitor or attorney reviews this letter before sending. The platform provider accepts no liability for content sent without legal review.</em></p>`;

/* ============================================================================
 * Public API
 * ==========================================================================*/

export function disclaimerHtmlFor(draft: Draft): string {
  const meta = getLetterMeta(draft.letterType);
  const region =
    draft.context.jurisdiction === "UK"
      ? draft.context.ukRegion
      : draft.context.usState;

  if (meta.mode === "employee") {
    const j = draft.context.jurisdiction;
    const tier2 = j === "UK" ? EMP_TIER2_UK : EMP_TIER2_US;
    if (meta.tribunalBound || meta.legalReviewRequired) {
      return EMP_TIER3 + EMP_TIER1 + tier2;
    }
    return EMP_TIER1 + tier2;
  }

  // Employer-mode existing tiers
  if (meta.riskClass === "high") {
    return TIER3 + TIER1;
  }
  if (meta.riskClass === "medium") {
    return TIER2(draft.context.jurisdiction, region) + TIER1;
  }
  return TIER1;
}

/** True if the export flow should hard-stop with the counsel-review modal. */
export function exportRequiresCounselGate(draft: Draft): boolean {
  const meta = getLetterMeta(draft.letterType);
  return Boolean(meta.legalReviewRequired || (meta.mode === "employee" && meta.tribunalBound));
}
