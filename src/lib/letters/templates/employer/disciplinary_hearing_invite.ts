import type { LetterTemplate } from "../types";

export const DISCIPLINARY_HEARING_INVITE_UK: LetterTemplate = {
  letterType: "disciplinary_hearing_invite",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Invitation to a Disciplinary Hearing):
- Comply with the Acas Code of Practice on Disciplinary and Grievance Procedures (paragraphs 9 to 12). Unreasonable failure to follow the Code may lead a tribunal to adjust an award by up to 25% (s.207A TULRCA 1992).
- Para 9: the letter must contain enough information about the alleged misconduct or poor performance, and its possible consequences, for the employee to prepare to answer the case at the hearing. Enclose copies of the written evidence, which may include witness statements.
- Para 10: give the date, time and place of the hearing and tell the employee of the right to be accompanied. Para 11: allow reasonable time to prepare.
- The right to be accompanied is statutory (s.10 Employment Relations Act 1999): a fellow worker, a trade union representative employed by a union, or a union official certified as competent to accompany. The companion may put and sum up the employee's case and confer with them, but may not answer questions on their behalf. If the chosen companion cannot attend, the employee may propose another time, and the hearing will be postponed to it if it is reasonable and falls within five working days beginning with the first working day after the date proposed (s.10(4) and (5)).
- Possible outcomes must be stated. If dismissalPossible is true, say plainly that dismissal is a possible outcome, and where gross misconduct is alleged, that this may be dismissal without notice. Never suggest an outcome has been decided.
- Name who will chair the hearing. Where practicable the chair should not be the person who investigated (Acas Code para 6).
- Say what happens if the employee does not attend: they should tell the company if they cannot attend for a good reason, and if they fail to attend without good reason the hearing may go ahead and a decision may be made on the evidence available (Acas Code paras 24 and 25).
- Offer reasonable adjustments (Equality Act 2010 ss.20 to 22).
- If the ukRegion is Northern Ireland, the Labour Relations Agency Code of Practice on Disciplinary and Grievance Procedures applies in place of the Acas Code, and the right to be accompanied is under Article 12 of the Employment Relations (Northern Ireland) Order 1999.
- Register: formal, neutral, factual. Allegations are allegations, not findings. Plain English. British English spelling throughout. No em dashes.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then 'Private and confidential', then the employee's full legal name and home address.",
      scaffold: `<p>{{issueDateUK}}<br><br>Private and confidential<br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST mark the letter 'Private and confidential'.",
        "MUST NOT include any greeting here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>Private and confidential<br>Mr Daniel Okafor<br>14 Rosewood Avenue<br>London N4 2QX</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Render a single short <p> with the subject in <strong>: 'Invitation to a disciplinary hearing'.",
      scaffold: `<p><strong>Invitation to a disciplinary hearing</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST NOT name an outcome in the subject.",
      ],
      example: `<p><strong>Invitation to a disciplinary hearing</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Render exactly one short <p>: 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
        "MUST NOT use a first-name salutation in a formal disciplinary letter.",
      ],
      example: `<p>Dear Mr Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Hearing details",
      instruction:
        "Invite the employee to the disciplinary hearing following the investigation. Give the date, time and place, name who will chair it, and anyone else attending (for example a People team adviser or note-taker). One short paragraph.",
      scaffold: `<p>Following the investigation into the matters set out below, I am writing to invite you to a disciplinary hearing on {{hearingDate}} at {{hearingTime}}, at {{hearingPlace}}. The hearing will be chaired by {{decisionMaker}}, {{decisionMakerTitle}}. {{otherAttendeesSentence}}</p>`,
      constraints: [
        "MUST give the date, time and place of the hearing.",
        "MUST name who will chair the hearing.",
        "MUST refer to the investigation that has taken place.",
      ],
      example: `<p>Following the investigation into the matters set out below, I am writing to invite you to a disciplinary hearing on 2 June 2026 at 2:00pm, at Meeting Room 4, Acme House, 1 Bridge Street, London EC1A 1AA. The hearing will be chaired by Priya Sharma, HR Director. Sarah Lewis from the People team will also attend to advise and take notes.</p>`,
    },
    {
      sectionId: "body",
      title: "Allegations and evidence",
      instruction:
        "Set out each allegation in enough detail for the employee to answer it: what is alleged, when, and where. Number them if there is more than one. Then list the evidence enclosed with the letter, and invite the employee to bring their own evidence and to tell the chair in advance if they wish to call witnesses.",
      scaffold: `<p>The allegations you will be asked to respond to are:</p>
<ul>{{allegationsListItems}}</ul>
<p>Copies of the evidence the hearing will consider are enclosed with this letter: {{evidenceEnclosed}}.</p>
<p>At the hearing you will be able to respond to each allegation, ask questions, present your own evidence and call relevant witnesses. If you wish to call a witness or submit documents, please tell {{decisionMaker}} by {{advanceNoticeDate}}.</p>`,
      constraints: [
        "MUST set out each allegation with enough detail (what, when, where) for the employee to prepare (Acas Code para 9).",
        "MUST list the evidence enclosed, including any witness statements.",
        "MUST say the employee may present evidence and call relevant witnesses.",
        "MUST describe the matters as allegations, not findings.",
        "MUST NOT add allegations that were not investigated.",
      ],
      example: `<p>The allegations you will be asked to respond to are:</p>
<ul><li>that on 9 May 2026 you removed four boxes of stock from the Hackney warehouse without authorisation; and</li><li>that on 9 May 2026 you made an entry on the stock system recording those boxes as damaged when they were not.</li></ul>
<p>Copies of the evidence the hearing will consider are enclosed with this letter: the investigation report by Tom Reid dated 26 May 2026, the witness statements of two colleagues, the stock system log for 9 May 2026, and the notes of your investigation meeting on 19 May 2026.</p>
<p>At the hearing you will be able to respond to each allegation, ask questions, present your own evidence and call relevant witnesses. If you wish to call a witness or submit documents, please tell Priya by 29 May 2026.</p>`,
    },
    {
      sectionId: "terms",
      title: "Possible outcomes",
      instruction:
        "State the possible outcomes if the allegations are upheld. If dismissalPossible is true, say plainly that dismissal is a possible outcome, and if gross misconduct is alleged, that this may be dismissal without notice. Say that no decision has been made and that the chair will consider the employee's response before deciding.",
      scaffold: `<p>{{grossMisconductSentence}} No decision has been made, and {{decisionMaker}} will consider everything you say before reaching one. If the allegations are upheld, the possible outcomes include {{possibleOutcomes}}.</p>`,
      constraints: [
        "MUST state the possible outcomes (Acas Code para 9).",
        "MUST state that dismissal is a possible outcome where dismissalPossible is true.",
        "MUST say that dismissal may be without notice where gross misconduct is alleged.",
        "MUST state that no decision has been made.",
        "MUST NOT mention dismissal as an outcome unless dismissalPossible is true.",
      ],
      example: `<p>The company considers that, if they are upheld, these allegations could amount to gross misconduct under the Disciplinary Policy. No decision has been made, and Priya will consider everything you say before reaching one. If the allegations are upheld, the possible outcomes include a written warning, a final written warning, or dismissal, which in a case of gross misconduct may be without notice.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Right to be accompanied",
      instruction:
        "State the statutory right to be accompanied by a fellow worker or trade union representative under s.10 Employment Relations Act 1999, what the companion may do, and the right to propose another time within five working days if the companion cannot attend. Ask for the companion's name in advance.",
      scaffold: `<p>You have the right to be accompanied at the hearing by a colleague or a trade union representative, under section 10 of the Employment Relations Act 1999. Your companion may put and sum up your case and talk to you during the hearing, but may not answer questions on your behalf. Please tell {{decisionMaker}} who will accompany you by {{companionNameByDate}}.</p>
<p>If your chosen companion cannot attend at the time above, you may propose another time. As long as it is reasonable and falls within five working days of the original date, we will move the hearing to that time.</p>`,
      constraints: [
        "MUST state the right to be accompanied by a colleague or trade union representative.",
        "MUST cite section 10 of the Employment Relations Act 1999 (or Article 12 of the Employment Relations (Northern Ireland) Order 1999 in Northern Ireland).",
        "MUST state the right to propose another time within five working days if the companion cannot attend.",
        "MUST NOT limit the choice of companion to fewer people than the statute allows.",
      ],
      example: `<p>You have the right to be accompanied at the hearing by a colleague or a trade union representative, under section 10 of the Employment Relations Act 1999. Your companion may put and sum up your case and talk to you during the hearing, but may not answer questions on your behalf. Please tell Priya who will accompany you by 29 May 2026.</p>
<p>If your chosen companion cannot attend at the time above, you may propose another time. As long as it is reasonable and falls within five working days of the original date, we will move the hearing to that time.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Adjustments and attendance",
      instruction:
        "Offer reasonable adjustments. Ask the employee to confirm attendance. Explain what happens if they cannot attend for a good reason, and that if they do not attend without good reason the hearing may go ahead in their absence and a decision may be made on the evidence available.",
      scaffold: `<p>If you need any adjustments to help you take part, please tell {{decisionMaker}} and we will do what we reasonably can.</p>
<p>Please confirm by {{confirmByDate}} that you will attend. If you cannot attend for a good reason, such as illness, please tell us as soon as possible and we will consider rearranging. If you do not attend without good reason, the hearing may go ahead without you and a decision may be made on the evidence available.</p>`,
      constraints: [
        "MUST offer reasonable adjustments.",
        "MUST ask the employee to confirm attendance.",
        "MUST explain what happens if the employee does not attend.",
        "MUST NOT say a decision will automatically be made against the employee if they do not attend.",
      ],
      example: `<p>If you need any adjustments to help you take part, for example extra breaks or a different room, please tell Priya and we will do what we reasonably can.</p>
<p>Please confirm by 29 May 2026 that you will attend. If you cannot attend for a good reason, such as illness, please tell us as soon as possible and we will consider rearranging. If you do not attend without good reason, the hearing may go ahead without you and a decision may be made on the evidence available.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph pointing to support (Employee Assistance Programme) and a contact for questions, followed by 'Yours sincerely,'.",
      scaffold: `<p>{{supportParagraph}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST point to at least one source of support.",
        "MUST use 'Yours sincerely,'.",
        "MUST NOT express a view on the allegations.",
      ],
      example: `<p>If you have any questions about the hearing, please contact Sarah Lewis at sarah.lewis@acme.example. The Employee Assistance Programme is free and confidential, and you can call it on 0800 123 4567 at any time.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Three lines: signatory name, signatory title, employer legal name.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>HR Director<br>Acme Holdings Limited</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "investigation_report",
      label: "Investigation report",
      required: true,
      description: "The investigator's report setting out the evidence and whether there is a case to answer.",
      expectedKinds: ["document"],
    },
    {
      key: "allegation_evidence",
      label: "Evidence to enclose",
      required: true,
      description: "Witness statements, emails, logs or other documents the hearing will consider.",
      expectedKinds: ["email", "document", "screenshot"],
    },
    {
      key: "investigation_meeting_notes",
      label: "Investigation meeting notes",
      required: false,
      description: "Notes of the employee's investigation meeting.",
      expectedKinds: ["document", "note"],
    },
    {
      key: "policy_excerpts",
      label: "Disciplinary policy",
      required: false,
      description: "The policy, including any examples of gross misconduct relied on.",
      expectedKinds: ["document"],
    },
    {
      key: "prior_records",
      label: "Live warnings on file",
      required: false,
      description: "Any warning still live on the file, which affects the possible outcomes.",
      expectedKinds: ["document"],
    },
  ],
};

export const DISCIPLINARY_HEARING_INVITE_US: LetterTemplate = {
  letterType: "disciplinary_hearing_invite",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Invitation to a Disciplinary Meeting):
- Employment is at-will. A disciplinary meeting is company practice, not a legal requirement. Frame the process as following company policy, and do not promise a particular process, a particular outcome, or that employment will only end for cause. Do not create an implied contract.
- There is no statutory right to be accompanied (the UK s.10 right does not apply). Say what company policy allows. If the employee is in a bargaining unit represented by a union, they may ask for a union representative at an interview they reasonably believe may lead to discipline (NLRB v. J. Weingarten, Inc., 420 U.S. 251 (1975)); include that sentence only where it applies.
- Set out the concerns in enough detail for the employee to respond, and share the documents the decision maker will consider where policy allows. Documentation that the employee was told the concerns and given a chance to respond helps defend later claims under Title VII, the ADA, the ADEA and state law.
- State that possible outcomes include discipline up to and including termination of employment where dismissalPossible is true. Never suggest an outcome has been decided.
- Offer reasonable accommodation (ADA, 42 USC 12112(b)(5)).
- Say what happens if the employee does not attend: the company may make a decision based on the information available.
- No admission language. Register: neutral, professional, factual. American English spelling throughout. No em dashes.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'), then 'Personal and confidential', then the employee's full legal name and home address.",
      scaffold: `<p>{{issueDateUS}}<br><br>Personal and confidential<br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST mark the letter 'Personal and confidential'.",
        "MUST NOT include any greeting here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>May 12, 2026<br><br>Personal and confidential<br>Mr. Daniel Okafor<br>240 Pine Street, Apt 7<br>San Francisco, CA 94111</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Render a single short <p> with the subject in <strong>: 'Disciplinary Meeting'.",
      scaffold: `<p><strong>Disciplinary Meeting</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST NOT name an outcome in the subject.",
      ],
      example: `<p><strong>Disciplinary Meeting</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Render exactly one short <p>: 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Mr. Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Meeting details",
      instruction:
        "Ask the employee to attend a disciplinary meeting following the investigation, under company policy. Give the date, time and place and name the decision maker and anyone else attending. One short paragraph.",
      scaffold: `<p>Following the company's investigation, and in line with our {{policyName}}, please attend a disciplinary meeting on {{hearingDate}} at {{hearingTime}}, at {{hearingPlace}}. The meeting will be led by {{decisionMaker}}, {{decisionMakerTitle}}. {{otherAttendeesSentence}}</p>`,
      constraints: [
        "MUST give the date, time and place of the meeting.",
        "MUST name who will lead the meeting and make the decision.",
        "MUST frame the meeting as following company policy, not a legal requirement.",
      ],
      example: `<p>Following the company's investigation, and in line with our Workplace Conduct Policy, please attend a disciplinary meeting on June 2, 2026 at 2:00 p.m., at Conference Room B, 500 Market Street, San Francisco, CA 94105. The meeting will be led by Priya Sharma, Vice President, People. Sarah Lewis from HR will also attend to take notes.</p>`,
    },
    {
      sectionId: "body",
      title: "Concerns and documents",
      instruction:
        "Set out each concern in enough detail for the employee to respond: what is alleged, when, and where. Then list the documents enclosed and invite the employee to bring any information they want considered.",
      scaffold: `<p>The concerns you will be asked to respond to are:</p>
<ul>{{allegationsListItems}}</ul>
<p>Copies of the documents {{decisionMaker}} will consider are enclosed: {{evidenceEnclosed}}.</p>
<p>At the meeting you will have the opportunity to respond to each concern and to share any information you would like the company to consider. If you have documents or the names of people you believe the company should speak to, please send them to {{decisionMaker}} by {{advanceNoticeDate}}.</p>`,
      constraints: [
        "MUST set out each concern with enough detail (what, when, where) for the employee to respond.",
        "MUST list the documents enclosed.",
        "MUST give the employee an opportunity to respond and share information.",
        "MUST describe the matters as allegations, not findings.",
        "MUST NOT include any statement that admits wrongdoing by the employee or the company.",
      ],
      example: `<p>The concerns you will be asked to respond to are:</p>
<ul><li>that on May 9, 2026 you removed four boxes of stock from the Oakland warehouse without authorization; and</li><li>that on May 9, 2026 you recorded those boxes as damaged in the inventory system when they were not.</li></ul>
<p>Copies of the documents Priya will consider are enclosed: the investigation summary dated May 26, 2026, the inventory system log for May 9, 2026, and the notes of your investigation meeting on May 19, 2026.</p>
<p>At the meeting you will have the opportunity to respond to each concern and to share any information you would like the company to consider. If you have documents or the names of people you believe the company should speak to, please send them to Priya by May 29, 2026.</p>`,
    },
    {
      sectionId: "terms",
      title: "Possible outcomes",
      instruction:
        "State the possible outcomes if the concerns are substantiated, including termination of employment where dismissalPossible is true. Say no decision has been made. Confirm employment remains at-will.",
      scaffold: `<p>No decision has been made, and {{decisionMaker}} will consider your response before reaching one. If the concerns are substantiated, possible outcomes include {{possibleOutcomes}}. Nothing in this letter changes the at-will nature of your employment with {{employerLegalName}}.</p>`,
      constraints: [
        "MUST state the possible outcomes.",
        "MUST state that termination of employment is a possible outcome where dismissalPossible is true.",
        "MUST state that no decision has been made.",
        "MUST confirm that employment remains at-will.",
        "MUST NOT mention termination as an outcome unless dismissalPossible is true.",
      ],
      example: `<p>No decision has been made, and Priya will consider your response before reaching one. If the concerns are substantiated, possible outcomes include a written warning, a final written warning, or termination of employment. Nothing in this letter changes the at-will nature of your employment with Acme Inc.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Attendance at the meeting",
      instruction:
        "Say what company policy allows about bringing someone to the meeting, adding the union representative sentence only where it applies. Do not describe any statutory right to be accompanied.",
      scaffold: `<p>{{companionParagraph}}</p>`,
      constraints: [
        "MUST say what company policy allows about bringing someone to the meeting.",
        "MUST NOT state or imply a statutory right to be accompanied.",
        "MUST NOT cite the UK Employment Relations Act 1999.",
      ],
      example: `<p>Company policy allows you to bring a coworker to the meeting as a support person. Your coworker may take notes and support you but may not answer questions for you. Please let Priya know their name by May 29, 2026.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Accommodation and attendance",
      instruction:
        "Offer reasonable accommodation. Ask the employee to confirm attendance. Explain that if they cannot attend they should say so as soon as possible, and that if they do not attend the company may make a decision based on the information available.",
      scaffold: `<p>If you need an accommodation to take part in the meeting, please let {{decisionMaker}} know and we will work with you on it.</p>
<p>Please confirm by {{confirmByDate}} that you will attend. If you are unable to attend, please let us know as soon as possible so that we can consider another time. If you do not attend, the company may make a decision based on the information available.</p>`,
      constraints: [
        "MUST offer reasonable accommodation.",
        "MUST ask the employee to confirm attendance.",
        "MUST explain what happens if the employee does not attend.",
      ],
      example: `<p>If you need an accommodation to take part in the meeting, please let Priya know and we will work with you on it.</p>
<p>Please confirm by May 29, 2026 that you will attend. If you are unable to attend, please let us know as soon as possible so that we can consider another time. If you do not attend, the company may make a decision based on the information available.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph pointing to support (Employee Assistance Program) and a contact for questions, followed by 'Sincerely,'.",
      scaffold: `<p>{{supportParagraph}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST point to at least one source of support.",
        "MUST use 'Sincerely,'.",
        "MUST NOT express a view on the concerns.",
      ],
      example: `<p>If you have any questions about the meeting, please contact Sarah Lewis at sarah.lewis@acme.example. The Employee Assistance Program is free and confidential, and you can reach it at (800) 555 0199 at any time.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Three lines: signatory name, signatory title, employer legal name.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>Vice President, People<br>Acme Inc.</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "investigation_report",
      label: "Investigation summary",
      required: true,
      description: "The investigator's summary of what was found.",
      expectedKinds: ["document"],
    },
    {
      key: "allegation_evidence",
      label: "Documents to enclose",
      required: true,
      description: "Emails, logs, statements or other documents the decision maker will consider.",
      expectedKinds: ["email", "document", "screenshot"],
    },
    {
      key: "policy_excerpts",
      label: "Policy excerpts",
      required: false,
      description: "The conduct or discipline policy that applies.",
      expectedKinds: ["document"],
    },
    {
      key: "prior_records",
      label: "Prior disciplinary records",
      required: false,
      description: "Any earlier warnings on the file that affect the possible outcomes.",
      expectedKinds: ["document"],
    },
  ],
};
