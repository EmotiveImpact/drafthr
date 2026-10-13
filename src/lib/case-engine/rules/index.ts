import type { RuleContext, RuleFn, RuleId, RuleInput, RuleResult } from "../types";
import { RULE_INPUTS } from "./contract";
import { needsResult, notApplicable } from "./inputs";
import * as uk from "./uk";
import * as us from "./us";

/** Every rule the playbooks can name. Inputs and returns: see contract.ts. */
export const RULES: Record<RuleId, RuleFn> = {
  "uk.tribunalTimeLimit": uk.tribunalTimeLimit,
  "uk.earlyConciliation": uk.earlyConciliation,
  "uk.companionPostponement": uk.companionPostponement,
  "uk.qualifyingService": uk.qualifyingService,
  "uk.writtenReasons": uk.writtenReasons,
  "uk.statutoryNotice": uk.statutoryNotice,
  "uk.suspensionReview": uk.suspensionReview,
  "uk.collectiveConsultation": uk.collectiveConsultation,
  "uk.hr1Deadline": uk.hr1Deadline,
  "uk.protectiveAwardMax": uk.protectiveAwardMax,
  "uk.statutoryRedundancyPay": uk.statutoryRedundancyPay,
  "uk.familyLeaveProtectedPeriod": uk.familyLeaveProtectedPeriod,
  "uk.trialPeriodEnd": uk.trialPeriodEnd,
  "uk.sexualHarassmentDuty": uk.sexualHarassmentDuty,
  "us.eeocCharge": us.eeocCharge,
  "us.caCivilRights": us.caCivilRights,
  "us.warnNotice": us.warnNotice,
  "us.owbpa": us.owbpa,
};

/**
 * Runs one rule. A UK rule on a US case (or the reverse) is `notApplicable`;
 * a required input that is undefined or null gives `{ date: null, missing }`
 * without running the rule.
 */
export function runRule(id: RuleId, input: RuleInput, ctx: RuleContext): RuleResult {
  const country = id.startsWith("uk.") ? "uk" : "us";
  if (ctx.jurisdiction.country !== country) {
    return notApplicable(
      country === "uk"
        ? "This is a UK rule and the case is in the United States."
        : "This is a US rule and the case is in the UK."
    );
  }
  const missing = RULE_INPUTS[id].required.filter((name) => input[name] === undefined || input[name] === null);
  if (missing.length) return needsResult(missing);
  return RULES[id](input, ctx);
}
