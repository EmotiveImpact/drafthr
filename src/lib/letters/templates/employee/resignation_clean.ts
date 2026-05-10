import type { LetterTemplate } from "../types";

export const RESIGNATION_CLEAN_UK: LetterTemplate = {
  letterType: "resignation_clean",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Clean Resignation — EMPLOYEE MODE):
- A clean exit. Use only when the relationship has ended on neutral or positive terms and there is NO live grievance, no breach, no protected disclosure to preserve.
- Notice period is the contractual notice or, if longer, the statutory minimum under s.86 ERA 1996 (1 week per year of service to a maximum of 12).
- Tone: warm but professional. British English.
- DO NOT reserve rights here — that signals dispute and contradicts a clean exit. If the user wants rights preserved, the wizard should route them to resignation_with_grievance or resignation_constructive.
- DO NOT include statutory citations beyond the notice basis — this is not a tribunal-bound letter.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026') then the recipient (typically the line manager) on separate lines, in a single <p> with <br>.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST address to the line manager (or HR if line manager is the issue, but for a clean resignation it should be the line manager).",
      ],
      example: `<p>12 May 2026<br><br>Mr Marcus Chen<br>Head of Marketing<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single short <p> with subject in <strong>. 'Notice of Resignation'.",
      scaffold: `<p><strong>Notice of Resignation</strong></p>`,
      constraints: [
        "MUST be 'Notice of Resignation' or close variant.",
        "MUST NOT include 'Without Prejudice'.",
      ],
      example: `<p><strong>Notice of Resignation</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "One short <p>. 'Dear {First name}' is acceptable for a clean exit; 'Dear Mr/Ms {Surname}' if the relationship was formal.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: [
        "MUST be one line ending with a comma.",
      ],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "body",
      title: "Notice of resignation and last working day",
      instruction:
        "One or two short paragraphs. State the resignation, the contractual notice period being given, and the last working day calculated from notice. Optionally a brief, restrained reason ('to take up a new role', 'for personal reasons') — never a complaint.",
      scaffold: `<p>I am writing to give notice of my resignation from my role as {{employeeJobTitle}} at {{employerLegalName}}. In accordance with my contract of employment I am giving {{noticePeriod}} notice, with my last working day being {{lastWorkingDayUK}}.</p>
<p>{{briefReasonOptional}}</p>`,
      constraints: [
        "MUST state notice period and last working day.",
        "MUST NOT include any complaint, grievance, or criticism.",
        "MUST NOT include statutory citations — this is a clean exit.",
        "MUST NOT use 'effective immediately' (that signals constructive resignation).",
      ],
      example: `<p>I am writing to give notice of my resignation from my role as Senior Marketing Manager at Acme Holdings Limited. In accordance with my contract of employment I am giving three months' notice, with my last working day being 12 August 2026.</p>
<p>I have accepted a role elsewhere that I am keen to begin, and after careful thought I have decided that the time is right to move on.</p>`,
    },
    {
      sectionId: "terms",
      title: "Handover offer",
      instruction:
        "One short paragraph offering to assist with handover. Mention specific projects or transitions where useful.",
      scaffold: `<p>I am committed to making the handover as smooth as possible. {{handoverOffer}}.</p>`,
      constraints: [
        "MUST offer practical handover assistance.",
        "MUST NOT promise availability beyond the last working day unless agreed.",
      ],
      example: `<p>I am committed to making the handover as smooth as possible. Over the coming weeks I will produce written handover notes for each of my live campaigns, brief Sarah Williams on the Q3 launch, and ensure the agency relationships are introduced to whomever you nominate as my replacement.</p>`,
    },
    {
      sectionId: "closing",
      title: "Thanks and closing",
      instruction:
        "One or two short paragraphs of thanks for the opportunity, and 'Yours sincerely,'. Genuine but not effusive. This is the only employee-mode template where warmth is appropriate.",
      scaffold: `<p>{{thanksParagraph}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,' (named recipient).",
        "MUST express thanks for the opportunity.",
        "MUST NOT include any reservation of rights.",
        "MUST NOT include any criticism however mild.",
      ],
      example: `<p>I would like to thank you and the wider team for the opportunity I have had at Acme over the past four years. I have learned a great deal, worked with some excellent colleagues, and contributed to projects I am proud of. I leave with warm wishes for the team's continued success.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Two lines: name, job title.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}</p>`,
      constraints: [
        "MUST be name and job title.",
      ],
      example: `<p>Sarah Williams<br>Senior Marketing Manager</p>`,
    },
  ],
};

