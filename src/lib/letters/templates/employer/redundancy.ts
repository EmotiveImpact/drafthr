import type { LetterTemplate } from "../types";

export const REDUNDANCY_UK: LetterTemplate = {
  letterType: "redundancy",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Redundancy):
- 'Redundancy' is one of the s.98 ERA 1996 potentially fair reasons for dismissal, defined in s.139 ERA 1996 (cessation of business, cessation at the workplace, or diminishing requirement for employees to do work of a particular kind).
- Where 20 or more dismissals are proposed at one establishment within 90 days, collective consultation under s.188 TULRCA 1992 applies: 30 days minimum (45 days if 100+). Failure to consult exposes the employer to a protective award of up to 90 days' pay per affected employee under s.189 TULRCA.
- Even for sub-threshold redundancies, individual consultation must be meaningful and at a formative stage (Polkey v AE Dayton Services Ltd [1987]).
- Selection must be from a defined pool, applying objective and non-discriminatory criteria. Reference the criteria and that they were applied fairly.
- Statutory redundancy pay under s.162 ERA 1996: 0.5 weeks' pay per year of service under age 22; 1 week per year aged 22–40; 1.5 weeks per year aged 41+. Minimum 2 years' continuous service. Weekly cap statutorily set (see current SI). Tax-free up to 30,000 pounds under s.401 ITEPA 2003.
- Statutory minimum notice under s.86 ERA 1996 (or contractual notice if longer).
- 4-week trial period in any suitable alternative role under s.138 ERA 1996.
- A right of appeal in writing should be offered as ACAS best practice.
- Register: dignified, factual, supportive in tone. British English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then the employee's full legal name and home address.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST NOT include any greeting here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>Mr Daniel Okafor<br>14 Rosewood Avenue<br>London N4 2QX</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Notice of Termination by Reason of Redundancy'.",
      scaffold: `<p><strong>Notice of Termination by Reason of Redundancy</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify redundancy as the reason.",
      ],
      example: `<p><strong>Notice of Termination by Reason of Redundancy</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT use first-name salutation in a formal redundancy letter.",
      ],
      example: `<p>Dear Mr Okafor,</p>`,
    },
    {
      sectionId: "body",
      title: "Decision and process",
      instruction:
        "State the decision and the redundancy basis under s.139 ERA 1996. Reference the consultation history (collective and/or individual), the selection pool, and the criteria. State that the pool, criteria, and scoring were applied fairly. Two to three paragraphs.",
      scaffold: `<p>I am writing to confirm that, following the consultation process which began on {{consultationStartDate}} and concluded with our individual consultation meeting on {{finalConsultationDate}}, your role as {{employeeRoleTitle}} has been confirmed as redundant under section 139 of the Employment Rights Act 1996. Your employment with {{employerLegalName}} will accordingly terminate by reason of redundancy.</p>
<p>The redundancy arises from {{redundancyReasonSummary}}. The selection pool consisted of {{selectionPoolDescription}}, and the selection criteria applied were {{selectionCriteriaSummary}}. The criteria were applied objectively and non-discriminatorily, and your provisional and final scores were shared with you on {{scoresSharedDate}}. The representations you made during consultation, including {{employeeRepresentationsSummary}}, were considered, but the panel concluded that the redundancy decision should stand.</p>
<p>{{collectiveConsultationParagraph}}</p>`,
      constraints: [
        "MUST cite s.139 ERA 1996 for the redundancy definition.",
        "MUST reference consultation start and end dates.",
        "MUST describe the selection pool and criteria.",
        "MUST acknowledge the employee's representations.",
        "MUST reference s.188 TULRCA 1992 collective consultation where 20+ dismissals applied.",
      ],
      example: `<p>I am writing to confirm that, following the consultation process which began on 1 April 2026 and concluded with our individual consultation meeting on 6 May 2026, your role as Senior Software Engineer has been confirmed as redundant under section 139 of the Employment Rights Act 1996. Your employment with Acme Holdings Limited will accordingly terminate by reason of redundancy.</p>
<p>The redundancy arises from the consolidation of the London engineering function into the Manchester hub, which has reduced the requirement for engineers based at the London site. The selection pool consisted of all Senior Software Engineers based at the London office, and the selection criteria applied were performance score (most recent two appraisals, weighted 40%), skill match against the future London role profile (40%), and length of service (20%). The criteria were applied objectively and non-discriminatorily, and your provisional and final scores were shared with you on 22 April 2026. The representations you made during consultation, including your suggestion that an alternative reporting line could mitigate the relocation requirement, were considered, but the panel concluded that the redundancy decision should stand.</p>
<p>The collective consultation under section 188 of the Trade Union and Labour Relations (Consolidation) Act 1992 ran from 1 April 2026 to 1 May 2026, with elected employee representatives, and a copy of the response to representatives' questions has previously been shared with you.</p>`,
    },
    {
      sectionId: "terms",
      title: "Notice, redundancy pay, and final pay",
      instruction:
        "State the last day of employment, notice arrangement (worked or paid in lieu, citing s.86 ERA), statutory redundancy pay calculation under s.162 ERA, any contractual enhancement, accrued holiday pay under WTR 1998, and the final pay date.",
      scaffold: `<p>Your last day of employment will be {{lastDay}}. {{noticeArrangementParagraph}}</p>
<p>You are entitled to a statutory redundancy payment under section 162 of the Employment Rights Act 1996, calculated as follows: {{statutoryRedundancyCalculation}}, giving a statutory redundancy payment of £{{statutoryRedundancyAmount}}. {{contractualEnhancementParagraph}} The first £30,000 of any redundancy payment is paid free of income tax and National Insurance under section 401 of the Income Tax (Earnings and Pensions) Act 2003.</p>
<p>Your final pay, including {{accruedHolidayDays}} days of accrued but untaken holiday calculated under the Working Time Regulations 1998, the redundancy payment described above, and any pay in lieu of notice, will be paid into your nominated bank account on {{finalPayDate}}.</p>`,
      constraints: [
        "MUST cite s.86 ERA 1996 for statutory minimum notice.",
        "MUST cite s.162 ERA 1996 for statutory redundancy pay and show the calculation (years, age band, weekly pay capped where applicable).",
        "MUST cite s.401 ITEPA 2003 for the £30,000 tax-free treatment.",
        "MUST cite the Working Time Regulations 1998 for holiday pay.",
      ],
      example: `<p>Your last day of employment will be 12 August 2026. The company will require you to work your contractual three-month notice period to that date and you will continue to be paid your normal salary in the usual way over that period.</p>
<p>You are entitled to a statutory redundancy payment under section 162 of the Employment Rights Act 1996, calculated as follows: 6 complete years of continuous service, of which 4 years fall in the 22–40 age band (1 week per year) and 2 years fall in the 41+ age band (1.5 weeks per year), giving 7 weeks at the statutory weekly cap of £700, a statutory redundancy payment of £4,900. In addition to the statutory entitlement, the company will pay an enhanced redundancy payment of £6,300 in line with the Acme Redundancy Policy, giving a total redundancy payment of £11,200. The first £30,000 of any redundancy payment is paid free of income tax and National Insurance under section 401 of the Income Tax (Earnings and Pensions) Act 2003.</p>
<p>Your final pay, including 8 days of accrued but untaken holiday calculated under the Working Time Regulations 1998, the redundancy payment described above, and any pay in lieu of notice, will be paid into your nominated bank account on 28 August 2026.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Alternative employment and support",
      instruction:
        "Reference any suitable alternative employment offered, the 4-week trial period under s.138 ERA, time off for job-hunting (s.52 ERA where 2y+ service), outplacement support, and any final reference policy.",
      scaffold: `<p>{{alternativeEmploymentParagraph}}</p>
<p>You are entitled to reasonable paid time off during your notice period to look for new employment or to arrange training under section 52 of the Employment Rights Act 1996. The company will also provide outplacement support through {{outplacementProvider}}, details of which will be sent to you separately. Reference enquiries from prospective employers will be handled by the People team on a fact-only basis (dates of employment and last-held position) unless you request otherwise.</p>`,
      constraints: [
        "MUST address whether suitable alternative employment was offered, and reference the 4-week trial period under s.138 ERA where applicable.",
        "MUST cite s.52 ERA 1996 for time off to look for work (where 2 years' service).",
        "MUST describe outplacement support where offered.",
        "MUST NOT make promises about references beyond fact-only without authority.",
      ],
      example: `<p>The company has carefully considered whether any suitable alternative employment is available within the Acme group. Two roles based at the Manchester hub were identified and shared with you on 15 April 2026, and following our discussion you confirmed that neither was suitable for you. If a suitable alternative role becomes available within the notice period, the company will continue to share it with you, and any such role would be subject to the four-week statutory trial period under section 138 of the Employment Rights Act 1996.</p>
<p>You are entitled to reasonable paid time off during your notice period to look for new employment or to arrange training under section 52 of the Employment Rights Act 1996. The company will also provide outplacement support through Phoenix Career Partners, details of which will be sent to you separately. Reference enquiries from prospective employers will be handled by the People team on a fact-only basis (dates of employment and last-held position) unless you request otherwise.</p>`,
    },
    {
      sectionId: "appeal_rights",
      title: "Right of appeal",
      instruction:
        "Offer a right of appeal in writing as ACAS best practice. Name the appeal officer (different from the dismissing officer), give a 5-working-day deadline, and reference the right to be accompanied (s.10 ERelA 1999).",
      scaffold: `<p>You have the right to appeal this decision. To do so, please write to {{appealOfficerName}}, {{appealOfficerTitle}}, at {{appealOfficerContact}} within {{appealDeadlineWorkingDays}} working days of the date of this letter, setting out the grounds of your appeal. You are entitled to be accompanied at any appeal hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>`,
      constraints: [
        "MUST name an appeal officer different from the dismissing officer.",
        "MUST give a specific deadline (working days).",
        "MUST cite s.10 ERelA 1999.",
      ],
      example: `<p>You have the right to appeal this decision. To do so, please write to Helen Carter, Director of People, at helen.carter@acme.example within 5 working days of the date of this letter, setting out the grounds of your appeal. You are entitled to be accompanied at any appeal hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph thanking the employee for their service and offering practical support, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST acknowledge the employee's contribution restrainedly.",
        "MUST NOT undermine the substance of the decision.",
      ],
      example: `<p>I would like to thank you for your contribution to Acme Holdings over the last six years and to wish you well in your future career. The People team will be in touch with the next steps for offboarding and outplacement.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Three lines: signatory name, signatory title, employer legal name.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>HR Director<br>Acme Holdings Limited</p>`,
    },
  ],
};

