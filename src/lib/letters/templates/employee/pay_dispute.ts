import type { LetterTemplate } from "../types";

export const PAY_DISPUTE_UK: LetterTemplate = {
  letterType: "pay_dispute",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Pay Dispute / Unauthorised Deductions — EMPLOYEE MODE):
- Statutory basis: s.13 Employment Rights Act 1996 — an employer must not make any deduction from a worker's wages unless authorised by statute, an express contractual provision, or written consent given before the deduction.
- Limitation: 3 months less one day from the date of payment of the underpaid wages (s.23 ERA), subject to ACAS Early Conciliation extension. Bear Scotland Ltd v Fulton [2014] UKEAT 0047/13/0411 — a "series of deductions" can extend back, but Deduction from Wages (Limitation) Regulations 2014 cap the look-back at 2 years for claims presented on or after 1 July 2015.
- Holiday pay underpayment claims: Working Time Regulations 1998 reg.13 / 13A; or as unauthorised deduction under s.13 ERA.
- National Minimum Wage Act 1998 / National Living Wage where the dispute concerns the legal floor.
- Tone: assertive, forensic. Itemise the underpayment with calculation. British English.
- Tribunal-bound. Reserve all rights.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Address to HR Director, Finance Director, or Payroll Manager.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Ms Priya Sharma<br>HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Identifies as notice of pay dispute.",
      scaffold: `<p><strong>Notice of Pay Dispute — Unauthorised Deduction from Wages (s.13 ERA 1996)</strong></p>`,
      constraints: [
        "MUST identify as a pay dispute / unauthorised deduction.",
        "MUST cite s.13 ERA 1996.",
      ],
      example: `<p><strong>Notice of Pay Dispute — Unauthorised Deduction from Wages (s.13 ERA 1996)</strong></p>`,
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
      title: "Identification of underpayment and calculation",
      instruction:
        "Itemise the underpayment with dates, amounts, calculation. Reference the contract clause / policy / statutory basis on which the higher amount is due. Include payslip dates / gross/net positions.",
      scaffold: `<p>I write to set out the underpayment of wages by {{employerLegalName}} and to request payment.</p>
<p>The sums I claim are as follows:</p>
<ol>
  <li><strong>{{itemDescription1}}</strong> — period {{period1}}; amount due £{{amountDue1}}; amount paid £{{amountPaid1}}; shortfall <strong>£{{shortfall1}}</strong>. Calculation: {{calculation1}}.</li>
  <li><strong>{{itemDescription2}}</strong> — period {{period2}}; amount due £{{amountDue2}}; amount paid £{{amountPaid2}}; shortfall <strong>£{{shortfall2}}</strong>. Calculation: {{calculation2}}.</li>
</ol>
<p>The total I claim is <strong>£{{totalShortfall}}</strong> gross.</p>`,
      constraints: [
        "MUST itemise each underpayment with period, amount due, amount paid, shortfall.",
        "MUST show the calculation.",
        "MUST give a clear total.",
      ],
      example: `<p>I write to set out the underpayment of wages by Acme Holdings Limited and to request payment.</p>
<p>The sums I claim are as follows:</p>
<ol>
  <li><strong>Sales commission Q1 2026</strong> — period 1 January to 31 March 2026; amount due £18,420 (3% of £614,000 net new business per clause 6.2 of my Employment Contract); amount paid £4,200; shortfall <strong>£14,220</strong>. Calculation: my Q1 closed-won book was £614,000 net new (CRM export attached); commission rate 3%; gross due £18,420.</li>
  <li><strong>Statutory holiday pay</strong> — period 1 April 2025 to 31 March 2026; 5 days of accrued and untaken statutory holiday under WTR 1998 reg.13, paid out as regular daily rate (£345/day) rather than the statutory average including commission per Bear Scotland v Fulton [2014]; underpayment <strong>£612</strong>.</li>
</ol>
<p>The total I claim is <strong>£14,832</strong> gross.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Citation of contract, statute, policy",
      instruction:
        "State the legal and contractual basis for the claim: clause numbers, statute sections, policy references.",
      scaffold: `<p>The basis on which the sums are due is as follows: {{contractualBasis}}; {{statutoryBasis}}. Each shortfall is, in my submission, an unauthorised deduction from wages under section 13 of the Employment Rights Act 1996.</p>`,
      constraints: [
        "MUST cite the contractual clause(s) by number.",
        "MUST cite s.13 ERA 1996 (and any other relevant statute).",
      ],
      example: `<p>The basis on which the sums are due is as follows: clause 6.2 of my Employment Contract dated 4 March 2022 (commission entitlement); regulation 13 of the Working Time Regulations 1998 (statutory annual leave) read with Bear Scotland Ltd v Fulton [2014] UKEAT 0047/13/0411 (commission to be reflected in holiday pay). Each shortfall is, in my submission, an unauthorised deduction from wages under section 13 of the Employment Rights Act 1996.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Demand for payment within reasonable period",
      instruction:
        "Demand payment by a reasonable but specific deadline (typically 14 or 21 calendar days from the date of the letter). Refer to the limitation period (3 months less one day per s.23 ERA) and the ACAS EC route as the next procedural step.",
      scaffold: `<p>I ask that the sum of £{{totalShortfall}} be paid into my nominated account within {{deadlineDays}} calendar days of the date of this letter, that is, by {{paymentDeadlineUK}}. If payment is not received by that date I will, without further notice, notify ACAS under the Early Conciliation procedure with a view to bringing a claim in the Employment Tribunal under section 13 of the Employment Rights Act 1996. I am mindful of the limitation period under section 23 of the Act (3 months less one day from the relevant deduction).</p>`,
      constraints: [
        "MUST demand payment by a specific date.",
        "MUST reference ACAS EC and s.23 ERA limitation.",
      ],
      example: `<p>I ask that the sum of £14,832 be paid into my nominated account within 14 calendar days of the date of this letter, that is, by 26 May 2026. If payment is not received by that date I will, without further notice, notify ACAS under the Early Conciliation procedure with a view to bringing a claim in the Employment Tribunal under section 13 of the Employment Rights Act 1996. I am mindful of the limitation period under section 23 of the Act (3 months less one day from the relevant deduction).</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights (ACAS / tribunal)",
      instruction: "Reserve all rights including ACAS EC and tribunal proceedings.",
      scaffold: `<p>I reserve all my rights, including without limitation the right to notify ACAS under the Early Conciliation procedure and to bring proceedings in the Employment Tribunal. Nothing in this letter should be construed as a waiver of any right or as an admission on my part.</p>`,
      constraints: ["MUST reserve ACAS / tribunal rights."],
      example: `<p>I reserve all my rights, including without limitation the right to notify ACAS under the Early Conciliation procedure and to bring proceedings in the Employment Tribunal. Nothing in this letter should be construed as a waiver of any right or as an admission on my part.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Yours sincerely,'.",
      scaffold: `<p>I look forward to your prompt response.</p>
<p>Yours sincerely,</p>`,
      constraints: ["MUST use 'Yours sincerely,'."],
      example: `<p>I look forward to your prompt response.</p>
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

export const PAY_DISPUTE_US: LetterTemplate = {
  letterType: "pay_dispute",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Wage Claim — EMPLOYEE MODE):
- Federal: Fair Labor Standards Act (FLSA) 29 U.S.C. §201 et seq. — minimum wage and overtime; private right of action under §216(b); 2-year statute (3-year for willful violations).
- State wage payment laws are typically more protective:
  - California: Cal. Lab. Code §201 (immediate payment on involuntary termination), §202 (72-hour rule on resignation), §203 (waiting-time penalties), §204 (timing of regular wages), §226 (pay statements), §1194 (minimum wage / overtime private action).
  - New York: N.Y. Lab. Law §198 (liquidated damages for unpaid wages), §195 (wage notice).
  - Massachusetts: M.G.L. c.149 §148 (Wage Act).
  - Many states allow private right of action with treble damages and attorneys' fees.
- Frame the claim with itemised calculation, statute citations, deadline, reservation of rights to file with DOL and state labor commissioner.
- American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. HR / Payroll / CFO.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Ms. Priya Sharma<br>Chief People Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Identifies as wage claim.",
      scaffold: `<p><strong>Notice of Wage Claim — {{statuteList}}</strong></p>`,
      constraints: [
        "MUST identify as wage claim.",
        "MUST cite the relevant federal/state statute(s).",
      ],
      example: `<p><strong>Notice of Wage Claim — FLSA, Cal. Lab. Code §§201, 226, 1194</strong></p>`,
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
      title: "Identification of underpayment and calculation",
      instruction:
        "Itemise. Period, amount due, amount paid, shortfall, calculation.",
      scaffold: `<p>I write to set out the underpayment of wages by {{employerLegalName}} and to request payment.</p>
