import type { LetterTemplate } from "../types";

export const RETURN_TO_WORK_UK: LetterTemplate = {
  letterType: "return_to_work",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Return to Work):
- After Ordinary Maternity Leave (first 26 weeks), the employee has the right to return to the same job under section 71 of the Employment Rights Act 1996. After Additional Maternity Leave (weeks 27–52), the right is to the same job or, if not reasonably practicable, a suitable alternative on no less favourable terms (regulation 18 of the Maternity and Parental Leave etc. Regulations 1999).
- Equality Act 2010 sections 20–22 impose a duty to make reasonable adjustments where a provision, criterion, or practice places a disabled returning employee at substantial disadvantage. Document any adjustments agreed.
- Occupational Health (OH) referral is best practice where the leave was sickness-related; reference the OH report (with the employee's consent) and any advised adjustments.
- For sickness returns, a return-to-work meeting should be held; document its outcomes.
- Phased return arrangements (reduced hours building up to contractual hours) should be time-limited and pay-clear.
- Annual leave continues to accrue throughout statutory leave under the Working Time Regulations 1998 (regulation 13); confirm the carry-over position.
- Register: warm, supportive, precise. British English throughout.`,
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
        "Render a single short <p> with the subject in <strong>: 'Return to Work — {Leave Type}'.",
      scaffold: `<p><strong>Return to Work — {{leaveType}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the type of leave the employee is returning from.",
      ],
      example: `<p><strong>Return to Work — Maternity Leave</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear {PreferredName},' or 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Aisha,</p>`,
    },
    {
      sectionId: "body",
      title: "Welcome and return date",
      instruction:
        "Welcome the employee back. Confirm the return-to-work date, the role being returned to (with reference to s.71 ERA 1996 right to same/suitable alternative job for maternity returners), and any prior return-to-work meeting.",
      scaffold: `<p>Welcome back. Following our return-to-work meeting on {{returnMeetingDate}} and the {{relevantMedicalEvidence}}, I am pleased to confirm your return to work on {{returnDate}} to your role as {{returningRoleTitle}}, in accordance with {{statutoryReturnRight}}.</p>`,
      constraints: [
        "MUST cite s.71 ERA 1996 (or equivalent) for the right of return where applicable.",
        "MUST state the return date and the role.",
        "MUST reference the return-to-work meeting and any OH report.",
        "MUST NOT impose conditions inconsistent with the right of return.",
      ],
      example: `<p>Welcome back. Following our return-to-work meeting on 28 April 2026 and the Occupational Health report of 2 May 2026, I am pleased to confirm your return to work on 1 July 2026 to your role as Senior Software Engineer, in accordance with section 71 of the Employment Rights Act 1996 and your right to return to the same job following Ordinary Maternity Leave.</p>`,
    },
    {
      sectionId: "terms",
      title: "Role, hours, and reasonable adjustments",
      instruction:
        "State the working pattern (hours, days, location), any phased return, any reasonable adjustments under Equality Act 2010 ss.20–22, and the carry-over of accrued holiday under WTR 1998. Two short paragraphs.",
      scaffold: `<p>Your contractual working pattern of {{contractualWorkingPattern}} will resume on your return. {{phasedReturnParagraph}} The reasonable adjustments agreed at the return-to-work meeting are as follows: {{reasonableAdjustmentsList}}. These adjustments are made in accordance with sections 20 to 22 of the Equality Act 2010 and will be reviewed at our follow-up meeting on {{adjustmentsReviewDate}}.</p>
<p>Your accrued holiday entitlement of {{accruedHolidayDays}} days, which has continued to accrue under regulation 13 of the Working Time Regulations 1998 throughout your leave, has been carried over and is available for use during the current holiday year. Your participation in the {{pensionSchemeName}} and other benefits resumes from your return date.</p>`,
      constraints: [
        "MUST cite Equality Act 2010 ss.20–22 for reasonable adjustments where applicable.",
        "MUST cite WTR 1998 regulation 13 for holiday accrual carry-over.",
        "MUST state the phased-return arrangement (hours, duration, pay) precisely if applicable.",
        "MUST set a review date for any adjustments.",
      ],
      example: `<p>Your contractual working pattern of 37.5 hours per week, Monday to Friday, with hybrid working in line with the Hybrid Working Policy, will resume on your return. To support your return, we have agreed a phased return: 3 days per week (60% of contractual hours, paid at full contractual salary) for the first 4 weeks, then 4 days per week (80% of hours, paid at full contractual salary) for weeks 5 and 6, with full hours from week 7. The reasonable adjustments agreed at the return-to-work meeting are as follows: a quiet workspace booking when on-site, scheduled break-out time mid-morning and mid-afternoon, and access to the on-site nursing room. These adjustments are made in accordance with sections 20 to 22 of the Equality Act 2010 and will be reviewed at our follow-up meeting on 31 July 2026.</p>
<p>Your accrued holiday entitlement of 25 days, which has continued to accrue under regulation 13 of the Working Time Regulations 1998 throughout your leave, has been carried over and is available for use during the current holiday year. Your participation in the Acme Group Pension Scheme and other benefits resumes from your return date.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph welcoming the employee back, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST keep tone warm and supportive.",
      ],
      example: `<p>The team is looking forward to having you back. Your line manager, Daniel Okafor, will be in touch before your return date with a re-onboarding plan and to set up a check-in for your first week.</p>
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

export const RETURN_TO_WORK_US: LetterTemplate = {
  letterType: "return_to_work",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Return to Work):
- FMLA: an employee returning from FMLA leave is entitled to be restored to the same or an equivalent position, with the same pay, benefits, and other terms and conditions of employment, under 29 USC section 2614(a)(1) and 29 CFR 825.214.
- Pregnancy Workers Fairness Act (PWFA), 42 USC 2000gg: reasonable accommodations for known limitations related to pregnancy, childbirth, or related medical conditions, including post-partum recovery, breastfeeding/lactation accommodations.
- ADA (42 USC 12112) and the interactive process under 29 CFR 1630.2(o)(3): document the dialogue and any reasonable accommodations agreed.
- California Pregnancy Disability Leave (Gov. Code 12945) provides up to four months and the right to return to the same role unless the role no longer exists for non-pregnancy-related reasons.
- A fitness-for-duty certification may be required only if it was disclosed in the FMLA designation notice (29 CFR 825.312).
- Phased-return arrangements should be time-limited and clearly described as to hours and pay.
- Register: warm, supportive, precise. American English throughout.`,
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
        "Render a single short <p> with the subject in <strong>: 'Return to Work — {Leave Type}'.",
      scaffold: `<p><strong>Return to Work — {{leaveType}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the leave type.",
      ],
      example: `<p><strong>Return to Work — FMLA Bonding Leave</strong></p>`,
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
      title: "Welcome and return date",
      instruction:
        "Welcome the employee back. Confirm the return-to-work date, the role and reporting line, and the statutory restoration right (29 USC 2614(a)(1) for FMLA returns; PDL/PWFA for pregnancy-related).",
      scaffold: `<p>Welcome back. Following our return-to-work conversation on {{returnConversationDate}} and any related medical certification, this letter confirms your return to work on {{returnDate}} to your role as {{returningRoleTitle}}, reporting to {{lineManagerName}}, {{lineManagerTitle}}, in accordance with {{statutoryReturnRight}}.</p>`,
      constraints: [
        "MUST cite 29 USC 2614(a)(1) for FMLA restoration where applicable.",
        "MUST state the return date, role, and reporting line.",
        "MUST NOT impose conditions inconsistent with the restoration right.",
      ],
      example: `<p>Welcome back. Following our return-to-work conversation on April 28, 2026 and any related medical certification, this letter confirms your return to work on July 1, 2026 to your role as Senior Software Engineer, reporting to Daniel Okafor, Director of Engineering, in accordance with the restoration right under 29 USC section 2614(a)(1) of the Family and Medical Leave Act.</p>`,
    },
    {
      sectionId: "terms",
      title: "Role, hours, and accommodations",
      instruction:
        "State working pattern, any phased return (hours and pay), any reasonable accommodations agreed under the ADA / PWFA interactive process, and benefits reinstatement.",
      scaffold: `<p>Your standard working pattern of {{standardWorkingPattern}} will resume on your return. {{phasedReturnParagraph}} The reasonable accommodations agreed through the interactive process under the {{accommodationStatuteReference}} are as follows: {{accommodationsList}}. These will be reviewed at our follow-up meeting on {{accommodationsReviewDate}}.</p>
<p>Your participation in the company's medical, dental, vision, life insurance, and 401(k) plans resumes from your return date on the same basis as before your leave. Any premium balances accrued during unpaid portions of your leave have been addressed in line with our prior communication.</p>`,
      constraints: [
        "MUST cite ADA (42 USC 12112), PWFA (42 USC 2000gg), or the relevant state statute when describing accommodations.",
        "MUST state any phased-return arrangement (hours, duration, pay) precisely.",
        "MUST set a review date for accommodations.",
        "MUST NOT condition return on accommodations the employee has not requested.",
      ],
      example: `<p>Your standard working pattern of 40 hours per week, Monday to Friday, with hybrid working under the company's Hybrid Work Policy, will resume on your return. To support your return, we have agreed a phased return: 3 days per week (24 hours, paid at full contractual salary) for the first 4 weeks, then 4 days per week (32 hours, paid at full contractual salary) for weeks 5 and 6, with full hours from week 7. The reasonable accommodations agreed through the interactive process under the Pregnancy Workers Fairness Act (42 USC section 2000gg) are as follows: a private lactation space and two 30-minute lactation breaks per working day, scheduled in coordination with your manager. These will be reviewed at our follow-up meeting on July 31, 2026.</p>
<p>Your participation in the company's medical, dental, vision, life insurance, and 401(k) plans resumes from your return date on the same basis as before your leave. Any premium balances accrued during unpaid portions of your leave have been addressed in line with our prior communication.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph welcoming the employee back, followed by 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST keep tone warm and supportive.",
      ],
      example: `<p>The team is looking forward to having you back. Your manager will be in touch before your return date with a re-onboarding plan and a first-week check-in.</p>
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
