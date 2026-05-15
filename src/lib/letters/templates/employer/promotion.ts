import type { LetterTemplate } from "../types";

export const PROMOTION_UK: LetterTemplate = {
  letterType: "promotion",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Promotion):
- A promotion is a variation of contractual terms. The employer must issue a written statement of changes within one month under section 4 of the Employment Rights Act 1996.
- Continuity of service must be expressly preserved (s.218 ERA 1996); the new role does not break continuity.
- Confirm whether other terms (notice period, restrictive covenants, working hours) remain or change. If duties shift materially, consider whether existing covenants remain reasonable.
- Auto-enrolment under the Pensions Act 2008 may need recomputation if pensionable pay increases.
- For roles crossing collective-agreement boundaries, check Recognised Trade Union and TULRCA 1992 implications.
- Register: warm, congratulatory, precise. British English throughout (recognise, organisation, programme).`,
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
      example: `<p>12 May 2026<br><br>Ms Aisha Khan<br>27 Belgrave Crescent<br>Manchester M14 5RT</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Promotion to {New Title}, effective {Date}'.",
      scaffold: `<p><strong>Promotion to {{newJobTitle}}, effective {{effectiveDateUK}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST include the new title and the effective date.",
      ],
      example: `<p><strong>Promotion to Principal Software Engineer, effective 1 June 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. Prefer first-name salutation if the employee uses one, otherwise 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Aisha,</p>`,
    },
    {
      sectionId: "opening",
      title: "Opening — congratulations",
      instruction:
        "State the promotion warmly. Name the new role, the line manager, and the effective date. One short paragraph; warm but precise.",
      scaffold: `<p>I am delighted to confirm your promotion to the role of {{newJobTitle}}, reporting to {{newLineManagerName}}, {{newLineManagerTitle}}, with effect from {{effectiveDateUK}}. This promotion recognises your contribution to {{contributionSummary}} and we are very pleased to confirm it formally.</p>`,
      constraints: [
        "MUST name the new role, line manager, and effective date.",
        "MUST briefly state the basis for the promotion (what contribution it recognises).",
        "MUST NOT promise future promotions or guaranteed retention.",
      ],
      example: `<p>I am delighted to confirm your promotion to the role of Principal Software Engineer, reporting to Daniel Okafor, Head of Engineering, with effect from 1 June 2026. This promotion recognises your contribution to the platform consolidation programme and your technical leadership of the Manchester engineering team, and we are very pleased to confirm it formally.</p>`,
    },
    {
      sectionId: "body",
      title: "New role and responsibilities",
      instruction:
        "Summarise the new responsibilities at a high level. Reference the new role description if one is enclosed. One short paragraph.",
      scaffold: `<p>In your new role you will be responsible for {{newResponsibilitiesSummary}}. The full role description is set out in the Job Description enclosed with this letter and forms part of the variation to your terms.</p>`,
      constraints: [
        "MUST summarise the new responsibilities at a high level.",
        "MUST reference an enclosed Job Description where one exists.",
        "MUST NOT promise specific direct reports or budgets unless contractually agreed.",
      ],
      example: `<p>In your new role you will be responsible for the technical direction of the Platform group, line management of the Platform engineering leads, and accountability for the platform roadmap from Q3 2026 onwards. The full role description is set out in the Job Description enclosed with this letter and forms part of the variation to your terms.</p>`,
    },
    {
      sectionId: "compensation",
      title: "New compensation",
      instruction:
        "Set out the revised salary and bonus / equity terms. A small <table> comparing old vs new is helpful where the change is material. State amounts as gross.",
      scaffold: `<p>Your revised compensation, with effect from {{effectiveDateUK}}, will be as follows:</p>
<table>
<tr><td><strong>Element</strong></td><td><strong>Current</strong></td><td><strong>New</strong></td></tr>
<tr><td>Base salary (gross, per annum)</td><td>£{{currentBaseSalary}}</td><td>£{{newBaseSalary}}</td></tr>
<tr><td>Bonus target (% of base)</td><td>{{currentBonusPercent}}%</td><td>{{newBonusPercent}}%</td></tr>
</table>
<p>Salary will continue to be paid monthly in arrears on the {{payDayOfMonth}} of each month, subject to deductions for income tax and National Insurance.</p>`,
      constraints: [
        "MUST state amounts as gross.",
        "MUST use a small <table> when comparing old vs new figures.",
        "MUST use the GBP symbol '£'.",
        "MUST NOT promise discretionary bonuses as guaranteed.",
      ],
      example: `<p>Your revised compensation, with effect from 1 June 2026, will be as follows:</p>
