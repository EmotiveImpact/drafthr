import type { LetterTemplate } from "../types";

export const INVESTIGATION_MEETING_INVITE_UK: LetterTemplate = {
  letterType: "investigation_meeting_invite",
  jurisdiction: "UK",
  evidenceTier: "medium",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Invitation to an Investigation Meeting):
- This letter invites the employee to a fact-finding investigation meeting under the Acas Code of Practice on Disciplinary and Grievance Procedures (paragraphs 5 to 7). It is not a disciplinary hearing.
- State plainly that the meeting is to establish the facts, that no decision will be made at it, and that an investigation meeting should not by itself result in any disciplinary action (Acas Code para 7). If the investigation finds there is a case to answer, the employee will be invited to a separate disciplinary hearing in writing.
- Where practicable, the investigator should be a different person from whoever may later hear the case (Acas Code para 6). Name the investigator and any note-taker.
- Companion: there is no statutory right to be accompanied at an investigation meeting (the s.10 Employment Relations Act 1999 right applies to disciplinary and grievance hearings). Say exactly what the employer's policy allows. If companionAllowed is true, say who may attend (a colleague or a trade union representative, unless the policy says otherwise). Otherwise, say plainly that the policy does not provide for a companion at this meeting, and do not cite s.10.
- Offer reasonable adjustments to the meeting (Equality Act 2010 ss.20 to 22) and invite the employee to say what they need.
- Confidentiality: ask the employee to keep the matter confidential and not to discuss it with potential witnesses, while making clear they may speak to a companion, a trade union representative, their own adviser or the Employee Assistance Programme.
- If the ukRegion is Northern Ireland, the Labour Relations Agency Code of Practice on Disciplinary and Grievance Procedures applies in place of the Acas Code.
- Register: neutral, factual, brief. The allegation is described as an allegation. Plain English. British English spelling throughout. No em dashes.`,
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
      instruction: "Render a single short <p> with the subject in <strong>: 'Invitation to an investigation meeting'.",
      scaffold: `<p><strong>Invitation to an investigation meeting</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST NOT use the words 'disciplinary hearing' in the subject.",
      ],
      example: `<p><strong>Invitation to an investigation meeting</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Render exactly one short <p>: 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Mr Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Meeting details",
      instruction:
        "Invite the employee to the meeting. Give the date, time and place, and name the investigator and any note-taker. One short paragraph.",
      scaffold: `<p>I am writing to invite you to an investigation meeting on {{meetingDate}} at {{meetingTime}}, at {{meetingPlace}}. The meeting will be held by {{investigator}}, {{investigatorTitle}}, who has been asked to investigate this matter. {{noteTakerName}} will attend to take notes.</p>`,
      constraints: [
        "MUST give the date, time and place of the meeting.",
        "MUST name who will hold the meeting.",
        "MUST NOT call the meeting a hearing.",
      ],
      example: `<p>I am writing to invite you to an investigation meeting on 19 May 2026 at 10:00am, at Meeting Room 2, Acme House, 1 Bridge Street, London EC1A 1AA. The meeting will be held by Tom Reid, Operations Manager, who has been asked to investigate this matter. Sarah Lewis from the People team will attend to take notes.</p>`,
    },
    {
      sectionId: "body",
      title: "Allegation and purpose",
      instruction:
        "Describe the allegation being investigated in enough detail for the employee to understand it. Explain that the meeting is a fact-finding meeting and not a disciplinary hearing, that no outcome will be decided at it, and what happens after the investigation.",
      scaffold: `<p>The investigation concerns an allegation that {{allegationSummary}}.</p>
