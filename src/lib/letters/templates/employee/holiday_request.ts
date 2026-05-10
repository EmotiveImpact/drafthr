import type { LetterTemplate } from "../types";

export const HOLIDAY_REQUEST_UK: LetterTemplate = {
  letterType: "holiday_request",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Holiday Request — EMPLOYEE MODE):
- Working Time Regulations 1998: reg.13 (4 weeks WTD), reg.13A (additional 1.6 weeks UK), reg.15 (notice of intention to take leave — at least twice the period of leave to be taken).
- Refusal: the employer can refuse on giving counter-notice equal to the period of leave (reg.15(4)) — but the refusal must be reasonable and consistent with the contract.
- Where leave has been refused, this letter can be a request OR a challenge to a refusal.
- Tone: practical, polite. British English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Line manager.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Mr Marcus Chen<br>Head of Marketing<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. 'Annual Leave Request' or 'Challenge to Annual Leave Refusal'.",
      scaffold: `<p><strong>{{subjectText}}</strong></p>`,
      constraints: ["MUST identify request or challenge."],
      example: `<p><strong>Annual Leave Request — 13 to 24 July 2026</strong></p>`,
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
      title: "Dates and basis",
      instruction:
        "State the requested dates, total working days, and remaining balance. Reference reg.15 WTR notice (twice the period of leave). Where this is a challenge to a refusal, summarise the refusal and reasons given, and address why the refusal was unreasonable.",
      scaffold: `<p>I would like to request annual leave from {{leaveStartDateUK}} to {{leaveEndDateUK}} inclusive ({{workingDays}} working days). My remaining leave entitlement balance is {{balanceDays}} days. The notice given by this letter exceeds twice the period of leave requested, in accordance with regulation 15 of the Working Time Regulations 1998.</p>
<p>{{additionalContextOrChallenge}}</p>`,
      constraints: [
        "MUST state dates and working days.",
        "MUST state remaining balance.",
        "MUST cite reg.15 WTR 1998 where appropriate.",
        "Where a challenge to a refusal, MUST address the reasons given.",
      ],
      example: `<p>I would like to request annual leave from 13 July 2026 to 24 July 2026 inclusive (10 working days). My remaining leave entitlement balance is 17 days. The notice given by this letter exceeds twice the period of leave requested, in accordance with regulation 15 of the Working Time Regulations 1998.</p>
<p>I have arranged cover with Sarah Williams for the period and have prepared a handover note covering the live campaigns. There are no client deliverables in that window. I would be grateful for confirmation by 26 May 2026 so I can confirm bookings.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Polite. 'Yours sincerely,' or 'Kind regards,'.",
      scaffold: `<p>Thank you for considering this request.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST be polite."],
      example: `<p>Thank you for considering this request.</p>
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

export const HOLIDAY_REQUEST_US: LetterTemplate = {
  letterType: "holiday_request",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US PTO / Vacation Request — EMPLOYEE MODE):
- No federal statutory PTO entitlement. Most US PTO is governed by employer policy.
- Some states protect accrued PTO as wages (CA, CO, MA, IL, NE, ND) — Cal. Lab. Code §227.3 makes accrued vacation a vested wage, payable on separation.
- Tone: practical, polite. American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. Line manager.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Mr. Marcus Chen<br>Head of Marketing<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>{{subjectText}}</strong></p>`,
      constraints: ["MUST identify request or challenge."],
      example: `<p><strong>PTO Request — July 13 to July 24, 2026</strong></p>`,
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
      title: "Dates and basis",
      instruction: "Dates, business days, balance, cover arrangements.",
      scaffold: `<p>I would like to request paid time off from {{leaveStartDateUS}} to {{leaveEndDateUS}} inclusive ({{businessDays}} business days). My remaining PTO balance is {{balanceDays}} days. {{coverArrangementsParagraph}}</p>`,
      constraints: [
        "MUST state dates and business days.",
        "MUST state remaining balance.",
        "MUST address cover.",
      ],
      example: `<p>I would like to request paid time off from July 13, 2026 to July 24, 2026 inclusive (10 business days). My remaining PTO balance is 17 days. I have arranged cover with Sarah Williams for the period and prepared a handover note. There are no client deliverables in that window. I would appreciate confirmation by May 26, 2026 so I can confirm travel bookings.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Polite. 'Best regards,' or 'Sincerely,'.",
      scaffold: `<p>Thank you for considering this request.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST be polite."],
      example: `<p>Thank you for considering this request.</p>
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
