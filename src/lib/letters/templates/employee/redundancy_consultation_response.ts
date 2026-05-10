import type { LetterTemplate } from "../types";

export const REDUNDANCY_CONSULTATION_RESPONSE_UK: LetterTemplate = {
  letterType: "redundancy_consultation_response",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Redundancy Consultation Response — EMPLOYEE MODE):
- Williams v Compair Maxam [1982] ICR 156 framework: warning, consultation, fair selection criteria, fair scoring, consideration of alternative employment.
- A redundancy is potentially fair under s.98(2)(c) ERA 1996 only if the employer follows a fair process; failures of consultation or selection found unfair dismissal even where the redundancy reason is genuine (Polkey v AE Dayton Services [1987]).
- For 20+ proposed dismissals at one establishment in 90 days, s.188 TULRCA 1992 collective consultation duty applies (30 days; 45 if 100+).
- Statutory redundancy pay under s.162 ERA: <22 = 0.5 weeks/year; 22-40 = 1 week/year; 41+ = 1.5 weeks/year; cap on weekly amount; minimum 2y service.
- Suitable alternative employment: 4-week trial period under s.138 ERA.
- Tone: engaged, forensic, preserves position. British English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. HR / line manager.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Ms Priya Sharma<br>HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Identifies as response to at-risk notification.",
      scaffold: `<p><strong>Response to At-Risk Notification dated {{atRiskNoticeDate}}</strong></p>`,
      constraints: ["MUST reference the at-risk notification date."],
      example: `<p><strong>Response to At-Risk Notification dated 28 April 2026</strong></p>`,
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
      title: "Questions on selection pool and criteria",
      instruction:
        "Engage with the selection pool, the criteria, and the scoring methodology. Numbered questions. Reference the Compair Maxam framework. Request specific information.",
      scaffold: `<p>I write in response to the at-risk notification of {{atRiskNoticeDate}}. I would like to engage constructively with the consultation and ask the Company to address the following matters:</p>
<ol>
  <li><strong>Selection pool:</strong> {{poolQuestion}}</li>
  <li><strong>Selection criteria:</strong> {{criteriaQuestion}}</li>
  <li><strong>Scoring methodology:</strong> {{scoringQuestion}}</li>
  <li><strong>Comparators:</strong> {{comparatorsQuestion}}</li>
</ol>`,
      constraints: [
        "MUST ask specific questions about pool, criteria, and scoring.",
        "MUST request comparator scoring (anonymised) where pool involves more than one candidate.",
        "MUST reference the consultation framework.",
      ],
      example: `<p>I write in response to the at-risk notification of 28 April 2026. I would like to engage constructively with the consultation and ask the Company to address the following matters:</p>
<ol>
  <li><strong>Selection pool:</strong> Please confirm the composition of the selection pool, the rationale for its boundary, and the alternative pools considered. The notification refers to the "UK marketing leadership pool" but does not explain why the pool is limited in this way; in particular, please confirm whether the Group Brand and Group Insights teams (which include similarly graded roles) were considered as part of the pool, and if not, why not.</li>
  <li><strong>Selection criteria:</strong> Please provide the selection criteria, the relative weighting, and the rationale. Where any criterion is potentially subjective (such as "leadership potential"), please explain the steps taken to ensure consistency.</li>
  <li><strong>Scoring methodology:</strong> Please provide my own scoring matrix and an anonymised summary of comparators' scores in the pool.</li>
  <li><strong>Comparators:</strong> Please confirm the period of performance reviewed and confirm that any periods of statutory leave (maternity, sickness, and paternity) have been excluded or appropriately adjusted.</li>
</ol>`,
    },
    {
      sectionId: "terms",
      title: "Request for selection scoring / alternative employment information",
      instruction:
        "Request access to alternative roles, the suitable alternative employment list, and consideration of bumping / redeployment. Reference s.138 ERA 4-week trial period.",
      scaffold: `<p>I would also like to receive:</p>
<ul>
  <li>A current list of vacancies at all grades within {{employerLegalName}} and any group company, with closing dates;</li>
  <li>Confirmation of the Company's approach to suitable alternative employment, including consideration of redeployment to roles below my current grade and any "bumping" arrangements;</li>
  <li>Confirmation that any role offered as suitable alternative employment will be subject to the statutory 4-week trial period under section 138 of the Employment Rights Act 1996.</li>
</ul>`,
      constraints: [
        "MUST request a list of vacancies.",
        "MUST cite s.138 ERA 4-week trial period.",
      ],
      example: `<p>I would also like to receive:</p>
<ul>
  <li>A current list of vacancies at all grades within Acme Holdings Limited and any group company, with closing dates;</li>
  <li>Confirmation of the Company's approach to suitable alternative employment, including consideration of redeployment to roles below my current grade and any "bumping" arrangements;</li>
  <li>Confirmation that any role offered as suitable alternative employment will be subject to the statutory 4-week trial period under section 138 of the Employment Rights Act 1996.</li>
</ul>`,
    },
    {
      sectionId: "outcome_sought",
      title: "Suggestions to avoid redundancy",
      instruction:
        "Optional but valuable. Suggest alternatives: voluntary redundancy across a wider pool, secondment, reduced hours, sabbatical, redeployment to specific roles. Demonstrates engagement and may strengthen procedural fairness arguments.",
      scaffold: `<p>I would also like to suggest the following alternatives to compulsory redundancy from my role:</p>
<ul>
  <li>{{alternative1}}</li>
  <li>{{alternative2}}</li>
</ul>`,
      constraints: [
        "MUST be specific and credible.",
        "MUST NOT amount to a personal demand.",
      ],
      example: `<p>I would also like to suggest the following alternatives to compulsory redundancy from my role:</p>
<ul>
  <li>The opening of a voluntary redundancy window across the wider Group Marketing function (current pool of c.40 roles), which I am informed by colleagues would have several volunteers.</li>
  <li>A secondment to the Brand team's Northwood project (October 2026 - March 2027), in respect of which the team has indicated capacity gaps in their Q3 plan.</li>
  <li>A reduction to four working days per week with a corresponding salary reduction, on a permanent basis.</li>
</ul>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve all rights including unfair dismissal under Part X ERA, discrimination under EqA, and any collective consultation rights.",
      scaffold: `<p>I reserve all my rights, including without limitation any rights I may have under Part X of the Employment Rights Act 1996, the Equality Act 2010, and (where applicable) under section 188 of TULRCA 1992. Nothing in this letter should be construed as a waiver of any such right or as agreement that the proposed redundancy is fair or that any selection decision communicated to date is final.</p>`,
      constraints: [
        "MUST reserve unfair dismissal, EqA, and TULRCA rights.",
        "MUST disclaim acceptance of the proposed redundancy.",
      ],
      example: `<p>I reserve all my rights, including without limitation any rights I may have under Part X of the Employment Rights Act 1996, the Equality Act 2010, and (where applicable) under section 188 of TULRCA 1992. Nothing in this letter should be construed as a waiver of any such right or as agreement that the proposed redundancy is fair or that any selection decision communicated to date is final.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Yours sincerely,'.",
      scaffold: `<p>I look forward to your responses ahead of our next consultation meeting.</p>
<p>Yours sincerely,</p>`,
      constraints: ["MUST use 'Yours sincerely,'."],
      example: `<p>I look forward to your responses ahead of our next consultation meeting.</p>
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

export const REDUNDANCY_CONSULTATION_RESPONSE_US: LetterTemplate = {
  letterType: "redundancy_consultation_response",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Layoff / RIF Response — EMPLOYEE MODE):
- "Redundancy" in US parlance is "reduction in force" (RIF) or "layoff". At-will employment generally permits layoffs without statutory consultation, BUT:
  - WARN Act (29 U.S.C. §2101 et seq.): 60-day notice for plant closings or mass layoffs by employers with 100+ employees, where 50+ employees are affected at a single site within a 30-day window.
  - State mini-WARN: Cal. WARN (75 employees, 60 days), NY WARN (50 employees, 90 days), NJ, IL.
  - Older Workers Benefit Protection Act (OWBPA), 29 U.S.C. §626(f), where a release of ADEA claims is offered for a group: 21-day consideration (45 for group), 7-day revocation period, and disclosure of the decisional unit and selection criteria.
  - Title VII / ADA / ADEA disparate impact: a layoff that disproportionately affects a protected class can be challenged.
- Engage with the criteria; preserve position; reserve rights.
- American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. HR.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Ms. Priya Sharma<br>Chief People Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Identifies the response.",
      scaffold: `<p><strong>Response to Notice of Reduction in Force dated {{rifNoticeDate}}</strong></p>`,
      constraints: ["MUST reference the RIF notice date."],
      example: `<p><strong>Response to Notice of Reduction in Force dated April 28, 2026</strong></p>`,
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
      title: "Questions on RIF and selection",
      instruction: "Numbered questions: decisional unit, criteria, OWBPA disclosures, WARN compliance.",
      scaffold: `<p>I write in response to the Company's notice of reduction in force dated {{rifNoticeDate}}. I would like to engage with the process and ask the Company to address the following:</p>
<ol>
  <li><strong>Decisional unit:</strong> {{unitQuestion}}</li>
  <li><strong>Selection criteria:</strong> {{criteriaQuestion}}</li>
  <li><strong>OWBPA disclosures (where release proposed):</strong> {{owbpaQuestion}}</li>
  <li><strong>WARN compliance:</strong> {{warnQuestion}}</li>
</ol>`,
      constraints: [
        "MUST ask about decisional unit and criteria.",
        "MUST reference OWBPA where the writer is 40+ and a release is proposed.",
        "MUST reference WARN where applicable.",
      ],
      example: `<p>I write in response to the Company's notice of reduction in force dated April 28, 2026. I would like to engage with the process and ask the Company to address the following:</p>
<ol>
  <li><strong>Decisional unit:</strong> Please confirm the decisional unit, the rationale for its boundary, and the alternative units considered.</li>
  <li><strong>Selection criteria:</strong> Please provide the selection criteria, their relative weighting, and the rationale for each. Where any criterion is potentially subjective, please confirm the steps taken to ensure consistency across decision-makers.</li>
  <li><strong>OWBPA disclosures:</strong> If a release of ADEA claims is to be requested in connection with this RIF, please provide the disclosures required by 29 U.S.C. §626(f)(1)(H), including the job titles and ages of all individuals eligible or selected for the program and those in the same job classification or organizational unit who are not eligible or selected.</li>
  <li><strong>WARN compliance:</strong> Please confirm whether the proposed action is a "mass layoff" or "plant closing" within the meaning of 29 U.S.C. §2101 and Cal. Lab. Code §1400 et seq., and the basis on which any 60-day notice obligation has been satisfied or excepted.</li>
</ol>`,
    },
    {
      sectionId: "terms",
      title: "Request for alternative employment information",
      instruction: "Request list of open positions; confirm consideration of redeployment.",
      scaffold: `<p>I would also like to receive:</p>
<ul>
  <li>A current list of open positions at all levels within the Company and its affiliates, with application instructions;</li>
  <li>Confirmation of the Company's approach to redeployment, including consideration of roles below my current level.</li>
</ul>`,
      constraints: ["MUST request open positions list."],
      example: `<p>I would also like to receive:</p>
<ul>
  <li>A current list of open positions at all levels within the Company and its affiliates, with application instructions;</li>
  <li>Confirmation of the Company's approach to redeployment, including consideration of roles below my current level.</li>
</ul>`,
    },
    {
      sectionId: "outcome_sought",
      title: "Suggestions to avoid the RIF",
      instruction: "Optional alternatives.",
      scaffold: `<p>I would also like to suggest the following alternatives:</p>
<ul>
  <li>{{alternative1}}</li>
  <li>{{alternative2}}</li>
</ul>`,
      constraints: ["MUST be specific and credible."],
      example: `<p>I would also like to suggest the following alternatives:</p>
<ul>
  <li>A voluntary separation window across the wider Group Marketing function.</li>
  <li>A secondment to the Brand team's Northwood project (October 2026 to March 2027).</li>
  <li>A reduction to four working days per week with corresponding compensation adjustment.</li>
</ul>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve rights including Title VII, ADA, ADEA, WARN, state-law analogues.",
      scaffold: `<p>I reserve all of my rights, including without limitation rights under Title VII, the ADA, the ADEA, the WARN Act, and applicable state law. Nothing in this letter should be construed as a waiver of any right or as acceptance of the proposed RIF or any selection decision.</p>`,
      constraints: [
        "MUST reserve federal and state-law rights.",
      ],
      example: `<p>I reserve all of my rights, including without limitation rights under Title VII, the ADA, the ADEA, the WARN Act, the California WARN Act (Cal. Lab. Code §1400 et seq.), and the California Fair Employment and Housing Act. Nothing in this letter should be construed as a waiver of any right or as acceptance of the proposed RIF or any selection decision.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Sincerely,'.",
      scaffold: `<p>I look forward to your responses ahead of our next consultation meeting.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>I look forward to your responses ahead of our next consultation meeting.</p>
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
