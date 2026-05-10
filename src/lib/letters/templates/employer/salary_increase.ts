import type { LetterTemplate } from "../types";

export const SALARY_INCREASE_UK: LetterTemplate = {
  letterType: "salary_increase",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Salary Increase):
- A salary change is a variation of contractual terms. The employer must provide a written statement of the change within one month under section 4 of the Employment Rights Act 1996.
- Auto-enrolment pension contributions under the Pensions Act 2008 will recompute on the new pensionable pay where applicable.
- Confirm the National Living Wage / National Minimum Wage compliance: the new rate must be at or above the applicable rate (current NLW for age 21+ at April 2025 is £12.21/hour).
- For pro-rata changes (mid-year, part-time), state the calculation basis explicitly.
- Register: warm, brief, factual. British English throughout.`,
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
        "Render a single short <p> with subject in <strong>: 'Salary Review — Increase effective {Date}'.",
      scaffold: `<p><strong>Salary Review — Increase effective {{effectiveDateUK}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST include the effective date.",
      ],
      example: `<p><strong>Salary Review — Increase effective 1 June 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. Prefer first-name salutation if used, otherwise 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Daniel,</p>`,
    },
    {
      sectionId: "body",
      title: "Pay change and reason",
      instruction:
        "State the increase amount, the percentage uplift, and the basis (annual review, market adjustment, performance recognition, retention). One short paragraph.",
      scaffold: `<p>Following the {{reviewType}}, I am pleased to confirm an increase to your gross annual base salary from £{{currentBaseSalary}} to £{{newBaseSalary}}, an uplift of {{percentageUplift}}%, with effect from {{effectiveDateUK}}. This increase reflects {{rationaleSummary}}.</p>`,
      constraints: [
        "MUST state the current and new gross annual salary.",
        "MUST state the percentage uplift.",
        "MUST state the effective date.",
        "MUST state the basis for the increase briefly.",
      ],
      example: `<p>Following the 2026 annual salary review, I am pleased to confirm an increase to your gross annual base salary from £82,000 to £88,560, an uplift of 8.0%, with effect from 1 June 2026. This increase reflects your strong performance over the review period and the benchmarking of your role against the wider market.</p>`,
    },
    {
      sectionId: "compensation",
      title: "New rate and effective date",
      instruction:
        "State pay cadence and confirm the first pay date on the new rate. Reference s.4 ERA 1996 written statement and pension recomputation if relevant.",
      scaffold: `<p>Your new salary will be paid monthly in arrears on the {{payDayOfMonth}} of each month, with the first payment at the new rate appearing in your {{firstNewRatePayMonth}} payslip. Pension contributions under the {{pensionSchemeName}} will recompute on the new pensionable pay in line with the Pensions Act 2008 auto-enrolment provisions. A written statement of this change will be issued under section 4 of the Employment Rights Act 1996 within one month of the effective date. All other terms and conditions of your Employment Contract remain unchanged.</p>`,
      constraints: [
        "MUST cite s.4 ERA 1996 for the written statement obligation.",
        "MUST state when the first payment at the new rate will appear.",
        "MUST confirm other terms remain unchanged.",
        "MUST NOT promise future increases.",
      ],
      example: `<p>Your new salary will be paid monthly in arrears on the 25th of each month, with the first payment at the new rate appearing in your June 2026 payslip. Pension contributions under the Acme Group Pension Scheme will recompute on the new pensionable pay in line with the Pensions Act 2008 auto-enrolment provisions. A written statement of this change will be issued under section 4 of the Employment Rights Act 1996 within one month of the effective date. All other terms and conditions of your Employment Contract remain unchanged.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST keep warmth restrained and brief.",
      ],
      example: `<p>Thank you for your continued contribution to Acme Holdings.</p>
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
      example: `<p>Helen Carter<br>Director of People<br>Acme Holdings Limited</p>`,
    },
  ],
};

