import type { LetterTemplate } from "../types";

export const FLEXIBLE_WORKING_REQUEST_UK: LetterTemplate = {
  letterType: "flexible_working_request",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Statutory Flexible Working Request — EMPLOYEE MODE):
- Statutory request under s.80F Employment Rights Act 1996, as amended by the Flexible Working (Amendment) Regulations 2023 (in force 6 April 2024).
- Day-one right since April 2024 — no minimum service required.
- Two requests permitted in any 12-month period (previously one).
- The employer must deal with the request reasonably (s.80G ERA) and within two months (extendable by agreement). The employer can refuse only on one of the eight statutory grounds: (a) burden of additional costs; (b) detrimental effect on ability to meet customer demand; (c) inability to reorganise work among existing staff; (d) inability to recruit additional staff; (e) detrimental impact on quality; (f) detrimental impact on performance; (g) insufficiency of work during the periods proposed; (h) planned structural changes (s.80G(1)(b) ERA).
- Pre-empt these grounds in the business case.
- Tone: practical, business-case-led, not adversarial. British English.
- Where the request is disability-linked, also signpost the parallel Equality Act 2010 ss.20-22 reasonable-adjustments duty (which is separate and not subject to the same statutory grounds for refusal).`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Address to line manager or HR.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST address to line manager or HR.",
      ],
      example: `<p>12 May 2026<br><br>Mr Marcus Chen<br>Head of Marketing<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies the letter as a statutory request under s.80F ERA 1996.",
      scaffold: `<p><strong>Statutory Flexible Working Request under s.80F Employment Rights Act 1996</strong></p>`,
      constraints: [
        "MUST identify the request as statutory.",
        "MUST cite s.80F ERA 1996.",
      ],
      example: `<p><strong>Statutory Flexible Working Request under s.80F Employment Rights Act 1996</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "One <p>. Honorific or first name appropriate to relationship.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statutory basis and current pattern",
      instruction:
        "State that the request is made under s.80F ERA 1996 / Flexible Working (Amendment) Regulations 2023. Confirm the date of the letter (the start of the two-month statutory window). State the current working pattern. Note any prior request in the last 12 months.",
      scaffold: `<p>I am writing to make a statutory flexible working request under section 80F of the Employment Rights Act 1996, as amended by the Flexible Working (Amendment) Regulations 2023. I confirm the date of this request is {{issueDateUK}}. My current working pattern is {{currentPattern}}. {{priorRequestStatement}}.</p>`,
      constraints: [
        "MUST cite s.80F ERA 1996.",
        "MUST state the date of the request (starts the two-month window).",
        "MUST describe the current working pattern.",
        "MUST state whether a prior request has been made in the last 12 months.",
      ],
      example: `<p>I am writing to make a statutory flexible working request under section 80F of the Employment Rights Act 1996, as amended by the Flexible Working (Amendment) Regulations 2023. I confirm the date of this request is 12 May 2026. My current working pattern is full-time, Monday to Friday, 9.00am to 5.30pm, working from the London office four days a week and remotely on Wednesdays. I have not made a prior flexible working request in the last 12 months.</p>`,
    },
    {
      sectionId: "body",
      title: "Proposed change and effective date",
      instruction:
        "Set out the requested change precisely: the new pattern, the proposed effective date, whether the change is permanent or temporary. Be precise — vague requests are easier to refuse.",
      scaffold: `<p>I am requesting the following change to my working pattern: {{proposedChange}}. I would like the change to take effect from {{proposedEffectiveDate}} and to be a {{permanentOrTemporary}} change.</p>`,
      constraints: [
        "MUST be precise about the new pattern (days, hours, location).",
        "MUST state the proposed effective date.",
        "MUST state whether permanent or temporary.",
      ],
      example: `<p>I am requesting the following change to my working pattern: a reduction from five to four working days per week, working Monday to Thursday, 9.00am to 5.30pm, with no work on Fridays; I would also like to work remotely on Tuesdays in addition to my current Wednesday remote day. I would like the change to take effect from 1 September 2026 and to be a permanent change to my contract.</p>`,
    },
    {
      sectionId: "terms",
      title: "Effect on work and business — proposed mitigations",
      instruction:
        "Pre-empt the eight statutory grounds for refusal under s.80G(1)(b) ERA. Address: cost, customer demand, work reorganisation, recruitment, quality, performance, work availability, planned changes. The mitigations should be specific and credible.",
      scaffold: `<p>I have considered the impact of this change on the business and propose the following:</p>
