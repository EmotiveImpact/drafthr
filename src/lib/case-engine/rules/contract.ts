import type { RuleId } from "../types";

/**
 * The inputs each rule takes. Playbooks map their fact keys onto these input
 * names; the runner checks every rule use against this list in tests.
 *
 * Dates are IsoDate strings. Enumerated inputs list their allowed values.
 */
export type RuleInputContract = {
  required: string[];
  optional: string[];
  /** What the rule returns as `date`, in one line. */
  returns: string;
};

export const RULE_INPUTS: Record<RuleId, RuleInputContract> = {
  "uk.tribunalTimeLimit": {
    // claimType: "unfair_dismissal" | "discrimination" | "deduction" | "detriment"
    //   | "breach_of_contract" | "companion" | "protective_award" | "redundancy_pay"
    // relevantDate: the act (last act in a series), or the effective date of
    //   termination for dismissal claims, or the last dismissal for a protective award.
    required: ["claimType", "relevantDate"],
    optional: [],
    returns: "Last day to present the claim, before any early conciliation extension",
  },
  "uk.earlyConciliation": {
    // limitDate: the primary limit from uk.tribunalTimeLimit.
    // dayA: date Acas (or the LRA in Northern Ireland) was notified.
    // dayB: date the certificate was received.
    required: ["limitDate", "dayA", "dayB"],
    optional: [],
    returns: "The time limit once the early conciliation extension is applied",
  },
  "uk.companionPostponement": {
    required: ["proposedDate"],
    optional: [],
    returns: "Latest date the worker's alternative hearing time may fall",
  },
  "uk.qualifyingService": {
    // Returns date = the day the qualifying period is met; detail.qualifies is
    // a boolean for the termination date given.
    required: ["startDate", "terminationDate"],
    optional: ["automaticReason"],
    returns: "Date the unfair dismissal qualifying period is met",
  },
  "uk.writtenReasons": {
    required: ["requestDate"],
    optional: ["pregnantOrOnLeave"],
    returns: "Last day to give written reasons for dismissal",
  },
  "uk.statutoryNotice": {
    // Returns date = earliest end of statutory notice; detail.weeks.
    required: ["startDate", "noticeDate"],
    optional: [],
    returns: "Earliest date statutory minimum notice from the employer ends",
  },
  "uk.suspensionReview": {
    // A product rule (Proposal), not law.
    required: ["suspensionStart"],
    optional: ["lastReview"],
    returns: "Next date a suspension should be reviewed",
  },
  "uk.collectiveConsultation": {
    // proposedCount: dismissals proposed at one establishment within 90 days.
    // Returns date = latest day consultation must begin; detail.days and
    // detail.applies (false below 20).
    required: ["proposedCount", "firstDismissalDate"],
    optional: [],
    returns: "Latest day collective consultation must begin",
  },
  "uk.hr1Deadline": {
    required: ["proposedCount", "firstDismissalDate"],
    optional: ["firstNoticeDate"],
    returns: "Latest day the HR1 must be received",
  },
  "uk.protectiveAwardMax": {
    // Returns date = null; detail.maxDays.
    required: ["dismissalDate"],
    optional: [],
    returns: "No date; the maximum protective award in days",
  },
  "uk.statutoryRedundancyPay": {
    // Returns date = null; detail.amount (pounds), detail.weeklyCap,
    // detail.qualifies, detail.completeYears.
    required: ["startDate", "terminationDate", "dateOfBirth", "weeklyPay"],
    optional: [],
    returns: "No date; the statutory redundancy payment",
  },
  "uk.familyLeaveProtectedPeriod": {
    // leaveType: "maternity" | "adoption" | "shared_parental" | "neonatal" | "bereaved_partner"
    required: ["leaveType"],
    optional: ["birthDate", "expectedWeekStart", "notifiedPregnancyDate", "leaveEndDate"],
    returns: "Last day of redundancy priority protection",
  },
  "uk.trialPeriodEnd": {
    required: ["newRoleStartDate"],
    optional: ["retrainingEndDate"],
    returns: "Last day of the statutory trial period",
  },
  "uk.sexualHarassmentDuty": {
    // Returns date = null; detail.standard: "none" | "reasonable_steps" | "all_reasonable_steps",
    // detail.thirdParty (boolean).
    required: ["conductDate"],
    optional: [],
    returns: "No date; which prevention duty applied on that date",
  },
  "us.eeocCharge": {
    // deferralState: true when a state or local agency enforces a law on the
    // same basis (300 days); basis: "age" changes the 300-day test.
    // Returns date = the 300-day date when deferralState is true, else 180;
    // detail.day180 and detail.day300 always.
    required: ["actDate"],
    optional: ["deferralState", "basis"],
    returns: "Last day to file an EEOC charge",
  },
  "us.caCivilRights": {
    required: ["actDate"],
    optional: [],
    returns: "Last day to file with the California Civil Rights Department",
  },
  "us.warnNotice": {
    required: ["firstSeparationDate"],
    optional: [],
    returns: "Latest day WARN notice must be given",
  },
  "us.owbpa": {
    // Returns date = end of the consideration period; detail.revocationEnd when signedDate given.
    required: ["agreementGivenDate"],
    optional: ["groupProgramme", "signedDate"],
    returns: "Last day of the consideration period",
  },
};
