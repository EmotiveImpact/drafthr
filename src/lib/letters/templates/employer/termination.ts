import type { LetterTemplate } from "../types";

/**
 * Reference template authored by Claude Opus 4.7 acting as a senior UK
 * employment-law editor. Use this as the gold standard for tone, register,
 * structural fidelity, and statutory anchoring across employer-mode letters.
 */
export const TERMINATION_UK: LetterTemplate = {
  letterType: "termination",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Termination):
- This letter is a "potentially fair" dismissal under s.98 Employment Rights Act 1996. Name the s.98 reason expressly (capability, conduct, redundancy, statutory illegality, or some other substantial reason).
- Comply with the ACAS Code of Practice on Disciplinary and Grievance Procedures. Reference the disciplinary hearing date and outcome.
- The minimum statutory notice (s.86 ERA) is 1 week after 1 month of service, then 1 week per year of service up to a maximum of 12 weeks. Apply contractual notice if greater.
- Final pay treatment: state the pay date, accrued holiday pay (Working Time Regulations 1998), outstanding bonuses, and any benefits-in-kind cessation.
- A right of appeal in writing is mandatory: name the appeal officer (must be different from the dismissing officer where possible), give a deadline (typically 5 working days), and reference the right to be accompanied (s.10 ERelA 1999).
- Register: formal, dignified, factual. Avoid editorialising, expressions of regret that may be construed as admission, or commentary on the employee's character beyond the facts found.
- British English spelling throughout (organisation, behaviour, recognise).`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then the employee's full legal name and home address on separate lines, wrapped in a single <p> with <br>. If the employer has letterhead, suppress the sender's address.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format ('12 May 2026'), not '12/05/2026'.",
        "MUST NOT include any greeting or 'Dear' here.",
        "MUST place the date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>Mr Daniel Okafor<br>14 Rosewood Avenue<br>London N4 2QX</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject line in <strong>. Identify the letter precisely — 'Notice of Termination of Employment' followed by a short qualifier (gross misconduct, capability, redundancy, etc.).",
      scaffold: `<p><strong>Notice of Termination of Employment — {{terminationGround}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the s.98 ground in plain language.",
        "MUST NOT include 'Without Prejudice' for an open termination — that header is reserved for settlement correspondence.",
      ],
      example: `<p><strong>Notice of Termination of Employment — Gross Misconduct</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. Use 'Dear Mr/Ms/Dr {Surname},'. Do not use a first name unless one is supplied as the preferred form. End with a comma.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title or honorific not supplied.",
      ],
      example: `<p>Dear Mr Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Opening — decision and basis",
      instruction:
        "State the decision plainly in the first sentence. Reference the disciplinary hearing date, the panel, and the s.98 ERA reason found. Two short paragraphs at most. No expressions of regret beyond a single restrained acknowledgement.",
      scaffold: `<p>I am writing to confirm the outcome of the disciplinary hearing held on {{hearingDate}}, which was chaired by {{hearingChairName}}, {{hearingChairTitle}}. Having considered the evidence, the panel has decided that your employment with {{employerLegalName}} will be terminated on the grounds of {{s98Reason}}.</p>
<p>The findings were communicated to you orally at the close of the hearing. This letter sets out those findings, the resulting decision, and the practical arrangements for the end of your employment.</p>`,
      constraints: [
        "MUST name the s.98 reason expressly (capability, conduct, redundancy, statutory illegality, or 'some other substantial reason').",
        "MUST reference the disciplinary hearing by date and chair.",
        "MUST NOT include 'we regret' or 'unfortunately' — these can be construed as expressions of doubt about the decision.",
        "MUST NOT make findings of fact beyond those communicated at the hearing.",
      ],
      example: `<p>I am writing to confirm the outcome of the disciplinary hearing held on 28 April 2026, which was chaired by Priya Sharma, HR Director. Having considered the evidence, the panel has decided that your employment with Acme Holdings Limited will be terminated on the grounds of gross misconduct.</p>
<p>The findings were communicated to you orally at the close of the hearing. This letter sets out those findings, the resulting decision, and the practical arrangements for the end of your employment.</p>`,
    },
    {
      sectionId: "body",
      title: "Findings and reasoning",
      instruction:
        "Set out the findings of fact the panel made and how those facts engage the s.98 reason. Use 2–3 paragraphs of prose. Cite the relevant policy or contract clause where the conduct breaches it. Avoid restating the entire investigation — summarise.",
      scaffold: `<p>The panel found, on the balance of probabilities, that {{factualFinding1}}. {{factualFinding2}}.</p>
<p>This conduct constitutes a fundamental breach of the {{policyOrClauseReference}} and amounts to {{s98Reason}} as defined in s.98(2) of the Employment Rights Act 1996. The panel considered alternative sanctions including a final written warning but concluded that the seriousness of the breach made dismissal the appropriate sanction.</p>`,
      constraints: [
        "MUST tie the conduct to a specific policy clause, contract term, or statutory duty.",
        "MUST refer to s.98 ERA expressly when relying on it.",
        "MUST NOT speculate beyond findings of fact made at the hearing.",
        "MUST NOT use intensifiers ('serious', 'severe', 'egregious') — let the facts carry the weight.",
      ],
      example: `<p>The panel found, on the balance of probabilities, that on 14 April 2026 you accessed customer financial records that fell outside your authorised remit, and that on 16 April 2026 you forwarded portions of those records to an external email address.</p>
<p>This conduct constitutes a fundamental breach of clauses 7.2 and 11.4 of your Employment Contract and of the Acme Information Security Policy, and amounts to gross misconduct as defined in s.98(2)(b) of the Employment Rights Act 1996. The panel considered alternative sanctions including a final written warning but concluded that the seriousness of the breach made dismissal the appropriate sanction.</p>`,
    },
    {
      sectionId: "terms",
      title: "Notice, last day, and final pay",
      instruction:
        "State whether notice is given or whether the dismissal is summary (no notice). State the last day of employment, the final pay date, accrued holiday pay treatment, and any outstanding bonuses or benefits cessation. Reference s.86 ERA where statutory minimum notice is being given.",
      scaffold: `<p>Your last day of employment will be {{lastDay}}. {{noticeTreatmentParagraph}}</p>
<p>Your final salary, including pay for the period to {{lastDay}} and {{accruedHolidayDays}} days of accrued but untaken holiday calculated under the Working Time Regulations 1998, will be paid into your nominated account on {{finalPayDate}}. Your participation in the {{pensionScheme}} and {{benefitsScheme}} will end on {{lastDay}}.</p>`,
      constraints: [
        "MUST distinguish between summary dismissal (no notice) and dismissal with notice.",
        "MUST cite s.86 ERA when paying statutory minimum notice.",
        "MUST state accrued holiday pay treatment under the Working Time Regulations 1998.",
        "MUST NOT include a non-compete reminder unless one was contractually agreed.",
      ],
      example: `<p>Your last day of employment will be 12 May 2026. As the panel has found gross misconduct, the company is entitled to and will dismiss you summarily under clause 14.3 of your Employment Contract; no notice or pay in lieu of notice is owed.</p>
<p>Your final salary, including pay for the period to 12 May 2026 and 6.5 days of accrued but untaken holiday calculated under the Working Time Regulations 1998, will be paid into your nominated account on 28 May 2026. Your participation in the Acme Group Pension Scheme and the company medical plan will end on 12 May 2026.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Return of property and confidentiality",
      instruction:
        "List the property to be returned and remind the employee of continuing confidentiality and post-termination obligations. One short paragraph. Do not enlarge restrictive covenants beyond the contract.",
      scaffold: `<p>You are required to return all company property in your possession, including {{propertyList}}, by {{propertyReturnDate}}. Your obligations of confidentiality under clause {{confidentialityClause}} of your Employment Contract continue beyond the termination of your employment, as do any post-termination restrictions set out in clause {{restrictiveCovenantClause}}.</p>`,
      constraints: [
        "MUST list specific property categories where supplied.",
        "MUST refer to specific contract clauses by number, not in general terms.",
        "MUST NOT introduce any new restriction not in the contract.",
      ],
      example: `<p>You are required to return all company property in your possession, including your laptop, mobile telephone, access card, and any printed materials marked confidential, by 19 May 2026. Your obligations of confidentiality under clause 11 of your Employment Contract continue beyond the termination of your employment, as do the post-termination restrictions set out in clause 18.</p>`,
    },
    {
      sectionId: "appeal_rights",
      title: "Right of appeal",
      instruction:
        "Mandatory section. Name the appeal officer, the deadline (typically 5 working days from the date of this letter), the format (in writing, setting out grounds), and the right to be accompanied under s.10 ERelA 1999.",
      scaffold: `<p>You have the right to appeal this decision. To do so, please write to {{appealOfficerName}}, {{appealOfficerTitle}}, at {{appealOfficerEmailOrAddress}} within {{appealDeadlineWorkingDays}} working days of the date of this letter, setting out the grounds of your appeal. You are entitled to be accompanied at any appeal hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>`,
      constraints: [
        "MUST name the appeal officer and how to contact them.",
        "MUST give a specific deadline (in working days).",
        "MUST cite s.10 ERelA 1999 for the right to be accompanied.",
        "MUST NOT name the dismissing officer as the appeal officer.",
      ],
      example: `<p>You have the right to appeal this decision. To do so, please write to Aisha Khan, Group HR Director, at aisha.khan@acme.example within 5 working days of the date of this letter, setting out the grounds of your appeal. You are entitled to be accompanied at any appeal hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing and sign-off",
      instruction:
        "One short paragraph. A single restrained acknowledgement is permitted (e.g. 'I do not take this decision lightly'). Sign off 'Yours sincerely,' (named recipient).",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,' (named recipient), not 'Yours faithfully,'.",
        "MUST NOT use 'Best regards' or any informal sign-off.",
        "MUST keep any acknowledgement to a single restrained sentence.",
      ],
      example: `<p>I recognise that this is a difficult outcome and the company will provide reasonable assistance with handover and any reference enquiries on a fact-only basis.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Three lines wrapped in a <p> with <br>: signatory name, signatory title, employer legal name. Leave space above for a wet signature.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines: name, title, employer.",
        "MUST NOT include any marketing footer or disclaimer.",
      ],
      example: `<p>Priya Sharma<br>HR Director<br>Acme Holdings Limited</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "hearing_minutes",
      label: "Hearing minutes",
      required: true,
      description: "Notes from the dismissal hearing — attendees, allegations put, responses given.",
      expectedKinds: ["document", "note"],
    },
    {
      key: "allegation_evidence",
      label: "Allegation evidence",
      required: true,
      description: "The evidence relied on by the panel, such as emails, witness statements, reports, or records.",
      expectedKinds: ["email", "document", "screenshot"],
    },
    {
      key: "prior_warnings",
      label: "Prior warnings on file",
      required: false,
      description: "Any active warnings relevant to sanction proportionality and the dismissal decision.",
      expectedKinds: ["document"],
    },
    {
      key: "policy_excerpts",
      label: "Policy excerpts",
      required: false,
      description: "The conduct or capability policy sections applied to the decision.",
      expectedKinds: ["document"],
    },
  ],
};

