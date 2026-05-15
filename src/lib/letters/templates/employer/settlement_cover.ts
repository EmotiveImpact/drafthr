import type { LetterTemplate } from "../types";

export const SETTLEMENT_COVER_UK: LetterTemplate = {
  letterType: "settlement_cover",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Settlement Agreement Cover Letter):
- A Settlement Agreement under section 203 of the Employment Rights Act 1996 must be in writing, identify the particular complaint(s) being waived, and state that the employee has received independent legal advice from a relevant adviser (qualified solicitor, certified union representative, or advice-centre worker), the adviser is identified, and the adviser is covered by professional indemnity insurance — see s.203(3) ERA 1996.
- The cover letter and the agreement itself should be marked 'Without Prejudice and Subject to Contract' to engage the protection of the without-prejudice rule (Rush & Tompkins v GLC [1989]) and the s.111A ERA 1996 statutory protection for pre-termination settlement discussions.
- Tax: the first 30,000 pounds of any compensation for loss of office is paid free of income tax and National Insurance under section 401 ITEPA 2003. Notice pay (worked or PILON) is fully taxable under the post-2018 PENP regime (s.402D ITEPA 2003).
- Reasonable contribution to the employee's legal fees (typically 500–1,500 pounds + VAT) is conventional and tax-free under SP 2/82.
- The agreement should set out the agreed reference (factual or agreed wording), confidentiality, mutual non-disparagement, and any post-termination restrictions affirmed.
- ACAS Code of Practice on Settlement Agreements (2013) sets best practice on conduct of pre-termination negotiations.
- Register: dignified, neutral, transactional. British English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then the employee's full legal name and home address. The Without-Prejudice header is a separate section.",
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
      title: "Subject line — Without Prejudice header and subject",
      instruction:
        "Render two short <p> elements: first the 'Without Prejudice and Subject to Contract' header in <strong>, then the subject line in <strong>.",
      scaffold: `<p><strong>Without Prejudice and Subject to Contract</strong></p>
<p><strong>Settlement Agreement — Proposed Terms</strong></p>`,
      constraints: [
        "MUST include the Without Prejudice and Subject to Contract header.",
        "MUST include a clear subject line.",
        "MUST NOT omit the Without Prejudice marking.",
      ],
      example: `<p><strong>Without Prejudice and Subject to Contract</strong></p>
<p><strong>Settlement Agreement — Proposed Terms</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT use first-name salutation in a settlement letter.",
      ],
      example: `<p>Dear Mr Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Opening — context",
      instruction:
        "Set out the context: that the company and the employee have been in discussions, that this letter and enclosed Settlement Agreement record the proposed terms, and that the discussions are pre-termination negotiations protected by s.111A ERA 1996. One short paragraph.",
      scaffold: `<p>Following our discussions on {{discussionDates}}, I enclose a draft Settlement Agreement setting out the proposed terms on which your employment with {{employerLegalName}} would end. This letter and the enclosed Settlement Agreement are written on a Without Prejudice and Subject to Contract basis, and our discussions are protected by section 111A of the Employment Rights Act 1996 as pre-termination negotiations.</p>`,
      constraints: [
        "MUST cite s.111A ERA 1996 protection.",
        "MUST reference the discussion(s) by date.",
        "MUST identify the document as a draft Settlement Agreement.",
        "MUST NOT include admissions of liability.",
      ],
      example: `<p>Following our discussions on 28 April 2026 and 5 May 2026, I enclose a draft Settlement Agreement setting out the proposed terms on which your employment with Acme Holdings Limited would end. This letter and the enclosed Settlement Agreement are written on a Without Prejudice and Subject to Contract basis, and our discussions are protected by section 111A of the Employment Rights Act 1996 as pre-termination negotiations.</p>`,
    },
    {
      sectionId: "body",
      title: "Summary of terms",
      instruction:
        "Summarise the headline terms: termination date, payments (notice, ex-gratia, statutory redundancy if applicable, tax treatment under s.401 ITEPA), reference, confidentiality, non-disparagement, and any restrictive covenants reaffirmed. Two to three paragraphs. Refer to the agreement for full terms.",
      scaffold: `<p>The principal terms proposed are summarised below. The full and binding terms are contained in the Settlement Agreement itself, which prevails in the event of any difference.</p>
<p>Your employment will terminate by mutual agreement on {{terminationDate}}. The company will pay you: (i) all earned but unpaid salary and {{accruedHolidayDays}} days of accrued holiday pay to {{terminationDate}}; (ii) {{noticePaymentTreatment}}; (iii) an ex-gratia payment of £{{exGratiaAmount}} as compensation for loss of office, of which the first £30,000 is paid free of income tax and National Insurance under section 401 of the Income Tax (Earnings and Pensions) Act 2003 and the balance is subject to deductions; and (iv) a contribution of £{{legalFeesContribution}} plus VAT towards the cost of your independent legal advice, paid directly to your adviser on production of an invoice.</p>
<p>The Settlement Agreement also provides for an agreed reference in the form set out in the schedule, mutual confidentiality, mutual non-disparagement, and confirmation that the post-termination restrictions in clauses {{restrictiveCovenantClauses}} of your Employment Contract continue to apply.</p>`,
      constraints: [
        "MUST cite s.401 ITEPA 2003 for the £30,000 tax-free treatment.",
        "MUST itemise the headline payments.",
        "MUST identify the post-2018 PENP/notice pay treatment correctly.",
        "MUST refer to the Settlement Agreement for full terms.",
        "MUST NOT make any admission of liability.",
      ],
      example: `<p>The principal terms proposed are summarised below. The full and binding terms are contained in the Settlement Agreement itself, which prevails in the event of any difference.</p>
<p>Your employment will terminate by mutual agreement on 30 June 2026. The company will pay you: (i) all earned but unpaid salary and 6 days of accrued holiday pay to 30 June 2026; (ii) a payment in lieu of your three-month notice period of £21,000 (gross), subject to income tax and National Insurance in the usual way under the post-employment notice pay rules in section 402D of the Income Tax (Earnings and Pensions) Act 2003; (iii) an ex-gratia payment of £45,000 as compensation for loss of office, of which the first £30,000 is paid free of income tax and National Insurance under section 401 of the Income Tax (Earnings and Pensions) Act 2003 and the balance is subject to deductions; and (iv) a contribution of £750 plus VAT towards the cost of your independent legal advice, paid directly to your adviser on production of an invoice.</p>
<p>The Settlement Agreement also provides for an agreed reference in the form set out in the schedule, mutual confidentiality, mutual non-disparagement, and confirmation that the post-termination restrictions in clauses 17 and 18 of your Employment Contract continue to apply.</p>`,
    },
    {
      sectionId: "terms",
      title: "Independent legal advice and statutory conditions",
      instruction:
        "State the s.203 ERA 1996 conditions for a binding settlement: writing, particular complaints identified, independent legal advice from a relevant adviser identified in the agreement, adviser insured, statement that the conditions are met. Reference the legal-fees contribution.",
      scaffold: `<p>To be legally binding, a Settlement Agreement under section 203 of the Employment Rights Act 1996 must be in writing, identify the particular complaints being waived, and be entered into after you have received independent legal advice from a relevant adviser who is identified in the agreement and who carries professional indemnity insurance covering that advice. The agreement records that these conditions are met. The company's contribution of £{{legalFeesContribution}} plus VAT towards the cost of your independent legal advice is intended to ensure you can obtain that advice without any out-of-pocket cost.</p>`,
      constraints: [
        "MUST cite s.203 ERA 1996 in full (writing, particular complaints, relevant adviser, identified, insured).",
        "MUST state the legal-fees contribution.",
        "MUST NOT pressure the employee to dispense with legal advice.",
      ],
      example: `<p>To be legally binding, a Settlement Agreement under section 203 of the Employment Rights Act 1996 must be in writing, identify the particular complaints being waived, and be entered into after you have received independent legal advice from a relevant adviser who is identified in the agreement and who carries professional indemnity insurance covering that advice. The agreement records that these conditions are met. The company's contribution of £750 plus VAT towards the cost of your independent legal advice is intended to ensure you can obtain that advice without any out-of-pocket cost.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Next steps and deadline",
      instruction:
        "State that the employee should take independent legal advice, give a reasonable deadline (the ACAS Code recommends a minimum of 10 calendar days), and provide a contact for any questions. Make clear the offer remains open until the deadline.",
      scaffold: `<p>Please take this letter and the enclosed Settlement Agreement to your independent legal adviser. The company would be grateful to receive your signed agreement (and your adviser's certificate) by {{settlementDeadline}}, which gives you {{daysToConsider}} calendar days to consider the proposal in line with the ACAS Code of Practice on Settlement Agreements. If you have any questions in the meantime, please contact {{contactName}}, {{contactTitle}}, at {{contactEmail}}.</p>`,
      constraints: [
        "MUST give a reasonable deadline (minimum 10 calendar days under ACAS guidance).",
        "MUST direct the employee to take independent legal advice.",
        "MUST name a contact.",
        "MUST NOT pressure the employee to sign before taking advice.",
      ],
      example: `<p>Please take this letter and the enclosed Settlement Agreement to your independent legal adviser. The company would be grateful to receive your signed agreement (and your adviser's certificate) by 26 May 2026, which gives you 14 calendar days to consider the proposal in line with the ACAS Code of Practice on Settlement Agreements. If you have any questions in the meantime, please contact Helen Carter, Director of People, at helen.carter@acme.example.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph noting the spirit in which the offer is made, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST keep tone neutral and transactional.",
        "MUST NOT include admissions or warmth that could be misread.",
      ],
      example: `<p>This proposal is made in the spirit of resolving matters constructively and on terms that recognise your service to the company. The company is open to a brief follow-up discussion through your adviser if helpful.</p>
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

export const SETTLEMENT_COVER_US: LetterTemplate = {
  letterType: "settlement_cover",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Separation Agreement / Severance Cover Letter):
- For employees aged 40 or older, any release of ADEA claims must comply with the Older Workers Benefit Protection Act (OWBPA), 29 USC section 626(f): writing, plain language, advice to consult counsel, 21 days to consider (or 45 days where a group exit/RIF is involved), 7 days to revoke after signing, identification of the ADEA claim being waived, and disclosures of the decisional unit and ages of selected/not-selected employees in a group setting.
- Section 409A of the Internal Revenue Code (26 USC 409A) governs the timing of deferred-compensation payments; severance must be timed to the end of the consideration/revocation period or qualify as a short-term deferral.
- California Senate Bill 331 (Silenced No More Act) limits NDAs/non-disparagement clauses where the underlying claim involves harassment, discrimination, or retaliation in the workplace; the employee must retain the right to discuss unlawful acts. Cal. Civ. Code 1670.11 and Gov. Code 12964.5.
- Federal Speak Out Act (42 USC 19401) limits pre-dispute NDA/non-disparagement clauses for sexual assault and sexual harassment claims.
- New York General Obligations Law 5-336 limits release of harassment/discrimination/retaliation claims unless certain conditions are met (preference of the complainant, 21-day period, 7-day revocation).
- Mark the cover and agreement 'Confidential — Settlement Discussion / Federal Rule of Evidence 408' for inadmissibility protection.
- Register: dignified, neutral, transactional. American English throughout.`,
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
      title: "Subject line — Confidential header and subject",
      instruction:
        "Render two short <p> elements: first the 'Confidential — Settlement Discussion (Fed. R. Evid. 408)' header in <strong>, then the subject line in <strong>.",
      scaffold: `<p><strong>Confidential — Settlement Discussion (Fed. R. Evid. 408)</strong></p>
<p><strong>Separation Agreement and General Release — Proposed Terms</strong></p>`,
      constraints: [
        "MUST include the confidential / settlement-discussion header for FRE 408 protection.",
        "MUST include a clear subject line.",
      ],
      example: `<p><strong>Confidential — Settlement Discussion (Fed. R. Evid. 408)</strong></p>
<p><strong>Separation Agreement and General Release — Proposed Terms</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT use first-name salutation in a separation letter.",
      ],
      example: `<p>Dear Mr. Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Opening — context",
      instruction:
        "State the context: that the company and the employee have been in discussions and that this letter and the enclosed Separation Agreement and General Release record the proposed terms.",
      scaffold: `<p>Following our discussions on {{discussionDates}}, I enclose a draft Separation Agreement and General Release setting out the proposed terms on which your employment with {{employerLegalName}} would end. This letter and the enclosed agreement are confidential settlement communications under Federal Rule of Evidence 408 and the corresponding state-law analogs.</p>`,
      constraints: [
        "MUST reference Federal Rule of Evidence 408 for inadmissibility protection.",
        "MUST reference the discussion(s) by date.",
        "MUST identify the document as a Separation Agreement and General Release.",
        "MUST NOT include admissions of liability.",
      ],
      example: `<p>Following our discussions on April 28, 2026 and May 5, 2026, I enclose a draft Separation Agreement and General Release setting out the proposed terms on which your employment with Acme Inc. would end. This letter and the enclosed agreement are confidential settlement communications under Federal Rule of Evidence 408 and the corresponding state-law analogs.</p>`,
    },
    {
      sectionId: "body",
      title: "Summary of terms",
      instruction:
        "Summarize the headline terms: separation date, severance, accrued amounts, COBRA subsidy, agreed reference, mutual non-disparagement, and confirmation that release does not waive non-waivable claims (e.g., right to file an EEOC charge).",
      scaffold: `<p>The principal terms proposed are summarized below. The full and binding terms are contained in the Separation Agreement itself, which prevails in the event of any difference.</p>
<p>Your employment will end by mutual agreement on {{separationDate}}. The company will pay you (in addition to all wages and accrued PTO due by law on the separation date): (i) a severance payment of {{currencySymbol}}{{severanceAmount}} (gross), payable in {{severanceInstallmentDescription}}, conditional on your execution and non-revocation of the enclosed agreement; (ii) a COBRA subsidy of {{cobraSubsidyMonths}} months at the company's contribution level, conditional on your timely COBRA election under 29 USC section 1166; and (iii) {{equityVestingTreatment}}.</p>
<p>The agreement also provides for an agreed reference in the form set out in the exhibit, mutual non-disparagement (subject to the carve-outs required by California Civil Code section 1670.11, Government Code section 12964.5, and the federal Speak Out Act, 42 USC 19401, where applicable), and confirmation that the release does not waive your right to file a charge with the Equal Employment Opportunity Commission or any analogous state agency, or to participate in any such investigation, although you waive any individual monetary recovery from such a charge.</p>`,
      constraints: [
        "MUST cite Federal Rule of Evidence 408 (in opening).",
        "MUST itemize the consideration components and identify which are conditional on the release.",
        "MUST preserve the right to file an EEOC charge (the right is non-waivable).",
        "MUST cite Cal. Civ. Code 1670.11 / Gov. Code 12964.5 and the federal Speak Out Act where harassment/discrimination claims are within scope.",
        "MUST NOT condition statutorily-due final pay on the release.",
      ],
      example: `<p>The principal terms proposed are summarized below. The full and binding terms are contained in the Separation Agreement itself, which prevails in the event of any difference.</p>
<p>Your employment will end by mutual agreement on June 30, 2026. The company will pay you (in addition to all wages and accrued PTO due by law on the separation date): (i) a severance payment of $52,000 (gross), payable in 12 equal bi-weekly installments through the regular payroll, conditional on your execution and non-revocation of the enclosed agreement; (ii) a COBRA subsidy of 6 months at the company's contribution level, conditional on your timely COBRA election under 29 USC section 1166; and (iii) accelerated vesting of 1,000 of the 4,000 unvested restricted stock units under your March 2024 grant agreement.</p>
<p>The agreement also provides for an agreed reference in the form set out in the exhibit, mutual non-disparagement (subject to the carve-outs required by California Civil Code section 1670.11, Government Code section 12964.5, and the federal Speak Out Act, 42 USC 19401, where applicable), and confirmation that the release does not waive your right to file a charge with the Equal Employment Opportunity Commission or any analogous state agency, or to participate in any such investigation, although you waive any individual monetary recovery from such a charge.</p>`,
    },
    {
      sectionId: "terms",
      title: "Consideration period, advice of counsel, and revocation",
      instruction:
        "State the OWBPA consideration period (21 or 45 days), the 7-day revocation period for ADEA waivers if 40+, the advice to consult counsel, and Section 409A timing implications. Cite statutes.",
      scaffold: `<p>{{owbpaParagraph}} You are advised to consult with an attorney of your own choosing before signing the Separation Agreement, and the company will reimburse reasonable legal fees up to {{currencySymbol}}{{legalFeesCap}} on production of an invoice. Severance payments are timed and structured so as to qualify as short-term deferrals or otherwise comply with section 409A of the Internal Revenue Code, 26 USC section 409A, with payments commencing only after the expiration of any revocation period.</p>`,
      constraints: [
        "MUST cite 29 USC 626(f) for OWBPA where the employee is 40+, with the 21- or 45-day consideration period and 7-day revocation period.",
        "MUST advise the employee to consult counsel.",
        "MUST cite 26 USC 409A for timing of payments.",
        "MUST disclose the decisional unit and age data where group exit applies.",
      ],
      example: `<p>Because you are aged 40 or above and this is part of a group exit, you have 45 days from your receipt of the Separation Agreement to consider it and 7 days after signing to revoke it, in accordance with the Older Workers Benefit Protection Act, 29 USC section 626(f). Disclosures of the decisional unit and the ages of the employees selected and not selected for separation are attached to the Separation Agreement. You are advised to consult with an attorney of your own choosing before signing the Separation Agreement, and the company will reimburse reasonable legal fees up to $1,500 on production of an invoice. Severance payments are timed and structured so as to qualify as short-term deferrals or otherwise comply with section 409A of the Internal Revenue Code, 26 USC section 409A, with payments commencing only after the expiration of any revocation period.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Next steps and deadline",
      instruction:
        "State the deadline for return of the signed agreement (matching the OWBPA period), the contact for questions, and that the offer remains open until the deadline.",
      scaffold: `<p>Please take this letter and the enclosed Separation Agreement to your attorney. The company would be grateful to receive the signed agreement by {{signatureDeadline}}. If you have any questions in the meantime, please contact {{contactName}}, {{contactTitle}}, at {{contactEmail}}.</p>`,
      constraints: [
        "MUST give a deadline matching the OWBPA period if applicable (21 or 45 days).",
        "MUST direct the employee to take independent legal advice.",
        "MUST name a contact.",
      ],
      example: `<p>Please take this letter and the enclosed Separation Agreement to your attorney. The company would be grateful to receive the signed agreement by June 26, 2026. If you have any questions in the meantime, please contact Helen Carter, Vice President of People, at helen.carter@acme.example.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph noting the spirit of the offer, followed by 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST keep tone neutral and transactional.",
        "MUST NOT include admissions or unwarranted warmth.",
      ],
      example: `<p>This proposal is made in the spirit of resolving matters constructively and on terms that recognize your service to the company. The company is open to a brief follow-up discussion through your attorney if helpful.</p>
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
