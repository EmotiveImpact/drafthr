import type { ComplianceRule } from "../compliance";

/**
 * Rights-preservation rules for employee letters. These flag when the letter
 * is missing language that protects the employee's legal position.
 *
 * Severity is mapped to the existing employer-side semantics:
 *   required    — strongly recommended; missing = compliance flag
 *   recommended — best practice; missing = soft suggestion
 *   warn        — present but risky; mostly covered by register-safety
 */
export const EMPLOYEE_COMPLIANCE_RULES: ComplianceRule[] = [
  // ===== Grievance =====
  {
    id: "emp_uk_grievance_acas_basis",
    letterType: "grievance",
    jurisdiction: "UK",
    severity: "required",
    label: "ACAS Code basis stated",
    description:
      "Reference the ACAS Code of Practice on Disciplinary and Grievance Procedures so it is unambiguous that this is a Step 1 grievance.",
    match: { kind: "regex", value: "ACAS Code|Acas Code|grievance procedure", flags: "i" },
    recommendation:
      "Add a sentence like: 'I am writing to raise a formal grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures.'",
  },
  {
    id: "emp_uk_grievance_reservation",
    letterType: "grievance",
    jurisdiction: "UK",
    severity: "required",
    label: "Reservation of rights",
    description:
      "Close with an explicit reservation: '...all rights, including any statutory, contractual, or common-law remedies.' Failing to reserve may be cited later.",
    match: { kind: "regex", value: "reserve all (?:my )?rights|all rights are reserved|without prejudice to my rights", flags: "i" },
    recommendation:
      "Add: 'I reserve all my rights, including any statutory, contractual, or common-law remedies.'",
  },
  {
    id: "emp_uk_grievance_outcome",
    letterType: "grievance",
    jurisdiction: "UK",
    severity: "required",
    label: "Outcome sought stated",
    description:
      "A grievance without a remedy line is hard for the employer to act on and dilutes its evidential weight.",
    match: { kind: "regex", value: "outcome (?:i seek|sought|i am seeking|i ask for)|i ask that|i request that", flags: "i" },
    recommendation: "Add a clear outcome paragraph: what would resolve this for you?",
  },
  {
    id: "emp_us_grievance_protected_class",
    letterType: "grievance",
    jurisdiction: "US",
    severity: "recommended",
    label: "Protected-characteristic basis stated",
    description:
      "If discrimination is alleged, Title VII / ADA / ADEA require putting the employer on notice of the protected-characteristic basis (Faragher–Ellerth). 'I felt singled out' is too soft; 'I believe I was treated differently because of my [protected characteristic]' is the bar.",
    match: { kind: "regex", value: "because of my (?:race|sex|gender|age|disability|religion|national origin|pregnancy)|connected to my (?:race|sex|gender|age|disability|religion|national origin|pregnancy)", flags: "i" },
    recommendation:
      "If a protected characteristic is in play, add: 'I believe these matters are connected to my [characteristic], in violation of [Title VII / ADA / state law].'",
  },

  // ===== Resignation (constructive) =====
  {
    id: "emp_uk_constructive_in_response",
    letterType: "resignation_constructive",
    jurisdiction: "UK",
    severity: "required",
    label: "'In response to' breach language",
    description:
      "Constructive dismissal under s.95(1)(c) ERA 1996 requires the resignation be IN RESPONSE TO the breach. The wording matters.",
    match: { kind: "regex", value: "in response to|by reason of (?:your|the) (?:breach|conduct)|consequent upon", flags: "i" },
    recommendation:
      "Add: 'I resign in response to your fundamental breach of the contract of employment.'",
  },
  {
    id: "emp_uk_constructive_no_delay",
    letterType: "resignation_constructive",
    jurisdiction: "UK",
    severity: "required",
    label: "No-delay framing",
    description:
      "Delay between the breach and the resignation = affirmation, which kills the claim (Western Excavating v Sharp [1978]).",
    match: { kind: "regex", value: "without delay|with effect from (?:today|immediately)|immediate effect", flags: "i" },
    recommendation:
      "Add language showing immediacy: 'I resign with immediate effect, without delay.' Avoid 'I have been considering this for some time.'",
  },
  {
    id: "emp_uk_constructive_reservation",
    letterType: "resignation_constructive",
    jurisdiction: "UK",
    severity: "required",
    label: "Reservation including unfair dismissal",
    description:
      "Reserve all rights INCLUDING unfair dismissal proceedings, expressly. A bare 'reservation of rights' is weaker.",
    match: { kind: "regex", value: "(?:including |incl\\.\\s*)(?:my right to|claims for|proceedings for)?\\s*(?:unfair|constructive)\\s*dismissal|right to bring (?:tribunal|claim)", flags: "i" },
    recommendation:
      "Add: 'I reserve all rights including, without limitation, the right to bring a claim for constructive unfair dismissal.'",
  },

  // ===== Whistleblowing =====
  {
    id: "emp_uk_whistle_pida_attestation",
    letterType: "whistleblowing",
    jurisdiction: "UK",
    severity: "required",
    label: "PIDA / s.43A attestation",
    description:
      "Protection requires a reasonable belief that the information tends to show a relevant failure and that the disclosure is in the public interest (s.43B). 'Substantially true' is the stricter test for prescribed persons and wider disclosures only.",
    match: { kind: "regex", value: "(?:reasonable|reasonably)\\s+belie(?:f|ve).*(?:substantially\\s+true|public\\s+interest)|public\\s+interest.*(?:reasonable|reasonably)\\s+belie(?:f|ve)", flags: "is" },
    recommendation:
      "Add: 'I make this disclosure under s.43A Employment Rights Act 1996. I reasonably believe the information tends to show [the relevant failure] and that disclosure is in the public interest.'",
  },
  {
    id: "emp_uk_whistle_category_named",
    letterType: "whistleblowing",
    jurisdiction: "UK",
    severity: "required",
    label: "Statutory category named",
    description:
      "Name the s.43B category: criminal offence, breach of legal obligation, miscarriage of justice, danger to health & safety, sexual harassment, environmental damage, or deliberate concealment.",
    match: { kind: "regex", value: "criminal offence|breach of (?:a )?legal obligation|miscarriage of justice|health and safety|sexual harassment|environmental damage|deliberate concealment", flags: "i" },
    recommendation: "Identify which s.43B category your disclosure falls into.",
  },
  {
    id: "emp_us_whistle_statute",
    letterType: "whistleblowing",
    jurisdiction: "US",
    severity: "required",
    label: "Statutory basis named",
    description:
      "Name the statute (SOX §806, OSHA whistleblower provision, Cal. Lab. Code §1102.5, NLRA §7) so the protection is on the record.",
    match: { kind: "regex", value: "SOX|Sarbanes[- ]Oxley|18 U\\.?S\\.?C\\.?\\s*§?\\s*1514A|Lab(?:or)?\\.?\\s+Code\\s*§\\s*1102\\.5|NLRA|whistleblower", flags: "i" },
    recommendation: "Cite the relevant statutory protection (SOX §806, state law, NLRA §7, etc.).",
  },

  // ===== Subject Access Request =====
  {
    id: "emp_uk_sar_basis",
    letterType: "subject_access_request",
    jurisdiction: "UK",
    severity: "required",
    label: "UK GDPR Art. 15 cited",
    description:
      "Cite Article 15 UK GDPR so the 1-month statutory window starts ticking unambiguously.",
    match: { kind: "regex", value: "Article\\s*15|Art\\.\\s*15|UK GDPR|Data Protection Act\\s*2018|DPA\\s*2018", flags: "i" },
    recommendation:
      "Add: 'I make this request under Article 15 UK GDPR.'",
  },
  {
    id: "emp_us_sar_basis_california",
    letterType: "subject_access_request",
    jurisdiction: "US",
    states: ["CA"],
    severity: "required",
    label: "California Lab. Code §1198.5 cited",
    description:
      "California requires inspection within 30 days under §1198.5 (HR file) and 21 days under §226 (payroll).",
    match: { kind: "regex", value: "1198\\.5|California\\s+Labor\\s+Code|CCPA|CPRA|§\\s*226", flags: "i" },
    recommendation:
      "Cite California Labor Code §1198.5 (HR file) and/or §226 (payroll) and/or CCPA for the request.",
  },

  // ===== Appeal =====
  {
    id: "emp_uk_appeal_grounds",
    letterType: "appeal",
    jurisdiction: "UK",
    severity: "required",
    label: "Grounds enumerated",
    description:
      "Tribunals expect the canonical four grounds (procedural unfairness, factual error, severity disproportionate, new evidence) to be addressed in turn.",
    match: { kind: "regex", value: "procedural|factual error|severity|new evidence|disproportionate", flags: "i" },
    recommendation: "Structure the body around the four canonical grounds.",
  },
  {
    id: "emp_uk_appeal_accompaniment",
    letterType: "appeal",
    jurisdiction: "UK",
    severity: "required",
    label: "Right to be accompanied requested",
    description:
      "s.10 Employment Relations Act 1999: request the right to be accompanied at the appeal hearing.",
    match: { kind: "regex", value: "right to be accompanied|colleague or trade union", flags: "i" },
    recommendation:
      "Add: 'I request the right to be accompanied at the appeal hearing in accordance with s.10 ERelA 1999.'",
  },

  // ===== Pay Dispute =====
  {
    id: "emp_uk_paydispute_s13",
    letterType: "pay_dispute",
    jurisdiction: "UK",
    severity: "required",
    label: "s.13 ERA 1996 reference",
    description: "Cite the unauthorised deduction from wages provision; preserves the limitation argument.",
    match: { kind: "regex", value: "section\\s*13|s\\.\\s*13|unauthorised deduction|unauthorized deduction", flags: "i" },
    recommendation:
      "Add: 'I treat this underpayment as an unauthorised deduction from wages under s.13 Employment Rights Act 1996.'",
  },

  // ===== Settlement counter-offer =====
  {
    id: "emp_settlement_wp_header",
    letterType: "settlement_counter_offer",
    jurisdiction: "UK",
    severity: "required",
    label: "Without Prejudice & Subject to Contract header",
    description:
      "All settlement correspondence must be marked 'Without Prejudice and Subject to Contract' to preserve privilege.",
    match: { kind: "regex", value: "without prejudice (?:and|&) subject to contract", flags: "i" },
    recommendation:
      "Toggle the Without Prejudice header in the editor, or insert: 'Without Prejudice and Subject to Contract' at the top.",
  },

  // ===== Constructive dismissal warning =====
  {
    id: "emp_uk_breach_remedy_deadline",
    letterType: "constructive_dismissal_warning",
    jurisdiction: "UK",
    severity: "required",
    label: "Specific remedy deadline",
    description:
      "A breach notice without a deadline is weak. Set a concrete date by which the employer must remedy.",
    match: { kind: "regex", value: "by\\s+\\d{1,2}\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)|within\\s+\\d+\\s+(?:working )?days", flags: "i" },
    recommendation: "Add a specific remedy deadline (e.g. 'by 16 May 2026' or 'within 7 working days').",
  },

  // ===== ACAS EC Notification / Tribunal Cover =====
  {
    id: "emp_uk_acas_limitation",
    letterType: "acas_ec_notification",
    jurisdiction: "UK",
    severity: "required",
    label: "Limitation period referenced",
    description: "Reference s.111 ERA 1996 / the tribunal limitation period so it's clear you're acting in time.",
    match: { kind: "regex", value: "section\\s*111|s\\.\\s*111|limitation period|(three|six|3|6)[- ]month", flags: "i" },
    recommendation:
      "Add: 'I am notifying ACAS of a prospective claim within the s.111 ERA 1996 limitation period (6 months less one day for acts on or after 1 October 2026, 3 months less one day before that).'",
  },
];
