import type { LetterTemplate } from "../types";

export const APPEAL_UK: LetterTemplate = {
  letterType: "appeal",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Internal Appeal — EMPLOYEE MODE):
- Step 4 of the ACAS Code of Practice on Disciplinary and Grievance Procedures: appeal against any disciplinary, capability, or grievance outcome.
- Failure to use the internal appeal route may result in a Polkey deduction (Polkey v AE Dayton Services Ltd [1987] UKHL 8) — the tribunal can reduce the compensatory award where the procedural defect would not have changed the outcome — and may suggest the dismissal would have happened anyway.
- Use the four canonical grounds: (1) procedural unfairness; (2) factual error; (3) severity disproportionate; (4) new evidence.
- Right to be accompanied at the appeal hearing under s.10 Employment Relations Act 1999.
- This is OPEN correspondence and tribunal-bound. No intensifiers, no admissions, no settlement language. Reserve all rights.
- British English. Cite the ACAS Code expressly.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "UK date format. Address to the appeal officer named in the original outcome letter, or to HR Director if not named.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{appealOfficerName}}<br>{{appealOfficerTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST address to the appeal officer named in the original outcome letter (or HR Director if not named).",
      ],
      example: `<p>12 May 2026<br><br>Ms Aisha Khan<br>Group HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies the decision being appealed and the date of the outcome letter.",
      scaffold: `<p><strong>Appeal Against {{decisionTypeAndDate}}</strong></p>`,
      constraints: [
        "MUST identify the decision (warning, dismissal, redundancy outcome, grievance outcome).",
        "MUST include the date of the outcome letter.",
      ],
      example: `<p><strong>Appeal Against Dismissal — Outcome Letter dated 5 May 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Ms Khan,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statement of intention to appeal",
      instruction:
        "State plainly that the writer is appealing the decision under Step 4 of the ACAS Code. Identify the decision and the original outcome letter. Confirm the appeal is in time under any deadline imposed in the outcome letter.",
      scaffold: `<p>I am writing to appeal the decision communicated in your letter of {{originalOutcomeDate}} ({{decisionType}}). I make this appeal in accordance with Step 4 of the ACAS Code of Practice on Disciplinary and Grievance Procedures and within the deadline specified in your letter.</p>`,
      constraints: [
        "MUST identify the decision and original outcome letter.",
        "MUST cite the ACAS Code Step 4.",
        "MUST confirm the appeal is in time.",
      ],
      example: `<p>I am writing to appeal the decision communicated in your letter of 5 May 2026 (dismissal on the grounds of capability). I make this appeal in accordance with Step 4 of the ACAS Code of Practice on Disciplinary and Grievance Procedures and within the five working days specified in your letter.</p>`,
    },
    {
      sectionId: "body",
      title: "Grounds of appeal — the canonical four",
      instruction:
        "Use the four canonical grounds as numbered headings: 1. Procedural unfairness; 2. Factual error; 3. Severity disproportionate; 4. New evidence. The writer need not use all four — use only those that apply, but use the canonical labels. Each ground: specific facts, dates, references to the original outcome letter, and (for new evidence) what the new evidence is and why it was not produced earlier.",
      scaffold: `<p>I appeal on the following grounds:</p>
<p><strong>1. Procedural unfairness</strong></p>
<p>{{proceduralGround}}</p>
<p><strong>2. Factual error</strong></p>
<p>{{factualErrorGround}}</p>
<p><strong>3. The sanction is disproportionate</strong></p>
<p>{{severityGround}}</p>
<p><strong>4. New evidence</strong></p>
<p>{{newEvidenceGround}}</p>`,
      constraints: [
        "MUST use the canonical four ground labels (procedural unfairness, factual error, severity disproportionate, new evidence).",
        "MUST cite specific paragraphs of the original outcome letter where challenged.",
        "MUST date and identify any new evidence and explain why it was not produced earlier.",
        "MUST NOT introduce wholly new substantive complaints — those should be a separate grievance.",
        "MUST NOT use intensifiers ('shocking', 'outrageous', 'biased').",
      ],
      example: `<p>I appeal on the following grounds:</p>
<p><strong>1. Procedural unfairness</strong></p>
<p>The disciplinary hearing of 28 April 2026 was chaired by Marcus Chen, who is also the manager whose conduct I had raised in my grievance of 11 April 2026. The Company's Disciplinary Policy (clause 4.2) requires that the chair "shall be impartial and have had no prior involvement". I raised the conflict at the start of the hearing and was told the matter would be "noted". The conflict was not addressed.</p>
<p><strong>2. Factual error</strong></p>
<p>Paragraph 3 of your letter records that I "failed to deliver the Q1 launch by the agreed deadline of 31 March 2026". The deadline was rescheduled by Mr Chen by email of 18 March 2026 (attached) to 14 April 2026 and was met on 11 April 2026.</p>
<p><strong>3. The sanction is disproportionate</strong></p>
<p>The sanction of dismissal is, in my submission, outside the range of reasonable responses (Iceland Frozen Foods v Jones [1983]) given (i) my four-year clean record; (ii) the absence of any prior warning; and (iii) the availability of less severe sanctions including a written warning or final written warning under the Disciplinary Policy.</p>
<p><strong>4. New evidence</strong></p>
<p>I produce two new pieces of evidence that were not before the hearing: (a) the email from Mr Chen of 18 March 2026 rescheduling the launch (which I did not have access to at the hearing because I had been suspended and locked out of my email); and (b) the launch sign-off log dated 11 April 2026 confirming on-time delivery.</p>`,
    },
    {
      sectionId: "outcome_sought",
      title: "Outcome sought",
      instruction:
        "State the specific outcome sought: overturn, reduce sanction, rehear, or remit. List 1-2 outcomes.",
      scaffold: `<p>The outcomes I seek on appeal are:</p>
<ul>
  <li>{{primaryOutcome}}</li>
  <li>{{secondaryOutcome}}</li>
</ul>`,
      constraints: [
        "MUST list specific outcomes.",
        "MUST NOT include a monetary demand.",
      ],
      example: `<p>The outcomes I seek on appeal are:</p>
<ul>
  <li>That the decision to dismiss be overturned and I be reinstated to my role with continuous service preserved.</li>
  <li>In the alternative, that the matter be remitted for a fresh hearing before an impartial chair with no prior involvement.</li>
</ul>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for appeal hearing and accompaniment",
      instruction:
        "Request an appeal hearing. Reference s.10 ERelA 1999 right to be accompanied. Request access to documents needed to prepare.",
      scaffold: `<p>I request an appeal hearing in accordance with the ACAS Code. I will be accompanied at the hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999. I ask that I be provided with copies of {{documentsRequested}} in good time before the hearing to enable me to prepare.</p>`,
      constraints: [
        "MUST request an appeal hearing.",
        "MUST cite s.10 ERelA 1999.",
        "MUST request specific documents needed to prepare.",
      ],
      example: `<p>I request an appeal hearing in accordance with the ACAS Code. I will be accompanied at the hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999. I ask that I be provided with copies of (i) the original investigation report; (ii) the witness statements taken during the investigation; and (iii) the disciplinary hearing notes, in good time before the hearing to enable me to prepare.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction: "Reserve all rights. One short paragraph.",
      scaffold: `<p>I reserve all my rights, including any statutory, contractual, and common-law remedies. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part.</p>`,
      constraints: [
        "MUST reserve all rights.",
        "MUST NOT enumerate every potential claim.",
      ],
      example: `<p>I reserve all my rights, including any statutory, contractual, and common-law remedies. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Yours sincerely,'.",
      scaffold: `<p>I look forward to confirmation of the appeal hearing arrangements.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST NOT include thanks or warmth.",
      ],
      example: `<p>I look forward to confirmation of the appeal hearing arrangements.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, job title (former, if dismissed), employee number.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST be name, title, employee number."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee No. 04231</p>`,
    },
  ],
};

