import type { LetterTemplate } from "../types";

export const RESIGNATION_WITH_GRIEVANCE_UK: LetterTemplate = {
  letterType: "resignation_with_grievance",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Resignation + Concurrent Grievance — EMPLOYEE MODE):
- A two-track letter: notice of resignation AND a formal grievance lodged in the same instrument. The grievance survives the resignation — the employer's investigative duty under the ACAS Code persists at least to allow paper consideration (Jagex Ltd v McCambridge [2019] UKEAT).
- This is NOT a constructive resignation. The employee is not asserting fundamental breach. They are leaving on contractual notice while preserving the grievance.
- This letter is OPEN correspondence and tribunal-bound. No intensifiers, no admissions, no settlement language, no threats.
- Frame protected-characteristic angles as belief: 'I believe these matters are connected to my [characteristic]'.
- Reserve all rights at the close. Do NOT use warmth/thanks/'time to move on' alongside the grievance — that affirmation language complicates any subsequent claim.
- British English throughout. Cite the ACAS Code and s.10 ERelA 1999 right to be accompanied.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "UK date format. Address to HR Director (not the line manager who is typically the subject of the grievance).",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST address to HR Director or equivalent, NOT to the line manager subject to the grievance.",
      ],
      example: `<p>12 May 2026<br><br>Ms Priya Sharma<br>HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. 'Notice of Resignation and Formal Grievance'.",
      scaffold: `<p><strong>Notice of Resignation and Formal Grievance under the ACAS Code of Practice</strong></p>`,
      constraints: [
        "MUST identify both the resignation and the grievance.",
        "MUST NOT mark Without Prejudice.",
      ],
      example: `<p><strong>Notice of Resignation and Formal Grievance under the ACAS Code of Practice</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "One <p>. 'Dear Mr/Ms {Surname},'.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal honorific + surname."],
      example: `<p>Dear Ms Sharma,</p>`,
    },
    {
      sectionId: "opening",
      title: "Notice of resignation and last working day",
      instruction:
        "State the resignation, the notice period, the last working day. Then state plainly that this letter also constitutes a formal grievance under the ACAS Code which the employee asks the employer to investigate. No reasons for resignation in this paragraph.",
      scaffold: `<p>I am writing on two matters. First, I give notice of my resignation from my role as {{employeeJobTitle}} at {{employerLegalName}}. In accordance with my contract of employment I am giving {{noticePeriod}} notice, with my last working day being {{lastWorkingDayUK}}.</p>
<p>Second, this letter constitutes a formal grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures, which I ask the Company to investigate and address notwithstanding the fact that I am leaving. The matters set out below remain live and the duty to investigate them, as I understand it, is not extinguished by my notice.</p>`,
      constraints: [
        "MUST state both the resignation and the grievance plainly.",
        "MUST NOT thank the employer in this paragraph (that's affirmation language).",
        "MUST refer to the ACAS Code expressly.",
        "MUST NOT include any statement that could be read as constructive resignation ('I have no choice but to leave') unless the user has chosen the constructive route.",
      ],
      example: `<p>I am writing on two matters. First, I give notice of my resignation from my role as Senior Marketing Manager at Acme Holdings Limited. In accordance with my contract of employment I am giving three months' notice, with my last working day being 12 August 2026.</p>
<p>Second, this letter constitutes a formal grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures, which I ask the Company to investigate and address notwithstanding the fact that I am leaving. The matters set out below remain live and the duty to investigate them, as I understand it, is not extinguished by my notice.</p>`,
    },
    {
      sectionId: "chronology",
      title: "Grievance — background and chronology",
      instruction:
        "Strict chronological order, dated, named individuals, named witnesses. Numbered list. Paraphrase, do not quote unless verbatim record exists. No intensifiers.",
      scaffold: `<p>The grievance concerns the following matters:</p>
<ol>
  <li><strong>{{incident1Date}}</strong> — {{incident1Description}}. {{incident1Witnesses}}</li>
  <li><strong>{{incident2Date}}</strong> — {{incident2Description}}. {{incident2Witnesses}}</li>
  <li><strong>{{incident3Date}}</strong> — {{incident3Description}}. {{incident3Witnesses}}</li>
</ol>
<p>{{patternOrEscalationParagraph}}</p>
<p>I believe that the matters set out above {{protectedCharacteristicConnection}}.</p>`,
      constraints: [
        "MUST present incidents in strict chronological order with dates.",
        "MUST name individuals and witnesses.",
        "MUST paraphrase unless a verbatim record was supplied.",
        "MUST NOT use intensifiers.",
        "MUST frame any protected-characteristic angle as 'I believe...may amount to' under the Equality Act 2010.",
      ],
      example: `<p>The grievance concerns the following matters:</p>
<ol>
  <li><strong>14 January 2026</strong> — During a team meeting, my line manager Marcus Chen referred to me in front of the team as "the diversity hire". The remarks were heard by Sarah Williams, James O'Brien and Aisha Rahman.</li>
  <li><strong>3 February 2026</strong> — Following an internal recruitment round for the Head of Brand role, Mr Chen told me I "wasn't quite the right fit for the leadership group". A male colleague with shorter tenure was appointed.</li>
  <li><strong>21 March 2026</strong> — At the quarterly business review, Mr Chen interrupted my presentation twice to question my figures, then praised an identical methodology used by Tom Bryant.</li>
  <li><strong>10 April 2026</strong> — When I raised the pattern with Mr Chen, he told me I was "being oversensitive" and should "drop it before it became a problem".</li>
</ol>
<p>I believe that the matters set out above are connected to my sex and race and may amount to direct discrimination, harassment, and victimisation contrary to sections 13, 26 and 27 of the Equality Act 2010. I raise this on the basis of my reasonable belief and reserve my position as to legal characterisation.</p>`,
    },
    {
      sectionId: "outcome_sought",
      title: "Outcome sought from grievance",
      instruction:
        "List 1-3 specific outcomes calibrated to the fact of departure: investigation outcome in writing, finding on the conduct, agreed reference wording, training. Do NOT request reinstatement-type outcomes.",
      scaffold: `<p>Notwithstanding my notice, the outcomes I seek from this grievance are:</p>
<ul>
  <li>{{outcome1}}</li>
  <li>{{outcome2}}</li>
  <li>{{outcome3}}</li>
</ul>`,
      constraints: [
        "MUST list 1-3 outcomes calibrated to the writer's departure.",
        "MUST NOT include monetary demands (those belong in settlement correspondence).",
        "MUST NOT demand a specific sanction.",
      ],
      example: `<p>Notwithstanding my notice, the outcomes I seek from this grievance are:</p>
<ul>
  <li>A prompt and impartial investigation by an investigator with no prior reporting relationship with Mr Chen, with the witnesses interviewed and the relevant documents reviewed, and a written outcome confirmed to me before my last working day where reasonably practicable.</li>
  <li>A written finding on each of the incidents set out above and on the pattern they form.</li>
  <li>Confirmation that any reference provided to a future employer will be on a fact-only basis and will not refer to this grievance.</li>
</ul>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve all rights including any tribunal claim. Single short paragraph.",
      scaffold: `<p>I reserve all my rights, including any statutory, contractual, and common-law remedies. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part. In particular, my notice of resignation is not given in response to any conduct on the Company's part that I treat as a fundamental breach; the grievance is brought separately and is to be considered on its merits.</p>`,
      constraints: [
        "MUST reserve all rights.",
        "MUST distinguish the resignation from a constructive resignation (otherwise the dual character is unclear).",
        "MUST NOT enumerate every potential claim.",
      ],
      example: `<p>I reserve all my rights, including any statutory, contractual, and common-law remedies. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part. In particular, my notice of resignation is not given in response to any conduct on the Company's part that I treat as a fundamental breach; the grievance is brought separately and is to be considered on its merits.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph requesting acknowledgement and confirming willingness to engage with the grievance process. Reference s.10 ERelA 1999 right to be accompanied at any hearing. 'Yours sincerely,'. No thanks.",
      scaffold: `<p>I would be grateful for confirmation of receipt and of the grievance process timetable. I confirm that I will be accompanied at any grievance hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST cite s.10 ERelA 1999.",
        "MUST NOT include thanks for past treatment or warmth.",
        "MUST NOT include any statement that could be read as affirmation of the conduct complained of.",
      ],
      example: `<p>I would be grateful for confirmation of receipt and of the grievance process timetable. I confirm that I will be accompanied at any grievance hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Two or three lines: name, job title, employee number.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST be name, title, employee number where supplied."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee No. 04231</p>`,
    },
  ],
};

