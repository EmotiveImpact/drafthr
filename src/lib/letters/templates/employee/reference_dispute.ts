import type { LetterTemplate } from "../types";

export const REFERENCE_DISPUTE_UK: LetterTemplate = {
  letterType: "reference_dispute",
  jurisdiction: "UK",
  evidenceTier: "medium",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Reference Dispute — EMPLOYEE MODE):
- Spring v Guardian Assurance plc [1995] 2 AC 296 — an employer owes the subject of a reference a duty of care to take reasonable care that the reference is fair, accurate, true, and not misleading. Negligent inaccuracies that cause loss are actionable.
- Defamation Act 2013 — defamatory statements may be actionable; references generally attract qualified privilege which is defeated by malice (Horrocks v Lowe [1975] AC 135).
- UK GDPR / Data Protection Act 2018 — personal data must be accurate (Art. 5(1)(d)); the data subject has rights of rectification (Art. 16) and may complain to the ICO (Art. 77).
- Tone: factual, forensic, not aggressive. Quote the offending text verbatim.
- Tribunal-bound. Reserve all rights.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Address to former employer (HR Director or signatory of the disputed reference).",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Ms Priya Sharma<br>HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Disputed Reference — Demand for Correction or Withdrawal</strong></p>`,
      constraints: ["MUST identify as disputed reference."],
      example: `<p><strong>Disputed Reference — Demand for Correction or Withdrawal</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Ms Sharma,</p>`,
    },
    {
      sectionId: "body",
      title: "Reference quoted and specific inaccuracies",
      instruction:
        "Identify the reference (date, recipient employer where known, the role applied for). Quote the offending passages verbatim. For each, identify the specific inaccuracy and the documentary basis on which the writer says the statement is wrong.",
      scaffold: `<p>I am writing in respect of a reference provided by the Company in respect of me to {{prospectiveEmployerName}} on or about {{referenceDateUK}} in connection with my application for the role of {{roleAppliedFor}}.</p>
<p>The reference contains the following statements which I dispute:</p>
<ol>
  <li>The reference states: "{{disputedQuote1}}". This is inaccurate because: {{correctionWithEvidence1}}.</li>
  <li>The reference states: "{{disputedQuote2}}". This is inaccurate because: {{correctionWithEvidence2}}.</li>
</ol>
<p>The reference fails the duty of care set out in Spring v Guardian Assurance plc [1995] 2 AC 296: it is not, in my submission, fair, accurate, true and not misleading.</p>`,
      constraints: [
        "MUST identify the reference (date, recipient, role).",
        "MUST quote the offending text verbatim.",
        "MUST identify the inaccuracy with documentary basis.",
        "MUST cite Spring v Guardian Assurance.",
        "MUST NOT make findings of malice (that is for proceedings).",
      ],
      example: `<p>I am writing in respect of a reference provided by the Company in respect of me to Globex Marketing Limited on or about 25 April 2026 in connection with my application for the role of Director of Brand Marketing.</p>
<p>The reference contains the following statements which I dispute:</p>
<ol>
  <li>The reference states: "Ms Williams's tenure was characterised by repeated missed deadlines and we had concerns about her ability to lead a team." This is inaccurate because: my last three performance reviews (FY2023, FY2024, FY2025) all rated me 4/5 or above on delivery; I have never been the subject of a written warning, capability process, or PIP; and I led a team of 11 from 2024 to 2026 with a clean engagement-survey record. I attach copies of my reviews.</li>
  <li>The reference states: "There were ongoing concerns about Ms Williams's professionalism." This is inaccurate because: there is no documentary basis for this in any review or HR record (and indeed I have made a separate Subject Access Request which the Company has confirmed produced no such record), and the statement is, in substance, defamatory.</li>
</ol>
<p>The reference fails the duty of care set out in Spring v Guardian Assurance plc [1995] 2 AC 296: it is not, in my submission, fair, accurate, true and not misleading.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Correction or withdrawal demand",
      instruction:
        "Demand: (i) immediate written withdrawal of the disputed reference and provision of an agreed corrected reference; (ii) written confirmation to the prospective employer; (iii) commitment that any future reference about the writer is fact-only.",
      scaffold: `<p>I require the Company to:</p>
<ul>
  <li>{{demand1}}</li>
  <li>{{demand2}}</li>
  <li>{{demand3}}</li>
</ul>
<p>Please confirm by {{deadlineUK}} that the Company will take these steps.</p>`,
      constraints: [
        "MUST demand withdrawal and / or correction.",
        "MUST demand written confirmation to the prospective employer.",
        "MUST set a specific deadline.",
      ],
      example: `<p>I require the Company to:</p>
<ul>
  <li>withdraw the reference of 25 April 2026 in writing to Globex Marketing Limited;</li>
  <li>provide an agreed corrected reference, in the form attached at Schedule 1 (factual, neutral, with confirmation of role, dates and reason for leaving), to Globex Marketing Limited and to me; and</li>
  <li>confirm in writing that any future reference about me will be limited to a fact-only summary of role, dates of employment, and reason for leaving, and will not depart from the wording in Schedule 1 without my prior written consent.</li>
</ul>
<p>Please confirm by 26 May 2026 that the Company will take these steps.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve rights including negligent misstatement (Spring), defamation, UK GDPR rectification (Art. 16) and complaint to ICO (Art. 77).",
      scaffold: `<p>I reserve all my rights, including without limitation the right to bring proceedings for negligent misstatement under Spring v Guardian Assurance plc, for defamation, for breach of contract, and to seek rectification under Article 16 UK GDPR and to complain to the Information Commissioner's Office under Article 77 UK GDPR. Nothing in this letter should be construed as a waiver of any right.</p>`,
      constraints: [
        "MUST reserve negligent misstatement and defamation rights.",
        "MUST reserve UK GDPR Art. 16 / 77 rights.",
      ],
      example: `<p>I reserve all my rights, including without limitation the right to bring proceedings for negligent misstatement under Spring v Guardian Assurance plc, for defamation, for breach of contract, and to seek rectification under Article 16 UK GDPR and to complain to the Information Commissioner's Office under Article 77 UK GDPR. Nothing in this letter should be construed as a waiver of any right.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short, neutral. 'Yours sincerely,'.",
      scaffold: `<p>I look forward to your written response.</p>
<p>Yours sincerely,</p>`,
      constraints: ["MUST use 'Yours sincerely,'."],
      example: `<p>I look forward to your written response.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, former role, contact address.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeFormerJobTitle}}<br>{{employeeContactAddress}}</p>`,
      constraints: ["MUST include contact address."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager (former)<br>14 Rosewood Avenue, London N4 2QX</p>`,
    },
  ],
};