<ul>
  <li><strong>Workload coverage:</strong> {{workloadMitigation}}</li>
  <li><strong>Customer / stakeholder availability:</strong> {{customerMitigation}}</li>
  <li><strong>Quality and performance:</strong> {{qualityMitigation}}</li>
  <li><strong>Cost:</strong> {{costMitigation}}</li>
  <li><strong>Trial period:</strong> {{trialPeriodOffer}}</li>
</ul>`,
      constraints: [
        "MUST address at least four of the eight statutory grounds for refusal.",
        "MUST offer specific, credible mitigations.",
        "MUST consider offering a trial period.",
        "MUST NOT make commitments about colleagues' workloads without their agreement.",
      ],
      example: `<p>I have considered the impact of this change on the business and propose the following:</p>
<ul>
  <li><strong>Workload coverage:</strong> I will redistribute my Friday agency calls to Mondays and Thursdays, and I have spoken to Sarah Williams who has agreed to be the team's first point of contact for media enquiries on Fridays. No additional headcount will be required.</li>
  <li><strong>Customer / stakeholder availability:</strong> I will continue to be reachable by exception for genuine emergencies on Fridays. I will set up an out-of-office reply on Fridays directing routine queries to Sarah Williams and urgent matters to my mobile.</li>
  <li><strong>Quality and performance:</strong> I will retain ownership of all live campaigns; the four-day pattern is sufficient to meet my current KPIs, which I have reviewed with this proposal in mind.</li>
  <li><strong>Cost:</strong> The change involves a corresponding reduction in salary and pro rata adjustment of accrued holiday and benefits. There is no additional cost to the Company.</li>
  <li><strong>Trial period:</strong> I am happy to operate the new pattern as a three-month trial from 1 September 2026, with a review meeting in November to confirm continuation.</li>
</ul>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for response and meeting",
      instruction:
        "Reference the two-month statutory window for the employer's decision (s.80G ERA). Offer to meet to discuss. Offer to be accompanied at any meeting (good practice though not statutory under the flexible working regime).",
      scaffold: `<p>The Company is required to deal with this request reasonably and to notify me of its decision within two months of the date of this letter (s.80G ERA 1996), unless we agree to extend that period. I would welcome a meeting to discuss the request and any practical concerns; I am happy to be accompanied by a colleague at any such meeting.</p>`,
      constraints: [
        "MUST reference the two-month statutory window under s.80G ERA.",
        "MUST offer to meet.",
        "MUST NOT impose a unilateral deadline shorter than the statutory window.",
      ],
      example: `<p>The Company is required to deal with this request reasonably and to notify me of its decision within two months of the date of this letter (s.80G ERA 1996), unless we agree to extend that period. I would welcome a meeting to discuss the request and any practical concerns; I am happy to be accompanied by a colleague at any such meeting.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph thanking the recipient for considering the request. 'Yours sincerely,'.",
      scaffold: `<p>I would be grateful for confirmation of receipt and the proposed timetable for the Company's response.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,' (named recipient).",
        "MUST be polite and constructive.",
      ],
      example: `<p>I would be grateful for confirmation of receipt and the proposed timetable for the Company's response.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, job title, employee number.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST be name, title, employee number."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee No. 04231</p>`,
    },
  ],
};

export const FLEXIBLE_WORKING_REQUEST_US: LetterTemplate = {
  letterType: "flexible_working_request",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Flexible Work Request — EMPLOYEE MODE):
