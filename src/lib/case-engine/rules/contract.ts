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
    // relevantDate: the act (last act in a series), or for a failure to act the
    //   date the employer decided on it (Equality Act s123(3)(b), (4)), or the
    //   effective date of termination for dismissal claims, or the last dismissal
    //   for a protective award. For breach_of_contract: the effective date of
    //   termination, or the last day worked if there is none (SI 2026/759 art 3).
    // ground (optional): the protected characteristic(s) for a discrimination
    //   claim, one value or a list: "sex" | "pregnancy_maternity" | "race"
    //   | "national_origin" | "disability" | "age" | "sexual_orientation"
    //   | "religion_belief" | "political_opinion" | "religion_political" (both of
    //   the last two); others are ignored. Used in Northern Ireland, where each
    //   ground has its own law; religious belief and political opinion go to the
    //   Fair Employment Tribunal.
    // knowledgeDate (optional): Northern Ireland fair employment claims only; the
    //   day the claimant first knew, or might reasonably have known, of the act.
    // detail.months always. A Scottish breach of contract claim with an effective
    //   date of termination on or after 9 November 2026 gets 6 months under a
    //   Scottish order still in draft on 13 October 2026, with the 3-month date
    //   in detail.ifScottishOrderNotMade and in toVerify.
    required: ["claimType", "relevantDate"],
    optional: ["ground", "knowledgeDate"],
    returns: "Last day to present the claim, before any early conciliation extension",
  },
  "uk.earlyConciliation": {
    // limitDate: the primary limit from uk.tribunalTimeLimit.
    // dayA: date Acas (or the LRA in Northern Ireland) was notified.
    // dayB: date the certificate was received.
    // ground (optional): as uk.tribunalTimeLimit. In Northern Ireland the
    //   extension for age, sexual orientation and fair employment claims is not
    //   yet confirmed, so with any of those grounds the unextended date is
    //   returned and detail.extendedDate gives the extended one.
    required: ["limitDate", "dayA", "dayB"],
    optional: ["ground"],
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
    // withoutNotice (optional boolean): employment ended with less than the
    //   statutory minimum notice, or none. true adds that notice to the
    //   termination date for the test (ERA 1996 s97(2), (4); ERO 1996 Art 129(2))
    //   and sets detail.s97Date; false leaves it out; absent, the rule says when
    //   adding it would change the answer.
    // resignation (optional boolean): the employee resigned (constructive
    //   dismissal), so s97(4) rather than s97(2) applies.
    required: ["startDate", "terminationDate"],
    optional: ["automaticReason", "withoutNotice", "resignation"],
    returns: "Date the unfair dismissal qualifying period is met",
  },
  "uk.writtenReasons": {
    // startDate and terminationDate (optional, together): give detail.qualifies,
    // whether the service needed for the right is met (detail.monthsNeeded).
    required: ["requestDate"],
    optional: ["pregnantOrOnLeave", "startDate", "terminationDate"],
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
    //   | "paternity" (ordinary paternity leave, which gives no priority).
    // placementDate: adoption placement date, or entry date for an overseas
    //   adoption; for shared parental, neonatal care or bereaved partner's leave
    //   after an adoption, the placement date (birthDate otherwise).
    // sixConsecutiveWeeks: true when six or more consecutive weeks of shared
    //   parental, neonatal care or bereaved partner's paternity leave were taken,
    //   which extends the protection to 18 months.
    // birthNotified: whether the employee told the employer the birth date
    //   before maternity leave ended (MPL Regs 1999 reg 10(1D)).
    // Northern Ireland: maternity, adoption and shared parental leave only, and
    //   the protection ends with the leave (leaveEndDate).
    required: ["leaveType"],
    optional: [
      "birthDate",
      "expectedWeekStart",
      "notifiedPregnancyDate",
      "leaveEndDate",
      "placementDate",
      "sixConsecutiveWeeks",
      "birthNotified",
    ],
    returns: "Last day of redundancy priority protection",
  },
  "uk.trialPeriodEnd": {
    required: ["newRoleStartDate"],
    optional: ["retrainingEndDate"],
    returns: "Last day of the statutory trial period",
  },
  "uk.compensationCap": {
    // terminationDate: the effective date of termination. weeklyPay: gross week's
    // pay, for the Great Britain 52 weeks' pay limb.
    // Returns date = null; detail.capRemoved (boolean), detail.fixedCap (pounds or
    // null), detail.weeksPayCap (52 weeks' pay, Great Britain only, or null) and
    // detail.cap (the lower of the two, or null when there is none or it is not held).
    required: ["terminationDate"],
    optional: ["weeklyPay"],
    returns: "No date; the cap on the unfair dismissal compensatory award",
  },
  "uk.weeklyPayCap": {
    // appropriateDate: the date the Increase of Limits Orders key the limit to,
    // for example the failure or threat for a companion claim (ERA 1999 s11).
    // Returns date = null; detail.weeklyCap (pounds, or null when not held).
    required: ["appropriateDate"],
    optional: [],
    returns: "No date; the limit on a week's pay (ERA 1996 s227(1); ERO 1996 Art 23(1))",
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
    //   same basis (300 days); basis: "age" changes the 300-day test.
    // state: where the employee works, as a code or name, or a list; defaults to
    //   the case's state. When deferralState is not given, California, New
    //   York, Texas, Florida and Illinois give 300 days (age included).
    // employerHeadcount: a number, or a band such as "15 to 19"; below 15 (20 for
    //   age) there is no EEOC route: date is null and detail.noRoute is true.
    // stateAgencyEndDate: the day the person received notice that a state or
    //   local agency they filed with first ended its proceedings; the deadline is
    //   then the earlier of the usual date and 30 days after it.
    // Returns date = the 300-day date when 300 days apply, else 180;
    // detail.day180, detail.day300 and detail.noRoute always.
    required: ["actDate"],
    optional: ["deferralState", "basis", "state", "employerHeadcount", "stateAgencyEndDate"],
    returns: "Last day to file an EEOC charge",
  },
  "us.caCivilRights": {
    required: ["actDate"],
    optional: [],
    returns: "Last day to file with the California Civil Rights Department",
  },
  "us.warnNotice": {
    // Optional, to test whether federal WARN applies (counts leave out part-time staff):
    // separationDates: separation dates of every group (one date or a list),
    //   each needing its own 60 days; the earliest of these and
    //   firstSeparationDate gives `date`.
    // employerFullTime: employees, not counting part-time staff.
    // employer4000Hours: true when 100 or more employees, part-time included,
    //   together work at least 4,000 hours a week excluding overtime.
    // siteFullTimeHeadcount: full-time headcount at the site on the date notice
    //   is first due (for the 33% test).
    // siteLosses30 / siteLosses90: employment losses at the site within 30 days,
    //   and within the 90-day window (aggregation).
    // closure: true for a plant closing (shutdown of the site or a unit in it).
    // detail.noticeDates lists each group's date; detail.covered,
    // detail.triggered, detail.aggregated and detail.applies are true, false or
    // null (not known). With applies false, date is null.
    required: ["firstSeparationDate"],
    optional: [
      "separationDates",
      "employerFullTime",
      "employer4000Hours",
      "siteFullTimeHeadcount",
      "siteLosses30",
      "siteLosses90",
      "closure",
    ],
    returns: "Latest day WARN notice must be given",
  },
  "us.owbpa": {
    // Returns date = end of the consideration period; detail.revocationEnd when signedDate given.
    required: ["agreementGivenDate"],
    optional: ["groupProgramme", "signedDate"],
    returns: "Last day of the consideration period",
  },
  "us.eeocSuitDeadline": {
    // noticeDate: the date of the EEOC notice of right to sue.
    required: ["noticeDate"],
    optional: [],
    returns: "Last day to sue after an EEOC notice of right to sue",
  },
  "us.stateAgencyDeadline": {
    // California, New York, Texas, Florida and Illinois fair employment agencies
    // (shared table T2); other states are not applicable.
    // state: a code or name, or a list naming one of the five; defaults to the case's state.
    // basis: "sexual_harassment" (Texas 300 days; any employer size in Texas and
    //   California), "harassment" (any size in California), "disability" (any
    //   size in Illinois); other values change nothing.
    // employerHeadcount: as us.eeocCharge; below the state's size, date is null
    //   with detail.covered false.
    // eeocFiledDate: Illinois only; an EEOC charge filed within 300 days counts
    //   as filed with the Department (detail.eeocChargeCounts).
    // detail.traps lists what follows the filing.
    required: ["actDate"],
    optional: ["state", "basis", "employerHeadcount", "eeocFiledDate"],
    returns: "Last day to file with the state fair employment agency",
  },
  "us.finalPay": {
    // separationType: "discharge" | "layoff" | "quit_with_notice" | "quit_without_notice"
    //   (with notice means at least 72 hours' notice, the California test).
    // nextPayday: the next regular payday after the separation date (needed in
    //   New York, Illinois, and for a Texas quit).
    // state: as us.stateAgencyDeadline. Florida: date null (no state rule found).
    required: ["separationDate", "separationType"],
    optional: ["nextPayday", "state"],
    returns: "Latest day for final wages",
  },
  "us.separationNotice": {
    // state: as us.stateAgencyDeadline. separationType: as us.finalPay; in
    //   California a quit gives date null. detail.notices names what is due;
    //   New York also has detail.writtenNoticeBy (5 working days).
    required: ["separationDate"],
    optional: ["state", "separationType"],
    returns: "Latest day for the state's separation notice",
  },
  "us.stateWarnNotice": {
    // California, New York and Illinois layoff notice laws (shared table T5);
    // Texas and Florida are not applicable.
    // state: as us.stateAgencyDeadline; a list naming more than one of the
    //   three is refused (run the rule once per state).
    // stateHeadcount: New York, full-time employees in New York State;
    //   California, full and part-time employees at the establishment with 6 of
    //   the last 12 months' service; Illinois, employees not counting part-time.
    // siteLosses30: employment losses at the site within 30 days; siteLosses90:
    //   within the 90-day window (New York aggregation); siteFullTimeHeadcount:
    //   for the 33% test; closure: true for a plant closing; relocationMiles:
    //   distance of a relocation.
    // detail.covered, detail.triggered, detail.aggregated and detail.applies are
    // true, false or null; with applies false, date is null.
    required: ["firstSeparationDate", "stateHeadcount", "siteLosses30"],
    optional: ["state", "siteLosses90", "closure", "siteFullTimeHeadcount", "relocationMiles"],
    returns: "Latest day state layoff notice must be given",
  },
  "us.nlrbChargeLimit": {
    // actDate: the unfair labor practice complained of.
    required: ["actDate"],
    optional: [],
    returns: "Last day to file an unfair labor practice charge with the NLRB",
  },
};