/**
 * US termination — at-will, with documentation grade sufficient to defeat
 * disparate-treatment claims under Title VII / ADA / ADEA / state analogs.
 */
export const TERMINATION_US: LetterTemplate = {
  letterType: "termination",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Termination):
- US employment is presumptively at-will (except Montana after probation, MCA 39-2-904). The letter does not need to state a statutory reason but should document a legitimate, non-discriminatory business reason to defeat claims under Title VII (42 USC 2000e-2), the ADA (42 USC 12112), the ADEA (29 USC 623), the FMLA (29 USC 2615), and state analogs (e.g., FEHA Cal. Gov. Code 12940).
- Final-pay timing is state-specific and strict. California: all final wages, including accrued unused vacation, due immediately on the day of termination for involuntary separation under Lab. Code 201, with waiting-time penalties under Lab. Code 203 for non-compliance. New York: by the next regular payday under Labor Law 191. Texas: next regular payday under Lab. Code 61.014. Massachusetts: on the day of discharge under M.G.L. c.149 148. Verify the applicable state rule.
- Accrued unused PTO must be paid out at termination in CA, CO, MA, IL, NE, ND where vested under company policy.
- COBRA continuation election notice must be issued to the qualified beneficiary within 14 days of the qualifying event under 29 USC 1166 and 29 CFR 2590.606-4.
- Where the termination is part of a reduction in force of 50+ at a single site by a 100+ employer, the WARN Act 60-day notice (29 USC 2102) and any state mini-WARN (Cal. Lab. Code 1400 et seq., NY Labor Law 860) apply — those situations should use the redundancy/layoff template, not this one.
- For employees aged 40+, any release of ADEA claims must comply with the OWBPA (29 USC 626(f)): 21 days to consider (45 in a group exit), 7 days to revoke, written, advice to consult counsel.
- Register: factual, professional, dignified. No editorializing or character commentary. American English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'), then the employee's full legal name and home address on separate lines, wrapped in a single <p> with <br>.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format ('May 12, 2026'), not '5/12/2026'.",
        "MUST NOT include any greeting or 'Dear' here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>May 12, 2026<br><br>Mr. Daniel Okafor<br>240 Pine Street, Apt 7<br>San Francisco, CA 94111</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject line in <strong>: 'Notice of Termination of Employment' with a brief qualifier (cause / performance / restructuring).",
      scaffold: `<p><strong>Notice of Termination of Employment — {{terminationContext}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the context of the termination plainly.",
        "MUST NOT include 'Without Prejudice' (that is a UK convention not used in US correspondence).",
      ],
      example: `<p><strong>Notice of Termination of Employment — Performance</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr./Ms./Dr. {Surname},'. Do not use a first name in a formal termination letter.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
        "MUST NOT use first-name salutation.",
      ],
      example: `<p>Dear Mr. Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Opening — decision and basis",
      instruction:
        "State the decision plainly in the first sentence. Reference the meeting at which it was communicated. State that the termination is effective on a specific date. One short paragraph.",
      scaffold: `<p>This letter confirms the decision communicated to you at our meeting on {{meetingDate}} that your employment with {{employerLegalName}} will end effective {{terminationEffectiveDate}}. The decision was made by {{decisionMakerName}}, {{decisionMakerTitle}}, after careful consideration.</p>`,
      constraints: [
        "MUST state the decision and the effective date.",
        "MUST reference the in-person communication meeting by date.",
        "MUST NOT include 'we regret' or expressions of doubt.",
        "MUST NOT promise reconsideration.",
      ],
      example: `<p>This letter confirms the decision communicated to you at our meeting on May 9, 2026 that your employment with Acme Inc. will end effective May 12, 2026. The decision was made by Daniel Okafor, Director of Engineering, after careful consideration.</p>`,
    },
    {
      sectionId: "body",
      title: "Reason and findings",
      instruction:
        "State the legitimate business reason for the termination plainly: documented performance concerns, conduct, restructuring, or business reasons. Reference any prior warnings, performance plan, or investigation. Two short paragraphs.",
      scaffold: `<p>The basis for the decision is {{businessReasonSummary}}. {{factualSupportParagraph}}</p>
