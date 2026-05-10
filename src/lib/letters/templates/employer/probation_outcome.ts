import type { LetterTemplate } from "../types";

export const PROBATION_OUTCOME_UK: LetterTemplate = {
  letterType: "probation_outcome",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Probation Outcome):
- An employee with under two years' continuous service generally has no ordinary unfair-dismissal claim under s.108 ERA 1996, but exceptions apply: discrimination (Equality Act 2010), whistleblowing (s.103A ERA 1996), and other automatic-unfair categories (ss.99–105 ERA 1996).
- The ACAS Code of Practice on Disciplinary and Grievance Procedures applies to capability dismissals as best practice; non-compliance may attract a 25% uplift on tribunal awards under s.207A TULRCA 1992.
- Once the employee has more than one month's service, statutory minimum notice under s.86 ERA 1996 applies (1 week minimum); contractual notice may be longer.
- For pass / extension / fail outcomes, this template branches on outcome — be precise about which is being communicated.
- Right to be accompanied at any review meeting under s.10 ERelA 1999 should be respected.
- Register: factual, dignified, no editorialising on character. British English throughout.`,
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
        "Render a single short <p> with subject in <strong>: 'Probation Review Outcome — {Pass / Extension / Fail}'.",
      scaffold: `<p><strong>Probation Review Outcome — {{outcomeLabel}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the outcome plainly: Pass, Extension, or Fail.",
      ],
      example: `<p><strong>Probation Review Outcome — Successful Completion</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr/Ms/Dr {Surname},' or first-name salutation if used.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Aisha,</p>`,
    },
    {
      sectionId: "body",
      title: "Outcome and rationale",
      instruction:
        "State the outcome (Pass / Extension / Fail) plainly. Reference the probation review meeting date and chair. Summarise the basis for the outcome (objectives met / not met). Two short paragraphs.",
      scaffold: `<p>I am writing to confirm the outcome of your probation review meeting held on {{reviewMeetingDate}}, chaired by {{reviewChairName}}, {{reviewChairTitle}}. {{outcomeStatementParagraph}}</p>
<p>{{rationaleParagraph}}</p>`,
      constraints: [
        "MUST state the outcome (Pass, Extension, or Fail) clearly in the first sentence of the outcome statement.",
        "MUST reference the review meeting by date and chair.",
        "MUST summarise the rationale with reference to the probation objectives.",
        "MUST NOT make findings of fact beyond those discussed at the review.",
      ],
      example: `<p>I am writing to confirm the outcome of your probation review meeting held on 5 May 2026, chaired by Daniel Okafor, Head of Engineering. I am pleased to confirm that you have successfully completed your probationary period.</p>
<p>The review considered your performance against the four objectives set at induction: technical contribution, collaboration, on-call participation, and stakeholder engagement. The review concluded that you have met or exceeded each of these objectives over the six-month probation period, and your line manager has confirmed your readiness to take on the full scope of the role.</p>`,
    },
    {
      sectionId: "terms",
      title: "Effect on terms",
      instruction:
        "On Pass: confirm full notice period is now in effect, any salary review on completion, end of probation conditions. On Extension: state the new probation end date, additional support, and review meeting. On Fail: state the last day of employment, notice or pay in lieu, accrued holiday pay (Working Time Regulations 1998), and any return of property requirement.",
      scaffold: `<p>{{effectOnTermsParagraph}}</p>`,
      constraints: [
        "MUST address notice period treatment on Pass (e.g., now 3 months not 1 week).",
        "MUST cite s.86 ERA 1996 when paying statutory minimum notice on Fail.",
        "MUST cite Working Time Regulations 1998 for accrued holiday pay on Fail.",
        "MUST give a specific extension end date and review date on Extension.",
        "MUST NOT change other terms beyond those expressly varied.",
      ],
      example: `<p>With effect from 1 June 2026, your contractual notice period increases from one week to three months on either side, in line with clause 12.1 of your Employment Contract. All other terms and conditions of your Employment Contract remain unchanged. Your annual leave entitlement, pension arrangements, and salary review timing continue as set out in your contract.</p>`,
    },
    {
      sectionId: "appeal_rights",
      title: "Right of appeal (Fail and Extension only)",
      instruction:
        "Where the outcome is Fail or an extension is being imposed against the employee's wishes, name an appeal officer, give a 5-working-day deadline, and reference the right to be accompanied (s.10 ERelA 1999). For Pass outcomes, omit this section or render an empty string.",
      scaffold: `<p>{{appealRightsParagraph}}</p>`,
      constraints: [
        "MUST name an appeal officer different from the dismissing/extending officer where possible.",
        "MUST give a specific deadline (working days).",
        "MUST cite s.10 ERelA 1999.",
        "MUST be omitted (or rendered as empty) for a Pass outcome.",
      ],
      example: `<p>If you wish to appeal this decision, please write to Helen Carter, Director of People, at helen.carter@acme.example within 5 working days of the date of this letter, setting out the grounds of your appeal. You are entitled to be accompanied at any appeal hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph appropriate to the outcome, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST match the tone to the outcome (warm on Pass, factual on Extension/Fail).",
      ],
      example: `<p>Congratulations on completing your probation. We look forward to your continued contribution to the team.</p>
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
      example: `<p>Daniel Okafor<br>Head of Engineering<br>Acme Holdings Limited</p>`,
    },
  ],
};