<p>This is a fact-finding meeting. It is not a disciplinary hearing, and no decision or outcome will be reached at it. Its purpose is to hear your account and to ask you about what happened. Once the investigation is complete, {{investigator}} will decide whether there is a case to answer. If there is, you will be invited in writing to a separate disciplinary hearing and given copies of the evidence beforehand. If there is not, the matter will be closed and you will be told in writing.</p>`,
      constraints: [
        "MUST describe the allegation clearly and as an allegation.",
        "MUST state that the meeting is fact-finding and not a disciplinary hearing.",
        "MUST state that no outcome will be decided at the meeting.",
        "MUST explain what happens after the investigation.",
        "MUST NOT name the person who raised the allegation or any witness.",
        "MUST NOT suggest the allegation has been proved.",
      ],
      example: `<p>The investigation concerns an allegation that on 9 May 2026 you removed stock from the Hackney warehouse without authorisation.</p>
<p>This is a fact-finding meeting. It is not a disciplinary hearing, and no decision or outcome will be reached at it. Its purpose is to hear your account and to ask you about what happened. Once the investigation is complete, Tom will decide whether there is a case to answer. If there is, you will be invited in writing to a separate disciplinary hearing and given copies of the evidence beforehand. If there is not, the matter will be closed and you will be told in writing.</p>`,
    },
    {
      sectionId: "terms",
      title: "Companion and adjustments",
      instruction:
        "Say exactly what the employer's policy allows about a companion at the investigation meeting, based on companionAllowed. Then offer reasonable adjustments and ask the employee to say what they need.",
      scaffold: `<p>{{companionParagraph}}</p>
<p>If you need any adjustments to help you take part, for example a different time or place, extra breaks, or written questions in advance, please tell {{investigator}} and we will do what we reasonably can.</p>`,
      constraints: [
        "MUST say what the policy allows about a companion.",
        "MUST NOT state that the employee has a statutory right to be accompanied at an investigation meeting.",
        "MUST NOT cite section 10 of the Employment Relations Act 1999 as giving a right at this meeting.",
        "MUST offer reasonable adjustments.",
      ],
      example: `<p>Our disciplinary policy allows you to bring a colleague or a trade union representative to this meeting if you wish. Please let Tom know their name by 15 May 2026. There is no legal right to be accompanied at an investigation meeting, but we allow it under our policy.</p>
