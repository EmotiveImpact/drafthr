import type { LetterTemplate } from "../types";

export const RIGHT_TO_DISCONNECT_UK: LetterTemplate = {
  letterType: "right_to_disconnect",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Right to Disconnect / Overtime Objection — EMPLOYEE MODE):
- The UK has no standalone "right to disconnect" statute. The relevant frame:
  - Working Time Regulations 1998 (WTR): 48-hour weekly average working time (reg.4) — opt-out is voluntary and revocable on 7 days' notice (reg.5(2)); 11 hours' daily rest (reg.10); 24 hours' weekly rest (reg.11).
  - Implied term of mutual trust and confidence (Malik v BCCI [1997]) where a pattern of out-of-hours contact is unreasonable.
  - Health and Safety at Work Act 1974 / Management of Health and Safety at Work Regulations 1999 — duty to protect from work-related stress (HSE Stress Management Standards).
- Tone: assertive but not aggressive. Practical. British English.
- Reserve rights briefly.`,
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
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Out-of-Hours Contact and Working Time</strong></p>`,
      constraints: ["MUST be a single line."],
      example: `<p><strong>Out-of-Hours Contact and Working Time</strong></p>`,
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
      title: "Statement of position and ask",
      instruction:
        "Briefly describe the pattern of out-of-hours contact (dates, frequency, channels). Identify the impact. Set out the ask: cessation of routine out-of-hours contact, except for genuine emergencies. Reference WTR 1998 working time / rest periods. Where the writer has previously signed an opt-out, formally revoke it on 7 days' notice.",
      scaffold: `<p>I am writing to set out my position on out-of-hours contact and working time.</p>
<p>{{patternOfContactParagraph}}</p>
<p>I ask that, going forward, routine work-related contact with me outside my contracted working hours of {{contractedHours}} (Monday to Friday) and outside my contracted weekly rest period be limited to genuine emergencies. I will not be available to take or respond to calls, emails, or messages outside those hours.</p>
<p>{{wtrOptOutRevocation}}</p>`,
      constraints: [
        "MUST describe the pattern of out-of-hours contact with frequency.",
        "MUST set out a clear ask.",
        "Where the writer has signed an opt-out, MUST formally revoke it on 7 days' notice citing reg.5(2) WTR 1998.",
        "MUST cite WTR 1998 by reference.",
      ],
      example: `<p>I am writing to set out my position on out-of-hours contact and working time.</p>
<p>Over the past three months, I have received an average of 8-10 work-related emails and messages per week between 22.00 and 06.00, and have on five occasions in that period been called on weekends to attend to non-emergency matters. The pattern has had a measurable impact on my rest and on my wellbeing.</p>
<p>I ask that, going forward, routine work-related contact with me outside my contracted working hours of 09.00 to 17.30 (Monday to Friday) and outside my contracted weekly rest period be limited to genuine emergencies. I will not be available to take or respond to calls, emails, or messages outside those hours, save in the case of genuine emergency.</p>
<p>I previously signed a Working Time Regulations 1998 opt-out from the 48-hour weekly limit. Pursuant to regulation 5(2) of the Regulations, I now formally revoke that opt-out, with the revocation taking effect 7 days from the date of this letter.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. Reserve rights briefly. 'Yours sincerely,' or 'Kind regards,'.",
      scaffold: `<p>I am happy to discuss any practical concerns. I reserve all my rights, including under the Working Time Regulations 1998 and at common law.</p>
<p>{{signOff}}</p>`,
      constraints: [
        "MUST reserve rights briefly.",
        "MUST cite WTR 1998.",
      ],
      example: `<p>I am happy to discuss any practical concerns. I reserve all my rights, including under the Working Time Regulations 1998 and at common law.</p>
<p>Yours sincerely,</p>`,
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

export const RIGHT_TO_DISCONNECT_US: LetterTemplate = {
  letterType: "right_to_disconnect",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Overtime Objection / Off-the-Clock Work — EMPLOYEE MODE):
- No federal "right to disconnect" statute. Relevant frames:
  - Fair Labor Standards Act (FLSA) 29 U.S.C. §207 — overtime at 1.5x for non-exempt employees over 40 hours / week. "Off-the-clock" work that the employer knows or should know about must be paid (29 C.F.R. §785.11-13).
  - State predictive scheduling: NYC Fair Workweek Law, San Francisco Formula Retail, Oregon SB 828 — advance scheduling and predictability pay for retail / food service.
  - California Lab. Code §510 (daily overtime over 8 hours; double-time over 12) and §226.7 (meal/rest breaks).
  - NLRA §7 — collective discussion of working conditions is protected concerted activity.
- For exempt employees, overtime claims are limited; the issue is more typically wellbeing, contract terms, or constructive discharge framing.
- Tone: practical. American English.`,
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
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Off-the-Clock Work and Out-of-Hours Contact</strong></p>`,
      constraints: ["MUST be one line."],
      example: `<p><strong>Off-the-Clock Work and Out-of-Hours Contact</strong></p>`,
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
      title: "Statement of position and ask",
      instruction:
        "Describe the pattern. Set the ask. For non-exempt employees, address overtime entitlement under FLSA §207 / state law. For exempt, frame as contract / wellbeing.",
      scaffold: `<p>I am writing to set out my position on out-of-hours contact and unauthorized overtime.</p>
<p>{{patternOfContactParagraph}}</p>
<p>I ask that, going forward, routine work-related contact with me outside my regular working hours of {{regularHours}} be limited to genuine emergencies. {{flsaOrWellbeingFraming}}</p>`,
      constraints: [
        "MUST describe the pattern with frequency.",
        "MUST set a clear ask.",
        "For non-exempt employees, MUST cite FLSA §207 and applicable state overtime law.",
      ],
      example: `<p>I am writing to set out my position on out-of-hours contact and unauthorized overtime.</p>
<p>Over the past three months, I have received an average of 8-10 work-related emails and messages per week between 10:00pm and 6:00am, and have on five occasions in that period been required to handle non-emergency matters on weekends.</p>
<p>I ask that, going forward, routine work-related contact with me outside my regular working hours of 9:00am to 5:30pm (Monday to Friday) be limited to genuine emergencies. To the extent that any time worked outside those hours is treated as compensable working time under the Fair Labor Standards Act (29 U.S.C. §207) and California Labor Code §510, I ask that it be recorded and paid in accordance with applicable overtime rates. To the extent any such work has gone unrecorded, I reserve my position in respect of unpaid wages.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. Reserve rights briefly. 'Sincerely,' or 'Best regards,'.",
      scaffold: `<p>I am happy to discuss any practical concerns. I reserve all of my rights, including under the FLSA and applicable state law.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST reserve rights briefly."],
      example: `<p>I am happy to discuss any practical concerns. I reserve all of my rights, including under the FLSA and California wage and hour law.</p>
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
