import type { LetterTemplate } from "../types";

export const RESIGNATION_ACCEPTANCE_UK: LetterTemplate = {
  letterType: "resignation_acceptance",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Resignation Acceptance):
- Confirm the contractual notice period and the resulting last day of employment. Statutory minimum notice from the employee under s.86 ERA 1996 is 1 week once 1 month's service is reached; contractual notice may be longer.
- Garden leave may only be imposed if there is an express contractual right; otherwise the employer must allow the employee to perform their duties (the Christel-Houston-style implied 'work' obligation has been considered in cases such as William Hill v Tucker [1998]).
- Final pay should include all accrued holiday under the Working Time Regulations 1998 (regulation 14), any outstanding bonuses payable under the scheme rules, and any pay in lieu of notice if applied.
- Restrictive covenants and confidentiality obligations under the Employment Contract continue post-termination — refer to the contract clauses by number, do not enlarge them.
- Register: courteous, warm where appropriate, factual. British English throughout.`,
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
        "Render a single short <p> with the subject in <strong>: 'Acceptance of Resignation'.",
      scaffold: `<p><strong>Acceptance of Resignation</strong></p>`,
      constraints: [
        "MUST be a single line.",
      ],
      example: `<p><strong>Acceptance of Resignation</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. 'Dear {PreferredName},' is appropriate where the relationship has been first-name; otherwise 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Daniel,</p>`,
    },
    {
      sectionId: "body",
      title: "Acceptance and last day",
      instruction:
        "Acknowledge receipt of the resignation letter (with date), confirm acceptance, and state the last day of employment computed from the contractual notice. One short paragraph.",
      scaffold: `<p>Thank you for your letter of {{resignationLetterDate}} in which you gave notice of your resignation from your role as {{employeeRoleTitle}}. The company accepts your resignation. Based on your contractual notice period of {{contractualNoticeWeeks}} weeks, your last day of employment with {{employerLegalName}} will be {{lastDay}}.</p>`,
      constraints: [
        "MUST acknowledge the resignation letter by date.",
        "MUST state the contractual notice period and the resulting last day.",
        "MUST NOT add new contractual conditions.",
      ],
      example: `<p>Thank you for your letter of 5 May 2026 in which you gave notice of your resignation from your role as Senior Software Engineer. The company accepts your resignation. Based on your contractual notice period of 12 weeks, your last day of employment with Acme Holdings Limited will be 28 July 2026.</p>`,
    },
    {
      sectionId: "terms",
      title: "Final pay, leave, and property",
      instruction:
        "State whether the notice period is to be worked, taken on garden leave (only if contractually permitted), or paid in lieu. Set out final pay treatment, accrued holiday under WTR 1998, property return, and continuing obligations under the contract.",
      scaffold: `<p>{{noticeArrangementParagraph}} Your final pay, including pay for the period to {{lastDay}}, {{accruedHolidayDays}} days of accrued but untaken holiday calculated under regulation 14 of the Working Time Regulations 1998, and {{additionalFinalPayItems}}, will be paid into your nominated bank account on {{finalPayDate}}.</p>
<p>Please return all company property in your possession by {{propertyReturnDate}}, including {{propertyList}}. Your obligations of confidentiality under clause {{confidentialityClause}} of your Employment Contract and any post-termination restrictions set out in clause {{restrictiveCovenantClause}} continue to apply after the end of your employment.</p>`,
      constraints: [
        "MUST cite regulation 14 of the Working Time Regulations 1998 for accrued holiday.",
        "MUST distinguish notice worked, garden leave (contractual only), and PILON.",
        "MUST list property by category.",
        "MUST refer to specific contract clause numbers, not in general terms.",
        "MUST NOT enlarge restrictive covenants.",
      ],
      example: `<p>The company would like you to work your full notice period to support an orderly handover; please liaise with your line manager on the handover plan. Your final pay, including pay for the period to 28 July 2026, 4 days of accrued but untaken holiday calculated under regulation 14 of the Working Time Regulations 1998, and your Q2 2026 bonus payable under the scheme rules in the August payroll cycle, will be paid into your nominated bank account on 28 August 2026.</p>