<p>The decision is being made on the basis of these documented concerns. Your employment with {{employerLegalName}} has been at-will throughout, meaning the company may terminate the employment relationship at any time, with or without cause and with or without notice.</p>`,
      constraints: [
        "MUST state a specific legitimate business reason.",
        "MUST reference any prior warning, PIP, or investigation by date.",
        "MUST confirm the at-will basis of the relationship.",
        "MUST NOT include character judgments or speculative findings.",
        "MUST NOT reference protected characteristics or activity.",
      ],
      example: `<p>The basis for the decision is the failure to meet the performance expectations documented in the Performance Improvement Plan dated February 12, 2026, which was reviewed at the 60-day check-in on April 14, 2026 and the 90-day final review on May 9, 2026. The specific concerns documented in the plan, including the customer-escalation handling expectation and the sprint-goal completion expectation, were not met by the close of the review period.</p>
<p>The decision is being made on the basis of these documented concerns. Your employment with Acme Inc. has been at-will throughout, meaning the company may terminate the employment relationship at any time, with or without cause and with or without notice.</p>`,
    },
    {
      sectionId: "terms",
      title: "Final pay, PTO, benefits, and COBRA",
      instruction:
        "State the last day worked, final pay treatment in line with the applicable state final-pay rule, accrued PTO payout, benefits termination date, and COBRA notice timing. Cite Cal. Lab. Code 201 / NY Labor Law 191 / etc. as applicable. Reference 29 USC 1166 for COBRA.",
      scaffold: `<p>Your last day of employment is {{terminationEffectiveDate}}. Your final paycheck, including all earned but unpaid wages through your last day and {{accruedPtoHours}} hours of accrued unused paid time off, will be issued {{finalPayTimingStatement}} in accordance with {{stateFinalPayStatute}}, less applicable federal, state, and local taxes and authorized deductions.</p>
