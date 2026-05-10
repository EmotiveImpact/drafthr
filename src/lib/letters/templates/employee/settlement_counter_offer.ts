import type { LetterTemplate } from "../types";

export const SETTLEMENT_COUNTER_OFFER_UK: LetterTemplate = {
  letterType: "settlement_counter_offer",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Settlement Counter — EMPLOYEE MODE — WITHOUT PREJUDICE):
- WITHOUT PREJUDICE AND SUBJECT TO CONTRACT — open the letter with this header in <strong>. The without-prejudice rule (Rush & Tompkins v Greater London Council [1989] AC 1280) applies to genuine attempts to compromise an existing dispute; "subject to contract" prevents inadvertent contract formation.
- Section 111A ERA 1996 protected conversations apply to ordinary unfair dismissal claims even where there is no pre-existing dispute, BUT the protection is lost where there is "improper behaviour" (s.111A(4)) and does NOT apply to discrimination, whistleblowing, or breach-of-contract claims — for those, rely on common-law without-prejudice privilege which requires a pre-existing dispute.
- Statutory basis for valid waiver of statutory employment claims: s.203 ERA — the agreement must be in writing, identify the specific complaint(s), and the employee must have received independent legal advice from a "relevant adviser" (typically a solicitor with current PI insurance).
- Tax: £30,000 of genuine compensation for loss of office is tax-free under s.401 ITEPA 2003. Notice pay is subject to PAYE (Post-Employment Notice Pay rules apply).
- Counter terms typically engage with: payment, reference, restrictive covenants, mutual non-disparagement, mutual indemnity, legal-fee contribution.
- Tone: neutral, transactional. British English.
- Almost always sent through a solicitor; this is a first-pass for legal review.`,
  sections: [
    {
      sectionId: "header",
      title: "Without Prejudice and Subject to Contract header",
      instruction:
        "Single short <p> in <strong>. Two lines: 'WITHOUT PREJUDICE AND SUBJECT TO CONTRACT' and 'For settlement discussions only — not to be relied upon in any tribunal or court'. This must be the very first element on the page.",
      scaffold: `<p><strong>WITHOUT PREJUDICE AND SUBJECT TO CONTRACT</strong><br><strong>For settlement discussions only — not to be relied upon in any tribunal or court</strong></p>`,
      constraints: [
        "MUST be the very first element on the page.",
        "MUST be in <strong>.",
        "MUST include both 'Without Prejudice' and 'Subject to Contract'.",
      ],
      example: `<p><strong>WITHOUT PREJUDICE AND SUBJECT TO CONTRACT</strong><br><strong>For settlement discussions only — not to be relied upon in any tribunal or court</strong></p>`,
    },
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Address to HR Director or the employer's solicitors where instructed.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Ms Priya Sharma<br>HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Identifies the letter as a counter-offer.",
      scaffold: `<p><strong>Counter-Offer in Response to Settlement Proposal of {{employerOfferDate}}</strong></p>`,
      constraints: ["MUST reference the employer offer date."],
      example: `<p><strong>Counter-Offer in Response to Settlement Proposal of 5 May 2026</strong></p>`,
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
      sectionId: "opening",
      title: "Acknowledgement of offer",
      instruction:
        "Acknowledge receipt of the offer and the date. Confirm engagement on a Without Prejudice and Subject to Contract basis. Decline the offer in its current form and indicate willingness to engage on revised terms.",
      scaffold: `<p>I am writing in response to the settlement proposal communicated in your letter of {{employerOfferDate}}, which I have considered with the benefit of independent legal advice from a relevant adviser as required by section 203 of the Employment Rights Act 1996. I engage with you on a Without Prejudice and Subject to Contract basis. I am unable to accept the offer in its current form but am willing to engage on the following revised terms.</p>`,
      constraints: [
        "MUST acknowledge offer with date.",
        "MUST reference s.203 ERA and independent legal advice (or that it has been or will be sought).",
        "MUST confirm Without Prejudice and Subject to Contract basis.",
        "MUST politely decline the offer in its current form.",
      ],
      example: `<p>I am writing in response to the settlement proposal communicated in your letter of 5 May 2026, which I have considered with the benefit of independent legal advice from a relevant adviser as required by section 203 of the Employment Rights Act 1996. I engage with you on a Without Prejudice and Subject to Contract basis. I am unable to accept the offer in its current form but am willing to engage on the following revised terms.</p>`,
    },
    {
      sectionId: "body",
      title: "Counter-offer terms",
      instruction:
        "Numbered list of revised terms: (1) total settlement amount and breakdown; (2) reference; (3) restrictive covenant relaxation / waiver; (4) mutual non-disparagement; (5) mutual indemnity; (6) legal-fee contribution; (7) timing.",
      scaffold: `<p>The terms I propose are as follows:</p>