<p>The sums I claim are as follows:</p>
<ol>
  <li><strong>{{itemDescription1}}</strong> — period {{period1}}; due ${"$"}{{amountDue1}}; paid ${"$"}{{amountPaid1}}; shortfall <strong>${"$"}{{shortfall1}}</strong>. Calculation: {{calculation1}}.</li>
  <li><strong>{{itemDescription2}}</strong> — period {{period2}}; due ${"$"}{{amountDue2}}; paid ${"$"}{{amountPaid2}}; shortfall <strong>${"$"}{{shortfall2}}</strong>. Calculation: {{calculation2}}.</li>
</ol>
<p>The total I claim is <strong>${"$"}{{totalShortfall}}</strong> gross, exclusive of statutory penalties and interest.</p>`,
      constraints: [
        "MUST itemise each underpayment with period, amount, calculation.",
        "MUST give a clear total.",
        "MUST flag statutory penalties separately.",
      ],
      example: `<p>I write to set out the underpayment of wages by Acme Inc. and to request payment.</p>
<p>The sums I claim are as follows:</p>
<ol>
  <li><strong>Sales commission Q1 2026</strong> — period January 1 to March 31, 2026; due $25,800 (3% of $860,000 net new business per Section 6.2 of my Offer Letter); paid $5,800; shortfall <strong>$20,000</strong>. Calculation: Q1 closed-won book of $860,000 (CRM export attached); 3% commission rate.</li>
  <li><strong>Unpaid overtime</strong> — period October 6, 2025 to March 31, 2026; an average of 7 hours' overtime per week at the regular rate of $52.88/hr (1.5x); 26 weeks × 7 hours × $52.88 = <strong>$9,624.16</strong>.</li>