<p>Your participation in the company's medical, dental, vision, and life insurance plans will end on {{benefitsEndDate}}. You will receive a separate COBRA continuation election notice within 14 days under 29 USC 1166 and 29 CFR 2590.606-4, which will explain your right to continue your group health coverage at your own cost. Your participation in the company's 401(k) plan will be addressed in a separate communication from the plan administrator.</p>`,
      constraints: [
        "MUST cite the applicable state final-pay statute (Cal. Lab. Code 201, NY Labor Law 191, Texas Lab. Code 61.014, M.G.L. c.149 148, etc.).",
        "MUST state final-pay timing precisely (immediate / next regular payday / specific date).",
        "MUST address accrued PTO payout under state law where applicable.",
        "MUST cite 29 USC 1166 for the COBRA election notice.",
        "MUST NOT promise severance unless authorized.",
      ],
      example: `<p>Your last day of employment is May 12, 2026. Your final paycheck, including all earned but unpaid wages through your last day and 64 hours of accrued unused paid time off, will be issued to you on May 12, 2026 in accordance with California Labor Code section 201, less applicable federal, state, and local taxes and authorized deductions.</p>
<p>Your participation in the company's medical, dental, vision, and life insurance plans will end on May 31, 2026. You will receive a separate COBRA continuation election notice within 14 days under 29 USC 1166 and 29 CFR 2590.606-4, which will explain your right to continue your group health coverage at your own cost. Your participation in the company's 401(k) plan will be addressed in a separate communication from the plan administrator.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Property return and continuing obligations",
      instruction:
        "List company property to be returned and remind the employee of continuing confidentiality and IP obligations under the Proprietary Information and Inventions Agreement. Do not enlarge restrictive covenants beyond the contract.",
      scaffold: `<p>You are required to return all company property in your possession by {{propertyReturnDate}}, including {{propertyList}}. Your continuing obligations of confidentiality and intellectual property assignment under the Proprietary Information and Inventions Agreement you signed on {{piiaSignedDate}} survive the end of your employment, as do any other post-employment restrictions specifically agreed in writing.</p>`,
      constraints: [
        "MUST list specific property categories where supplied.",
        "MUST reference the PIIA by date.",
        "MUST NOT introduce a non-compete in California, North Dakota, Oklahoma, or Minnesota.",
        "MUST NOT enlarge restrictive covenants beyond the contract.",
      ],
      example: `<p>You are required to return all company property in your possession by May 14, 2026, including your laptop, badge, mobile device, and any printed materials marked confidential. Your continuing obligations of confidentiality and intellectual property assignment under the Proprietary Information and Inventions Agreement you signed on June 1, 2024 survive the end of your employment, as do any other post-employment restrictions specifically agreed in writing.</p>`,
    },
    {
      sectionId: "appeal_rights",
      title: "Internal review and references",
      instruction:
        "Offer an internal review contact for any factual matters the employee believes were not considered. State the company's reference policy (typically dates of employment and last-held title only). There is no statutory right of appeal in the US.",
      scaffold: `<p>If you believe there are matters the company should review in connection with this decision, you may write to {{reviewContactName}}, {{reviewContactTitle}}, at {{reviewContactEmail}} within {{reviewDeadlineBusinessDays}} business days of the date of this letter. Reference enquiries from prospective employers will be handled by the People team and confined to confirmation of dates of employment and last-held position, in line with company policy.</p>`,
      constraints: [
        "MUST name an internal review contact.",
        "MUST give a specific deadline (business days).",
        "MUST state the reference policy briefly.",
        "MUST NOT mischaracterize the internal review as a statutory right of appeal.",
      ],
      example: `<p>If you believe there are matters the company should review in connection with this decision, you may write to Helen Carter, Vice President of People, at helen.carter@acme.example within 5 business days of the date of this letter. Reference enquiries from prospective employers will be handled by the People team and confined to confirmation of dates of employment and last-held position, in line with company policy.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph; a single restrained acknowledgement is permitted. End with 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST keep any acknowledgement to a single restrained sentence.",
        "MUST NOT use 'Best regards' or other informal sign-off.",
      ],
      example: `<p>The People team will be in touch separately with offboarding logistics and any final administrative steps.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Three lines: signatory name, signatory title, employer legal name, separated by <br>.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>Vice President, People<br>Acme Inc.</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "hearing_minutes",
      label: "Hearing minutes",
      required: true,
      description: "Notes from the dismissal hearing — attendees, allegations put, responses given.",
      expectedKinds: ["document", "note"],
    },
    {
      key: "allegation_evidence",
      label: "Allegation evidence",
      required: true,
      description: "What the panel relied on: emails, witness statements, expert reports, prior records.",
      expectedKinds: ["email", "document", "screenshot"],
    },
    {
      key: "prior_warnings",
      label: "Prior warnings on file",
      required: true,
      description: "Any active warnings — critical for sanction proportionality and unfair-dismissal defence.",
      expectedKinds: ["document"],
    },
    {
      key: "policy_excerpts",
      label: "Policy excerpts",
      required: false,
      description: "Sections of the conduct / capability policy applied to the dismissal decision.",
      expectedKinds: ["document"],
    },
    {
      key: "service_record",
      label: "Service record",
      required: false,
      description: "Continuous service start, last performance review, holiday accrual snapshot for the dismissal letter.",
      expectedKinds: ["document"],
    },
  ],
};
