import type { LetterTemplate } from "../types";

export const CONSTRUCTIVE_DISMISSAL_WARNING_UK: LetterTemplate = {
  letterType: "constructive_dismissal_warning",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Notice of Fundamental Breach (Pre-Resignation) — EMPLOYEE MODE — TRIBUNAL CRITICAL):
- This letter is sent BEFORE resigning under constructive dismissal — its purpose is to (i) put the employer on formal notice of the conduct treated as fundamental breach, (ii) demand specific remedy by a specific deadline, and (iii) preserve the writer's position so as to pre-empt the affirmation argument under Western Excavating (ECC) Ltd v Sharp [1978] ICR 221 (CA).
- The letter MUST state that the writer is NOT YET RESIGNING but reserves the right to treat the contract as discharged if the breach is not remedied.
- The breach must be set out: dates, named individuals, the express clauses or implied term breached. The implied term of mutual trust and confidence (Malik v BCCI [1997] UKHL 23) is the most commonly relied-upon term.
- A reasonable but specific deadline must be set. Too short risks unreasonableness; too long risks affirmation.
- This is OPEN correspondence and tribunal-bound. No intensifiers, no admissions, no settlement language.
- Reserve all rights including the right to resign in response and bring s.95(1)(c) ERA proceedings.
- Counsel review strongly recommended. British English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "UK date format. Address to a senior officer (HR Director, MD, CEO), NOT the line manager subject to the breach.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST address to a senior officer.",
        "MUST NOT address the line manager subject to the alleged breach.",
      ],
      example: `<p>12 May 2026<br><br>Mr David Whitfield<br>Managing Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Identifies as Notice of Fundamental Breach.",
      scaffold: `<p><strong>Notice of Fundamental Breach of Contract</strong></p>`,
      constraints: [
        "MUST identify as Notice of Fundamental Breach.",
        "MUST NOT mark Without Prejudice.",
      ],
      example: `<p><strong>Notice of Fundamental Breach of Contract</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Mr Whitfield,</p>`,
    },
    {
      sectionId: "chronology",
      title: "Specific breach particulars",
      instruction:
        "Numbered list of incidents in chronological order. Dates, named individuals, witnesses. Reference any prior raises and the response. Paraphrase. No intensifiers. State plainly that the writer treats the conduct as a fundamental breach but is NOT YET RESIGNING.",
      scaffold: `<p>I am writing to put the Company formally on notice that I treat the following conduct as a fundamental breach of my contract of employment. I am not at this stage resigning; I expect the Company to address the matters set out below promptly so that my employment can continue, but I reserve the right (and intend) to treat the contract as discharged should the breach not be remedied within the deadline set out below.</p>
<p>The conduct on which I rely is as follows:</p>
<ol>
  <li><strong>{{incident1Date}}</strong> — {{incident1Description}}. {{incident1Witnesses}}</li>
  <li><strong>{{incident2Date}}</strong> — {{incident2Description}}. {{incident2Witnesses}}</li>
  <li><strong>{{incident3Date}}</strong> — {{incident3Description}}. {{incident3Witnesses}}</li>
</ol>
<p>{{priorRaisesParagraph}}</p>`,
      constraints: [
        "MUST state expressly that the writer is NOT YET RESIGNING.",
        "MUST list incidents in chronological order with dates and named individuals.",
        "MUST reference any prior raises.",
        "MUST NOT use intensifiers.",
        "MUST NOT include any sentence that could be read as affirmation.",
      ],
      example: `<p>I am writing to put the Company formally on notice that I treat the following conduct as a fundamental breach of my contract of employment. I am not at this stage resigning; I expect the Company to address the matters set out below promptly so that my employment can continue, but I reserve the right (and intend) to treat the contract as discharged should the breach not be remedied within the deadline set out below.</p>
<p>The conduct on which I rely is as follows:</p>
<ol>
  <li><strong>14 January 2026</strong> — During a team meeting in the third-floor conference room, my line manager Marcus Chen referred to me in front of the team as "the diversity hire" and stated I had been promoted "to fill a quota". Witnesses: Sarah Williams, James O'Brien, Aisha Rahman.</li>
  <li><strong>3 February 2026</strong> — Following the internal recruitment for the Head of Brand role, Mr Chen told me I "wasn't quite the right fit for the leadership group". A male colleague with shorter tenure was appointed; the scoring rationale has not been provided despite multiple requests.</li>
  <li><strong>10 April 2026</strong> — When I raised the pattern with Mr Chen, he told me I was "being oversensitive" and should "drop it before it became a problem".</li>
  <li><strong>5 May 2026</strong> — I was excluded from the senior leadership offsite, despite attending in each of the previous three years.</li>
