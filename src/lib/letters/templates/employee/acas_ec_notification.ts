import type { LetterTemplate } from "../types";

export const ACAS_EC_NOTIFICATION_UK: LetterTemplate = {
  letterType: "acas_ec_notification",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK ACAS Early Conciliation Cover — EMPLOYEE MODE):
- ACAS Early Conciliation is mandatory before presenting an ET1 in most tribunal claims (Employment Tribunals Act 1996 s.18A; Employment Tribunals (Early Conciliation: Exemptions and Rules of Procedure) Regulations 2014 (as amended)).
- Limitation: s.111 ERA 1996 — an unfair dismissal claim must be presented within 3 months less one day from the effective date of termination (subject to the EC stop-the-clock under s.207B). Discrimination claims under EqA 2010 — 3 months less one day from the act complained of (s.123 EqA).
- This letter is the cover note to ACAS or the prospective respondent (where notifying the respondent in parallel) confirming the Early Conciliation notification has been made.
- Strictly procedural — do NOT set out the full claim. The substance belongs in the ET1.
- Tribunal-bound. British English.
- Counsel review strongly recommended.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Address to the prospective respondent (employer) — typically HR Director or General Counsel — to give notice that EC has been initiated. Some users send a copy to ACAS but ACAS uses its own notification process; this letter is principally for the employer.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST address to a sufficiently senior person at the prospective respondent.",
      ],
      example: `<p>12 May 2026<br><br>Ms Priya Sharma<br>HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Notification of ACAS Early Conciliation — Prospective Employment Tribunal Claim</strong></p>`,
      constraints: [
        "MUST identify as ACAS Early Conciliation notification.",
        "MUST NOT mark Without Prejudice.",
      ],
      example: `<p><strong>Notification of ACAS Early Conciliation — Prospective Employment Tribunal Claim</strong></p>`,
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
      title: "Statement of intended claim and basis",
      instruction:
        "State briefly: (i) that the writer has notified ACAS under s.18A Employment Tribunals Act 1996; (ii) the EC reference number where issued; (iii) the claim types intended (in headline terms only — e.g. 'unfair dismissal under Part X ERA 1996, direct sex discrimination under s.13 Equality Act 2010'); (iv) brief reference to the act complained of with date. Strictly procedural.",
      scaffold: `<p>I write to notify the Company that I have today notified ACAS under section 18A of the Employment Tribunals Act 1996 of a prospective claim against the Company. The Early Conciliation reference number is {{ecReferenceNumber}}.</p>
<p>The intended claim concerns the following matters in headline terms only: {{claimHeadlines}}; arising out of {{actComplainedOf}} on {{actDateUK}}.</p>
<p>The full pleaded claim, if proceedings are commenced, will be set out in the Form ET1.</p>`,
      constraints: [
        "MUST cite s.18A Employment Tribunals Act 1996.",
        "MUST give the EC reference number.",
        "MUST identify the claim types in headline terms only.",
        "MUST NOT set out the substantive case.",
        "MUST NOT include intensifiers or accusations.",
      ],
      example: `<p>I write to notify the Company that I have today notified ACAS under section 18A of the Employment Tribunals Act 1996 of a prospective claim against the Company. The Early Conciliation reference number is R012345/26.</p>
<p>The intended claim concerns the following matters in headline terms only: (i) constructive unfair dismissal under Part X of the Employment Rights Act 1996; (ii) direct sex and race discrimination, harassment, and victimisation under sections 13, 26 and 27 of the Equality Act 2010; arising out of conduct culminating in my resignation on 7 May 2026.</p>
<p>The full pleaded claim, if proceedings are commenced, will be set out in the Form ET1.</p>`,
    },
    {
      sectionId: "deadline",
      title: "Limitation deadline reference",
      instruction:
        "Reference the s.111 ERA / s.123 EqA limitation, the s.207B stop-the-clock, and that the writer reserves the right to present an ET1 within the limitation period as extended by EC.",
      scaffold: `<p>The Company will be aware of the statutory limitation periods under section 111 of the Employment Rights Act 1996 and section 123 of the Equality Act 2010 (3 months less one day from the relevant act), as extended by the ACAS Early Conciliation provisions in section 207B of the 1996 Act. I reserve the right to present a Form ET1 to the Employment Tribunal within the relevant limitation period.</p>`,
      constraints: [
        "MUST cite s.111 ERA 1996 and s.123 EqA 2010 (where relevant).",
        "MUST cite s.207B ERA 1996 (EC stop-the-clock).",
        "MUST reserve the right to present the ET1.",
      ],
      example: `<p>The Company will be aware of the statutory limitation periods under section 111 of the Employment Rights Act 1996 and section 123 of the Equality Act 2010 (3 months less one day from the relevant act), as extended by the ACAS Early Conciliation provisions in section 207B of the 1996 Act. I reserve the right to present a Form ET1 to the Employment Tribunal within the relevant limitation period.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Neutral, procedural. 'Yours sincerely,'.",
      scaffold: `<p>ACAS will be in touch with the Company in due course to discuss the prospects for conciliation.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST be procedural — no substantive content.",
      ],
      example: `<p>ACAS will be in touch with the Company in due course to discuss the prospects for conciliation.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, contact address, solicitor where instructed.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeContactAddress}}<br>{{solicitorContactBlock}}</p>`,
      constraints: ["MUST include contact address and solicitor where instructed."],
      example: `<p>Sarah Williams<br>14 Rosewood Avenue, London N4 2QX<br>c/o Charlotte Wright, Wright & Co Solicitors</p>`,
    },
  ],
};

