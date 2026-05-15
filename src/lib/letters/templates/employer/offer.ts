import type { LetterTemplate } from "../types";

export const OFFER_UK: LetterTemplate = {
  letterType: "offer",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Offer of Employment):
- The offer letter is the precursor to the s.1 Employment Rights Act 1996 written statement of particulars, which must be issued on or before day one of employment. Reference that the s.1 statement will follow.
- The offer is conditional on satisfactory right-to-work documentation under the Immigration, Asylum and Nationality Act 2006 (List A / List B / Home Office share code).
- Auto-enrolment under the Pensions Act 2008 applies for eligible jobholders aged 22+ earning above the qualifying earnings threshold. Reference the company pension scheme.
- Statutory minimum notice (s.86 ERA 1996): 1 week after 1 month of service, then 1 week per year of service up to 12 weeks. Contractual notice may be longer.
- Annual leave: minimum 5.6 weeks including bank holidays under the Working Time Regulations 1998.
- Restrictive covenants must be reasonable in scope and duration; do not extend beyond what is reasonably necessary to protect legitimate business interests.
- Register: warm but precise. British English throughout (organisation, recognise, programme, behaviour).`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then the candidate's full legal name and home address on separate lines, wrapped in a single <p> with <br>. If the employer has letterhead, suppress the sender address.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{candidateLegalName}}<br>{{candidateAddressLine1}}<br>{{candidateAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format ('12 May 2026'), not '12/05/2026'.",
        "MUST NOT include any greeting or 'Dear' here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>Ms Aisha Khan<br>27 Belgrave Crescent<br>Manchester M14 5RT</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject line in <strong>. Identify the letter precisely: 'Offer of Employment — {Job Title}'.",
      scaffold: `<p><strong>Offer of Employment — {{jobTitle}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST include the job title exactly as offered.",
        "MUST NOT include 'Subject to Contract' (the letter is the offer).",
      ],
      example: `<p><strong>Offer of Employment — Senior Software Engineer</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. Use 'Dear Mr/Ms/Dr {Surname},' unless a preferred first name is supplied. End with a comma.",
      scaffold: `<p>Dear {{candidateHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title or honorific not supplied.",
      ],
      example: `<p>Dear Ms Khan,</p>`,
    },
    {
      sectionId: "opening",
      title: "Opening — offer of employment",
      instruction:
        "State that the company is pleased to offer employment, naming the role and the proposed start date. Reference any prior interview or recruitment process. One short paragraph.",
      scaffold: `<p>Following your recent interviews with {{interviewerNames}}, I am pleased to offer you the role of {{jobTitle}} at {{employerLegalName}}, reporting to {{lineManagerName}}, {{lineManagerTitle}}. Subject to the conditions set out below, your proposed start date is {{startDate}}.</p>`,
      constraints: [
        "MUST name the role, line manager, and start date.",
        "MUST reference the recruitment context briefly (interviews, conversations).",
        "MUST NOT promise the role is permanent or guaranteed beyond the contractual position.",
      ],
      example: `<p>Following your recent interviews with Daniel Okafor and Priya Sharma, I am pleased to offer you the role of Senior Software Engineer at Acme Holdings Limited, reporting to Daniel Okafor, Head of Engineering. Subject to the conditions set out below, your proposed start date is 1 June 2026.</p>`,
    },
    {
      sectionId: "body",
      title: "Position details",
      instruction:
        "Set out the job title, reporting line, principal place of work, hours, and a brief summary of duties. Reference that a fuller written statement of particulars under s.1 ERA 1996 will follow on or before day one. One to two paragraphs.",
      scaffold: `<p>The role is based at {{workLocation}}, with the contractual flexibility set out in the written statement of particulars. Your principal duties will include {{dutiesSummary}}, together with such other duties as may reasonably be required.</p>
<p>A full written statement of particulars under section 1 of the Employment Rights Act 1996 will be provided on or before your first day of employment, setting out the complete terms and conditions of your employment.</p>`,
      constraints: [
        "MUST reference s.1 ERA 1996 written statement.",
        "MUST identify the principal place of work.",
        "MUST summarise duties at a high level.",
        "MUST NOT promise specific projects or team allocations beyond the role description.",
      ],
      example: `<p>The role is based at our Manchester office, with the contractual flexibility for hybrid working set out in the written statement of particulars. Your principal duties will include leading the design and implementation of platform services within the Engineering function, together with such other duties as may reasonably be required.</p>
<p>A full written statement of particulars under section 1 of the Employment Rights Act 1996 will be provided on or before your first day of employment, setting out the complete terms and conditions of your employment.</p>`,
    },
    {
      sectionId: "compensation",
      title: "Compensation",
      instruction:
        "State base salary with currency and frequency, payment cadence, any bonus or equity, and that amounts are gross. Use prose unless comparing two figures. Reference auto-enrolment pension where relevant.",
      scaffold: `<p>Your gross annual salary will be {{currencySymbol}}{{baseSalaryGross}}, payable monthly in arrears on or about the {{payDayOfMonth}} of each month by direct credit to your nominated bank account, subject to deductions for income tax and National Insurance. {{bonusParagraph}}</p>`,
      constraints: [
        "MUST state amounts as gross (before tax).",
        "MUST state the pay cadence (monthly in arrears) and pay day.",
        "MUST NOT promise discretionary bonuses as guaranteed.",
        "MUST use the GBP symbol '£' for sterling.",
      ],
      example: `<p>Your gross annual salary will be £72,000, payable monthly in arrears on or about the 25th of each month by direct credit to your nominated bank account, subject to deductions for income tax and National Insurance. You will be eligible to participate in the company's discretionary annual bonus scheme with an on-target award of 12% of base salary, governed by the scheme rules in force from time to time.</p>`,
    },
    {
      sectionId: "benefits",
      title: "Benefits and leave",
      instruction:
        "Summarise pension, healthcare, annual leave, and any other benefits. Reference auto-enrolment under the Pensions Act 2008 where applicable. Annual leave must meet the WTR 1998 minimum (5.6 weeks including bank holidays).",
      scaffold: `<p>You will be entitled to {{annualLeaveDays}} days of paid annual leave per holiday year (1 January to 31 December), in addition to public and bank holidays in {{leaveJurisdiction}}, in accordance with the Working Time Regulations 1998. You will be eligible to join the {{pensionSchemeName}} from your first day of employment, with employer contributions of {{employerPensionPercent}}% and employee contributions of {{employeePensionPercent}}%, in line with the auto-enrolment provisions of the Pensions Act 2008. The company will also enrol you in the {{medicalPlanName}} and the {{lifeAssurancePlanName}}, subject to the terms of those schemes.</p>`,
      constraints: [
        "MUST cite the Working Time Regulations 1998 for annual leave.",
        "MUST reference the Pensions Act 2008 for auto-enrolment where applicable.",
        "MUST state annual leave as days excluding bank holidays, with bank holidays additional.",
        "MUST NOT promise benefits not yet contractually agreed.",
      ],
      example: `<p>You will be entitled to 25 days of paid annual leave per holiday year (1 January to 31 December), in addition to public and bank holidays in England and Wales, in accordance with the Working Time Regulations 1998. You will be eligible to join the Acme Group Pension Scheme from your first day of employment, with employer contributions of 6% and employee contributions of 5%, in line with the auto-enrolment provisions of the Pensions Act 2008. The company will also enrol you in the Acme Private Medical Plan and the Acme Life Assurance Plan (4x salary), subject to the terms of those schemes.</p>`,
    },
    {
      sectionId: "terms",
      title: "Working hours, notice, and other terms",
      instruction:
        "State weekly working hours, probation period (if any), and notice period. Cite s.86 ERA 1996 minimum notice. Reference any restrictive covenants and confidentiality only at the level of pointing to the contract.",
      scaffold: `<p>Your normal working hours will be {{workingHoursPerWeek}} hours per week, {{workingPattern}}. You will serve a probationary period of {{probationMonths}} months, during which the notice period on either side will be {{probationNoticeWeeks}} {{probationNoticeUnit}}. Following successful completion of probation, the notice period will be {{postProbationNoticeWeeks}} {{postProbationNoticeUnit}} from either party, subject always to the statutory minimum under section 86 of the Employment Rights Act 1996. The full terms, including provisions on confidentiality, intellectual property, and post-termination restrictions, are set out in the Employment Contract enclosed with this letter.</p>`,
      constraints: [
        "MUST cite s.86 ERA 1996 for statutory minimum notice.",
        "MUST state weekly hours and working pattern.",
        "MUST refer to the Employment Contract for fuller terms; do not summarise restrictive covenants here.",
        "MUST NOT introduce a non-compete that exceeds the contract.",
      ],
      example: `<p>Your normal working hours will be 37.5 hours per week, Monday to Friday, with hybrid working in line with the company's Hybrid Working Policy. You will serve a probationary period of 6 months, during which the notice period on either side will be 1 week. Following successful completion of probation, the notice period will be 3 months from either party, subject always to the statutory minimum under section 86 of the Employment Rights Act 1996. The full terms, including provisions on confidentiality, intellectual property, and post-termination restrictions, are set out in the Employment Contract enclosed with this letter.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Conditions of offer",
      instruction:
        "State that the offer is conditional on right-to-work, references, background checks, and any role-specific requirements (DBS, professional registration, medical clearance). Cite the Immigration, Asylum and Nationality Act 2006.",
      scaffold: `<p>This offer is conditional on: (i) satisfactory evidence of your right to work in the United Kingdom under the Immigration, Asylum and Nationality Act 2006; (ii) receipt of two satisfactory employment references; (iii) {{additionalConditionsList}}; and (iv) your acceptance of this offer in accordance with the terms set out below. The company reserves the right to withdraw this offer if any of these conditions is not met to its reasonable satisfaction.</p>`,
      constraints: [
        "MUST cite the Immigration, Asylum and Nationality Act 2006.",
        "MUST list role-specific conditions (DBS, registration, medical) where supplied.",
        "MUST NOT make conditions impossible or discriminatory in effect.",
      ],
      example: `<p>This offer is conditional on: (i) satisfactory evidence of your right to work in the United Kingdom under the Immigration, Asylum and Nationality Act 2006; (ii) receipt of two satisfactory employment references; (iii) a satisfactory basic Disclosure and Barring Service check; and (iv) your acceptance of this offer in accordance with the terms set out below. The company reserves the right to withdraw this offer if any of these conditions is not met to its reasonable satisfaction.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Acceptance and deadline",
      instruction:
        "State how to accept (countersigning the enclosed contract or replying in writing) and the deadline. Provide a specific date.",
      scaffold: `<p>To accept this offer, please sign and return the enclosed Employment Contract by {{acceptanceDeadline}}. If you have any questions before then, please contact {{recruiterName}}, {{recruiterTitle}}, at {{recruiterEmail}}.</p>`,
      constraints: [
        "MUST give a specific deadline date.",
        "MUST name a contact for questions.",
        "MUST NOT use phrases like 'soon as possible' without a date.",
      ],
      example: `<p>To accept this offer, please sign and return the enclosed Employment Contract by 22 May 2026. If you have any questions before then, please contact Priya Sharma, Talent Partner, at priya.sharma@acme.example.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph welcoming the candidate to the team, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{warmClosingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,' (named recipient).",
        "MUST keep warmth restrained and professional.",
        "MUST NOT use 'Best regards' or other informal sign-off.",
      ],
      example: `<p>We very much look forward to welcoming you to Acme Holdings and to your contribution to the Engineering team.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Three lines: signatory name, signatory title, employer legal name, separated by <br> in a single <p>.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines: name, title, employer.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Helen Carter<br>Director of People<br>Acme Holdings Limited</p>`,
    },
  ],
};

export const OFFER_US: LetterTemplate = {
  letterType: "offer",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Offer of Employment):
- This is an offer letter, NOT a contract for any specific term. The letter MUST contain an explicit at-will statement except where prohibited (Montana good-cause after probation under MCA 39-2-904).
- FLSA classification (exempt vs non-exempt) must be stated; the duties must support the classification under 29 USC 213(a)(1) and 29 CFR Part 541.
- Pay-transparency states (CA Lab. Code 432.3, NY Labor Law 194-b, CO C.R.S. 8-5-201, WA RCW 49.58.110, IL P.A. 103-0539, MA M.G.L. c.149 105E, etc.) require a pay range or rate disclosure. Include the salary or salary range explicitly when posted in those jurisdictions.
- Employment is contingent on completion of Form I-9 within 3 business days under the Immigration Reform and Control Act 1986; reference E-Verify if the employer participates.
- Non-compete provisions are unenforceable in California (Bus. & Prof. Code 16600), North Dakota (NDCC 9-08-06), Oklahoma (15 OS 217), Minnesota (effective 1 July 2023), and increasingly restricted under FTC and state activity. Do not include a non-compete in those states.
- For California, a Wage Theft Prevention Act notice (Lab. Code 2810.5) must be issued at hire; reference it.
- Register: warm, professional, precise. American English throughout (organization, recognize, program, behavior).`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'), then the candidate's full legal name and home address on separate lines, wrapped in a single <p> with <br>.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{candidateLegalName}}<br>{{candidateAddressLine1}}<br>{{candidateAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format ('May 12, 2026'), not '5/12/2026'.",
        "MUST NOT include any greeting or 'Dear' here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>May 12, 2026<br><br>Ms. Aisha Khan<br>1840 Sansome Street, Apt 4C<br>San Francisco, CA 94111</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject line in <strong>: 'Offer of Employment — {Job Title}'.",
      scaffold: `<p><strong>Offer of Employment — {{jobTitle}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST include the job title exactly as offered.",
        "MUST NOT promise the role is for any specific term.",
      ],
      example: `<p><strong>Offer of Employment — Senior Software Engineer</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. Use 'Dear Mr./Ms./Dr. {Surname},' unless a preferred first name is supplied.",
      scaffold: `<p>Dear {{candidateHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title or honorific not supplied.",
      ],
      example: `<p>Dear Ms. Khan,</p>`,
    },
    {
      sectionId: "opening",
      title: "Opening — offer of employment",
      instruction:
        "Open with the offer, naming the role, the proposed start date, and the location. One short paragraph; warm but precise.",
      scaffold: `<p>On behalf of {{employerLegalName}}, I am pleased to offer you the position of {{jobTitle}}, reporting to {{lineManagerName}}, {{lineManagerTitle}}. Subject to the conditions described below, your anticipated start date is {{startDate}}.</p>`,
      constraints: [
        "MUST name the role, line manager, and start date.",
        "MUST NOT promise the role is for any specific term or guaranteed duration.",
      ],
      example: `<p>On behalf of Acme Inc., I am pleased to offer you the position of Senior Software Engineer, reporting to Daniel Okafor, Director of Engineering. Subject to the conditions described below, your anticipated start date is June 1, 2026.</p>`,
    },
    {
      sectionId: "body",
      title: "Position details",
      instruction:
        "State location, work arrangement, FLSA classification, and a high-level summary of duties. Cite 29 USC 213(a)(1) when classifying as exempt.",
      scaffold: `<p>Your principal place of work will be {{workLocation}}, with the work arrangement set out in the company's policies as updated from time to time. The position is classified as {{flsaClassification}} under the Fair Labor Standards Act, 29 USC 213(a)(1) and 29 CFR Part 541. Your principal duties will include {{dutiesSummary}}, together with such other duties as the company may reasonably assign.</p>`,
      constraints: [
        "MUST state FLSA classification (exempt or non-exempt).",
        "MUST cite 29 USC 213(a)(1) when classifying as exempt.",
        "MUST identify the principal place of work.",
        "MUST NOT promise particular projects or assignments beyond the role.",
      ],
      example: `<p>Your principal place of work will be our San Francisco, CA office, with the work arrangement set out in the company's policies as updated from time to time. The position is classified as exempt under the Fair Labor Standards Act, 29 USC 213(a)(1) and 29 CFR Part 541. Your principal duties will include leading the design and implementation of platform services within the Engineering organization, together with such other duties as the company may reasonably assign.</p>`,
    },
    {
      sectionId: "compensation",
      title: "Compensation",
      instruction:
        "State base salary with USD and frequency (annualized + per-pay-period), pay schedule, bonus, and equity. Disclose the posted pay range if required by state law (CA, NY, CO, WA, IL, MA).",
      scaffold: `<p>Your base salary will be {{currencySymbol}}{{baseSalaryAnnual}} per year, equivalent to approximately {{currencySymbol}}{{baseSalaryPerPayPeriod}} per pay period, paid on a {{payFrequency}} basis, less applicable federal, state, and local taxes and authorized deductions. {{bonusEquityParagraph}} The posted pay range for this role in {{stateOfHire}} is {{currencySymbol}}{{payRangeLow}} to {{currencySymbol}}{{payRangeHigh}}, in compliance with {{stateTransparencyStatute}}.</p>`,
      constraints: [
        "MUST state amounts as gross (before tax).",
        "MUST state the pay frequency.",
        "MUST disclose the posted pay range in CA, NY, CO, WA, IL, MA, and other transparency states.",
        "MUST cite the relevant transparency statute when disclosing the range.",
      ],
      example: `<p>Your base salary will be $185,000 per year, equivalent to approximately $7,708.33 per pay period, paid on a semi-monthly basis, less applicable federal, state, and local taxes and authorized deductions. You will be eligible to participate in the company's annual incentive plan with a target bonus of 15% of base salary, governed by the plan documents in effect from time to time, and you will be granted 5,000 restricted stock units vesting over four years subject to the company's 2026 Equity Incentive Plan and a separate grant agreement. The posted pay range for this role in California is $170,000 to $205,000, in compliance with California Labor Code section 432.3.</p>`,
    },
    {
      sectionId: "benefits",
      title: "Benefits and leave",
      instruction:
        "Summarize 401(k), medical/dental/vision, PTO, sick leave, and any other benefits. Reference state-mandated paid sick leave where applicable (CA HWHFA, NY ESSL, etc.).",
      scaffold: `<p>You will be eligible to participate in the company's 401(k) plan with a {{employer401kMatchPercent}}% match on the first {{matchedContributionPercent}}% of eligible compensation, subject to plan terms and IRS limits. You will be enrolled in the company's medical, dental, and vision plans on the first of the month following your start date, with employer contributions as set out in the benefits summary. You will accrue {{ptoDaysPerYear}} days of paid time off per year and {{paidSickLeaveDays}} days of paid sick leave under {{stateSickLeaveStatute}}, in addition to {{paidHolidaysCount}} paid company holidays.</p>`,
      constraints: [
        "MUST reference state-mandated paid sick leave where applicable.",
        "MUST distinguish PTO from sick leave where the state requires separate accrual.",
        "MUST NOT promise benefit levels that exceed the plan documents.",
      ],
      example: `<p>You will be eligible to participate in the company's 401(k) plan with a 100% match on the first 4% of eligible compensation, subject to plan terms and IRS limits. You will be enrolled in the company's medical, dental, and vision plans on the first of the month following your start date, with employer contributions as set out in the benefits summary. You will accrue 20 days of paid time off per year and 5 days of paid sick leave under the California Healthy Workplaces, Healthy Families Act (Lab. Code section 246), in addition to 11 paid company holidays.</p>`,
    },
    {
      sectionId: "terms",
      title: "Working hours and at-will employment",
      instruction:
        "State the at-will nature of employment in plain language. Reference the location and any working-hours expectation appropriate to the FLSA classification.",
      scaffold: `<p>Your employment with {{employerLegalName}} will be at-will, which means that you or the company may terminate the employment relationship at any time, with or without cause and with or without notice. Nothing in this letter or in any oral or written communication should be construed as a contract of employment for any specific term or as a guarantee of continued employment. The terms of your employment, including those relating to confidentiality, intellectual property, and arbitration, are set out in the separate Employment Agreement and Proprietary Information and Inventions Agreement enclosed with this letter.</p>`,
      constraints: [
        "MUST contain an explicit at-will statement (except Montana).",
        "MUST state that the letter is not a contract for any specific term.",
        "MUST refer to the Employment Agreement and PIIA for further terms.",
        "MUST NOT include a non-compete in California, North Dakota, Oklahoma, or Minnesota.",
      ],
      example: `<p>Your employment with Acme Inc. will be at-will, which means that you or the company may terminate the employment relationship at any time, with or without cause and with or without notice. Nothing in this letter or in any oral or written communication should be construed as a contract of employment for any specific term or as a guarantee of continued employment. The terms of your employment, including those relating to confidentiality, intellectual property, and arbitration, are set out in the separate Employment Agreement and Proprietary Information and Inventions Agreement enclosed with this letter.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Conditions of offer",
      instruction:
        "State that the offer is contingent on Form I-9 verification, background check, references, and any role-specific requirements. Cite the Immigration Reform and Control Act 1986 and reference E-Verify if the employer participates.",
      scaffold: `<p>This offer is contingent upon: (i) your completion of Form I-9 and presentation of acceptable documentation establishing your identity and authorization to work in the United States within three business days of your start date, in accordance with the Immigration Reform and Control Act of 1986; (ii) {{eVerifyParticipationStatement}}; (iii) satisfactory completion of a background check and reference checks conducted under the Fair Credit Reporting Act, 15 USC section 1681 et seq.; and (iv) {{additionalConditionsList}}. The company reserves the right to withdraw this offer if any of these conditions is not satisfied.</p>`,
      constraints: [
        "MUST cite IRCA 1986 and Form I-9 within 3 business days.",
        "MUST cite the FCRA when referencing background checks.",
        "MUST state E-Verify participation only where accurate.",
        "MUST NOT impose conditions that have a discriminatory effect.",
      ],
      example: `<p>This offer is contingent upon: (i) your completion of Form I-9 and presentation of acceptable documentation establishing your identity and authorization to work in the United States within three business days of your start date, in accordance with the Immigration Reform and Control Act of 1986; (ii) verification of your work authorization through the U.S. Department of Homeland Security E-Verify system, in which Acme Inc. participates; (iii) satisfactory completion of a background check and reference checks conducted under the Fair Credit Reporting Act, 15 USC section 1681 et seq.; and (iv) execution of the enclosed Proprietary Information and Inventions Agreement. The company reserves the right to withdraw this offer if any of these conditions is not satisfied.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Acceptance and deadline",
      instruction:
        "State how to accept (countersigning) and the deadline. Provide a specific date and a contact for questions.",
      scaffold: `<p>To accept this offer, please sign and return this letter together with the enclosed Employment Agreement by {{acceptanceDeadline}}. If you have any questions, please contact {{recruiterName}}, {{recruiterTitle}}, at {{recruiterEmail}}.</p>`,
      constraints: [
        "MUST give a specific deadline date.",
        "MUST name a contact for questions.",
      ],
      example: `<p>To accept this offer, please sign and return this letter together with the enclosed Employment Agreement by May 22, 2026. If you have any questions, please contact Priya Sharma, Talent Partner, at priya.sharma@acme.example.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph welcoming the candidate, followed by 'Sincerely,'.",
      scaffold: `<p>{{warmClosingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST keep warmth professional and brief.",
      ],
      example: `<p>We are excited about the prospect of you joining Acme Inc. and contributing to the Engineering team.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Three lines: signatory name, signatory title, employer legal name, separated by <br> in a single <p>.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines: name, title, employer.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Helen Carter<br>Vice President, People<br>Acme Inc.</p>`,
    },
  ],
};
