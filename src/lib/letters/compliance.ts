import type { LetterTypeId, Jurisdiction, UsState } from "./types";
import { EMPLOYEE_COMPLIANCE_RULES } from "./compliance/employee";

export type ComplianceRuleSeverity = "required" | "recommended" | "warn";

export type ComplianceRule = {
  id: string;
  letterType: LetterTypeId;
  jurisdiction: Jurisdiction;
  states?: UsState[];
  severity: ComplianceRuleSeverity;
  label: string;
  description: string;
  /** Substring or regex tested against the assembled letter HTML/text. */
  match: { kind: "text" | "regex"; value: string; flags?: string };
  /** What to surface if the rule is missing. */
  recommendation: string;
};

export const COMPLIANCE_RULES: ComplianceRule[] = [
  // ===== UK — Offer =====
  {
    id: "uk_offer_s1_era",
    letterType: "offer",
    jurisdiction: "UK",
    severity: "recommended",
    label: "s.1 ERA 1996 written statement reference",
    description:
      "UK offers should reference that a written statement of particulars under s.1 Employment Rights Act 1996 will be provided on day one.",
    match: { kind: "regex", value: "section 1|s\\.\\s?1\\b|written statement", flags: "i" },
    recommendation:
      "Add a sentence: 'A written statement of employment particulars (Employment Rights Act 1996, s.1) will be provided on or before your first day.'",
  },
  {
    id: "uk_offer_rtw",
    letterType: "offer",
    jurisdiction: "UK",
    severity: "required",
    label: "Right-to-work check requirement",
    description:
      "Offers must reference that the offer is conditional on satisfactory right-to-work documentation.",
    match: { kind: "regex", value: "right[- ]to[- ]work|right to work in the UK", flags: "i" },
    recommendation:
      "Add: 'This offer is conditional on satisfactory evidence of your right to work in the United Kingdom.'",
  },
  {
    id: "uk_offer_pension",
    letterType: "offer",
    jurisdiction: "UK",
    severity: "recommended",
    label: "Pension auto-enrolment statement",
    description:
      "If the employee is an eligible jobholder, the offer should reference auto-enrolment under the Pensions Act 2008.",
    match: { kind: "regex", value: "auto[- ]enrol|auto-enrolment|workplace pension", flags: "i" },
    recommendation:
      "Add: 'You will be auto-enrolled in our workplace pension scheme in accordance with the Pensions Act 2008, subject to eligibility.'",
  },

  // ===== US — Offer =====
  {
    id: "us_offer_at_will",
    letterType: "offer",
    jurisdiction: "US",
    severity: "required",
    label: "At-will employment statement",
    description:
      "US offers must include an at-will statement (except Montana, where good-cause applies after probation).",
    match: { kind: "regex", value: "at[- ]will", flags: "i" },
    recommendation:
      "Add: 'Your employment will be at-will and may be terminated by either you or the company at any time, with or without cause or notice.'",
  },
  {
    id: "us_offer_no_contract",
    letterType: "offer",
    jurisdiction: "US",
    severity: "recommended",
    label: "Not a contract of employment",
    description:
      "US offers should disclaim that the letter is not a contract of guaranteed employment.",
    match: { kind: "regex", value: "not (?:a )?contract of employment|does not constitute a contract", flags: "i" },
    recommendation:
      "Add: 'This letter is not a contract of employment for any specific term.'",
  },
  {
    id: "us_ca_pay_range",
    letterType: "offer",
    jurisdiction: "US",
    states: ["CA", "CO", "NY", "WA", "IL", "MA"],
    severity: "required",
    label: "Pay transparency — salary range",
    description:
      "Pay-transparency states require a good-faith salary range be communicated. Confirm the range on the letter.",
    match: { kind: "regex", value: "salary range|pay range|compensation range", flags: "i" },
    recommendation: "Include the position's good-faith salary range in the compensation section.",
  },
  {
    id: "us_ca_no_noncompete",
    letterType: "offer",
    jurisdiction: "US",
    states: ["CA", "ND", "OK", "MN"],
    severity: "warn",
    label: "Non-compete restrictions",
    description:
      "California (Bus. & Prof. Code §16600 / AB 1076), North Dakota, Oklahoma, Minnesota largely void post-employment non-competes. Including one will likely be unenforceable and may expose the employer.",
    match: { kind: "regex", value: "non[- ]compete|covenant not to compete|restraint of trade", flags: "i" },
    recommendation:
      "Remove any post-employment non-compete clause for this jurisdiction. Confidentiality and non-solicitation can usually remain.",
  },

  // ===== UK — Warning / Termination =====
  {
    id: "uk_warning_appeal",
    letterType: "warning",
    jurisdiction: "UK",
    severity: "required",
    label: "Right of appeal (ACAS)",
    description:
      "UK warnings must inform the employee of their right to appeal, name the appeal officer, and give a deadline (usually 5 working days).",
    match: { kind: "regex", value: "right (?:of|to) appeal|you have the right to appeal", flags: "i" },
    recommendation:
      "Add: 'You have the right of appeal against this decision. To exercise it, write to [Appeal Officer] within 5 working days of receipt.'",
  },
  {
    id: "uk_warning_accompanied",
    letterType: "warning",
    jurisdiction: "UK",
    severity: "recommended",
    label: "Right to be accompanied (s.10 ERelA 1999)",
    description:
      "Confirm in writing that the employee was offered the right to be accompanied at the hearing by a colleague or trade union representative.",
    match: { kind: "regex", value: "right to be accompanied|accompanied at the hearing", flags: "i" },
    recommendation:
      "Reference: 'You were offered, and exercised/declined, your statutory right to be accompanied at the hearing.'",
  },
  {
    id: "uk_termination_appeal",
    letterType: "termination",
    jurisdiction: "UK",
    severity: "required",
    label: "Right of appeal (ACAS)",
    description:
      "UK dismissals must offer a right of appeal in writing — non-compliance can uplift tribunal awards by up to 25% (s.207A TULRCA).",
    match: { kind: "regex", value: "right (?:of|to) appeal", flags: "i" },
    recommendation:
      "Add: 'You have the right of appeal against this dismissal. To exercise it, write to [Appeal Officer] within 5 working days.'",
  },
  {
    id: "uk_termination_fair_reason",
    letterType: "termination",
    jurisdiction: "UK",
    severity: "required",
    label: "Named s.98 ERA fair reason",
    description:
      "UK dismissals should explicitly state the potentially fair reason: capability, conduct, redundancy, statutory illegality, or SOSR.",
    match: { kind: "regex", value: "capability|conduct|redundancy|statutory (?:restriction|illegality)|some other substantial reason|SOSR", flags: "i" },
    recommendation: "Name the fair reason category in the decision section.",
  },

  // ===== US — Termination =====
  {
    id: "us_termination_cobra",
    letterType: "termination",
    jurisdiction: "US",
    severity: "required",
    label: "COBRA continuation notice",
    description:
      "US terminations from group-health-plan employers trigger COBRA notice within 14 days (29 USC §1166).",
    match: { kind: "regex", value: "COBRA", flags: "i" },
    recommendation:
      "Reference COBRA continuation: 'You will receive a separate notice describing your right to elect COBRA continuation coverage for group health benefits.'",
  },
  {
    id: "us_ca_final_pay",
    letterType: "termination",
    jurisdiction: "US",
    states: ["CA"],
    severity: "required",
    label: "California immediate final pay",
    description:
      "California Labor Code §201 requires final wages immediately for employer-initiated termination. §203 imposes up to 30 days' wages as penalty for delay.",
    match: { kind: "regex", value: "final (?:pay|wages|paycheck) (?:will|is) (?:provided|paid|delivered) (?:today|on)", flags: "i" },
    recommendation:
      "Confirm: 'Your final wages, including all accrued unused PTO, are being provided on your final day of employment, in accordance with California Labor Code §201.'",
  },
  {
    id: "us_warn_60day",
    letterType: "redundancy",
    jurisdiction: "US",
    severity: "required",
    label: "WARN Act 60-day notice",
    description:
      "Employers with 100+ employees must give 60-day notice for layoffs of 50+ at a single site (29 USC §2101).",
    match: { kind: "regex", value: "60[- ]day|sixty[- ]day|WARN Act", flags: "i" },
    recommendation:
      "Reference WARN: 'You are receiving 60 days' written notice of layoff in accordance with the federal Worker Adjustment and Retraining Notification (WARN) Act.'",
  },
  {
    id: "us_owbpa_age40",
    letterType: "settlement_cover",
    jurisdiction: "US",
    severity: "required",
    label: "OWBPA — age 40+ release periods",
    description:
      "Releases by employees aged 40+ require 21 days to consider (45 group), 7 days to revoke; written advice to consult a lawyer; identify ADEA claim (29 USC §626(f)).",
    match: { kind: "regex", value: "21 days|45 days|7[- ]day revocation|consult (?:with )?an attorney", flags: "i" },
    recommendation:
      "Add OWBPA-compliant period language: 'You have 21 days [or 45 days for group] to consider this agreement, and 7 days after signing to revoke. You are advised to consult an attorney before signing.'",
  },

  // ===== UK — Redundancy =====
  {
    id: "uk_redundancy_consultation",
    letterType: "redundancy",
    jurisdiction: "UK",
    severity: "required",
    label: "Individual consultation referenced",
    description:
      "Reference the consultation history. For 20+ dismissals in 90 days, reference s.188 TULRCA collective consultation.",
    match: { kind: "regex", value: "consultation|consulted with you", flags: "i" },
    recommendation:
      "Reference consultation: 'Following our consultation meetings on [dates], we have reached the following decision...'",
  },
  {
    id: "uk_redundancy_pay",
    letterType: "redundancy",
    jurisdiction: "UK",
    severity: "required",
    label: "Statutory redundancy pay calculation",
    description:
      "If service ≥ 2 years, the letter must state the statutory redundancy pay calculation (s.162 ERA 1996).",
    match: { kind: "regex", value: "statutory redundancy pay|s\\.\\s?162", flags: "i" },
    recommendation:
      "Add the statutory redundancy pay amount and how it was calculated (age band × weeks per year × capped weekly amount).",
  },

  // ===== Settlement (UK) =====
  {
    id: "uk_settlement_advice",
    letterType: "settlement_cover",
    jurisdiction: "UK",
    severity: "required",
    label: "Independent legal advice (s.203 ERA)",
    description:
      "UK Settlement Agreements are only valid if the employee has received independent legal advice from a relevant adviser. The cover letter must direct them to obtain it.",
    match: { kind: "regex", value: "independent legal advice|relevant (?:independent )?adviser|s\\.\\s?203", flags: "i" },
    recommendation:
      "Add: 'You are required to obtain independent legal advice from a relevant adviser, as defined in s.203(3A) Employment Rights Act 1996, before signing.'",
  },

  // ===== Reference =====
  {
    id: "ref_consent",
    letterType: "reference",
    jurisdiction: "UK",
    severity: "warn",
    label: "Salary disclosure consent",
    description:
      "If salary is disclosed in a reference, UK GDPR / data protection requires the employee's written consent.",
    match: { kind: "regex", value: "salary|compensation|earnings|annual rate", flags: "i" },
    recommendation:
      "Confirm written consent has been obtained from the employee before disclosing salary. Otherwise, omit it.",
  },
];

export function rulesFor(
  letterType: LetterTypeId,
  jurisdiction: Jurisdiction,
  state?: UsState
): ComplianceRule[] {
  const all = [...COMPLIANCE_RULES, ...EMPLOYEE_COMPLIANCE_RULES];
  return all.filter((r) => {
    if (r.letterType !== letterType) return false;
    if (r.jurisdiction !== jurisdiction) return false;
    if (r.states && state) return r.states.includes(state);
    if (r.states && !state) return false;
    return true;
  });
}

export function ruleMatches(rule: ComplianceRule, content: string): boolean {
  if (rule.match.kind === "text") {
    return content.toLowerCase().includes(rule.match.value.toLowerCase());
  }
  const re = new RegExp(rule.match.value, rule.match.flags ?? "i");
  return re.test(content);
}