export const RESIGNATION_CLEAN_US: LetterTemplate = {
  letterType: "resignation_clean",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Clean Resignation — EMPLOYEE MODE):
- 'Two weeks' notice' is custom, not law. Most US employment is at-will. State the last working day clearly.
- Tone: warm but professional. American English.
- DO NOT reserve rights here — clean exit. If user wants rights preserved, route to resignation_with_grievance or resignation_constructive.
- DO NOT include statutory citations.
- For California: final wages must be paid on the last day if 72+ hours' notice is given (Cal. Lab. Code §202).`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "US date format ('May 12, 2026'). Recipient is the line manager.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST address to the line manager.",
      ],
      example: `<p>May 12, 2026<br><br>Mr. Marcus Chen<br>Head of Marketing<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single short <p> in <strong>. 'Notice of Resignation'.",
      scaffold: `<p><strong>Notice of Resignation</strong></p>`,
      constraints: [
        "MUST be 'Notice of Resignation'.",
      ],
      example: `<p><strong>Notice of Resignation</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "One short <p>. First name acceptable.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "body",
      title: "Notice of resignation and last working day",
      instruction:
        "State the resignation, the notice being given (typically two weeks), and the last working day. Optional brief, restrained reason.",
      scaffold: `<p>I am writing to give notice of my resignation from my role as {{employeeJobTitle}} at {{employerLegalName}}. I am giving {{noticePeriod}} notice, with my last working day being {{lastWorkingDayUS}}.</p>
<p>{{briefReasonOptional}}</p>`,
      constraints: [
        "MUST state notice period and last working day.",
        "MUST NOT include complaint or criticism.",
        "MUST NOT use 'effective immediately' (signals constructive discharge).",
      ],
      example: `<p>I am writing to give notice of my resignation from my role as Senior Marketing Manager at Acme Inc. I am giving four weeks' notice, with my last working day being June 9, 2026.</p>
<p>I have accepted a role elsewhere that I am keen to begin, and after careful thought I have decided that the time is right to move on.</p>`,
    },
    {
      sectionId: "terms",
      title: "Handover offer",
      instruction: "Short paragraph offering practical handover assistance.",
      scaffold: `<p>I am committed to making the transition as smooth as possible. {{handoverOffer}}.</p>`,
      constraints: [
        "MUST offer practical handover.",
        "MUST NOT promise post-departure availability without agreement.",
      ],
      example: `<p>I am committed to making the transition as smooth as possible. Over the coming weeks I will produce written handover notes for each of my live campaigns, brief Sarah Williams on the Q3 launch, and ensure the agency relationships are introduced to whomever you nominate as my replacement.</p>`,
    },
    {
      sectionId: "closing",
      title: "Thanks and closing",
      instruction:
        "Genuine thanks, 'Sincerely,'. Warmth is permitted here only.",
      scaffold: `<p>{{thanksParagraph}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST express thanks.",
        "MUST NOT reserve rights.",
        "MUST NOT include criticism.",
      ],
      example: `<p>I would like to thank you and the wider team for the opportunity I have had at Acme over the past four years. I have learned a great deal, worked with excellent colleagues, and contributed to projects I am proud of. I leave with warm wishes for the team's continued success.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Two lines: name, job title.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}</p>`,
      constraints: ["MUST be name and job title."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager</p>`,
    },
  ],
};