export const RESIGNATION_WITH_GRIEVANCE_US: LetterTemplate = {
  letterType: "resignation_with_grievance",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Resignation + Concurrent Internal Complaint — EMPLOYEE MODE):
- A two-track letter: resignation AND a formal internal complaint. Notice of complaint preserves Faragher–Ellerth posture.
- This is NOT a constructive discharge letter. The employee is not asserting intolerable conditions forcing resignation.
- OPEN correspondence — anything written may be produced in EEOC/court proceedings. No intensifiers, no admissions, no settlement language.
- Frame protected-characteristic angles as belief.
- Reserve all rights including the right to file a charge with the EEOC or state agency.
- American English. Cite Title VII, ADA, ADEA, PWFA, FEHA, or applicable state law where relevant.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "US date format. Address to HR (not the line manager subject to the complaint).",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST address to HR, not the line manager.",
      ],
      example: `<p>May 12, 2026<br><br>Ms. Priya Sharma<br>Chief People Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies both the resignation and the formal complaint.",
      scaffold: `<p><strong>Notice of Resignation and Formal Internal Complaint</strong></p>`,
      constraints: [
        "MUST identify both elements.",
        "MUST NOT mark Without Prejudice.",
      ],
      example: `<p><strong>Notice of Resignation and Formal Internal Complaint</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Ms. Sharma,</p>`,
    },
    {
      sectionId: "opening",
      title: "Notice of resignation and last working day",
      instruction:
        "State the resignation, notice, last day. Then state that the letter is also a formal internal complaint pursuant to company policy. No reasons in this paragraph.",
      scaffold: `<p>I am writing on two matters. First, I give notice of my resignation from my role as {{employeeJobTitle}} at {{employerLegalName}}. I am giving {{noticePeriod}} notice, with my last working day being {{lastWorkingDayUS}}.</p>