<ol>
  <li><strong>Settlement payment:</strong> {{paymentTerm}}</li>
  <li><strong>Reference:</strong> {{referenceTerm}}</li>
  <li><strong>Restrictive covenants:</strong> {{covenantTerm}}</li>
  <li><strong>Mutual non-disparagement:</strong> {{nondisparagementTerm}}</li>
  <li><strong>Mutual indemnity:</strong> {{indemnityTerm}}</li>
  <li><strong>Legal fee contribution:</strong> {{legalFeesTerm}}</li>
  <li><strong>Timing:</strong> {{timingTerm}}</li>
</ol>`,
      constraints: [
        "MUST itemise the counter terms with headings.",
        "MUST address payment, reference, covenants, non-disparagement, legal fees.",
        "MUST be specific (figures, periods, wording).",
      ],
      example: `<p>The terms I propose are as follows:</p>
<ol>
  <li><strong>Settlement payment:</strong> A total settlement payment of £85,000, of which £30,000 is to be paid as compensation for loss of office and treated as tax-free under s.401 ITEPA 2003 to the extent permitted, with the balance taxed under PAYE in accordance with the Post-Employment Notice Pay rules. This compares with the £45,000 in your offer.</li>
  <li><strong>Reference:</strong> An agreed reference in the form of the wording attached at Schedule 1 (one paragraph, factual, with confirmation that the Company will not depart from it without my consent), to be provided by Aisha Khan (Group HR Director) on a fact-only basis to any prospective employer.</li>
  <li><strong>Restrictive covenants:</strong> The 12-month non-compete in clause 18.1 of my Employment Contract to be reduced to a 3-month non-solicitation of clients with whom I had material dealings in the 12 months prior to the termination date.</li>
  <li><strong>Mutual non-disparagement:</strong> A mutual non-disparagement clause binding the Company (acting through its directors and officers) and me, in identical wording.</li>
  <li><strong>Mutual indemnity:</strong> A mutual tax indemnity in respect of any future tax liability arising from the settlement payment.</li>
  <li><strong>Legal fee contribution:</strong> A contribution of £1,500 plus VAT towards my legal fees, paid directly to my solicitors on production of a VAT invoice.</li>
  <li><strong>Timing:</strong> Settlement payment within 14 days of execution; agreed reference effective from the termination date.</li>
</ol>`,
    },
    {
      sectionId: "terms",
      title: "Tax-free element / legal-fee contribution",
      instruction:
        "Explain the tax structure briefly: £30,000 tax-free under s.401 ITEPA; PENP rules for notice pay; legal-fee contribution typically paid directly to the adviser.",
      scaffold: `<p>For the avoidance of doubt, the proposed payment structure assumes that £30,000 of the total is treated as tax-free compensation for loss of office under s.401 ITEPA 2003 to the extent so qualifying, and that the balance is taxed under PAYE consistent with the Post-Employment Notice Pay rules. The legal fee contribution should be paid directly to my solicitors against a VAT invoice.</p>`,
      constraints: [
        "MUST cite s.401 ITEPA 2003.",
        "MUST reference PENP rules.",
        "MUST direct the legal fee contribution to the solicitor.",
      ],
      example: `<p>For the avoidance of doubt, the proposed payment structure assumes that £30,000 of the total is treated as tax-free compensation for loss of office under s.401 ITEPA 2003 to the extent so qualifying, and that the balance is taxed under PAYE consistent with the Post-Employment Notice Pay rules. The legal fee contribution should be paid directly to my solicitors against a VAT invoice.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Deadline for response",
      instruction:
        "Reasonable deadline for response — typically 7 to 14 calendar days. Note that without-prejudice protection continues if discussions break down.",
      scaffold: `<p>I would be grateful for your response by {{responseDeadlineUK}}. If we are unable to reach agreement, I confirm that this letter and any responsive correspondence on this footing remain Without Prejudice and Subject to Contract and may not be referred to in any subsequent tribunal or court proceedings except for the limited purpose of enforcing any agreement reached.</p>`,
      constraints: [
        "MUST state a specific deadline.",
        "MUST reaffirm Without Prejudice / Subject to Contract status.",
      ],
      example: `<p>I would be grateful for your response by 26 May 2026. If we are unable to reach agreement, I confirm that this letter and any responsive correspondence on this footing remain Without Prejudice and Subject to Contract and may not be referred to in any subsequent tribunal or court proceedings except for the limited purpose of enforcing any agreement reached.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short, neutral. 'Yours sincerely,'.",
      scaffold: `<p>I look forward to your response.</p>