</ol>
<p>I escalated these matters to HR (Priya Sharma) by email of 11 April 2026; I received an acknowledgement on 14 April 2026 but no substantive response. The conduct has continued and, in my view, has escalated.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Statement treating as fundamental breach (not yet resigning)",
      instruction:
        "Identify the contractual term breached: express clauses (by number) and/or the implied term of mutual trust and confidence (Malik v BCCI [1997]). State that the conduct, taken individually and cumulatively, amounts to a fundamental and repudiatory breach. Re-confirm the writer is NOT YET RESIGNING.",
      scaffold: `<p>The conduct set out above amounts, individually and cumulatively, to a fundamental and repudiatory breach of {{contractualTermsBreached}}, including the implied term of mutual trust and confidence (Malik v BCCI [1997] UKHL 23). I do not at this stage treat the contract as discharged; I write so that the Company has the opportunity to remedy the breach.</p>`,
      constraints: [
        "MUST identify express clauses and/or the implied term of mutual trust and confidence.",
        "MUST cite Malik v BCCI [1997] UKHL 23.",
        "MUST re-confirm the writer is NOT YET RESIGNING.",
      ],
      example: `<p>The conduct set out above amounts, individually and cumulatively, to a fundamental and repudiatory breach of clauses 6 (mutual co-operation) and 14 (equal opportunity) of my Employment Contract, and of the implied term of mutual trust and confidence (Malik v BCCI [1997] UKHL 23). I do not at this stage treat the contract as discharged; I write so that the Company has the opportunity to remedy the breach.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Demand for remedy with deadline",
      instruction:
        "Set a specific, reasonable deadline (typically 14-21 calendar days). Specify the remedy: independent investigation, removal from line of report, written assurance against retaliation, written outcome.",
      scaffold: `<p>To remedy the breach, I ask that the Company:</p>
<ul>
  <li>{{remedy1}}</li>
  <li>{{remedy2}}</li>
  <li>{{remedy3}}</li>
</ul>
<p>I ask that the Company confirm in writing by {{remedyDeadlineUK}} the steps it will take. If by that date I have not received a substantive written response addressing each of the matters above, I reserve the right (and intend) to treat the contract as discharged by the Company's breach and to resign in response, without further notice, with effect from a date to be communicated.</p>`,
      constraints: [
        "MUST set a specific deadline.",
        "MUST specify remedy items.",
        "MUST state expressly the right to resign in response if the deadline is not met.",
      ],
      example: `<p>To remedy the breach, I ask that the Company:</p>
<ul>
  <li>commission an independent investigation by an investigator with no prior reporting line to Mr Chen, with the witnesses identified above interviewed and the documents reviewed;</li>
  <li>pending the outcome of that investigation, adjust my reporting line so that I no longer report to Mr Chen, with no detriment to my role, salary, or grade;</li>
  <li>provide me with written assurance that I will not be subjected to any detriment in connection with my having raised these matters; and</li>
  <li>confirm in writing the timetable for the investigation and the proposed mechanism for delivering the outcome to me.</li>
</ul>
<p>I ask that the Company confirm in writing by 26 May 2026 the steps it will take. If by that date I have not received a substantive written response addressing each of the matters above, I reserve the right (and intend) to treat the contract as discharged by the Company's breach and to resign in response, without further notice, with effect from a date to be communicated.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of all rights",
      instruction:
        "Reserve all rights including the right to resign and to bring s.95(1)(c) ERA constructive unfair dismissal proceedings, and any Equality Act claim where applicable.",
      scaffold: `<p>I reserve all my rights, including without limitation the right to bring proceedings under Part X of the Employment Rights Act 1996 for constructive unfair dismissal under section 95(1)(c), the right to bring proceedings under the Equality Act 2010, and the right to bring any other claim that may be available to me. Any continuing performance of my role pending the response to this letter is without prejudice to my position that the conduct set out above amounts to a fundamental breach.</p>`,
      constraints: [
        "MUST reserve s.95(1)(c) ERA constructive unfair dismissal rights.",
        "MUST state continued performance is without prejudice.",
        "MUST reserve EqA rights where applicable.",
      ],
      example: `<p>I reserve all my rights, including without limitation the right to bring proceedings under Part X of the Employment Rights Act 1996 for constructive unfair dismissal under section 95(1)(c), the right to bring proceedings under the Equality Act 2010, and the right to bring any other claim that may be available to me. Any continuing performance of my role pending the response to this letter is without prejudice to my position that the conduct set out above amounts to a fundamental breach.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short, neutral. 'Yours sincerely,'. NO warmth.",
      scaffold: `<p>I look forward to the Company's substantive written response by {{remedyDeadlineUK}}.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST NOT include warmth or thanks.",
      ],
      example: `<p>I look forward to the Company's substantive written response by 26 May 2026.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role, employee number.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST be name, role, employee number."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee No. 04231</p>`,
    },
  ],
};

