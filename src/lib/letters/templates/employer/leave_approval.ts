import type { LetterTemplate } from "../types";

export const LEAVE_APPROVAL_UK: LetterTemplate = {
  letterType: "leave_approval",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Leave Approval):
- Identify the applicable statutory regime: Statutory Maternity Leave (s.71–73 ERA 1996, MPLR 1999); Statutory Paternity Leave (PPLR 2002); Shared Parental Leave (CSPLR 2014); Adoption Leave (s.75A ERA); Carer's Leave (Carer's Leave Regulations 2024); Statutory Sick Pay (Social Security Contributions and Benefits Act 1992); Unpaid Parental Leave (MPLR 1999); Bereavement Leave / Parental Bereavement Leave (Parental Bereavement (Leave and Pay) Act 2018).
- State the pay arrangement (SMP/SPP/ShPP/SSP at statutory rate; any contractual enhancement). For SMP: 90% of average weekly earnings for first 6 weeks, then statutory rate or 90% (whichever is lower) for next 33 weeks. For SSP (from 6 April 2026): payable from the first day of incapacity at the standard weekly rate or 80% of average weekly earnings if lower, up to 28 weeks.
- Confirm benefits continuation during paid and unpaid statutory leave: pension contributions continue on contractual pay during paid maternity/adoption leave (Equality Act 2010, Sex Discrimination Act-derived case law); annual leave continues to accrue throughout statutory leave (Working Time Regulations 1998, regulation 13).
- Reference KIT/SPLIT day allowance: up to 10 KIT days during maternity/adoption leave; up to 20 SPLIT days during shared parental leave.
- Confirm the right to return to the same job (after Ordinary Maternity Leave, first 26 weeks) or same/suitable alternative (after Additional Maternity Leave) under s.71 ERA.
- Register: warm but precise; supportive in tone. British English throughout.`,
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
        "Render a single short <p> with the subject in <strong>: 'Approval of {Leave Type} Leave'.",
      scaffold: `<p><strong>Approval of {{leaveType}} Leave</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the leave type precisely.",
      ],
      example: `<p><strong>Approval of Statutory Maternity Leave</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. First-name salutation is appropriate for leave letters: 'Dear {PreferredName},' or 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeePreferredOrSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Aisha,</p>`,
    },
    {
      sectionId: "body",
      title: "Leave details and dates",
      instruction:
        "Confirm the leave type, the start date, the end date, and any relevant statutory framework. Reference the employee's notification (MAT B1 form, sickness self-cert, etc.) and the date received.",
      scaffold: `<p>Following your notification of {{notificationDate}} (and the {{evidenceFormType}} provided), I am pleased to confirm the approval of your {{leaveType}} leave under {{statutoryReference}}. Your leave will start on {{leaveStartDate}} and end on {{leaveEndDate}}, with your expected return to work on {{expectedReturnDate}}.</p>`,
      constraints: [
        "MUST cite the statutory reference (e.g., s.71 ERA 1996; Carer's Leave Regulations 2024).",
        "MUST state the start, end, and expected return dates.",
        "MUST reference the notification and any evidence (MAT B1, fit note).",
        "MUST NOT impose conditions not contemplated by statute.",
      ],
      example: `<p>Following your notification of 18 March 2026 (and the MAT B1 form provided), I am pleased to confirm the approval of your Statutory Maternity Leave under section 71 of the Employment Rights Act 1996 and the Maternity and Parental Leave etc. Regulations 1999. Your leave will start on 1 July 2026 and end on 30 June 2027 (52 weeks of Ordinary and Additional Maternity Leave), with your expected return to work on 1 July 2027.</p>`,
    },
    {
      sectionId: "terms",
      title: "Pay, benefits, and contact during leave",
      instruction:
        "State the pay arrangement (SMP/SPP/SSP rates and any enhancement), benefits continuation (pension, holiday accrual under WTR 1998, private medical), KIT/SPLIT day allowance where applicable, and the agreed contact arrangements.",
      scaffold: `<p>During your leave, you will receive {{statutoryPayDescription}}, together with {{contractualEnhancementDescription}}. Your participation in the {{pensionSchemeName}} will continue on your contractual pay throughout your paid leave period, and your annual leave will continue to accrue under the Working Time Regulations 1998 (regulation 13). Your enrolment in the {{medicalPlanName}} and other employee benefits will continue on the same basis as before.</p>
<p>You may, by agreement with the company, work up to {{kitSplitDayCount}} {{kitOrSplit}} days during your leave without bringing it to an end. Your line manager, {{lineManagerName}}, will keep in touch with you on the {{contactCadence}} basis you have requested. If you wish to vary your expected return date, please give the company at least 8 weeks' notice in writing.</p>`,
      constraints: [
        "MUST state the statutory pay regime and rate plainly (SMP weeks 1–6 at 90%; weeks 7–39 at the lower of statutory rate or 90%; weeks 40–52 unpaid; SSP from day 1 at the lower of the standard rate or 80% of average weekly earnings, etc.).",
        "MUST cite the Working Time Regulations 1998 for holiday accrual.",
        "MUST state KIT/SPLIT day allowance precisely.",
        "MUST state the 8-week notice rule for varying return date (maternity/adoption).",
        "MUST NOT impose unilateral contact requirements that breach the no-detriment rule.",
      ],
      example: `<p>During your leave, you will receive Statutory Maternity Pay at 90% of your average weekly earnings (£1,180.77) for the first 6 weeks, followed by 33 weeks at the lower of the statutory rate (currently £187.18 per week) or 90% of your average weekly earnings, with the final 13 weeks of leave being unpaid, in accordance with Part XII of the Social Security Contributions and Benefits Act 1992. Your participation in the Acme Group Pension Scheme will continue on your contractual pay throughout your paid leave period, and your annual leave will continue to accrue under the Working Time Regulations 1998 (regulation 13). Your enrolment in the Acme Private Medical Plan and other employee benefits will continue on the same basis as before.</p>
<p>You may, by agreement with the company, work up to 10 Keeping In Touch (KIT) days during your leave without bringing it to an end. Your line manager, Daniel Okafor, will keep in touch with you on the monthly basis you have requested. If you wish to vary your expected return date, please give the company at least 8 weeks' notice in writing.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph wishing the employee well, with a contact for any questions, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST offer a contact for questions.",
        "MUST keep tone supportive and warm.",
      ],
      example: `<p>We wish you all the best for the months ahead. If you have any questions about the arrangements set out in this letter, please contact me or the People team at people@acme.example.</p>
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

export const LEAVE_APPROVAL_US: LetterTemplate = {
  letterType: "leave_approval",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Leave Approval):
- Identify the applicable regime. Federal: Family and Medical Leave Act (FMLA) 29 USC 2612 — up to 12 weeks unpaid for eligible employees of covered employers (50+ employees within 75 miles); 26 weeks for military caregiver leave. Pregnancy Workers Fairness Act (42 USC 2000gg) — reasonable accommodation for pregnancy, childbirth, and related conditions. ADA (42 USC 12112) — leave can be a reasonable accommodation. USERRA (38 USC 4312) — military leave protections.
- State paid family leave (PFL) regimes: California PFL (Unemp. Ins. Code 3300 et seq.); New York PFL (Workers' Comp. Law 200 et seq.); New Jersey FLI (N.J.S.A. 43:21-39.1); Massachusetts PFML (M.G.L. c.175M); Washington PFML (RCW 50A); Colorado FAMLI (C.R.S. 8-13.3-501); Connecticut PFMLA; Oregon Paid Leave; etc. State-by-state pay rate, duration, and benefits.
- For FMLA-designated leave, the Designation Notice (DOL Form WH-382) must be issued within 5 business days of having sufficient information; this letter may serve that purpose if it includes the required content (29 CFR 825.300(d)).
- Continuation of group health coverage during FMLA leave at the same level as if working (29 USC 2614(c)).
- Restoration to the same or an equivalent position on return (29 USC 2614(a)(1)) — equivalent in pay, benefits, and other terms.
- Register: warm but precise. American English throughout.`,
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
        "Render a single short <p> with the subject in <strong>: 'Approval and Designation of {Leave Type} Leave'.",
      scaffold: `<p><strong>Approval and Designation of {{leaveType}} Leave</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the leave type and any FMLA designation.",
      ],
      example: `<p><strong>Approval and Designation of FMLA Leave (Bonding)</strong></p>`,
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
      example: `<p>Dear Aisha,</p>`,
    },
    {
      sectionId: "body",
      title: "Leave details and dates",
      instruction:
        "Confirm leave type, FMLA designation if applicable, start date, end date, and expected return. Reference the request and any certification received.",
      scaffold: `<p>Following your leave request of {{requestDate}} and the {{certificationDocument}} you provided, this letter confirms approval of your leave and, where applicable, designates it as protected under the {{statutoryReference}}. Your leave will begin on {{leaveStartDate}} and is approved through {{leaveEndDate}}, with an expected return-to-work date of {{expectedReturnDate}}.</p>`,
      constraints: [
        "MUST cite the federal and any state statutory regime (FMLA 29 USC 2612, CA PFL, NY PFL, etc.).",
        "MUST identify the FMLA leave reason where applicable (own serious health condition; family member SHC; bonding; military exigency; military caregiver).",
        "MUST state start, end, and expected return dates.",
        "MUST reference the medical certification (WH-380-E, WH-380-F) where required.",
      ],
      example: `<p>Following your leave request of March 18, 2026 and the WH-380-E certification of healthcare provider you provided, this letter confirms approval of your leave and designates it as protected under the federal Family and Medical Leave Act, 29 USC section 2612(a)(1)(A) (bonding leave following the birth of a child), and the California Paid Family Leave program, Unemployment Insurance Code section 3301. Your leave will begin on July 1, 2026 and is approved through September 22, 2026, with an expected return-to-work date of September 23, 2026.</p>`,
    },
    {
      sectionId: "terms",
      title: "Pay, benefits, contact, and restoration",
      instruction:
        "State the pay arrangement (state PFL benefits + any company top-up; FMLA itself is unpaid), continuation of group health coverage during leave (29 USC 2614(c)), the restoration right under 29 USC 2614(a)(1), required ongoing certification, and contact arrangements.",
      scaffold: `<p>FMLA leave is unpaid; you will, however, be eligible to receive {{statePflBenefitsDescription}}, and the company will provide {{employerTopUpDescription}}. You may, at your election, use accrued paid time off concurrently with your FMLA leave. Your participation in the company's group health, dental, and vision plans will continue during your leave on the same basis as if you were working, in accordance with 29 USC section 2614(c). Your contributions toward premiums during any unpaid portion of leave will be {{premiumPaymentArrangement}}.</p>
<p>On your return from leave, you will be restored to your same or an equivalent position with the same pay, benefits, and other terms and conditions of employment, in accordance with 29 USC section 2614(a)(1). Your line manager, {{lineManagerName}}, will keep in touch with you only as necessary and on the cadence you prefer. If your circumstances change and you need to extend or shorten the leave, please notify the People team in writing as soon as practicable.</p>`,
      constraints: [
        "MUST cite 29 USC 2614(c) for benefits continuation and 29 USC 2614(a)(1) for restoration.",
        "MUST state the pay regime correctly (FMLA unpaid; state PFL paid at the state rate).",
        "MUST address premium payment during unpaid leave.",
        "MUST NOT promise restoration to the exact same position if 'equivalent' is what FMLA requires.",
      ],
      example: `<p>FMLA leave is unpaid; you will, however, be eligible to receive California Paid Family Leave wage replacement of approximately 70% of your average weekly wage (subject to the state cap) for up to 8 weeks, paid by the California Employment Development Department, and the company will provide a salary top-up to bring you to 100% of base salary for the first 8 weeks of your leave under the Acme Parental Top-Up Policy. You may, at your election, use accrued paid time off concurrently with your FMLA leave. Your participation in the company's group health, dental, and vision plans will continue during your leave on the same basis as if you were working, in accordance with 29 USC section 2614(c). Your contributions toward premiums during any unpaid portion of leave will be deducted from any company top-up payments.</p>
<p>On your return from leave, you will be restored to your same or an equivalent position with the same pay, benefits, and other terms and conditions of employment, in accordance with 29 USC section 2614(a)(1). Your line manager, Daniel Okafor, will keep in touch with you only as necessary and on the cadence you prefer. If your circumstances change and you need to extend or shorten the leave, please notify the People team in writing as soon as practicable.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short warm paragraph wishing the employee well, with a contact for any questions, followed by 'Sincerely,'.",
      scaffold: `<p>{{closingSentiment}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST offer a contact for questions.",
        "MUST keep tone warm and supportive.",
      ],
      example: `<p>We wish you all the best for the months ahead. If you have any questions, please contact me or the People team at people@acme.example.</p>
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