<p>Second, this letter constitutes a formal internal complaint pursuant to the Company's anti-harassment and anti-discrimination policy, which I ask the Company to investigate and address notwithstanding the fact that I am leaving. The matters below are not, in my view, extinguished by my notice.</p>`,
      constraints: [
        "MUST state both elements.",
        "MUST NOT include thanks or warmth in this paragraph.",
        "MUST NOT use language consistent with constructive discharge unless intended.",
      ],
      example: `<p>I am writing on two matters. First, I give notice of my resignation from my role as Senior Marketing Manager at Acme Inc. I am giving four weeks' notice, with my last working day being June 9, 2026.</p>
<p>Second, this letter constitutes a formal internal complaint pursuant to the Company's anti-harassment and anti-discrimination policy, which I ask the Company to investigate and address notwithstanding the fact that I am leaving. The matters below are not, in my view, extinguished by my notice.</p>`,
    },
    {
      sectionId: "chronology",
      title: "Background and chronology",
      instruction:
        "Strict chronological order, dated, named individuals, named witnesses, paraphrased. Frame protected-characteristic angle as belief.",
      scaffold: `<p>The complaint concerns the following matters:</p>
<ol>
  <li><strong>{{incident1Date}}</strong> — {{incident1Description}}. {{incident1Witnesses}}</li>
  <li><strong>{{incident2Date}}</strong> — {{incident2Description}}. {{incident2Witnesses}}</li>
  <li><strong>{{incident3Date}}</strong> — {{incident3Description}}. {{incident3Witnesses}}</li>
</ol>
<p>{{patternOrEscalationParagraph}}</p>
<p>I believe that the matters set out above were directed at me because of my {{protectedCharacteristic}} and may violate {{statuteList}}. I raise this on the basis of my reasonable belief and reserve my position as to legal characterization.</p>`,
      constraints: [
        "MUST present incidents in chronological order, dated, with named witnesses.",
        "MUST cite the relevant federal statute and state law.",
        "MUST frame protected-characteristic angle as belief.",
        "MUST NOT use intensifiers.",
      ],
      example: `<p>The complaint concerns the following matters:</p>
<ol>
  <li><strong>January 14, 2026</strong> — During a team meeting, my supervisor Marcus Chen referred to me in front of the team as "the diversity hire". Witnesses: Sarah Williams, James O'Brien, Aisha Rahman.</li>
  <li><strong>February 3, 2026</strong> — Following an internal recruitment for the Head of Brand role, Mr. Chen told me I "wasn't quite the right fit for the leadership group". A male colleague with shorter tenure was appointed.</li>
  <li><strong>March 21, 2026</strong> — At the quarterly business review, Mr. Chen interrupted my presentation twice and praised an identical methodology used by Tom Bryant.</li>
  <li><strong>April 10, 2026</strong> — Mr. Chen told me I was "being oversensitive" and should "drop it before it became a problem".</li>
</ol>
<p>I believe that the matters set out above were directed at me because of my sex and race and may violate Title VII of the Civil Rights Act of 1964 and the California Fair Employment and Housing Act (Cal. Gov. Code §12940 et seq.). I raise this on the basis of my reasonable belief and reserve my position as to legal characterization.</p>`,
    },
    {
      sectionId: "outcome_sought",
      title: "Outcome sought from complaint",
      instruction: "1-3 specific outcomes calibrated to departure.",
      scaffold: `<p>Notwithstanding my notice, the outcomes I seek through this complaint are:</p>
<ul>
  <li>{{outcome1}}</li>
  <li>{{outcome2}}</li>
  <li>{{outcome3}}</li>
</ul>`,
      constraints: [
        "MUST list 1-3 outcomes.",
        "MUST NOT include monetary demand.",
        "MUST NOT demand a specific sanction.",
      ],
      example: `<p>Notwithstanding my notice, the outcomes I seek through this complaint are:</p>
<ul>
  <li>A prompt and impartial investigation by an investigator with no prior reporting relationship with Mr. Chen, with witnesses interviewed and documents reviewed, and a written outcome before my last working day where reasonably practicable.</li>
  <li>A written finding on each of the incidents set out above.</li>
  <li>Confirmation that any reference provided to a future employer will be limited to job title, dates of employment, and ending salary, in line with Company policy.</li>
</ul>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve all rights including EEOC / state agency. Distinguish from constructive discharge.",
      scaffold: `<p>I reserve all of my rights, including any statutory, contractual, and common-law remedies that may be available to me, and including without limitation the right to file a charge with the U.S. Equal Employment Opportunity Commission or the relevant state agency. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part. My resignation is given on contractual notice and is not, by this letter, asserted as a constructive discharge; the complaint is brought separately and is to be considered on its merits.</p>`,
      constraints: [
        "MUST reserve EEOC / state agency rights expressly.",
        "MUST distinguish from constructive discharge.",
      ],
      example: `<p>I reserve all of my rights, including any statutory, contractual, and common-law remedies that may be available to me, and including without limitation the right to file a charge with the U.S. Equal Employment Opportunity Commission or the California Civil Rights Department. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part. My resignation is given on contractual notice and is not, by this letter, asserted as a constructive discharge; the complaint is brought separately and is to be considered on its merits.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "Short paragraph requesting acknowledgement and confirmation of investigation timetable. 'Sincerely,'. No thanks for past treatment.",
      scaffold: `<p>I would be grateful for confirmation of receipt and of the investigation timetable, and confirmation of the Company's anti-retaliation obligations toward me during and after the process.</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST request acknowledgement and anti-retaliation confirmation.",
        "MUST NOT include thanks for past treatment.",
      ],
      example: `<p>I would be grateful for confirmation of receipt and of the investigation timetable, and confirmation of the Company's anti-retaliation obligations toward me during and after the process.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, title, employee ID.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST be name, title, employee ID."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee ID 04231</p>`,
    },
  ],
};