<p>If you need any adjustments to help you take part, for example a different time or place, extra breaks, or written questions in advance, please tell Tom and we will do what we reasonably can.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Confidentiality",
      instruction:
        "Ask the employee to keep the investigation confidential and not to discuss it with potential witnesses, and make clear who they may still talk to. One short paragraph.",
      scaffold: `<p>Please keep this matter confidential while the investigation takes place, and do not discuss it with anyone who may be a witness. This is to make sure the investigation is fair to everyone. You may of course talk to {{permittedContacts}}.</p>`,
      constraints: [
        "MUST ask the employee to keep the matter confidential and not to discuss it with potential witnesses.",
        "MUST say who the employee may still talk to, including a companion or trade union representative and the Employee Assistance Programme.",
        "MUST NOT threaten disciplinary action for breach of confidentiality in this letter.",
      ],
      example: `<p>Please keep this matter confidential while the investigation takes place, and do not discuss it with anyone who may be a witness. This is to make sure the investigation is fair to everyone. You may of course talk to your companion, a trade union representative, your own adviser or the Employee Assistance Programme.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Confirming attendance",
      instruction:
        "Ask the employee to confirm they can attend, and say who to contact if the time does not suit or they are unwell. One short paragraph.",
      scaffold: `<p>Please confirm by {{confirmByDate}} that you can attend, by contacting {{investigator}} at {{investigatorContact}}. If the time does not suit you, or you are unwell, please let us know as soon as possible so that we can arrange another time.</p>`,
      constraints: [
        "MUST ask the employee to confirm attendance and give a contact.",
        "MUST say what to do if the time does not suit.",
      ],
      example: `<p>Please confirm by 15 May 2026 that you can attend, by contacting Tom at tom.reid@acme.example. If the time does not suit you, or you are unwell, please let us know as soon as possible so that we can arrange another time.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph pointing to support (Employee Assistance Programme), followed by 'Yours sincerely,'.",
      scaffold: `<p>{{supportParagraph}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST point to at least one source of support.",
        "MUST use 'Yours sincerely,'.",
      ],
      example: `<p>We know that being involved in an investigation can be stressful. The Employee Assistance Programme is free and confidential, and you can call it on 0800 123 4567 at any time.</p>
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
      example: `<p>Tom Reid<br>Operations Manager<br>Acme Holdings Limited</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "allegation_record",
      label: "Record of the allegation",
      required: true,
      description: "The complaint, report or incident note the investigation is looking into.",
      expectedKinds: ["email", "document", "note"],
    },
    {
      key: "policy_excerpts",
      label: "Disciplinary policy",
      required: false,
      description: "The investigation section of the policy, including what it says about companions.",
      expectedKinds: ["document"],
    },
  ],
};

export const INVESTIGATION_MEETING_INVITE_US: LetterTemplate = {
  letterType: "investigation_meeting_invite",
  jurisdiction: "US",
  evidenceTier: "medium",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Invitation to an Investigation Meeting):
- This letter invites the employee to a fact-finding meeting as part of an internal investigation. It is not a disciplinary meeting and no decision will be made at it.
- Employment is at-will. Do not promise a particular process or outcome, and do not create an implied contract. Describe the process as the company's usual practice.
- There is no general legal right to bring someone to an investigation meeting. Say what company policy allows. If the employee is in a bargaining unit represented by a union, they may ask for a union representative to attend an investigatory interview they reasonably believe may lead to discipline (NLRB v. J. Weingarten, Inc., 420 U.S. 251 (1975)); include that sentence only where a union is recognized or companionAllowed covers a union representative.
- Offer reasonable accommodation for the meeting (ADA, 42 USC 12112(b)(5)) and invite the employee to say what they need.
- Confidentiality: ask the employee not to discuss the matter with potential witnesses or interfere with the investigation, and explain why. Do not impose a blanket confidentiality instruction or a ban on discussing terms and conditions of employment with coworkers (NLRA section 7, for non-supervisory employees).
- No admission language, and the concern is described as an allegation.
- Register: neutral, professional, brief. American English spelling throughout. No em dashes.`,
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
      instruction: "Render a single short <p> with the subject in <strong>: 'Investigation Meeting'.",
      scaffold: `<p><strong>Investigation Meeting</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST NOT use the words 'disciplinary' or 'discipline' in the subject.",
      ],
      example: `<p><strong>Investigation Meeting</strong></p>`,
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
        "Ask the employee to attend the meeting. Give the date, time and place, and name the investigator and anyone else attending. One short paragraph.",
      scaffold: `<p>Please attend a meeting on {{meetingDate}} at {{meetingTime}}, at {{meetingPlace}}. The meeting will be held by {{investigator}}, {{investigatorTitle}}, who is reviewing a concern that has been raised. {{noteTakerName}} will also attend to take notes.</p>`,
      constraints: [
        "MUST give the date, time and place of the meeting.",
        "MUST name who will hold the meeting.",
      ],
      example: `<p>Please attend a meeting on May 19, 2026 at 10:00 a.m., at Conference Room B, 500 Market Street, San Francisco, CA 94105. The meeting will be held by Tom Reid, Operations Manager, who is reviewing a concern that has been raised. Sarah Lewis from HR will also attend to take notes.</p>`,
    },
    {
      sectionId: "body",
      title: "Concern and purpose",
      instruction:
        "Describe the concern being investigated in enough detail for the employee to understand it. Explain that the meeting is to gather facts, that no decision will be made at it, and that the employee will be told the outcome of the review.",
      scaffold: `<p>The review concerns an allegation that {{allegationSummary}}.</p>