export const APPEAL_US: LetterTemplate = {
  letterType: "appeal",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Internal Appeal — EMPLOYEE MODE):
- There is no federal procedural appeal right for at-will employees, but where the employer has a written disciplinary or grievance policy with an appeal step, exhausting it is generally good practice and may be relevant to subsequent EEOC charge or court litigation.
- Where the underlying decision is alleged to be discriminatory, the appeal letter helps document the employer's response and is useful evidence for an EEOC charge.
- Use the four canonical grounds: procedural unfairness, factual error, severity disproportionate, new evidence.
- This is OPEN correspondence — no intensifiers, no admissions. Reserve all rights including the right to file an EEOC charge.
- American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. Appeal officer per company policy or HR.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{appealOfficerName}}<br>{{appealOfficerTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Ms. Aisha Khan<br>VP, People<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Decision and date.",
      scaffold: `<p><strong>Appeal Against {{decisionTypeAndDate}}</strong></p>`,
      constraints: ["MUST identify decision and date."],
      example: `<p><strong>Appeal Against Termination — Decision Letter dated May 5, 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Ms. Khan,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statement of intention to appeal",
      instruction:
        "State plainly that the writer is appealing under the company policy. Identify the decision and reference the deadline in the outcome letter.",
      scaffold: `<p>I am writing to appeal the decision communicated in your letter of {{originalOutcomeDate}} ({{decisionType}}), pursuant to {{appealProcedureReference}}. I make this appeal within the deadline specified in your letter.</p>`,
      constraints: [
        "MUST identify the decision and outcome letter.",
        "MUST reference the appeal procedure (company policy / handbook clause).",
      ],
      example: `<p>I am writing to appeal the decision communicated in your letter of May 5, 2026 (termination of employment), pursuant to Section 14 of the Acme Inc. Employee Handbook (Grievance and Appeal Procedure). I make this appeal within the five business days specified in your letter.</p>`,
    },
    {
      sectionId: "body",
      title: "Grounds of appeal — the canonical four",
      instruction:
        "Use the four canonical grounds: procedural unfairness, factual error, severity disproportionate, new evidence. Cite specific paragraphs of the outcome letter and produce new evidence with explanation.",
      scaffold: `<p>I appeal on the following grounds:</p>
<p><strong>1. Procedural unfairness</strong></p>
<p>{{proceduralGround}}</p>
<p><strong>2. Factual error</strong></p>
<p>{{factualErrorGround}}</p>
<p><strong>3. The decision is disproportionate</strong></p>
<p>{{severityGround}}</p>
<p><strong>4. New evidence</strong></p>
<p>{{newEvidenceGround}}</p>`,
      constraints: [
        "MUST use the canonical four labels.",
        "MUST cite paragraphs of the outcome letter.",
        "MUST explain why new evidence was not produced earlier.",
        "MUST NOT use intensifiers.",
      ],
      example: `<p>I appeal on the following grounds:</p>
<p><strong>1. Procedural unfairness</strong></p>
<p>The decision-making meeting of April 28, 2026 was led by Marcus Chen, who is also the manager whose conduct I had reported in my internal complaint of April 11, 2026. The Company's Grievance and Appeal Procedure (Handbook §13.2) requires that the decision-maker "shall be impartial and have had no prior involvement". I raised the conflict at the start of the meeting; it was not addressed.</p>
<p><strong>2. Factual error</strong></p>
<p>Paragraph 3 of your letter records that I "failed to deliver the Q1 launch by the agreed deadline of March 31, 2026". The deadline was rescheduled by Mr. Chen by email of March 18, 2026 (attached) to April 14, 2026 and was met on April 11, 2026.</p>
<p><strong>3. The decision is disproportionate</strong></p>
<p>Termination is, in my submission, disproportionate given (i) my four-year record without any prior corrective action; (ii) the availability of less severe outcomes under the Handbook; and (iii) the absence of any prior warning.</p>
<p><strong>4. New evidence</strong></p>
<p>I produce two new pieces of evidence that were not before the decision-maker: (a) the email from Mr. Chen of March 18, 2026 rescheduling the launch (which I did not have at the meeting because I had been placed on administrative leave and locked out of email); and (b) the launch sign-off log dated April 11, 2026.</p>`,
    },
    {
      sectionId: "outcome_sought",
      title: "Outcome sought",
      instruction: "Specific outcomes — overturn, reduce, rehear.",
      scaffold: `<p>The outcomes I seek on appeal are:</p>
<ul>
  <li>{{primaryOutcome}}</li>
  <li>{{secondaryOutcome}}</li>
</ul>`,
      constraints: [
        "MUST list specific outcomes.",
        "MUST NOT include monetary demand.",
      ],
      example: `<p>The outcomes I seek on appeal are:</p>
<ul>
  <li>That the decision to terminate be overturned and I be reinstated to my role with continuous service and benefits preserved.</li>
  <li>In the alternative, that the matter be remitted for a fresh determination by an impartial decision-maker.</li>
</ul>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for appeal meeting",
      instruction:
        "Request an appeal meeting and access to documents needed to prepare.",
      scaffold: `<p>I request an appeal meeting under the Company's procedure and ask that I be provided with copies of {{documentsRequested}} in good time before the meeting.</p>`,
      constraints: [
        "MUST request a meeting.",
        "MUST request specific documents.",
      ],
      example: `<p>I request an appeal meeting under the Company's procedure and ask that I be provided with copies of (i) the original investigation report; (ii) any witness statements; and (iii) the notes of the April 28, 2026 meeting, in good time before the appeal meeting.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve all rights including EEOC and state agency rights.",
      scaffold: `<p>I reserve all of my rights, including any statutory, contractual, and common-law remedies, and including without limitation the right to file a charge with the U.S. Equal Employment Opportunity Commission or the relevant state agency. Nothing in this letter should be construed as a waiver of any right or as an admission on my part.</p>`,
      constraints: [
        "MUST reserve EEOC / state agency rights.",
      ],
      example: `<p>I reserve all of my rights, including any statutory, contractual, and common-law remedies, and including without limitation the right to file a charge with the U.S. Equal Employment Opportunity Commission or the California Civil Rights Department. Nothing in this letter should be construed as a waiver of any right or as an admission on my part.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Sincerely,'.",
      scaffold: `<p>I look forward to confirmation of the appeal meeting arrangements.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>I look forward to confirmation of the appeal meeting arrangements.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role, employee ID.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST include name, role, employee ID."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee ID 04231</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "outcome_letter",
      label: "Outcome letter being appealed",
      required: true,
      description: "The dismissal / disciplinary / grievance outcome letter that started this appeal.",
      expectedKinds: ["document"],
    },
    {
      key: "hearing_notes",
      label: "Original hearing notes",
      required: false,
      description: "Minutes, recording, or your own notes of the hearing that produced the outcome.",
      expectedKinds: ["document", "note"],
    },
    {
      key: "new_evidence",
      label: "New evidence",
      required: false,
      description: "Anything not available at the original hearing that might change the outcome.",
      expectedKinds: ["email", "document", "screenshot"],
    },
    {
      key: "procedural_breaches",
      label: "Procedural breach notes",
      required: false,
      description: "Where you say the original process departed from ACAS / company policy — list with dates.",
      expectedKinds: ["note"],
    },
  ],
};
