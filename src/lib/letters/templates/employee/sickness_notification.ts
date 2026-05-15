import type { LetterTemplate } from "../types";

export const SICKNESS_NOTIFICATION_UK: LetterTemplate = {
  letterType: "sickness_notification",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Sickness Notification — EMPLOYEE MODE):
- Statutory Sick Pay (SSP) under the Social Security Contributions and Benefits Act 1992 from day 4 of incapacity (subject to qualifying conditions; the lower earnings limit is recalculated annually).
- Self-certification (form SC2 or employer equivalent) for absences of 7 calendar days or fewer; a fit note (Med 3) from a registered healthcare professional is required from day 8 of absence.
- "May be fit for work" fit notes engage the employer to consider amended duties / reduced hours / phased return / workplace adaptations.
- Where the underlying condition is or may be a disability under s.6 Equality Act 2010, the duty to make reasonable adjustments may apply.
- Tone: factual, brief, professional. British English.
- This is generally not a tribunal-bound letter unless the underlying issues escalate; do not over-include statutory citations beyond what is needed.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Line manager and HR.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Mr Marcus Chen<br>Head of Marketing<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Mark Confidential.",
      scaffold: `<p><strong>Confidential — Sickness Notification</strong></p>`,
      constraints: ["MUST mark Confidential."],
      example: `<p><strong>Confidential — Sickness Notification</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "First name or honorific.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "body",
      title: "Absence dates and certification",
      instruction:
        "State the dates of absence (or expected duration). Indicate whether self-certified (≤7 days) or covered by a fit note (≥8 days). Briefly describe in functional terms (no obligation to disclose diagnosis). Confirm method of any further updates.",
      scaffold: `<p>I am writing to notify you that I am unfit for work from {{absenceStartDateUK}} {{absenceEndOrOngoing}}. {{certificationStatement}}.</p>
<p>{{briefFunctionalDescription}}</p>
<p>I will keep you updated and provide further certification as required.</p>`,
      constraints: [
        "MUST state absence start date and (where known) expected end date.",
        "MUST state certification (self-cert or fit note) and attach / refer to it.",
        "MUST NOT disclose diagnosis unless the employee chooses to.",
      ],
      example: `<p>I am writing to notify you that I am unfit for work from 11 May 2026 and expect to be absent for at least the period covered by my fit note, which is dated 11 May 2026 and runs to 25 May 2026. A copy of the fit note is attached.</p>
<p>The fit note records that I am not fit for work; I have not been advised that "may be fit" amendments would assist at this stage. I will see my GP again on 22 May 2026 and will provide an updated fit note if required.</p>
<p>I will keep you updated and provide further certification as required.</p>`,
    },
    {
      sectionId: "terms",
      title: "Adjustments referenced / OH referral request",
      instruction:
        "Where the fit note records 'may be fit' with amendments, address the proposed amendments (phased return, amended duties, workplace adaptations). Optionally request an OH referral. Optional section.",
      scaffold: `<p>{{adjustmentsParagraph}}</p>
<p>{{ohReferralOffer}}</p>`,
      constraints: [
        "MUST engage with any 'may be fit' amendments on the fit note.",
        "MAY offer OH referral.",
      ],
      example: `<p>The fit note records that I "may be fit for work" subject to (i) a phased return at 60% hours for two weeks and (ii) avoidance of long meetings. I am willing to discuss how these can be implemented for my return on 26 May 2026.</p>
<p>I would also welcome a referral to occupational health if the Company considers it would assist.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Brief. 'Yours sincerely,' or 'Kind regards,'.",
      scaffold: `<p>Please let me know if you need anything further from me.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST be brief and polite."],
      example: `<p>Please let me know if you need anything further from me.</p>
<p>Kind regards,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}</p>`,
      constraints: ["MUST be name and role."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager</p>`,
    },
  ],
};

export const SICKNESS_NOTIFICATION_US: LetterTemplate = {
  letterType: "sickness_notification",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Sickness / FMLA Notification — EMPLOYEE MODE):
- Family and Medical Leave Act (FMLA), 29 U.S.C. §2601 et seq. — up to 12 weeks of unpaid, job-protected leave per 12-month period for a serious health condition (employee or qualifying family member); covered employers (50+ employees within 75 miles); 12-month and 1,250-hour service.
- The notice need not mention FMLA — the burden is on the employer to designate (29 C.F.R. §825.301). However, providing enough information to put the employer on notice triggers the duty.
- Where the condition is also a disability under the ADA, the ADA's reasonable-accommodation duty applies in parallel.
- State leave laws (CA CFRA / PFL, NY PFL, NJ FLA, etc.) may provide additional or paid leave.
- Tone: factual, brief, professional. American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. Line manager and HR.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Mr. Marcus Chen<br>Head of Marketing<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Mark Confidential.",
      scaffold: `<p><strong>Confidential — Notice of Medical Leave</strong></p>`,
      constraints: ["MUST mark Confidential."],
      example: `<p><strong>Confidential — Notice of Medical Leave / FMLA Designation Request</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "First name or honorific.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "body",
      title: "Absence dates and certification",
      instruction:
        "State absence dates / expected duration. Provide enough information for FMLA designation (29 C.F.R. §825.301). Attach medical certification or state when it will be provided. Reference state leave law where applicable.",
      scaffold: `<p>I am writing to notify you that I am unfit for work from {{absenceStartDateUS}} {{absenceEndOrOngoing}}. {{certificationStatement}}.</p>
<p>{{briefFunctionalDescription}}</p>
<p>I expect this absence may qualify as leave under the Family and Medical Leave Act (29 U.S.C. §2601 et seq.){{stateLeaveLaw}} and ask that the Company designate it accordingly. I will provide medical certification (Form WH-380-E or equivalent) within the 15-day window required by 29 C.F.R. §825.305.</p>`,
      constraints: [
        "MUST state absence dates.",
        "MUST provide enough information to trigger FMLA designation duty.",
        "MUST reference 29 U.S.C. §2601 et seq. and the 15-day certification window.",
        "MUST NOT disclose diagnosis unless the employee chooses to.",
      ],
      example: `<p>I am writing to notify you that I am unfit for work from May 11, 2026 and expect to be absent for approximately two weeks based on my physician's current advice. I am attaching a note from my treating physician dated May 11, 2026 confirming the period of incapacity.</p>
<p>I expect this absence may qualify as leave under the Family and Medical Leave Act (29 U.S.C. §2601 et seq.) and the California Family Rights Act, and ask that the Company designate it accordingly. I will provide medical certification (Form WH-380-E or equivalent) within the 15-day window required by 29 C.F.R. §825.305.</p>`,
    },
    {
      sectionId: "terms",
      title: "Adjustments / accommodations",
      instruction:
        "Where the condition is also potentially a disability under the ADA, signal that an interactive process may be appropriate on return.",
      scaffold: `<p>{{adjustmentsParagraph}}</p>`,
      constraints: [
        "MAY signal ADA interactive process if disability is potentially in issue.",
      ],
      example: `<p>If a phased return or other adjustment would assist, I am willing to engage with the Company in an interactive process consistent with the ADA on my return.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Brief. 'Sincerely,' or 'Best regards,'.",
      scaffold: `<p>Please let me know if you need anything further from me.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST be brief and polite."],
      example: `<p>Please let me know if you need anything further from me.</p>
<p>Best regards,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}</p>`,
      constraints: ["MUST be name and role."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager</p>`,
    },
  ],
};