export const CONSTRUCTIVE_DISMISSAL_WARNING_US: LetterTemplate = {
  letterType: "constructive_dismissal_warning",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Pre-Resignation Notice of Constructive Discharge Concerns — EMPLOYEE MODE — LITIGATION CRITICAL):
- This letter is sent BEFORE resigning to (i) put the employer on notice of conduct that, if not remedied, will be treated as constructive discharge; (ii) demand specific remedy; (iii) preserve the writer's position. It also documents the employer's notice for purposes of any subsequent EEOC charge or court complaint.
- US constructive discharge standard: working conditions so intolerable that a reasonable person would feel compelled to resign (Pennsylvania State Police v. Suders, 542 U.S. 129 (2004); Cal. Turner v. Anheuser-Busch, 7 Cal. 4th 1238 (1994)).
- Where protected characteristics are implicated, frame as belief and cite Title VII / ADA / ADEA / PWFA / state law.
- The writer must state that they are NOT YET RESIGNING but reserve the right to do so if the conduct is not remedied.
- This is OPEN correspondence — no intensifiers, no admissions. Reserve EEOC / state agency rights.
- American English. Counsel review strongly recommended.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "US date format. Senior officer (CEO, CHRO, GC), not the line manager.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST address to a senior officer.",
      ],
      example: `<p>May 12, 2026<br><br>Mr. David Whitfield<br>Chief Executive Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Notice of Conditions Tending Toward Constructive Discharge</strong></p>`,
      constraints: [
        "MUST identify the letter as a pre-resignation notice.",
        "MUST NOT mark confidential / settlement.",
      ],
      example: `<p><strong>Notice of Conditions Tending Toward Constructive Discharge</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Mr. Whitfield,</p>`,
    },
    {
      sectionId: "chronology",
      title: "Specific breach particulars",
      instruction:
        "Numbered list of incidents in chronological order. Dates, named individuals, witnesses. Prior raises and response. State expressly that the writer is NOT YET RESIGNING.",
      scaffold: `<p>I am writing to put the Company formally on notice that the conduct set out below has, in my view and in the view of any reasonable person in my position, brought my working conditions close to the threshold of intolerability. I am not at this stage resigning; I expect the Company to address the matters set out below promptly, but I reserve the right (and intend) to treat any failure to do so as constructive discharge for purposes of Pennsylvania State Police v. Suders, 542 U.S. 129 (2004){{stateLawAddon}}.</p>
<p>The conduct on which I rely is as follows:</p>
<ol>
  <li><strong>{{incident1Date}}</strong> — {{incident1Description}}. {{incident1Witnesses}}</li>
  <li><strong>{{incident2Date}}</strong> — {{incident2Description}}. {{incident2Witnesses}}</li>
  <li><strong>{{incident3Date}}</strong> — {{incident3Description}}. {{incident3Witnesses}}</li>
</ol>
<p>{{priorRaisesParagraph}}</p>`,
      constraints: [
        "MUST state expressly that the writer is NOT YET RESIGNING.",
        "MUST list incidents in chronological order, dated, with witnesses.",
        "MUST cite Pennsylvania State Police v. Suders.",
        "MUST reference prior raises.",
        "MUST NOT use intensifiers.",
      ],
      example: `<p>I am writing to put the Company formally on notice that the conduct set out below has, in my view and in the view of any reasonable person in my position, brought my working conditions close to the threshold of intolerability. I am not at this stage resigning; I expect the Company to address the matters set out below promptly, but I reserve the right (and intend) to treat any failure to do so as constructive discharge for purposes of Pennsylvania State Police v. Suders, 542 U.S. 129 (2004) and the analogous standard under California law (Turner v. Anheuser-Busch, 7 Cal. 4th 1238 (1994)).</p>
<p>The conduct on which I rely is as follows:</p>
<ol>
  <li><strong>January 14, 2026</strong> — Mr. Chen referred to me in front of the team as "the diversity hire" and stated I had been promoted "to fill a quota". Witnesses: Sarah Williams, James O'Brien, Aisha Rahman.</li>
  <li><strong>February 3, 2026</strong> — Following the internal recruitment for Head of Brand, Mr. Chen told me I "wasn't quite the right fit for the leadership group". A male colleague with shorter tenure was appointed.</li>
  <li><strong>April 10, 2026</strong> — Mr. Chen told me I was "being oversensitive" and should "drop it before it became a problem".</li>
  <li><strong>May 5, 2026</strong> — I was excluded from the senior leadership offsite despite attending in each of the previous three years.</li>
</ol>
<p>I escalated these matters by email of April 11, 2026 to Priya Sharma; I received an acknowledgement on April 14, 2026 but no substantive response. The conduct has continued and, in my view, has escalated.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Statement treating as approaching constructive discharge",
      instruction:
        "Frame as belief that conditions approach intolerability under Suders. Where protected characteristics are implicated, frame as belief that the conduct violates Title VII / ADA / ADEA / state law. Re-confirm not yet resigning.",
      scaffold: `<p>I believe that the conduct set out above {{protectedCharacteristicConnection}}. I do not at this stage treat my employment as terminated; I write so that the Company has the opportunity to address the matters and so that my continuing attendance at work is on record as without prejudice to my position.</p>`,
      constraints: [
        "MUST frame protected-characteristic angle as belief.",
        "MUST cite the relevant federal / state statute.",
        "MUST re-confirm not yet resigning.",
      ],
      example: `<p>I believe that the conduct set out above was directed at me because of my sex and race and may violate Title VII of the Civil Rights Act of 1964 and the California Fair Employment and Housing Act (Cal. Gov. Code §12940 et seq.). I do not at this stage treat my employment as terminated; I write so that the Company has the opportunity to address the matters and so that my continuing attendance at work is on record as without prejudice to my position.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Demand for remedy with deadline",
      instruction:
        "Specific, reasonable deadline (typically 14-21 calendar days). Specific remedies.",
      scaffold: `<p>To address the matters above, I ask that the Company:</p>
<ul>
  <li>{{remedy1}}</li>
  <li>{{remedy2}}</li>
  <li>{{remedy3}}</li>
</ul>
<p>I ask that the Company confirm in writing by {{remedyDeadlineUS}} the steps it will take. If by that date I have not received a substantive written response addressing each of the matters above, I reserve the right (and intend) to treat the conditions of my employment as constituting a constructive discharge and to resign in response, with effect from a date to be communicated.</p>`,
      constraints: [
        "MUST set a specific deadline.",
        "MUST specify remedies.",
        "MUST reserve the right to resign in response if the deadline is not met.",
      ],
      example: `<p>To address the matters above, I ask that the Company:</p>
<ul>
  <li>commission an independent investigation by an investigator with no prior reporting line to Mr. Chen, with the witnesses identified above interviewed and the documents reviewed;</li>
  <li>pending the outcome of that investigation, adjust my reporting line so that I no longer report to Mr. Chen, with no detriment to my role, salary, or level;</li>
  <li>provide me with written assurance that I will not be subjected to retaliation in connection with my having raised these matters; and</li>
  <li>confirm in writing the timetable for the investigation and the mechanism for delivering the outcome to me.</li>
</ul>
<p>I ask that the Company confirm in writing by May 26, 2026 the steps it will take. If by that date I have not received a substantive written response addressing each of the matters above, I reserve the right (and intend) to treat the conditions of my employment as constituting a constructive discharge and to resign in response, with effect from a date to be communicated.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of all rights",
      instruction:
        "Reserve EEOC / state agency rights expressly. Reserve right to bring suit.",
      scaffold: `<p>I reserve all of my rights, including without limitation the right to file a charge with the U.S. Equal Employment Opportunity Commission and {{stateAgency}}, the right to bring suit under Title VII, the ADA, and applicable state law, and the right to treat any failure to remedy the matters above as constructive discharge. Any continued attendance at work pending the Company's response is without prejudice to my position.</p>`,
      constraints: [
        "MUST reserve EEOC / state agency rights.",
        "MUST state continued attendance is without prejudice.",
      ],
      example: `<p>I reserve all of my rights, including without limitation the right to file a charge with the U.S. Equal Employment Opportunity Commission and the California Civil Rights Department, the right to bring suit under Title VII, the ADA, and applicable state law, and the right to treat any failure to remedy the matters above as constructive discharge. Any continued attendance at work pending the Company's response is without prejudice to my position.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short, neutral. 'Sincerely,'. NO warmth.",
      scaffold: `<p>I look forward to the Company's substantive written response by {{remedyDeadlineUS}}.</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST NOT include warmth or thanks.",
      ],
      example: `<p>I look forward to the Company's substantive written response by May 26, 2026.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role, employee ID.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST be name, role, employee ID."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee ID 04231</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "breach_chronology",
      label: "Breach chronology",
      required: true,
      description: "Dated entries describing the conduct that goes to the root of the contract.",
      expectedKinds: ["note", "document"],
    },
    {
      key: "prior_raising",
      label: "Prior raising of the issue",
      required: true,
      description: "Earlier letters / emails where you raised these matters — establishes you didn't affirm.",
      expectedKinds: ["email", "document"],
    },
    {
      key: "contract_terms",
      label: "Contract / handbook excerpts",
      required: false,
      description: "Sections of the employment contract or handbook the employer is alleged to have breached.",
      expectedKinds: ["document"],
    },
    {
      key: "impact",
      label: "Evidence of impact",
      required: false,
      description: "Sickness records, medical evidence, witness statements showing the impact on you.",
      expectedKinds: ["document", "note"],
    },
  ],
};