export const PROBATION_OUTCOME_US: LetterTemplate = {
  letterType: "probation_outcome",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Probation Outcome):
- US employment is at-will throughout any introductory or probationary period; the employer may terminate at any time without cause. Document the legitimate business reason for any Fail outcome to defeat discrimination claims (Title VII, ADA, ADEA, FEHA, state analogs).
- On Fail / termination at end of probation: California requires immediate payment of all final wages on the last day for employer-initiated terminations (Lab. Code 201; Lab. Code 203 waiting-time penalty for non-compliance). NY: next regular payday. TX: next regular payday under Lab. Code 61.014. Verify state rule.
- Accrued unused PTO must be paid out in CA, CO, MA, IL, NE, ND under state final-pay rules where it has vested under policy.
- COBRA continuation notice (29 USC 1166) must follow within 14 days for terminating employees enrolled in employer health plans.
- ADA: if disability is implicated in performance, separate the performance issue from accommodation discussion and document the interactive process.
- Register: factual, professional, no character commentary. American English throughout.`,
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
        "Render a single short <p> with subject in <strong>: 'Introductory Period Review — {Pass / Extension / End of Employment}'.",
      scaffold: `<p><strong>Introductory Period Review — {{outcomeLabel}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the outcome plainly.",
      ],
      example: `<p><strong>Introductory Period Review — Successful Completion</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear {PreferredName},' or 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Aisha,</p>`,
    },
    {
      sectionId: "body",
      title: "Outcome and rationale",
      instruction:
        "State the outcome plainly. Reference the review meeting date and chair. Summarize the rationale with reference to the role objectives.",
      scaffold: `<p>This letter confirms the outcome of your introductory-period review meeting on {{reviewMeetingDate}}, chaired by {{reviewChairName}}, {{reviewChairTitle}}. {{outcomeStatementParagraph}}</p>
<p>{{rationaleParagraph}}</p>`,
      constraints: [
        "MUST state the outcome clearly.",
        "MUST reference the review by date and chair.",
        "MUST summarize the rationale with reference to documented role expectations.",
        "MUST NOT include character judgments or speculative findings.",
      ],
      example: `<p>This letter confirms the outcome of your introductory-period review meeting on May 5, 2026, chaired by Daniel Okafor, Director of Engineering. I am pleased to confirm that you have successfully completed your introductory period.</p>
<p>The review considered your performance against the four objectives set at hire: technical contribution, collaboration, on-call participation, and stakeholder engagement. The review concluded that you have met or exceeded each of these objectives over the six-month introductory period, and your manager has confirmed your readiness to take on the full scope of the role.</p>`,
    },
    {
      sectionId: "terms",
      title: "Effect on terms",
      instruction:
        "On Pass: confirm continuation in role, any benefits eligibility starting now, no change to at-will status. On Extension: state the new review date and the supports offered. On End of Employment: state last day, final-pay timing per state, accrued PTO treatment, COBRA notice timing, and that the decision is at-will.",
      scaffold: `<p>{{effectOnTermsParagraph}}</p>`,
      constraints: [
        "MUST cite the relevant state final-pay rule on End of Employment (e.g., Cal. Lab. Code 201).",
        "MUST address accrued PTO under state law on End of Employment.",
        "MUST reference COBRA (29 USC 1166) on End of Employment.",
        "MUST confirm at-will status remains in effect on Pass and Extension.",
        "MUST NOT promise continued employment or any specific term.",
      ],
      example: `<p>With effect from June 1, 2026, you will be eligible for the company's full benefits suite, including 401(k) plan participation and the standard PTO accrual rate of 20 days per year. All other terms and conditions of your employment, including its at-will nature, remain unchanged.</p>`,
    },
    {
      sectionId: "appeal_rights",
      title: "Internal review rights (End of Employment / Extension)",
      instruction:
        "Where the outcome is End of Employment or a contested Extension, name an internal review contact and a deadline. For Pass, omit or render as empty. There is no statutory right of appeal in the US, but documenting an internal review path is best practice.",
      scaffold: `<p>{{internalReviewParagraph}}</p>`,
      constraints: [
        "MUST name an internal review contact on End of Employment or contested Extension.",
        "MUST give a specific deadline (e.g., 5 business days).",
        "MUST be omitted for a Pass outcome.",
        "MUST NOT mischaracterize an internal process as a statutory right of appeal.",
      ],
      example: `<p>If you wish the company to review this decision, please contact Helen Carter, Vice President of People, at helen.carter@acme.example within 5 business days of the date of this letter, setting out any matters you would like the company to consider.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph appropriate to the outcome, followed by 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST match the tone to the outcome.",
      ],
      example: `<p>Congratulations on completing your introductory period. We look forward to your continued contribution to the team.</p>
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
      example: `<p>Daniel Okafor<br>Director of Engineering<br>Acme Inc.</p>`,
    },
  ],
};