</ol>
<p>The total I claim is <strong>$29,624.16</strong> gross, exclusive of waiting-time penalties under Cal. Lab. Code §203, liquidated damages under FLSA §216(b), and interest.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Citation of contract, statute, policy",
      instruction: "Cite contract clauses, FLSA, state wage payment law.",
      scaffold: `<p>The basis on which the sums are due is as follows: {{contractualBasis}}; {{statutoryBasis}}.</p>`,
      constraints: [
        "MUST cite contract clauses by number.",
        "MUST cite FLSA and state wage statute.",
      ],
      example: `<p>The basis on which the sums are due is as follows: Section 6.2 of my Offer Letter dated March 4, 2022 (commission entitlement); the Fair Labor Standards Act (29 U.S.C. §207) and California Labor Code §510 (overtime); Cal. Lab. Code §§204 and 226 (timely payment and pay statements).</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Demand for payment",
      instruction:
        "Demand payment by specific date. Reference DOL / state labor commissioner / private action as next steps.",
      scaffold: `<p>I ask that the sum of ${"$"}{{totalShortfall}} be paid within {{deadlineDays}} calendar days of the date of this letter, that is, by {{paymentDeadlineUS}}. If payment is not made by that date I will, without further notice, file a complaint with the U.S. Department of Labor Wage and Hour Division and / or {{stateLaborAgency}}, and / or commence civil proceedings under FLSA §216(b) and applicable state law to recover the unpaid wages, statutory penalties, liquidated damages, interest, and attorneys' fees.</p>`,
      constraints: [
        "MUST demand payment by a specific date.",
        "MUST reference DOL / state labor commissioner / private action.",
      ],
      example: `<p>I ask that the sum of $29,624.16 be paid within 14 calendar days of the date of this letter, that is, by May 26, 2026. If payment is not made by that date I will, without further notice, file a complaint with the U.S. Department of Labor Wage and Hour Division and the California Labor Commissioner, and / or commence civil proceedings under FLSA §216(b) and Cal. Lab. Code §§203, 218.5 and 1194 to recover the unpaid wages, statutory penalties, liquidated damages, interest, and attorneys' fees.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction: "Reserve DOL / state agency / private action rights.",
      scaffold: `<p>I reserve all of my rights, including the right to file with the U.S. Department of Labor and {{stateLaborAgency}} and to commence civil proceedings. Nothing in this letter should be construed as a waiver of any right.</p>`,
      constraints: ["MUST reserve DOL / state agency / civil action rights."],
      example: `<p>I reserve all of my rights, including the right to file with the U.S. Department of Labor and the California Labor Commissioner and to commence civil proceedings. Nothing in this letter should be construed as a waiver of any right.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Sincerely,'.",
      scaffold: `<p>I look forward to your prompt response.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>I look forward to your prompt response.</p>
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
};
