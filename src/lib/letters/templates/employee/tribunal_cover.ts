import type { LetterTemplate } from "../types";

export const TRIBUNAL_COVER_UK: LetterTemplate = {
  letterType: "tribunal_cover",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Employment Tribunal Cover — EMPLOYEE MODE):
- This is the cover letter accompanying a Form ET1 (or a copy served on the respondent in parallel with online filing). The substantive claim is in the form itself.
- Reference: ACAS Early Conciliation certificate number; date of filing of the ET1; nature of the claim in the briefest possible headline terms.
- Strictly procedural — no substantive content beyond what is in the form.
- Tribunal-bound. British English.
- Counsel review required.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Address to the respondent (HR Director / GC) or to the Tribunal where this is the cover for filing.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Ms Priya Sharma<br>HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Service of Form ET1 — Williams v {{employerLegalName}}, ACAS EC Ref {{ecReferenceNumber}}</strong></p>`,
      constraints: [
        "MUST identify the parties and EC reference.",
      ],
      example: `<p><strong>Service of Form ET1 — Williams v Acme Holdings Limited, ACAS EC Ref R012345/26</strong></p>`,
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
      title: "Statement of attached claim",
      instruction:
        "Confirm: (i) ACAS EC certificate number; (ii) ET1 filed with the Tribunal on the date stated; (iii) headline claim types only; (iv) attached materials. No substance beyond what is in the ET1.",
      scaffold: `<p>I enclose, by way of service, a copy of the Form ET1 filed with the Employment Tribunal on {{et1FilingDate}}. The ACAS Early Conciliation Certificate number is {{ecReferenceNumber}}.</p>
<p>The claim, in headline terms only, comprises: {{claimHeadlines}}.</p>
<p>The substantive grounds, factual basis, and remedies sought are pleaded in the Form ET1 and the attached Particulars of Claim. The Company will receive formal notice and a copy of the ET1 from the Tribunal in due course.</p>`,
      constraints: [
        "MUST identify the EC reference and ET1 filing date.",
        "MUST give claim types in headline terms only.",
        "MUST NOT include substantive argument.",
      ],
      example: `<p>I enclose, by way of service, a copy of the Form ET1 filed with the Employment Tribunal on 12 May 2026. The ACAS Early Conciliation Certificate number is R012345/26.</p>
<p>The claim, in headline terms only, comprises: (i) constructive unfair dismissal under Part X of the Employment Rights Act 1996; (ii) direct sex and race discrimination, harassment, and victimisation under sections 13, 26 and 27 of the Equality Act 2010.</p>
<p>The substantive grounds, factual basis, and remedies sought are pleaded in the Form ET1 and the attached Particulars of Claim. The Company will receive formal notice and a copy of the ET1 from the Tribunal in due course.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Neutral, procedural. 'Yours sincerely,'.",
      scaffold: `<p>Future correspondence in connection with the proceedings should be addressed to {{representativeContact}}.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST direct future correspondence to the representative or the writer's contact address.",
        "MUST be procedural.",
      ],
      example: `<p>Future correspondence in connection with the proceedings should be addressed to my solicitors, Wright & Co, at 12 Lincoln's Inn Fields, London WC2A 3LF (Ref: CW/SW/2026/0142).</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name (claimant), solicitor / representative contact.",
      scaffold: `<p>{{employeeLegalName}}<br>Claimant<br>{{solicitorContactBlock}}</p>`,
      constraints: ["MUST identify the claimant and representative."],
      example: `<p>Sarah Williams<br>Claimant<br>c/o Charlotte Wright, Wright & Co Solicitors<br>charlotte.wright@wrightco.example</p>`,
    },
  ],
};

export const TRIBUNAL_COVER_US: LetterTemplate = {
  letterType: "tribunal_cover",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Court Complaint Cover — EMPLOYEE MODE):
- Cover letter accompanying a federal or state court complaint, served alongside or shortly after filing.
- Reference: EEOC right-to-sue notice (where Title VII / ADA / ADEA); date of filing; case number; court; nature of claim in headline terms.
- Strictly procedural. The substance is in the complaint.
- American English. Counsel review required.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. General Counsel / registered agent for service.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Mr. James Holloway<br>General Counsel<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Service of Complaint — Williams v. {{employerLegalName}}, Case No. {{caseNumber}}</strong></p>`,
      constraints: [
        "MUST identify parties, court, and case number.",
      ],
      example: `<p><strong>Service of Complaint — Williams v. Acme Inc., Case No. 3:26-cv-02145-JST (N.D. Cal.)</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Mr. Holloway,</p>`,
    },
    {
      sectionId: "body",
      title: "Statement of attached claim",
      instruction:
        "Confirm: case filing date, court, case number, EEOC right-to-sue notice (date of issue), headline claim types, attached service documents. No substance beyond the complaint.",
      scaffold: `<p>I enclose, by way of service, a Summons and copy of the Complaint filed in {{courtName}} on {{filingDateUS}}, Case No. {{caseNumber}}. The action follows the issue of a Notice of Right to Sue by the U.S. Equal Employment Opportunity Commission dated {{rightToSueDate}} (a copy of which is attached as Exhibit A to the Complaint).</p>
<p>The Complaint, in headline terms only, alleges: {{claimHeadlines}}.</p>
<p>The substantive allegations and prayer for relief are set out in the Complaint. The Company is required to respond within the time required by the Federal Rules of Civil Procedure (or applicable state rules) following service.</p>`,
      constraints: [
        "MUST identify court, filing date, case number, and right-to-sue date.",
        "MUST give claim types in headline only.",
        "MUST NOT include substantive argument.",
      ],
      example: `<p>I enclose, by way of service, a Summons and copy of the Complaint filed in the United States District Court for the Northern District of California on May 12, 2026, Case No. 3:26-cv-02145-JST. The action follows the issue of a Notice of Right to Sue by the U.S. Equal Employment Opportunity Commission dated April 21, 2026 (a copy of which is attached as Exhibit A to the Complaint).</p>
<p>The Complaint, in headline terms only, alleges: (i) discrimination, harassment, and retaliation in violation of Title VII of the Civil Rights Act of 1964; (ii) parallel claims under the California Fair Employment and Housing Act; and (iii) wrongful termination in violation of public policy under California common law.</p>
<p>The substantive allegations and prayer for relief are set out in the Complaint. The Company is required to respond within the time required by the Federal Rules of Civil Procedure following service.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Neutral, procedural. 'Sincerely,'.",
      scaffold: `<p>Future correspondence in connection with the proceedings should be addressed to {{representativeContact}}.</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST direct future correspondence to counsel.",
        "MUST be procedural.",
      ],
      example: `<p>Future correspondence in connection with the proceedings should be addressed to my counsel, Wright Employment Law PC, at 1 Embarcadero Center, Suite 1800, San Francisco, CA 94111 (Ref: CW/SW/2026/0142).</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name (plaintiff), counsel contact.",
      scaffold: `<p>{{employeeLegalName}}<br>Plaintiff<br>{{counselContactBlock}}</p>`,
      constraints: ["MUST identify plaintiff and counsel."],
      example: `<p>Sarah Williams<br>Plaintiff<br>c/o Charlotte Wright, Wright Employment Law PC<br>charlotte@wrightemployment.example<br>(415) 555-0142</p>`,
    },
  ],
};