<table>
<tr><td><strong>Element</strong></td><td><strong>Current</strong></td><td><strong>New</strong></td></tr>
<tr><td>Base salary (gross, per annum)</td><td>£82,000</td><td>£105,000</td></tr>
<tr><td>Bonus target (% of base)</td><td>10%</td><td>15%</td></tr>
</table>
<p>Salary will continue to be paid monthly in arrears on the 25th of each month, subject to deductions for income tax and National Insurance.</p>`,
    },
    {
      sectionId: "terms",
      title: "Continuity and other terms",
      instruction:
        "Confirm that continuous service is preserved (s.218 ERA 1996), state which terms remain unchanged, and reference the s.4 ERA written statement of changes.",
      scaffold: `<p>All other terms and conditions of your Employment Contract dated {{originalContractDate}} remain unchanged, including your notice period, holiday entitlement, pension arrangements, and continuous service, which is preserved under section 218 of the Employment Rights Act 1996. A written statement of these changes will be issued under section 4 of the Employment Rights Act 1996 within one month of the effective date.</p>`,
      constraints: [
        "MUST cite s.218 ERA 1996 for continuity of service.",
        "MUST cite s.4 ERA 1996 for the written statement obligation.",
        "MUST list the unchanged terms.",
        "MUST NOT introduce new restrictive covenants without express agreement.",
      ],
      example: `<p>All other terms and conditions of your Employment Contract dated 14 March 2022 remain unchanged, including your notice period of three months, your holiday entitlement of 25 days plus bank holidays, your participation in the Acme Group Pension Scheme, and your continuous service, which is preserved under section 218 of the Employment Rights Act 1996. A written statement of these changes will be issued under section 4 of the Employment Rights Act 1996 within one month of the effective date.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph congratulating the employee, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST keep warmth restrained and professional.",
      ],
      example: `<p>Congratulations once again on this promotion. Your line manager will be in touch shortly to discuss the transition and the priorities for your first quarter in the new role.</p>
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

export const PROMOTION_US: LetterTemplate = {
  letterType: "promotion",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Promotion):
- A promotion may change the FLSA classification (exempt vs non-exempt) under 29 USC 213(a)(1) and 29 CFR Part 541. Re-evaluate the duties test and the salary basis test for the new role.
- California: re-issue the Wage Theft Prevention Act notice (Lab. Code 2810.5) within 7 calendar days for non-exempt employees.
- New York: a Wage Theft Prevention Act notice (Labor Law 195(1)) must be provided within 10 business days of the change.
- Pay-transparency states (CA Lab. Code 432.3, NY Labor Law 194-b, CO C.R.S. 8-5-201, WA RCW 49.58.110, IL P.A. 103-0539, MA M.G.L. c.149 105E) may require posting of the pay range when an internal promotion is involved.
- Confirm at-will employment continues; do not create implied term promises.
- Register: warm, professional. American English throughout (recognize, organization, program).`,
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
      example: `<p>May 12, 2026<br><br>Ms. Aisha Khan<br>1840 Sansome Street, Apt 4C<br>San Francisco, CA 94111</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Promotion to {New Title}, effective {Date}'.",
      scaffold: `<p><strong>Promotion to {{newJobTitle}}, effective {{effectiveDateUS}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST include the new title and the effective date.",
      ],
      example: `<p><strong>Promotion to Principal Software Engineer, effective June 1, 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. 'Dear {PreferredName},' if used, otherwise 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Aisha,</p>`,
    },
    {
      sectionId: "opening",
      title: "Opening — congratulations",
      instruction:
        "State the promotion warmly. Name the new role, manager, and effective date. One short paragraph.",
      scaffold: `<p>I am pleased to confirm your promotion to the role of {{newJobTitle}}, reporting to {{newLineManagerName}}, {{newLineManagerTitle}}, effective {{effectiveDateUS}}. This promotion recognizes your contribution to {{contributionSummary}}.</p>`,
      constraints: [
        "MUST name the new role, manager, and effective date.",
        "MUST state the basis for the promotion briefly.",
        "MUST NOT promise future promotions or guaranteed retention.",
      ],
      example: `<p>I am pleased to confirm your promotion to the role of Principal Software Engineer, reporting to Daniel Okafor, Director of Engineering, effective June 1, 2026. This promotion recognizes your contribution to the platform consolidation program and your technical leadership of the San Francisco engineering team.</p>`,
    },
    {
      sectionId: "body",
      title: "New role and responsibilities",
      instruction:
        "Summarize the new responsibilities at a high level. Reference the new job description if one is enclosed.",
      scaffold: `<p>In your new role you will be responsible for {{newResponsibilitiesSummary}}. The full role description is set out in the Job Description provided with this letter.</p>`,
      constraints: [
        "MUST summarize the new responsibilities at a high level.",
        "MUST reference any enclosed Job Description.",
        "MUST NOT promise specific direct reports or budgets unless agreed.",
      ],
      example: `<p>In your new role you will be responsible for the technical direction of the Platform group, line management of the Platform engineering leads, and accountability for the platform roadmap from Q3 2026 onwards. The full role description is set out in the Job Description provided with this letter.</p>`,
    },
    {
      sectionId: "compensation",
      title: "New compensation",
      instruction:
        "Set out the revised compensation: base salary, bonus target, equity grant. Use a small <table> for material before/after changes. State amounts as gross.",
      scaffold: `<p>Effective {{effectiveDateUS}}, your compensation will be revised as follows:</p>
<table>
<tr><td><strong>Element</strong></td><td><strong>Current</strong></td><td><strong>New</strong></td></tr>
<tr><td>Base salary (annualized, gross)</td><td>{{currencySymbol}}{{currentBaseSalary}}</td><td>{{currencySymbol}}{{newBaseSalary}}</td></tr>
<tr><td>Target bonus (% of base)</td><td>{{currentBonusPercent}}%</td><td>{{newBonusPercent}}%</td></tr>
</table>
<p>Salary will continue to be paid on a {{payFrequency}} basis, less applicable federal, state, and local taxes and authorized deductions. {{equityGrantParagraph}}</p>`,
      constraints: [
        "MUST state amounts as gross.",
        "MUST use a small <table> for before/after comparison.",
        "MUST disclose pay range if a transparency state requires it.",
        "MUST NOT promise discretionary awards as guaranteed.",
      ],
      example: `<p>Effective June 1, 2026, your compensation will be revised as follows:</p>
<table>
<tr><td><strong>Element</strong></td><td><strong>Current</strong></td><td><strong>New</strong></td></tr>
<tr><td>Base salary (annualized, gross)</td><td>$185,000</td><td>$235,000</td></tr>
<tr><td>Target bonus (% of base)</td><td>15%</td><td>20%</td></tr>
</table>
<p>Salary will continue to be paid on a semi-monthly basis, less applicable federal, state, and local taxes and authorized deductions. You will also be granted an additional 4,000 restricted stock units, vesting over four years from the effective date subject to the company's 2026 Equity Incentive Plan and a separate grant agreement.</p>`,
    },
    {
      sectionId: "terms",
      title: "Continuity, classification, and other terms",
      instruction:
        "Confirm at-will status continues, state any change in FLSA classification, and reference any state-specific notice (Cal. Lab. Code 2810.5, NY 195(1)).",
      scaffold: `<p>All other terms and conditions of your employment, including its at-will nature, remain unchanged. The position is classified as {{flsaClassification}} under the Fair Labor Standards Act, 29 USC 213(a)(1) and 29 CFR Part 541. {{stateNoticeReference}}</p>`,
      constraints: [
        "MUST confirm at-will status continues.",
        "MUST state the FLSA classification of the new role and cite 29 USC 213(a)(1).",
        "MUST reference Cal. Lab. Code 2810.5 / NY Labor Law 195(1) where applicable.",
        "MUST NOT promise any specific term of employment.",
      ],
      example: `<p>All other terms and conditions of your employment, including its at-will nature, remain unchanged. The position is classified as exempt under the Fair Labor Standards Act, 29 USC 213(a)(1) and 29 CFR Part 541. An updated Wage Theft Prevention Act notice will be provided to you separately within seven calendar days under California Labor Code section 2810.5.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph, followed by 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST keep warmth professional and brief.",
      ],
      example: `<p>Congratulations on this promotion. Your manager will be in touch to discuss the transition and your priorities for the next quarter.</p>
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
      example: `<p>Helen Carter<br>Vice President, People<br>Acme Inc.</p>`,
    },
  ],
};