<p>The purpose of the meeting is to gather facts and to hear your account. It is not a disciplinary meeting, and no decision will be made at it. When the review is complete, the company will let you know the outcome and any next steps.</p>`,
      constraints: [
        "MUST describe the concern clearly and as an allegation.",
        "MUST state that the meeting is to gather facts and that no decision will be made at it.",
        "MUST NOT name the person who raised the concern or any witness.",
        "MUST NOT include any statement that admits wrongdoing by the employee or the company.",
        "MUST NOT promise a particular process or outcome.",
      ],
      example: `<p>The review concerns an allegation that on May 9, 2026, stock was removed from the Oakland warehouse without authorization.</p>
<p>The purpose of the meeting is to gather facts and to hear your account. It is not a disciplinary meeting, and no decision will be made at it. When the review is complete, the company will let you know the outcome and any next steps.</p>`,
    },
    {
      sectionId: "terms",
      title: "Attendance and accommodation",
      instruction:
        "Say what company policy allows about bringing someone to the meeting, based on companionAllowed, adding the union representative sentence only where it applies. Then offer reasonable accommodation.",
      scaffold: `<p>{{companionParagraph}}</p>
<p>If you need an accommodation to take part in the meeting, please let {{investigator}} know and we will work with you on it.</p>`,
      constraints: [
        "MUST say what company policy allows about bringing someone to the meeting.",
        "MUST NOT state or imply a general legal right to be accompanied.",
        "MUST offer reasonable accommodation.",
      ],
      example: `<p>Company policy does not provide for a companion at investigation meetings. If you are represented by a union, you may ask for a union representative to attend.</p>
<p>If you need an accommodation to take part in the meeting, please let Tom know and we will work with you on it.</p>`,
    },
    {
      sectionId: "conditions",
      title: "Protecting the investigation",
      instruction:
        "Ask the employee not to discuss the concern with potential witnesses or interfere with the investigation, and explain why. Keep it narrow. One short paragraph.",
      scaffold: `<p>To protect the integrity of the investigation, please do not discuss the concern with anyone who may be a witness, and do not take any step that could interfere with the review. This request does not limit your right to discuss your wages, hours or other terms and conditions of employment.</p>`,
      constraints: [
        "MUST ask the employee not to discuss the concern with potential witnesses and explain the reason.",
        "MUST NOT impose a blanket confidentiality instruction.",
        "MUST NOT threaten discipline for discussing the matter.",
      ],
      example: `<p>To protect the integrity of the investigation, please do not discuss the concern with anyone who may be a witness, and do not take any step that could interfere with the review. This request does not limit your right to discuss your wages, hours or other terms and conditions of employment.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Confirming attendance",
      instruction:
        "Ask the employee to confirm they can attend and say who to contact if the time does not work. One short paragraph.",
      scaffold: `<p>Please confirm by {{confirmByDate}} that you can attend, by contacting {{investigator}} at {{investigatorContact}}. If the time does not work for you, please let us know as soon as possible so that we can find another time.</p>`,
      constraints: [
        "MUST ask the employee to confirm attendance and give a contact.",
        "MUST say what to do if the time does not work.",
      ],
      example: `<p>Please confirm by May 15, 2026 that you can attend, by contacting Tom at tom.reid@acme.example. If the time does not work for you, please let us know as soon as possible so that we can find another time.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph pointing to support (Employee Assistance Program), followed by 'Sincerely,'.",
      scaffold: `<p>{{supportParagraph}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST point to at least one source of support.",
        "MUST use 'Sincerely,'.",
      ],
      example: `<p>The Employee Assistance Program is free and confidential, and you can reach it at (800) 555 0199 at any time.</p>
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
      example: `<p>Tom Reid<br>Operations Manager<br>Acme Inc.</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "allegation_record",
      label: "Record of the concern",
      required: true,
      description: "The complaint, report or incident note the investigation is looking into.",
      expectedKinds: ["email", "document", "note"],
    },
    {
      key: "policy_excerpts",
      label: "Investigation policy",
      required: false,
      description: "The handbook section on workplace investigations.",
      expectedKinds: ["document"],
    },
  ],
};