export const REDUNDANCY_US: LetterTemplate = {
  letterType: "redundancy",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Layoff / Reduction in Force):
- A reduction in force is an at-will termination but documentation is critical to defeat disparate-impact claims under Title VII (42 USC 2000e-2(k)) and the ADEA (29 USC 623), particularly where the selected employees skew toward protected groups.
- Federal WARN Act (29 USC 2101 et seq.): 60 calendar days written notice required for plant closings or mass layoffs by employers with 100+ full-time employees, where 50+ employees are affected at a single site (or 33% of the workforce). Notice must be given to affected employees, the state dislocated worker unit, and the chief elected local official.
- California WARN (Lab. Code 1400 et seq.): 60 days, lower threshold (75 employees, any number of dismissals at a covered establishment in a 30-day period). New York WARN (Labor Law 860): 90 days, 50 employees and 25+ affected (or 250+ affected). New Jersey WARN: 90 days. Confirm the applicable state mini-WARN.
- Severance and a release of claims often accompany layoffs. For employees aged 40+, any release of ADEA claims must comply with the Older Workers Benefit Protection Act (29 USC 626(f)): 21 days to consider (45 days in a group exit), 7 days to revoke, written, advice to consult counsel, and disclosure of the decisional unit and ages of selected and not-selected employees.
- Final pay: state-specific timing (Cal. Lab. Code 201 — immediate; NY Labor Law 191 — next regular payday; etc.). Accrued PTO payout in CA, CO, MA, IL, NE, ND.
- COBRA continuation election notice within 14 days under 29 USC 1166.
- State unemployment insurance information must be provided where state law requires (e.g., Cal. Unemp. Ins. Code 1089).
- Register: dignified, factual, supportive. American English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'), then the employee's full legal name and home address.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST NOT include any greeting here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>May 12, 2026<br><br>Mr. Daniel Okafor<br>240 Pine Street, Apt 7<br>San Francisco, CA 94111</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Notice of Layoff / Reduction in Force' followed by the WARN-required header where applicable.",
      scaffold: `<p><strong>Notice of Layoff — Reduction in Force {{warnHeaderQualifier}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the layoff as a reduction in force.",
        "MUST include WARN identification ('WARN Act Notice') where the layoff is WARN-triggering.",
      ],
      example: `<p><strong>Notice of Layoff — Reduction in Force (WARN Act Notice)</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT use first-name salutation in a formal layoff letter.",
      ],
      example: `<p>Dear Mr. Okafor,</p>`,
    },
    {
      sectionId: "body",
      title: "Decision and process",
      instruction:
        "State that the company is conducting a reduction in force and that the employee's position is being eliminated. State the business reason. Reference any consultation, the affected unit, and selection criteria where relevant. Reference WARN/state mini-WARN where applicable.",
      scaffold: `<p>This letter provides notice that {{employerLegalName}} is conducting a reduction in force affecting {{decisionalUnitDescription}}, and that your position as {{employeeRoleTitle}} is among those being eliminated. The reduction is a result of {{businessReasonSummary}}.</p>
<p>The selection of affected positions was based on {{selectionCriteriaSummary}}. {{warnNoticeParagraph}} Your last day of employment will be {{terminationEffectiveDate}}, and your employment will end on that date.</p>`,
      constraints: [
        "MUST state the business reason for the reduction in force.",
        "MUST describe the decisional unit and selection criteria.",
        "MUST cite the federal WARN Act (29 USC 2102) and any applicable state mini-WARN where the layoff is notice-triggering.",
        "MUST give the effective last day.",
        "MUST NOT reference protected characteristics or activity.",
      ],
      example: `<p>This letter provides notice that Acme Inc. is conducting a reduction in force affecting the Engineering organization at our San Francisco office, and that your position as Senior Software Engineer is among those being eliminated. The reduction is a result of the consolidation of the Engineering function in our Austin hub and the strategic realignment of platform engineering investment for the 2026 plan.</p>
<p>The selection of affected positions was based on a documented assessment of position type, business need against the future-state organization design, and skill match against the remaining roles, applied consistently across the affected decisional unit. This notice is provided in accordance with the federal Worker Adjustment and Retraining Notification Act, 29 USC section 2102, and the California Worker Adjustment and Retraining Notification Act, California Labor Code section 1401. Your last day of employment will be July 14, 2026, and your employment will end on that date.</p>`,
    },
    {
      sectionId: "terms",
      title: "Notice, severance, final pay, and benefits",
      instruction:
        "State final pay timing, severance offered, accrued PTO payout, benefits termination date, and COBRA notice. Reference any release of claims agreement (with OWBPA periods if 40+).",
      scaffold: `<p>Your final paycheck, including all earned but unpaid wages through your last day and {{accruedPtoHours}} hours of accrued unused paid time off, will be issued {{finalPayTimingStatement}} in accordance with {{stateFinalPayStatute}}, less applicable federal, state, and local taxes and authorized deductions.</p>
<p>The company is offering you a severance benefit of {{severanceWeeksOrAmount}}, conditional on your execution and non-revocation of the enclosed Separation Agreement and General Release. {{owbpaParagraph}} Your participation in the company's medical, dental, vision, and life insurance plans will end on {{benefitsEndDate}}. You will receive a separate COBRA continuation election notice within 14 days under 29 USC section 1166.</p>`,
      constraints: [
        "MUST cite the applicable state final-pay statute.",
        "MUST cite 29 USC 1166 for COBRA.",
        "MUST cite the OWBPA (29 USC 626(f)) for any release by an employee aged 40+, with the 21/45 day consideration period and 7 day revocation period.",
        "MUST NOT condition statutorily-due final pay on a release.",
        "MUST distinguish severance (conditional on release) from final-pay-due-by-law (unconditional).",
      ],
      example: `<p>Your final paycheck, including all earned but unpaid wages through your last day and 96 hours of accrued unused paid time off, will be issued to you on July 14, 2026 in accordance with California Labor Code section 201, less applicable federal, state, and local taxes and authorized deductions.</p>
<p>The company is offering you a severance benefit of 12 weeks of base salary, conditional on your execution and non-revocation of the enclosed Separation Agreement and General Release. Because this is a group reduction in force and you are aged 40 or above, you have 45 days from your receipt of the Separation Agreement to consider it and 7 days after signing to revoke it, in accordance with the Older Workers Benefit Protection Act, 29 USC section 626(f). You are advised to consult with an attorney before signing. Disclosures of the decisional unit and the ages of selected and not-selected employees are attached to the Separation Agreement. Your participation in the company's medical, dental, vision, and life insurance plans will end on July 31, 2026. You will receive a separate COBRA continuation election notice within 14 days under 29 USC section 1166.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Outplacement, references, and unemployment",
      instruction:
        "Reference outplacement support, the company's reference policy (typically fact-only), state unemployment insurance information (e.g., Cal. EDD, NY DOL), and any property return requirement.",
      scaffold: `<p>The company will provide outplacement support through {{outplacementProvider}}, details of which will be sent to you separately. Reference enquiries from prospective employers will be handled by the People team on a fact-only basis (dates of employment and last-held position).</p>
<p>You may be eligible for state unemployment insurance benefits. Information on how to apply is enclosed and is available at {{stateUnemploymentAgencyURL}}. You are required to return all company property in your possession by {{propertyReturnDate}}, including {{propertyList}}.</p>`,
      constraints: [
        "MUST reference state unemployment insurance information where state law requires it (e.g., Cal. Unemp. Ins. Code 1089 in California).",
        "MUST list property categories.",
        "MUST NOT enlarge restrictive covenants beyond the contract.",
      ],
      example: `<p>The company will provide outplacement support through Phoenix Career Partners, details of which will be sent to you separately. Reference enquiries from prospective employers will be handled by the People team on a fact-only basis (dates of employment and last-held position).</p>
<p>You may be eligible for state unemployment insurance benefits. Information on how to apply is enclosed and is available at edd.ca.gov, in accordance with California Unemployment Insurance Code section 1089. You are required to return all company property in your possession by July 16, 2026, including your laptop, badge, mobile device, and any printed materials marked confidential.</p>`,
    },
    {
      sectionId: "appeal_rights",
      title: "Internal review",
      instruction:
        "Offer an internal review path. Frame as company practice, not statutory right. Name a contact and a deadline.",
      scaffold: `<p>If you believe there are matters the company should review in connection with this decision, you may write to {{reviewContactName}}, {{reviewContactTitle}}, at {{reviewContactEmail}} within {{reviewDeadlineBusinessDays}} business days of the date of this letter.</p>`,
      constraints: [
        "MUST name a review contact.",
        "MUST give a specific deadline.",
        "MUST NOT mischaracterize the internal review as a statutory right of appeal.",
      ],
      example: `<p>If you believe there are matters the company should review in connection with this decision, you may write to Helen Carter, Vice President of People, at helen.carter@acme.example within 5 business days of the date of this letter.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short dignified paragraph acknowledging the employee's contribution, followed by 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST acknowledge the contribution restrainedly.",
        "MUST NOT undermine the decision.",
      ],
      example: `<p>I would like to thank you for your contribution to Acme Inc. over the last six years and to wish you well in your next role. The People team will be in touch with the offboarding details and outplacement information.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Three lines: signatory name, signatory title, employer legal name.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>Vice President, People<br>Acme Inc.</p>`,
    },
  ],
};
