import type { LetterTemplate } from "../types";

export const RESIGNATION_WITHDRAWAL_UK: LetterTemplate = {
  letterType: "resignation_withdrawal",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Resignation Withdrawal — EMPLOYEE MODE):
- The general rule is that a resignation, once given clearly and in unambiguous terms, cannot be unilaterally withdrawn without the employer's consent (Riordan v War Office [1959] 1 WLR 1046).
- Sothern v Franks Charlesly & Co [1981] IRLR 278 (CA) provides the principal exception: where words of resignation were spoken in heat or anger, or in special circumstances, the employer should allow a reasonable cooling-off period before treating them as final. The key indicator is whether the words were unequivocal at the time. Promptness in withdrawing is the single most important factor.
- Kwik-Fit (GB) Ltd v Lineham [1992] ICR 183 — even where words were said clearly, special circumstances (provocation, distress) may make it unfair for the employer to hold the employee to them.
- Tone: prompt, factual, brief. Build the record. British English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Address to the recipient of the resignation (line manager or HR).",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>9 May 2026<br><br>Mr Marcus Chen<br>Head of Marketing<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Withdrawal of Resignation Communicated on {{originalResignationDate}}</strong></p>`,
      constraints: ["MUST reference the original resignation date."],
      example: `<p><strong>Withdrawal of Resignation Communicated on 7 May 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific or first name.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "body",
      title: "Statement of withdrawal and circumstances",
      instruction:
        "Identify the words / message that constituted the resignation. State plainly that the writer withdraws the resignation and continues in employment. Address the circumstances briefly — words spoken in distress, heat of an argument, provocation. Reference Sothern v Franks Charlesly [1981] where appropriate. Do not enlarge into a grievance.",
      scaffold: `<p>I am writing to withdraw the words used in our meeting / message of {{originalResignationDate}} which may have been understood as a resignation. {{briefCircumstances}}. The words were said in heat / under significant pressure and were not, on reflection, an unequivocal resignation. I do not wish to resign and I confirm that I continue in employment with {{employerLegalName}} as {{employeeJobTitle}}.</p>
<p>I respectfully ask the Company to treat this letter as the prompt withdrawal of the words used (consistent with the cooling-off principle in Sothern v Franks Charlesly & Co [1981] IRLR 278) and to confirm in writing that my employment continues without interruption.</p>`,
      constraints: [
        "MUST identify the words / message and date.",
        "MUST plainly state the writer withdraws the resignation.",
        "MUST address the circumstances briefly (heat / pressure / provocation).",
        "MUST reference Sothern v Franks Charlesly where appropriate.",
        "MUST NOT make new substantive complaints.",
      ],
      example: `<p>I am writing to withdraw the words used in our meeting of 7 May 2026 which may have been understood as a resignation. The words were said immediately following a difficult exchange with Mr Chen and within ten minutes of leaving the room I had called HR to indicate that I had not intended to resign. The words were said in heat and were not, on reflection, an unequivocal resignation. I do not wish to resign and I confirm that I continue in employment with Acme Holdings Limited as Senior Marketing Manager.</p>
<p>I respectfully ask the Company to treat this letter as the prompt withdrawal of the words used (consistent with the cooling-off principle in Sothern v Franks Charlesly & Co [1981] IRLR 278) and to confirm in writing that my employment continues without interruption.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Yours sincerely,' or 'Kind regards,'.",
      scaffold: `<p>I look forward to your written confirmation.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST be brief."],
      example: `<p>I look forward to your written confirmation.</p>
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

export const RESIGNATION_WITHDRAWAL_US: LetterTemplate = {
  letterType: "resignation_withdrawal",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Resignation Withdrawal — EMPLOYEE MODE):
- In at-will employment, an employee can generally withdraw a resignation only with the employer's consent. Some courts have applied a "heat of the moment" cooling-off principle (Wendell v. Wendell, illustrative; doctrine varies by state) where words were not clearly intended as a final resignation.
- Tone: prompt, factual, brief. Build the record. American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. Recipient of resignation.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 9, 2026<br><br>Mr. Marcus Chen<br>Head of Marketing<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Withdrawal of Resignation Communicated on {{originalResignationDate}}</strong></p>`,
      constraints: ["MUST reference the original resignation date."],
      example: `<p><strong>Withdrawal of Resignation Communicated on May 7, 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific or first name.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "body",
      title: "Statement of withdrawal and circumstances",
      instruction:
        "Identify the words and date. State withdrawal plainly. Briefly address circumstances. Request written confirmation that employment continues.",
      scaffold: `<p>I am writing to withdraw the words used in our meeting / message of {{originalResignationDate}} which may have been understood as a resignation. {{briefCircumstances}}. The words were said in heat or under significant pressure and were not, on reflection, an unequivocal resignation. I do not wish to resign and I confirm that I continue in employment with {{employerLegalName}} as {{employeeJobTitle}}.</p>
<p>I respectfully ask the Company to treat this letter as a prompt withdrawal of the words used and to confirm in writing that my employment continues without interruption.</p>`,
      constraints: [
        "MUST identify words and date.",
        "MUST plainly withdraw.",
        "MUST address circumstances briefly.",
        "MUST NOT introduce new complaints.",
      ],
      example: `<p>I am writing to withdraw the words used in our meeting of May 7, 2026 which may have been understood as a resignation. The words were said immediately following a difficult exchange with Mr. Chen, and within ten minutes of leaving the room I called HR to indicate that I had not intended to resign. The words were said in heat and were not, on reflection, an unequivocal resignation. I do not wish to resign and I confirm that I continue in employment with Acme Inc. as Senior Marketing Manager.</p>
<p>I respectfully ask the Company to treat this letter as a prompt withdrawal of the words used and to confirm in writing that my employment continues without interruption.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Sincerely,' or 'Best regards,'.",
      scaffold: `<p>I look forward to your written confirmation.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST be brief."],
      example: `<p>I look forward to your written confirmation.</p>
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