export const REFERENCE_DISPUTE_US: LetterTemplate = {
  letterType: "reference_dispute",
  jurisdiction: "US",
  evidenceTier: "medium",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Reference Dispute — EMPLOYEE MODE):
- US references generally attract qualified privilege which is defeated by malice or knowing falsity (Restatement (Second) of Torts §595; Kennedy v. Children's Service Society, 17 F.3d 980 (7th Cir. 1994)).
- Cal. Lab. Code §1050-1052 — it is unlawful to "blacklist" a former employee with intent to prevent obtaining employment. Cal. Lab. Code §1053 makes a former employer liable for treble damages.
- Many states grant good-faith immunity for truthful references (CA Civ. Code §47(c) qualified privilege; analogous state statutes).
- Defamation, tortious interference with prospective economic advantage, and intentional infliction of emotional distress are potential claims.
- Tone: factual, forensic. Quote the disputed text verbatim.
- American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. Former employer.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Ms. Priya Sharma<br>Chief People Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Disputed Reference — Demand for Retraction or Correction</strong></p>`,
      constraints: ["MUST identify as disputed reference."],
      example: `<p><strong>Disputed Reference — Demand for Retraction or Correction</strong></p>`,
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
      sectionId: "body",
      title: "Reference quoted and specific inaccuracies",
      instruction:
        "Identify the reference. Quote the offending passages. For each, identify the specific inaccuracy and the documentary basis.",
      scaffold: `<p>I write in respect of a reference provided by the Company about me to {{prospectiveEmployerName}} on or about {{referenceDateUS}} in connection with my application for the role of {{roleAppliedFor}}.</p>
<p>The reference contains the following statements which I dispute:</p>
<ol>
  <li>The reference states: "{{disputedQuote1}}". This is inaccurate because: {{correctionWithEvidence1}}.</li>
  <li>The reference states: "{{disputedQuote2}}". This is inaccurate because: {{correctionWithEvidence2}}.</li>
</ol>
<p>The statements are, in my submission, false; they have caused me material harm; and they appear to fall outside the qualified privilege ordinarily attaching to references.</p>`,
      constraints: [
        "MUST identify the reference (date, recipient, role).",
        "MUST quote the disputed text verbatim.",
        "MUST identify the inaccuracy and documentary basis.",
        "MUST allege falsity and harm without overstating malice.",
      ],
      example: `<p>I write in respect of a reference provided by the Company about me to Globex Marketing Inc. on or about April 25, 2026 in connection with my application for the role of Director of Brand Marketing.</p>
<p>The reference contains the following statements which I dispute:</p>
<ol>
  <li>The reference states: "Ms. Williams's tenure was characterized by repeated missed deadlines and we had concerns about her ability to lead a team." This is inaccurate because: my last three performance reviews (FY2023, FY2024, FY2025) all rated me 4/5 or above on delivery; I have never been the subject of a written warning, performance improvement plan, or other corrective action; and I led a team of 11 from 2024 to 2026 with a clean engagement-survey record. Copies of my reviews are attached.</li>
  <li>The reference states: "There were ongoing concerns about Ms. Williams's professionalism." This is inaccurate because: there is no documentary basis for this in any review or HR record (a request under Cal. Lab. Code §1198.5 has produced no such record), and the statement is, in substance, defamatory.</li>
</ol>
<p>The statements are, in my submission, false; they have caused me material harm; and they appear to fall outside the qualified privilege ordinarily attaching to references.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Retraction or correction demand",
      instruction:
        "Demand retraction, agreed neutral reference, written confirmation to prospective employer, fact-only commitment.",
      scaffold: `<p>I require the Company to:</p>
<ul>
  <li>{{demand1}}</li>
  <li>{{demand2}}</li>
  <li>{{demand3}}</li>
</ul>
<p>Please confirm by {{deadlineUS}} that the Company will take these steps.</p>`,
      constraints: [
        "MUST demand retraction or correction.",
        "MUST demand written confirmation to prospective employer.",
        "MUST set a specific deadline.",
      ],
      example: `<p>I require the Company to:</p>
<ul>
  <li>retract the reference of April 25, 2026 in writing to Globex Marketing Inc.;</li>
  <li>provide an agreed neutral reference in the form attached as Schedule 1 (factual, limited to title, dates of employment, and ending salary) to Globex Marketing Inc. and to me; and</li>
  <li>confirm in writing that any future reference about me will be limited to title, dates of employment, and ending salary, and will not depart from Schedule 1 without my prior written consent.</li>
</ul>
<p>Please confirm by May 26, 2026 that the Company will take these steps.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve defamation, tortious interference, Cal. Lab. Code §1050 (or analog) rights.",
      scaffold: `<p>I reserve all of my rights, including without limitation the right to bring proceedings for defamation, tortious interference with prospective economic advantage, and (where applicable) under {{antiBlacklistingStatute}}, and to seek treble damages where available. Nothing in this letter constitutes a waiver of any right.</p>`,
      constraints: [
        "MUST reserve defamation and tortious interference rights.",
        "Where California, MUST reference Cal. Lab. Code §1050 / §1053.",
      ],
      example: `<p>I reserve all of my rights, including without limitation the right to bring proceedings for defamation, tortious interference with prospective economic advantage, and under California Labor Code §§1050 and 1053 (treble damages for unlawful blacklisting). Nothing in this letter constitutes a waiver of any right.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short, neutral. 'Sincerely,'.",
      scaffold: `<p>I look forward to your written response.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>I look forward to your written response.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, former role, contact address.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeFormerJobTitle}}<br>{{employeeContactAddress}}</p>`,
      constraints: ["MUST include contact address."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager (former)<br>124 Pine Street, San Francisco, CA 94108</p>`,
    },
  ],
};