export const ACAS_EC_NOTIFICATION_US: LetterTemplate = {
  letterType: "acas_ec_notification",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US EEOC Charge Cover — EMPLOYEE MODE):
- Cover for an EEOC charge of discrimination under Title VII / ADA / ADEA / GINA / PWFA. Note: the EEOC charge itself is the operative document; this letter is a cover or notice to the prospective respondent.
- Filing windows: 180 days from the alleged discriminatory act (extended to 300 days where a state or local FEPA also processes the charge).
- Some state agencies operate worksharing with the EEOC (CA CRD, NY DHR, TX TWC) — a charge filed with one is generally deemed filed with the other.
- Strictly procedural. The substance is in the charge.
- American English. Counsel review strongly recommended.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. Senior officer or General Counsel of prospective respondent.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Ms. Priya Sharma<br>Chief People Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Notice of EEOC Charge of Discrimination — Charge No. {{eeocChargeNumber}}</strong></p>`,
      constraints: [
        "MUST identify as EEOC charge notice.",
        "MUST include the charge number where issued.",
      ],
      example: `<p><strong>Notice of EEOC Charge of Discrimination — Charge No. 555-2026-12345</strong></p>`,
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
      title: "Statement of intended claim and basis",
      instruction:
        "State briefly: charge filed with EEOC and (where applicable) state FEPA; charge number; protected basis (Title VII / ADA / ADEA / PWFA / state); date(s) of act complained of; expected receipt of formal notice from the EEOC.",
      scaffold: `<p>I write to notify the Company that I have today filed a Charge of Discrimination with the U.S. Equal Employment Opportunity Commission, charge number {{eeocChargeNumber}}, and (where applicable) cross-filed with {{stateAgency}}.</p>
<p>The charge alleges, in headline terms only: {{chargeHeadlines}}; arising out of {{actComplainedOf}} on or about {{actDateUS}}.</p>
<p>The full charge, statement of facts, and basis are set out in the EEOC Form 5 and accompanying particulars. The Company should expect to receive formal notice and the charge documents from the EEOC in due course.</p>`,
      constraints: [
        "MUST identify the EEOC charge number and cross-filing.",
        "MUST identify the protected basis in headline terms.",
        "MUST NOT set out the substantive case.",
      ],
      example: `<p>I write to notify the Company that I have today filed a Charge of Discrimination with the U.S. Equal Employment Opportunity Commission, charge number 555-2026-12345, and cross-filed with the California Civil Rights Department.</p>
<p>The charge alleges, in headline terms only: (i) sex and race discrimination, harassment, and retaliation in violation of Title VII of the Civil Rights Act of 1964; (ii) parallel claims under the California Fair Employment and Housing Act; arising out of conduct culminating in the termination of my employment on May 5, 2026.</p>
<p>The full charge, statement of facts, and basis are set out in the EEOC Form 5 and accompanying particulars. The Company should expect to receive formal notice and the charge documents from the EEOC in due course.</p>`,
    },
    {
      sectionId: "deadline",
      title: "Limitation / filing window reference",
      instruction:
        "Reference the 180/300-day filing window and the right to receive a Notice of Right to Sue.",
      scaffold: `<p>The Company will be aware of the statutory filing window (180 days from the alleged act, extended to 300 days where the charge is processed by a state or local FEPA), and that I will be entitled to a Notice of Right to Sue from the EEOC at the conclusion of the EEOC's process or after 180 days under 29 C.F.R. §1601.28. I reserve all of my rights, including the right to commence civil proceedings within the 90-day window following issue of the right-to-sue notice.</p>`,
      constraints: [
        "MUST reference 180/300-day window.",
        "MUST reference the right to a Notice of Right to Sue and the 90-day post-issue window.",
      ],
      example: `<p>The Company will be aware of the statutory filing window (180 days from the alleged act, extended to 300 days where the charge is processed by a state or local FEPA), and that I will be entitled to a Notice of Right to Sue from the EEOC at the conclusion of the EEOC's process or after 180 days under 29 C.F.R. §1601.28. I reserve all of my rights, including the right to commence civil proceedings within the 90-day window following issue of the right-to-sue notice.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Neutral, procedural. 'Sincerely,'.",
      scaffold: `<p>The EEOC will be in contact with the Company in due course.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>The EEOC will be in contact with the Company in due course.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, contact address, counsel where represented.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeContactAddress}}<br>{{counselContactBlock}}</p>`,
      constraints: ["MUST include contact address and counsel where represented."],
      example: `<p>Sarah Williams<br>124 Pine Street, San Francisco, CA 94108<br>c/o Charlotte Wright, Wright Employment Law PC</p>`,
    },
  ],
};