<p>Yours sincerely,</p>`,
      constraints: ["MUST use 'Yours sincerely,'."],
      example: `<p>I look forward to your response.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name and (where instructed) solicitor's contact details.",
      scaffold: `<p>{{employeeLegalName}}<br>{{solicitorContactBlock}}</p>`,
      constraints: ["MUST include solicitor contact where instructed."],
      example: `<p>Sarah Williams<br>c/o Charlotte Wright, Wright & Co Solicitors<br>charlotte.wright@wrightco.example<br>020 7946 0000</p>`,
    },
  ],
};

export const SETTLEMENT_COUNTER_OFFER_US: LetterTemplate = {
  letterType: "settlement_counter_offer",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Settlement Counter — EMPLOYEE MODE — CONFIDENTIAL):
- Mark "Confidential — For Settlement Purposes Only — Fed. R. Evid. 408" at the head. FRE 408 protects compromise negotiations from being admitted to prove liability.
- OWBPA, 29 U.S.C. §626(f) — release of ADEA claims (employee 40+) requires: written, advised to consult attorney, 21-day consideration (45 in group RIF), 7-day revocation, specific reference to ADEA waived, no waiver of post-execution rights.
- California: SB 331 limits NDA / non-disparagement provisions in matters relating to harassment / discrimination / retaliation; CCP §1542 waiver required for general release of unknown claims.
- Tax: ordinary income for back wages (W-2); §104(a)(2) excludes damages for personal physical injury (rarely applicable in employment); §409A timing concerns for delayed payment.
- Counter terms: payment, reference, restrictive covenants, mutual non-disparagement, mutual indemnity, attorneys' fees.
- American English. Tone: neutral, transactional. Almost always sent through counsel.`,
  sections: [
    {
      sectionId: "header",
      title: "Confidential — For Settlement Purposes Only header",
      instruction:
        "Single <p> in <strong>. 'CONFIDENTIAL — FOR SETTLEMENT PURPOSES ONLY — FEDERAL RULE OF EVIDENCE 408' and a second line about state evidentiary protections where applicable.",
      scaffold: `<p><strong>CONFIDENTIAL — FOR SETTLEMENT PURPOSES ONLY — FEDERAL RULE OF EVIDENCE 408</strong><br><strong>{{stateEvidentiaryRule}}</strong></p>`,
      constraints: [
        "MUST be the first element on the page.",
        "MUST cite Fed. R. Evid. 408.",
      ],
      example: `<p><strong>CONFIDENTIAL — FOR SETTLEMENT PURPOSES ONLY — FEDERAL RULE OF EVIDENCE 408</strong><br><strong>and Cal. Evid. Code §1152</strong></p>`,
    },
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. HR or employer's counsel.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Ms. Priya Sharma<br>Chief People Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Identifies as counter-offer.",
      scaffold: `<p><strong>Counter-Offer in Response to Separation Proposal of {{employerOfferDate}}</strong></p>`,
      constraints: ["MUST reference employer offer date."],
      example: `<p><strong>Counter-Offer in Response to Separation Proposal of May 5, 2026</strong></p>`,
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
      title: "Acknowledgement of offer",
      instruction:
        "Acknowledge offer; confirm FRE 408 basis; reference OWBPA where applicable; decline offer in current form.",
      scaffold: `<p>I am writing in response to the separation proposal communicated in your letter of {{employerOfferDate}}, which I have considered with the benefit of independent legal advice. I engage with you on a confidential, settlement-only basis under Federal Rule of Evidence 408{{owbpaReference}}. I am unable to accept the offer in its current form but am willing to engage on the following revised terms.</p>`,
      constraints: [
        "MUST acknowledge offer with date.",
        "MUST cite FRE 408.",
        "MUST reference OWBPA where employee is 40+ and ADEA release is sought.",
      ],
      example: `<p>I am writing in response to the separation proposal communicated in your letter of May 5, 2026, which I have considered with the benefit of independent legal advice. I engage with you on a confidential, settlement-only basis under Federal Rule of Evidence 408 and, in respect of the proposed release of ADEA claims, under the Older Workers Benefit Protection Act, 29 U.S.C. §626(f). I am unable to accept the offer in its current form but am willing to engage on the following revised terms.</p>`,
    },
    {
      sectionId: "body",
      title: "Counter-offer terms",
      instruction:
        "Numbered list: payment, reference, restrictive covenants, mutual non-disparagement, mutual indemnity, attorneys' fees, timing, OWBPA periods.",
      scaffold: `<p>The terms I propose are as follows:</p>