<p>Please return all company property in your possession by 28 July 2026, including your laptop, mobile telephone, access card, and any printed materials marked confidential. Your obligations of confidentiality under clause 11 of your Employment Contract and any post-termination restrictions set out in clause 18 continue to apply after the end of your employment.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph thanking the employee for their contribution and wishing them well, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST keep warmth proportionate to the relationship.",
      ],
      example: `<p>I would like to thank you for your contribution to Acme Holdings over the last four years and to wish you every success in your new role.</p>
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

export const RESIGNATION_ACCEPTANCE_US: LetterTemplate = {
  letterType: "resignation_acceptance",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Resignation Acceptance):
- 'Two weeks' notice' is custom and not statutorily required in most states; the employer cannot generally require notice unless the employment agreement provides for it.
- Final-pay timing is state-specific. California (Lab. Code 202): if the employee gives at least 72 hours' notice, all wages are due on the last day; otherwise within 72 hours of the resignation. New York (Labor Law 191): next regular payday. Texas (Lab. Code 61.014(a)(2)): next regular payday. Massachusetts (M.G.L. c.149 148): next regular payday for voluntary separation.
- Accrued unused PTO must be paid out in CA, CO, MA, IL, NE, ND where vested under company policy.
- COBRA continuation election notice (29 USC 1166; 29 CFR 2590.606-4): the employer notifies the plan administrator within 30 days of the qualifying event, and the administrator sends the election notice within 14 days of that (44 days in total where the employer is the administrator). Do not promise the employee a 14-day timescale.
- Continuing obligations: confidentiality, IP assignment under the Proprietary Information and Inventions Agreement, and any narrow non-solicit (where enforceable) survive termination — refer to the contract clauses, do not enlarge them.
- Non-competes: unenforceable in California (Bus. & Prof. Code 16600), North Dakota, Oklahoma, and Minnesota; do not assert enforcement in those states.
- Register: courteous, warm where appropriate, factual. American English throughout.`,
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
        "Render a single short <p> with subject in <strong>: 'Acceptance of Resignation'.",
      scaffold: `<p><strong>Acceptance of Resignation</strong></p>`,
      constraints: [
        "MUST be a single line.",
      ],
      example: `<p><strong>Acceptance of Resignation</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. 'Dear {PreferredName},' or 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Daniel,</p>`,
    },
    {
      sectionId: "body",
      title: "Acceptance and last day",
      instruction:
        "Acknowledge receipt of the resignation, confirm acceptance, and state the last day of employment.",
      scaffold: `<p>Thank you for your message of {{resignationLetterDate}} in which you gave notice of your resignation from your position as {{employeeRoleTitle}}. The company accepts your resignation. Your last day of employment with {{employerLegalName}} will be {{lastDay}}.</p>`,
      constraints: [
        "MUST acknowledge the resignation by date.",
        "MUST state the last day of employment.",
        "MUST NOT add new contractual conditions.",
      ],
      example: `<p>Thank you for your message of May 5, 2026 in which you gave notice of your resignation from your position as Senior Software Engineer. The company accepts your resignation. Your last day of employment with Acme Inc. will be May 19, 2026.</p>`,
    },
    {
      sectionId: "terms",
      title: "Final pay, PTO, benefits, and property",
      instruction:
        "State final-pay timing per state law, accrued PTO payout, COBRA notice timing, property return, and continuing obligations under the PIIA. Cite the applicable state final-pay statute.",
      scaffold: `<p>Your final paycheck, including all earned but unpaid wages through your last day and {{accruedPtoHours}} hours of accrued unused paid time off, will be issued {{finalPayTimingStatement}} in accordance with {{stateFinalPayStatute}}, less applicable federal, state, and local taxes and authorized deductions. Your participation in the company's medical, dental, vision, and life insurance plans will end on {{benefitsEndDate}}; you will receive a separate COBRA continuation election notice from the plan administrator under 29 USC section 1166.</p>
<p>Please return all company property in your possession by {{propertyReturnDate}}, including {{propertyList}}. Your continuing obligations of confidentiality and intellectual property assignment under the Proprietary Information and Inventions Agreement you signed on {{piiaSignedDate}} survive the end of your employment.</p>`,
      constraints: [
        "MUST cite the applicable state final-pay statute.",
        "MUST address accrued PTO under state law where it must be paid.",
        "MUST cite 29 USC 1166 for COBRA.",
        "MUST reference the PIIA by date.",
        "MUST NOT enlarge restrictive covenants.",
        "MUST NOT assert non-compete enforcement in CA, ND, OK, MN.",
      ],
      example: `<p>Your final paycheck, including all earned but unpaid wages through your last day and 80 hours of accrued unused paid time off, will be issued to you on May 19, 2026 in accordance with California Labor Code section 202, less applicable federal, state, and local taxes and authorized deductions. Your participation in the company's medical, dental, vision, and life insurance plans will end on May 31, 2026; you will receive a separate COBRA continuation election notice from the plan administrator under 29 USC section 1166.</p>
<p>Please return all company property in your possession by May 19, 2026, including your laptop, badge, mobile device, and any printed materials marked confidential. Your continuing obligations of confidentiality and intellectual property assignment under the Proprietary Information and Inventions Agreement you signed on June 1, 2024 survive the end of your employment.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph thanking the employee and wishing them well, followed by 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST keep warmth proportionate to the relationship.",
      ],
      example: `<p>Thank you for your contribution to Acme Inc. over the last four years and best wishes for your next role.</p>
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