- Federal law: there is no general statutory right to request flexible working in the US, except where the request is a reasonable accommodation under the ADA (use the accommodation_request template instead) or PWFA (pregnancy).
- State / local right-to-request frameworks exist in a handful of jurisdictions: Vermont (21 V.S.A. §309), New Hampshire (RSA 275:37-b), San Francisco (Family Friendly Workplace Ordinance), Seattle (Secure Scheduling Ordinance — predictive scheduling).
- Where no statutory right applies, the request is discretionary under company policy. Frame as a business-case proposal.
- For caregiver-status protected jurisdictions (NY, NJ, AK, DE, DC, etc.), be careful about how the request is framed — caregiver discrimination protections may apply.
- Tone: practical, business-case-led. American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. Line manager or HR.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Mr. Marcus Chen<br>Head of Marketing<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies as a flexible work request. Cite the relevant state / local statute if applicable.",
      scaffold: `<p><strong>Flexible Work Arrangement Request{{statuteSubjectAddon}}</strong></p>`,
      constraints: [
        "MUST identify the letter as a flexible work request.",
        "Where state/local law applies, MUST cite it in the subject line.",
      ],
      example: `<p><strong>Flexible Work Arrangement Request — San Francisco Family Friendly Workplace Ordinance</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "One <p>.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statutory / policy basis and current pattern",
      instruction:
        "Identify the basis (state/local statute, company policy). State the current pattern. Note any prior request.",
      scaffold: `<p>I am writing to request a change to my working pattern under {{statuteOrPolicyBasis}}. My current working pattern is {{currentPattern}}. {{priorRequestStatement}}.</p>`,
      constraints: [
        "MUST identify the basis (statutory where applicable, otherwise company policy).",
        "MUST describe the current pattern.",
      ],
      example: `<p>I am writing to request a change to my working pattern under the San Francisco Family Friendly Workplace Ordinance, S.F. Police Code Article 33F, and the Company's Flexible Work Policy. My current working pattern is full-time, Monday to Friday, 9:00am to 5:30pm, working from the San Francisco office four days a week and remotely on Wednesdays. I have not made a prior request in the last 12 months.</p>`,
    },
    {
      sectionId: "body",
      title: "Proposed change and effective date",
      instruction:
        "Precise: new pattern, effective date, permanent or temporary.",
      scaffold: `<p>I am requesting the following change to my working pattern: {{proposedChange}}. I would like the change to take effect from {{proposedEffectiveDate}} and to be a {{permanentOrTemporary}} arrangement.</p>`,
      constraints: [
        "MUST be precise about the new pattern.",
        "MUST state effective date.",
      ],
      example: `<p>I am requesting the following change to my working pattern: a reduction from five to four working days per week, working Monday to Thursday, 9:00am to 5:30pm, with no work on Fridays; I would also like to work remotely on Tuesdays in addition to my current Wednesday remote day. I would like the change to take effect from September 1, 2026 and to be a permanent arrangement.</p>`,
    },
    {
      sectionId: "terms",
      title: "Effect on work and business — proposed mitigations",
      instruction:
        "Address coverage, stakeholder availability, quality, cost, trial period.",
      scaffold: `<p>I have considered the impact of this change on the business and propose the following:</p>
<ul>
  <li><strong>Workload coverage:</strong> {{workloadMitigation}}</li>
  <li><strong>Stakeholder availability:</strong> {{customerMitigation}}</li>
  <li><strong>Quality and performance:</strong> {{qualityMitigation}}</li>
  <li><strong>Cost:</strong> {{costMitigation}}</li>
  <li><strong>Trial period:</strong> {{trialPeriodOffer}}</li>
</ul>`,
      constraints: [
        "MUST offer specific, credible mitigations.",
        "MUST consider a trial period.",
      ],
      example: `<p>I have considered the impact of this change on the business and propose the following:</p>
<ul>
  <li><strong>Workload coverage:</strong> I will redistribute my Friday agency calls to Mondays and Thursdays, and Sarah Williams has agreed to be the team's first point of contact for media inquiries on Fridays. No additional headcount required.</li>
  <li><strong>Stakeholder availability:</strong> I will continue to be reachable by exception for genuine emergencies on Fridays via my mobile.</li>
  <li><strong>Quality and performance:</strong> I will retain ownership of all live campaigns; the four-day pattern is sufficient to meet my current OKRs.</li>
  <li><strong>Cost:</strong> The change involves a corresponding reduction in salary and pro rata adjustment of accrued vacation and benefits. No additional cost to the Company.</li>
  <li><strong>Trial period:</strong> I propose a three-month trial from September 1, 2026 with a review meeting in November.</li>
</ul>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for response and meeting",
      instruction:
        "Reference any statutory response window where applicable. Offer to meet.",
      scaffold: `<p>{{statutoryResponseWindowReference}} I would welcome a meeting to discuss the request and any practical concerns.</p>`,
      constraints: [
        "Where state/local law applies, MUST reference the statutory response window.",
        "MUST offer to meet.",
      ],
      example: `<p>Under the San Francisco Family Friendly Workplace Ordinance, the Company is required to respond to this request within 21 days. I would welcome a meeting to discuss the request and any practical concerns.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Polite. 'Sincerely,'.",
      scaffold: `<p>I would be grateful for confirmation of receipt and the proposed timetable for the Company's response.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>I would be grateful for confirmation of receipt and the proposed timetable for the Company's response.</p>
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