export const SALARY_INCREASE_US: LetterTemplate = {
  letterType: "salary_increase",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Salary Increase):
- California: a Wage Theft Prevention Act amended notice (Lab. Code 2810.5) MUST be issued within 7 calendar days for non-exempt employees on a wage rate change.
- New York: section 195(2) of the Labor Law requires written notice in advance of any decrease, and within 10 business days for any change for non-exempt employees on hire under section 195(1).
- Colorado Equal Pay for Equal Work Act (C.R.S. 8-5-201 et seq.) requires posting of pay ranges; an internal salary change does not automatically trigger posting but is good practice.
- Federal FLSA: confirm the new rate keeps an exempt employee at or above the salary basis threshold ($684/week as of 2024; verify current threshold). For non-exempt, confirm the rate exceeds any applicable state minimum.
- Confirm at-will employment continues.
- Register: warm, brief, factual. American English throughout.`,
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
        "Render a single short <p> with subject in <strong>: 'Compensation Adjustment — effective {Date}'.",
      scaffold: `<p><strong>Compensation Adjustment — effective {{effectiveDateUS}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST include the effective date.",
      ],
      example: `<p><strong>Compensation Adjustment — effective June 1, 2026</strong></p>`,
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
      title: "Pay change and reason",
      instruction:
        "State the increase amount, the uplift, and the rationale (annual review, market adjustment, performance recognition).",
      scaffold: `<p>Following the {{reviewType}}, I am pleased to confirm an increase to your gross annual base salary from {{currencySymbol}}{{currentBaseSalary}} to {{currencySymbol}}{{newBaseSalary}}, an increase of {{percentageUplift}}%, effective {{effectiveDateUS}}. This adjustment reflects {{rationaleSummary}}.</p>`,
      constraints: [
        "MUST state the current and new gross annual salary.",
        "MUST state the percentage uplift.",
        "MUST state the effective date.",
        "MUST state the basis for the increase briefly.",
      ],
      example: `<p>Following the 2026 annual compensation review, I am pleased to confirm an increase to your gross annual base salary from $185,000 to $202,000, an increase of 9.2%, effective June 1, 2026. This adjustment reflects your strong performance over the review period and the benchmarking of your role against the wider market.</p>`,
    },
    {
      sectionId: "compensation",
      title: "New rate and effective date",
      instruction:
        "State pay frequency, when the new rate first appears, FLSA classification confirmation, and any state notice (Cal. Lab. Code 2810.5 / NY 195(2)). Confirm at-will status.",
      scaffold: `<p>Your new salary will be paid on a {{payFrequency}} basis, less applicable federal, state, and local taxes and authorized deductions. The first payment at the new rate will appear in your {{firstNewRatePayDate}} paycheck. The position remains classified as {{flsaClassification}} under the Fair Labor Standards Act, 29 USC 213(a)(1), and the new rate continues to satisfy the salary basis threshold. {{stateNoticeReference}} All other terms and conditions of your employment, including its at-will nature, remain unchanged.</p>`,
      constraints: [
        "MUST confirm FLSA classification continues to be supported by the new rate.",
        "MUST cite Cal. Lab. Code 2810.5 (CA) or NY Labor Law 195(2) (NY) where applicable.",
        "MUST confirm at-will status.",
        "MUST NOT promise future increases.",
      ],
      example: `<p>Your new salary will be paid on a semi-monthly basis, less applicable federal, state, and local taxes and authorized deductions. The first payment at the new rate will appear in your June 15, 2026 paycheck. The position remains classified as exempt under the Fair Labor Standards Act, 29 USC 213(a)(1), and the new rate continues to satisfy the salary basis threshold. An updated Wage Theft Prevention Act notice will be provided to you separately within seven calendar days under California Labor Code section 2810.5. All other terms and conditions of your employment, including its at-will nature, remain unchanged.</p>`,
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
      example: `<p>Thank you for your continued contribution to Acme Inc.</p>
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
