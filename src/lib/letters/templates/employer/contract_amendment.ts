import type { LetterTemplate } from "../types";

export const CONTRACT_AMENDMENT_UK: LetterTemplate = {
  letterType: "contract_amendment",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Contract Amendment / Variation):
- Variation of contractual terms requires mutual agreement, unless an express variation clause exists. Imposed unilateral variation may be a fundamental breach giving rise to a constructive dismissal claim under s.95(1)(c) ERA 1996 (Western Excavating v Sharp [1978]).
- Section 4 of the Employment Rights Act 1996 requires the employer to provide a written statement of the change within one month of the change taking effect.
- Avoid 'fire and rehire' / 'dismissal and re-engagement' patterns: see the Statutory Code of Practice on Dismissal and Re-engagement (in force July 2024) which exposes employers to a 25% uplift on tribunal awards for non-compliance.
- Where the change reduces pay, hours, or benefits, the letter MUST seek express written agreement and offer reasonable time to consider.
- Reference any consultation, the business reason for the change, and the effect on other terms.
- Register: respectful, factual, no pressure language. British English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then the employee's full legal name and home address on separate lines, wrapped in a single <p> with <br>.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format ('12 May 2026').",
        "MUST NOT include any greeting here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>Mr Daniel Okafor<br>14 Rosewood Avenue<br>London N4 2QX</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject line in <strong>: 'Proposed Variation of Employment Contract — {Variation Topic}'.",
      scaffold: `<p><strong>Proposed Variation of Employment Contract — {{variationTopic}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the topic of the variation in plain language.",
        "MUST NOT use 'Notice of Change' which suggests imposition.",
      ],
      example: `<p><strong>Proposed Variation of Employment Contract — Change of Principal Place of Work</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. Use 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title not supplied.",
      ],
      example: `<p>Dear Mr Okafor,</p>`,
    },
    {
      sectionId: "body",
      title: "Statement of change and reason",
      instruction:
        "State the proposed change precisely (what term is changing, from what to what, and the effective date). Give the business reason. Reference any prior consultation or discussion. Two short paragraphs.",
      scaffold: `<p>Following our discussion on {{consultationDate}}, I am writing to propose a variation to your Employment Contract dated {{originalContractDate}}. With effect from {{variationEffectiveDate}}, we propose that {{currentTerm}} should be varied to {{proposedTerm}}.</p>
<p>The business reason for this proposed change is {{businessReason}}. We have considered alternatives and concluded that this variation is necessary to {{rationaleSummary}}.</p>`,
      constraints: [
        "MUST identify the existing term and the proposed term precisely (clause numbers where available).",
        "MUST state the business reason for the change.",
        "MUST reference any prior consultation.",
        "MUST NOT impose the change unilaterally without seeking agreement (unless an express variation clause is being relied on, which must be cited).",
      ],
      example: `<p>Following our discussion on 28 April 2026, I am writing to propose a variation to your Employment Contract dated 14 March 2022. With effect from 1 July 2026, we propose that your principal place of work, currently the London office at 12 Bishopsgate, should be varied to the Manchester office at 1 Spinningfields Square, with hybrid working continuing in line with the Hybrid Working Policy.</p>
<p>The business reason for this proposed change is the consolidation of the Engineering function in our Manchester hub by Q3 2026. We have considered alternatives, including retaining the role in London, and concluded that this variation is necessary to maintain the team cohesion and on-site collaboration that the function requires.</p>`,
    },
    {
      sectionId: "terms",
      title: "Effect on other terms",
      instruction:
        "State that all other terms of the Employment Contract remain unchanged unless expressly stated. List any consequential changes (relocation support, hours adjustment, salary adjustment) clearly. Reference s.4 ERA 1996 written statement of change.",
      scaffold: `<p>All other terms and conditions of your Employment Contract will remain unchanged. {{consequentialChangesParagraph}} A written statement of this change will be issued under section 4 of the Employment Rights Act 1996 within one month of the variation taking effect.</p>`,
      constraints: [
        "MUST state explicitly that other terms remain unchanged.",
        "MUST cite s.4 ERA 1996 for the written statement obligation.",
        "MUST list consequential changes precisely (e.g., relocation allowance amount).",
        "MUST NOT enlarge restrictive covenants beyond the existing contract.",
      ],
      example: `<p>All other terms and conditions of your Employment Contract will remain unchanged. To support the relocation, the company will provide a one-off relocation allowance of £6,000 (gross), payable on completion of your move, and will reimburse reasonable travel costs between London and Manchester for the first three months in line with the Travel and Expenses Policy. A written statement of this change will be issued under section 4 of the Employment Rights Act 1996 within one month of the variation taking effect.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Acceptance request",
      instruction:
        "Ask the employee to confirm acceptance in writing by a specific deadline. Offer a meeting to discuss. Make clear the change is proposed, not imposed.",
      scaffold: `<p>Please confirm your acceptance of the proposed variation by signing and returning a copy of this letter by {{acceptanceDeadline}}. If you would like to discuss the proposal before responding, please contact {{contactName}}, {{contactTitle}}, at {{contactEmail}} to arrange a meeting. We are open to hearing any concerns or alternative suggestions you may have.</p>`,
      constraints: [
        "MUST give a specific deadline date.",
        "MUST offer a meeting to discuss.",
        "MUST NOT use coercive language ('failure to respond will be deemed acceptance' is to be avoided unless legally specifically supported).",
      ],
      example: `<p>Please confirm your acceptance of the proposed variation by signing and returning a copy of this letter by 31 May 2026. If you would like to discuss the proposal before responding, please contact Priya Sharma, HR Director, at priya.sharma@acme.example to arrange a meeting. We are open to hearing any concerns or alternative suggestions you may have.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph thanking the employee for their consideration, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST keep tone respectful.",
      ],
      example: `<p>Thank you for considering this proposal. We value your contribution and are committed to working with you to find a workable arrangement.</p>
<p>Yours sincerely,</p>`,
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
      example: `<p>Helen Carter<br>Director of People<br>Acme Holdings Limited</p>`,
    },
  ],
};