<ol>
  <li><strong>Severance payment:</strong> {{paymentTerm}}</li>
  <li><strong>Benefits / COBRA:</strong> {{cobraTerm}}</li>
  <li><strong>Reference:</strong> {{referenceTerm}}</li>
  <li><strong>Restrictive covenants:</strong> {{covenantTerm}}</li>
  <li><strong>Mutual non-disparagement (subject to applicable law):</strong> {{nondisparagementTerm}}</li>
  <li><strong>Attorneys' fees:</strong> {{legalFeesTerm}}</li>
  <li><strong>OWBPA periods (where applicable):</strong> {{owbpaTerm}}</li>
  <li><strong>Timing:</strong> {{timingTerm}}</li>
</ol>`,
      constraints: [
        "MUST itemise terms.",
        "MUST address payment, COBRA, reference, covenants, non-disparagement, attorneys' fees.",
        "MUST address OWBPA periods where the writer is 40+.",
        "Where California, MUST address SB 331 limits on NDA / non-disparagement in harassment matters.",
      ],
      example: `<p>The terms I propose are as follows:</p>
<ol>
  <li><strong>Severance payment:</strong> A total severance of $185,000 (compared with the $90,000 in your offer), payable within 14 days of execution, structured to comply with §409A.</li>
  <li><strong>Benefits / COBRA:</strong> Six months of COBRA premiums paid directly to the carrier, with ongoing coverage at the employee rate.</li>
  <li><strong>Reference:</strong> An agreed neutral reference in the form of the wording attached as Schedule 1, provided by Aisha Khan (VP, People) to any prospective employer on a fact-only basis.</li>
  <li><strong>Restrictive covenants:</strong> The 12-month non-compete in §11.1 of my Offer Letter to be released. The 12-month non-solicit to be reduced to 6 months and limited to clients with whom I had material dealings in the 12 months prior to termination.</li>
  <li><strong>Mutual non-disparagement:</strong> A mutual non-disparagement clause binding the Company (acting through its directors and officers) and me, with the carve-outs required by Cal. Gov. Code §12964.5 and Cal. Civ. Code §1670.11 (truthful information about unlawful acts in the workplace).</li>
  <li><strong>Attorneys' fees:</strong> A contribution of $7,500 toward my attorneys' fees, paid directly to counsel.</li>
  <li><strong>OWBPA periods:</strong> 21 calendar days to consider the agreement and 7 calendar days to revoke after execution, in accordance with 29 U.S.C. §626(f).</li>
  <li><strong>Timing:</strong> Severance payment within 14 days of the revocation period expiring.</li>
</ol>`,
    },
    {
      sectionId: "terms",
      title: "Tax structure / OWBPA disclosures",
      instruction: "Address §409A, W-2 vs 1099 treatment, OWBPA disclosures.",
      scaffold: `<p>{{taxStructureParagraph}}</p>`,
      constraints: [
        "MUST reference §409A timing requirements.",
        "Where OWBPA applies, MUST request disclosures under 29 U.S.C. §626(f)(1)(H).",
      ],
      example: `<p>For the avoidance of doubt, the proposed severance is to be structured to comply with §409A and reported on Form W-2. The attorneys' fee contribution should be paid directly to counsel and reported on Form 1099 to counsel as required. To the extent the agreement requires waiver of ADEA claims, please provide the disclosures required by 29 U.S.C. §626(f)(1)(H) (decisional unit, eligibility factors, ages and titles of selected and non-selected employees in the unit).</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Deadline for response",
      instruction: "Reasonable deadline for response.",
      scaffold: `<p>I would be grateful for your response by {{responseDeadlineUS}}. This letter and any responsive correspondence remain confidential and inadmissible to prove liability under Fed. R. Evid. 408.</p>`,
      constraints: [
        "MUST state specific deadline.",
        "MUST reaffirm FRE 408 status.",
      ],
      example: `<p>I would be grateful for your response by May 26, 2026. This letter and any responsive correspondence remain confidential and inadmissible to prove liability under Fed. R. Evid. 408.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Sincerely,'.",
      scaffold: `<p>I look forward to your response.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>I look forward to your response.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name and counsel contact details.",
      scaffold: `<p>{{employeeLegalName}}<br>{{counselContactBlock}}</p>`,
      constraints: ["MUST include counsel contact where represented."],
      example: `<p>Sarah Williams<br>c/o Charlotte Wright, Wright Employment Law PC<br>charlotte@wrightemployment.example<br>(415) 555-0142</p>`,
    },
  ],
};
