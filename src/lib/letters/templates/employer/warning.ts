import type { LetterTemplate } from "../types";

export const WARNING_UK: LetterTemplate = {
  letterType: "warning",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Disciplinary / Performance Warning):
- Comply with the ACAS Code of Practice on Disciplinary and Grievance Procedures. Non-compliance may attract a 25% uplift on tribunal awards under s.207A TULRCA 1992.
- Reference the disciplinary hearing by date and chair. The right to be accompanied at the hearing under s.10 Employment Relations Act 1999 must have been offered.
- Be precise about the level of warning (verbal, first written, final written), the time it remains live on file, and the warning that further misconduct or unmet improvement may lead to further disciplinary action up to and including dismissal.
- Improvement requirements must be SMART: specific, measurable, achievable, relevant, time-bound. State the review period and date.
- A right of appeal in writing is mandatory: name the appeal officer (different from the warning officer), give a 5-working-day deadline.
- Where the matter is performance-linked and a disability is in play, separate the conduct issue from the disability and document Equality Act 2010 ss.20–22 reasonable adjustment considerations.
- Register: factual, dignified, no editorialising. British English throughout.`,
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
        "Render a single short <p> with subject in <strong>: 'Outcome of Disciplinary Hearing — {Level of Warning}'.",
      scaffold: `<p><strong>Outcome of Disciplinary Hearing — {{warningLevel}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the level of warning (Verbal, First Written, Final Written).",
        "MUST NOT use 'Final Warning' loosely if it is in fact a first written warning.",
      ],
      example: `<p><strong>Outcome of Disciplinary Hearing — First Written Warning</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
        "MUST NOT use first-name salutation in a formal disciplinary letter.",
      ],
      example: `<p>Dear Mr Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Reference to hearing",
      instruction:
        "State the outcome plainly. Reference the disciplinary hearing date, the chair, and confirm the right to be accompanied was offered (s.10 ERelA 1999). One short paragraph.",
      scaffold: `<p>I am writing to confirm the outcome of the disciplinary hearing held on {{hearingDate}}, chaired by {{hearingChairName}}, {{hearingChairTitle}}, at which you were accompanied by {{companionName}} in accordance with section 10 of the Employment Relations Act 1999. The panel has decided to issue you with a {{warningLevel}}.</p>`,
      constraints: [
        "MUST cite s.10 ERelA 1999 and confirm the right to be accompanied was offered.",
        "MUST reference the hearing by date and chair.",
        "MUST identify the warning level precisely.",
        "MUST NOT use 'we regret' which can be construed as ambivalence about the decision.",
      ],
      example: `<p>I am writing to confirm the outcome of the disciplinary hearing held on 28 April 2026, chaired by Priya Sharma, HR Director, at which you were accompanied by Aisha Khan in accordance with section 10 of the Employment Relations Act 1999. The panel has decided to issue you with a First Written Warning.</p>`,
    },
    {
      sectionId: "body",
      title: "Allegations and findings",
      instruction:
        "Set out the allegations considered and the findings of fact. Reference any contract clause or policy breached. Two to three short paragraphs. Do not restate the entire investigation — summarise.",
      scaffold: `<p>The allegations considered at the hearing were that {{allegationsSummary}}. Having considered the evidence presented, including {{evidenceSummary}}, the panel found, on the balance of probabilities, that {{factualFindings}}.</p>
<p>This conduct constitutes a breach of {{policyOrClauseReference}}. The panel considered your representations, including {{employeeRepresentationsSummary}}, but concluded that the breach was made out and warranted formal disciplinary action.</p>`,
      constraints: [
        "MUST tie the conduct to a specific policy clause or contract term.",
        "MUST acknowledge the employee's representations explicitly.",
        "MUST NOT speculate beyond findings of fact made at the hearing.",
        "MUST NOT use intensifiers ('serious', 'severe') — let the facts carry the weight.",
      ],
      example: `<p>The allegations considered at the hearing were that on 14 April 2026 you sent two emails to a customer using language inconsistent with the company's Customer Communications Standard, and that on 16 April 2026 you failed to escalate a customer complaint within the timeframe required by the Customer Service Procedure. Having considered the evidence presented, including the email records and the customer's written complaint, the panel found, on the balance of probabilities, that both allegations were made out.</p>
<p>This conduct constitutes a breach of paragraphs 4.2 and 6.1 of the Customer Communications Standard and paragraph 3.1 of the Customer Service Procedure. The panel considered your representations, including your account of the workload pressures on the day in question, but concluded that the breach was made out and warranted formal disciplinary action.</p>`,
    },
    {
      sectionId: "terms",
      title: "Improvement required and review",
      instruction:
        "State the SMART improvement requirements, the review period and date, and the level and duration of the warning on file. Confirm that further misconduct or failure to improve may lead to further disciplinary action up to and including dismissal.",
      scaffold: `<p>The required improvements are as follows: {{smartImprovementsParagraph}}. Your performance against these requirements will be reviewed at a meeting on {{reviewDate}} with {{reviewLineManagerName}}, {{reviewLineManagerTitle}}.</p>
<p>This {{warningLevel}} will remain on your personnel file for {{warningLiveDuration}} from the date of this letter. You should be aware that any further misconduct of a similar nature, or failure to meet the required standard within the review period, may result in further disciplinary action up to and including dismissal.</p>`,
      constraints: [
        "MUST set SMART (specific, measurable, achievable, relevant, time-bound) improvements.",
        "MUST state the review date and reviewer.",
        "MUST state the level and live duration of the warning.",
        "MUST warn that further matters may result in dismissal.",
      ],
      example: `<p>The required improvements are as follows: (i) all customer correspondence must comply with the Customer Communications Standard, with no further breaches over the next three months; (ii) all customer complaints must be escalated within 4 working hours of receipt, in line with the Customer Service Procedure. Your performance against these requirements will be reviewed at a meeting on 14 August 2026 with Aisha Khan, Customer Operations Manager.</p>
<p>This First Written Warning will remain on your personnel file for 12 months from the date of this letter. You should be aware that any further misconduct of a similar nature, or failure to meet the required standard within the review period, may result in further disciplinary action up to and including dismissal.</p>`,
    },
    {
      sectionId: "appeal_rights",
      title: "Right of appeal",
      instruction:
        "Mandatory section. Name the appeal officer (different from the chair), give a 5-working-day deadline, format (in writing, with grounds), and reference the right to be accompanied (s.10 ERelA 1999).",
      scaffold: `<p>You have the right to appeal this decision. To do so, please write to {{appealOfficerName}}, {{appealOfficerTitle}}, at {{appealOfficerContact}} within {{appealDeadlineWorkingDays}} working days of the date of this letter, setting out the grounds of your appeal. You are entitled to be accompanied at any appeal hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>`,
      constraints: [
        "MUST name an appeal officer different from the hearing chair.",
        "MUST give a specific deadline (working days).",
        "MUST cite s.10 ERelA 1999.",
      ],
      example: `<p>You have the right to appeal this decision. To do so, please write to Helen Carter, Director of People, at helen.carter@acme.example within 5 working days of the date of this letter, setting out the grounds of your appeal. You are entitled to be accompanied at any appeal hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph offering support (training, EAP, line-manager 1:1s) where appropriate, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{supportOfferedParagraph}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST offer support where appropriate (training, coaching, EAP).",
        "MUST NOT use 'we regret' or expressions of doubt about the decision.",
      ],
      example: `<p>The company is committed to supporting you to meet the required standard, and your line manager will arrange weekly 1:1 meetings during the review period. You may also access the Employee Assistance Programme via the People portal at any time.</p>
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

export const WARNING_US: LetterTemplate = {
  letterType: "warning",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Performance / Disciplinary Warning):
- US employment is at-will; a formal warning is not statutorily required, but documentation defeats discrimination claims under Title VII (42 USC 2000e-2), the ADA (42 USC 12112), the ADEA (29 USC 623), and analogous state law (FEHA Cal. Gov. Code 12940 et seq.).
- Reference the company's progressive-discipline policy if one is in place; otherwise frame as documentation of the issue and improvement expectation.
- Be precise about the conduct or performance concern, the policy or expectation breached, the improvement required, and the timeframe for review.
- Where ADA disability or PWFA pregnancy is implicated, separate the performance issue from the accommodation discussion and document the interactive process under 29 CFR 1630.2(o)(3).
- Offer support: EAP, training, additional coaching.
- There is no statutory right of appeal, but offering an internal review path is best practice.
- Register: factual, professional, no character judgments. American English throughout.`,
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
        "Render a single short <p> with subject in <strong>: 'Written {Performance / Conduct} Warning'.",
      scaffold: `<p><strong>Written {{warningType}} Warning</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify whether the warning is for performance or conduct.",
      ],
      example: `<p><strong>Written Performance Warning</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
        "MUST NOT use first-name salutation in a formal warning letter.",
      ],
      example: `<p>Dear Mr. Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Reference to meeting",
      instruction:
        "State the purpose of the letter and reference the meeting at which the issue was discussed. One short paragraph.",
      scaffold: `<p>This letter follows our meeting on {{meetingDate}}, attended by {{meetingAttendees}}, at which we discussed concerns regarding your {{performanceOrConduct}}. This letter formally documents those concerns and the improvements required.</p>`,
      constraints: [
        "MUST reference the meeting by date and attendees.",
        "MUST identify whether the issue is performance or conduct.",
        "MUST NOT include 'we regret' or similar language.",
      ],
      example: `<p>This letter follows our meeting on April 28, 2026, attended by Daniel Okafor, Priya Sharma (HR Business Partner), and your supervisor Aisha Khan, at which we discussed concerns regarding your performance against documented role expectations. This letter formally documents those concerns and the improvements required.</p>`,
    },
    {
      sectionId: "body",
      title: "Allegations and findings",
      instruction:
        "State the specific concerns. Reference the policy or documented expectation that has been missed. Two to three short paragraphs. Be factual and specific.",
      scaffold: `<p>The specific concerns are: {{specificConcernsList}}. These concerns were reviewed against {{policyOrExpectationReference}}, which sets the documented expectation for the role.</p>
<p>{{factualSupportParagraph}}</p>`,
      constraints: [
        "MUST list the specific concerns precisely (dates, instances).",
        "MUST tie the concerns to a documented policy or role expectation.",
        "MUST NOT include subjective character judgments.",
        "MUST NOT use intensifiers — let the facts carry the weight.",
      ],
      example: `<p>The specific concerns are: (i) on April 14, 2026 and April 16, 2026, two customer escalations were not handled within the four-hour service-level expectation; (ii) the Q1 2026 sprint goal completion rate of 42% fell below the 75% expectation set in the Engineering Performance Standard. These concerns were reviewed against the company's Engineering Performance Standard and the Customer Service Procedure, which set the documented expectations for the role.</p>
<p>The findings are documented in the meeting record and the related case logs, copies of which are attached. We have also considered the workload context you described in our meeting, including the on-call rota in the same period, but concluded that the gap to expectation remains material.</p>`,
    },
    {
      sectionId: "terms",
      title: "Improvement required and review",
      instruction:
        "Set out specific, measurable, time-bound improvements. State the review date and reviewer. State that the warning is being placed in the personnel file and that continued at-will employment depends on meeting the standard.",
      scaffold: `<p>The improvements required are as follows: {{smartImprovementsList}}. Your performance against these requirements will be reviewed on {{reviewDate}} by {{reviewerName}}, {{reviewerTitle}}.</p>
<p>This warning will be placed in your personnel file. Your employment with {{employerLegalName}} remains at-will. Continued failure to meet the documented expectations may result in further disciplinary action, up to and including termination of employment.</p>`,
      constraints: [
        "MUST set specific, measurable, time-bound improvements.",
        "MUST state the review date and reviewer.",
        "MUST confirm at-will status and warn of possible termination if standard not met.",
        "MUST NOT promise that meeting the plan guarantees continued employment.",
      ],
      example: `<p>The improvements required are as follows: (i) all customer escalations to be handled within the four-hour service-level expectation, with no further breaches over the next 60 days; (ii) achievement of at least 75% sprint goal completion in Q2 2026, measured against agreed sprint commitments. Your performance against these requirements will be reviewed on July 14, 2026 by Aisha Khan, Customer Operations Manager.</p>
<p>This warning will be placed in your personnel file. Your employment with Acme Inc. remains at-will. Continued failure to meet the documented expectations may result in further disciplinary action, up to and including termination of employment.</p>`,
    },
    {
      sectionId: "appeal_rights",
      title: "Internal review",
      instruction:
        "Offer an internal review path: who to write to, deadline (5 business days), and format. Frame as company practice, not a statutory right.",
      scaffold: `<p>If you wish the company to review this decision, please contact {{reviewContactName}}, {{reviewContactTitle}}, at {{reviewContactEmail}} within {{reviewDeadlineBusinessDays}} business days of the date of this letter, setting out any matters you would like the company to consider.</p>`,
      constraints: [
        "MUST name a review contact.",
        "MUST give a specific deadline.",
        "MUST NOT mischaracterize the internal review as a statutory right of appeal.",
      ],
      example: `<p>If you wish the company to review this decision, please contact Helen Carter, Vice President of People, at helen.carter@acme.example within 5 business days of the date of this letter, setting out any matters you would like the company to consider.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph offering support (training, EAP, coaching), followed by 'Sincerely,'.",
      scaffold: `<p>{{supportOfferedParagraph}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST offer support resources where appropriate.",
        "MUST NOT undermine the substance of the warning with conciliatory language.",
      ],
      example: `<p>The company is committed to supporting you to meet the documented standard. Your manager will hold weekly 1:1 meetings during the review period, and the Employee Assistance Program is available at any time via the People portal.</p>
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