export const CONTRACT_AMENDMENT_US: LetterTemplate = {
  letterType: "contract_amendment",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Contract / Terms Amendment):
- Most US employment is at-will, so prospective unilateral changes to terms (with notice) are generally permissible. However, written agreements, offer letters with binding terms, executive contracts, and union agreements may require mutual consent.
- California: a Wage Theft Prevention Act amended notice (Labor Code 2810.5) MUST be issued in writing within 7 calendar days of the change for non-exempt employees.
- New York: Section 195(2) of the Labor Law requires written notice in advance of any change that decreases the rate of pay.
- ERISA notice requirements apply to any change in benefits plans (Summary of Material Modifications under 29 CFR 2520.104b-3).
- Where the change is a reduction in compensation or a material change in role, document a legitimate business reason to defeat any disparate-treatment claim.
- Confirm at-will status remains intact.
- Register: clear, professional, courteous. American English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'), then the employee's full legal name and home address on separate lines.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format ('May 12, 2026').",
        "MUST NOT include any greeting here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>May 12, 2026<br><br>Mr. Daniel Okafor<br>240 Pine Street, Apt 7<br>San Francisco, CA 94111</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Amendment to Terms of Employment — {Topic}'.",
      scaffold: `<p><strong>Amendment to Terms of Employment — {{amendmentTopic}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the topic in plain language.",
      ],
      example: `<p><strong>Amendment to Terms of Employment — Change of Principal Work Location</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title not supplied.",
      ],
      example: `<p>Dear Mr. Okafor,</p>`,
    },
    {
      sectionId: "body",
      title: "Statement of change and reason",
      instruction:
        "State the change precisely (what is changing, from what to what, and the effective date). Provide the business reason. Reference any prior conversation or notice given.",
      scaffold: `<p>Following our conversation on {{conversationDate}}, this letter confirms the following amendment to the terms of your employment with {{employerLegalName}}, effective {{amendmentEffectiveDate}}: {{currentTerm}} will be amended to {{amendedTerm}}.</p>
<p>The business reason for this amendment is {{businessReason}}. We have considered the alternatives and concluded that this change is necessary to {{rationaleSummary}}.</p>`,
      constraints: [
        "MUST identify the existing term and the amended term precisely.",
        "MUST state the business reason for the change.",
        "MUST give a specific effective date.",
        "MUST reference prior conversations or notice.",
      ],
      example: `<p>Following our conversation on April 28, 2026, this letter confirms the following amendment to the terms of your employment with Acme Inc., effective July 1, 2026: your principal work location, currently our New York office at 250 Hudson Street, will be amended to our San Francisco office at 600 Montgomery Street, with hybrid working continuing in line with the company's Hybrid Work Policy.</p>
<p>The business reason for this amendment is the consolidation of the Engineering organization in our San Francisco hub by Q3 2026. We have considered the alternatives, including retaining the role in New York, and concluded that this change is necessary to maintain the team cohesion and on-site collaboration that the function requires.</p>`,
    },
    {
      sectionId: "terms",
      title: "Effect on other terms",
      instruction:
        "State that all other terms (compensation, benefits, at-will status) remain unchanged unless expressly stated. List any consequential changes. Reference Cal. Labor Code 2810.5 / NY 195(2) where applicable.",
      scaffold: `<p>All other terms and conditions of your employment, including the at-will nature of your employment, remain unchanged. {{consequentialChangesParagraph}} {{stateNoticeReference}}</p>`,
      constraints: [
        "MUST confirm at-will status is preserved.",
        "MUST cite Cal. Lab. Code section 2810.5 (CA) or NY Labor Law section 195(2) (NY) when applicable.",
        "MUST state any consequential changes precisely (e.g., relocation allowance amount).",
        "MUST NOT introduce new restrictive covenants.",
      ],
      example: `<p>All other terms and conditions of your employment, including the at-will nature of your employment, remain unchanged. To support the relocation, the company will provide a one-off relocation allowance of $10,000 (gross), payable upon completion of your move, and will reimburse reasonable travel between New York and San Francisco for the first three months in line with the Travel and Expense Policy. An amended Wage Theft Prevention Act notice will be provided to you separately within seven calendar days under California Labor Code section 2810.5.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Acceptance request",
      instruction:
        "Ask the employee to confirm acknowledgment in writing by a specific deadline. Offer a meeting to discuss. For at-will changes, the employer may proceed if the employee continues working; nevertheless, written acknowledgment is best practice.",
      scaffold: `<p>Please confirm your acknowledgment of this amendment by signing and returning a copy of this letter by {{acknowledgmentDeadline}}. If you would like to discuss the change before responding, please contact {{contactName}}, {{contactTitle}}, at {{contactEmail}}.</p>`,
      constraints: [
        "MUST give a specific deadline date.",
        "MUST offer a meeting or contact for questions.",
      ],
      example: `<p>Please confirm your acknowledgment of this amendment by signing and returning a copy of this letter by May 31, 2026. If you would like to discuss the change before responding, please contact Priya Sharma, Vice President of People, at priya.sharma@acme.example.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph thanking the employee, followed by 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST keep tone respectful and brief.",
      ],
      example: `<p>Thank you for your continued contribution to Acme Inc. We are committed to making this transition as straightforward as possible.</p>
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
      example: `<p>Helen Carter<br>Vice President, People<br>Acme Inc.</p>`,
    },
  ],
};
