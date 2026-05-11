import type { LetterTemplate } from "../types";

export const PIP_RESPONSE_UK: LetterTemplate = {
  letterType: "pip_response",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK PIP Response — EMPLOYEE MODE):
- Performance Improvement Plan (PIP) typically precedes capability dismissal under s.98(2)(a) ERA 1996. Engaging with the PIP — without conceding the underlying performance issue — preserves the writer's position and may demonstrate that any subsequent dismissal failed the band-of-reasonable-responses test (Iceland Frozen Foods v Jones [1983]).
- ACAS Code applies to capability process: warnings, hearings, the right to be accompanied (s.10 ERelA 1999).
- Where the underlying performance concern is or may be linked to disability under the Equality Act 2010, the duty to make reasonable adjustments under ss.20-22 EqA may apply — flag this and request OH referral.
- Constructive but defensive tone: engage with each objective, identify ambiguity, request tools, training, OH referral, and reasonable adjustments. Do NOT concede that performance is below standard. Reserve the right to grieve if the PIP is unfounded.
- British English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Line manager and HR.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Mr Marcus Chen<br>Head of Marketing<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Response to Performance Improvement Plan dated {{pipDate}}</strong></p>`,
      constraints: ["MUST reference the PIP date."],
      example: `<p><strong>Response to Performance Improvement Plan dated 5 May 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific or first name.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "opening",
      title: "Acknowledgement",
      instruction:
        "Acknowledge receipt of the PIP. Confirm willingness to engage. Reserve position on the underlying performance assessment.",
      scaffold: `<p>I acknowledge receipt of the Performance Improvement Plan dated {{pipDate}}. I am willing to engage constructively with the PIP and have set out below my response to each of the objectives, together with the support I will need from the Company to give them a fair opportunity to be met. I do not, by engaging with this process, accept the underlying assessment of my performance, on which I reserve my position.</p>`,
      constraints: [
        "MUST acknowledge receipt with date.",
        "MUST signal willingness to engage.",
        "MUST reserve position on the underlying assessment.",
      ],
      example: `<p>I acknowledge receipt of the Performance Improvement Plan dated 5 May 2026. I am willing to engage constructively with the PIP and have set out below my response to each of the objectives, together with the support I will need from the Company to give them a fair opportunity to be met. I do not, by engaging with this process, accept the underlying assessment of my performance, on which I reserve my position.</p>`,
    },
    {
      sectionId: "body",
      title: "Engagement with each objective",
      instruction:
        "For each PIP objective: state objective, identify any ambiguity, propose a precise restated objective (SMART), and identify what information / measurement basis is needed. Numbered list of objectives. Be constructive — not refusal, not capitulation.",
      scaffold: `<p>I engage with the objectives as follows:</p>
<ol>
  <li><strong>Objective 1:</strong> {{objective1AsStated}}<br><em>Response:</em> {{objective1Response}}</li>
  <li><strong>Objective 2:</strong> {{objective2AsStated}}<br><em>Response:</em> {{objective2Response}}</li>
  <li><strong>Objective 3:</strong> {{objective3AsStated}}<br><em>Response:</em> {{objective3Response}}</li>
</ol>`,
      constraints: [
        "MUST address each objective individually.",
        "MUST identify ambiguity / unmeasurability where present.",
        "MUST propose precise SMART restatements where the original is unclear.",
        "MUST NOT capitulate to vague objectives.",
        "MUST NOT refuse to engage.",
      ],
      example: `<p>I engage with the objectives as follows:</p>
<ol>
  <li><strong>Objective 1:</strong> "Improve quality of campaign outputs to meet the standard expected of the role."<br><em>Response:</em> The objective is, as drafted, ambiguous: "quality" and "the standard expected" are not defined. I would suggest restating it as: "Deliver each Q2 campaign brief in accordance with the Group Marketing Brief Template and within the agreed timeline; the quality benchmark to be agreed at the kick-off meeting for each campaign with reference to specific named comparator briefs from FY2025." I have a clean Q1 review on file (4/5 across all dimensions) and request that the Company identify the specific Q2 outputs that have given rise to the concern, with examples.</li>
  <li><strong>Objective 2:</strong> "Demonstrate stronger leadership in cross-functional meetings."<br><em>Response:</em> Again ambiguous and unmeasurable as drafted. I would suggest restating it as: "Lead the weekly cross-functional Q2 launch stand-up, including circulating an agenda 24 hours in advance and capturing actions and owners; receive a written feedback summary from the Brand and Insights leads at the mid-PIP review." I have led the equivalent stand-up for the past two quarters without prior negative feedback.</li>
  <li><strong>Objective 3:</strong> "Resolve concerns raised by stakeholders about responsiveness."<br><em>Response:</em> I have not been told which stakeholders, what concerns, or what dates these relate to. I ask that the Company identify the stakeholders and the specific instances so that I can engage. In the absence of specifics this objective is, in my view, unfair and unmeasurable.</li>
</ol>`,
    },
    {
      sectionId: "terms",
      title: "Tools, training, OH and adjustments requested",
      instruction:
        "List the support requested: tools, training, additional time, OH referral, reasonable adjustments under EqA where applicable, mid-point review.",
      scaffold: `<p>For me to be given a fair opportunity to meet the objectives, I request the following:</p>
<ul>
  <li>{{toolsTraining}}</li>
  <li>{{ohReferral}}</li>
  <li>{{reasonableAdjustments}}</li>
  <li>{{midPointReview}}</li>
</ul>`,
      constraints: [
        "MUST request specific tools / training / OH referral / adjustments.",
        "MUST request a mid-PIP review.",
      ],
      example: `<p>For me to be given a fair opportunity to meet the objectives, I request the following:</p>
<ul>
  <li>Access to the FY2025 comparator briefs referenced above and a session with the Insights Lead on the agreed quality benchmark, by 19 May 2026.</li>
  <li>An occupational health referral, given that I have been managing a long-term condition that may, as I have previously informed HR, affect my capacity in long meetings — I would welcome the opportunity to discuss reasonable adjustments under sections 20-22 of the Equality Act 2010.</li>
  <li>A formal mid-PIP review meeting at the four-week point with written feedback against each objective.</li>
  <li>The right to be accompanied at any review meeting under section 10 of the Employment Relations Act 1999.</li>
</ul>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of right to grieve",
      instruction:
        "Reserve the right to raise a formal grievance if the PIP is unfounded, ambiguous, or part of a wider unfair pattern. Reserve all rights generally.",
      scaffold: `<p>I reserve all my rights, including the right to raise a formal grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures should I conclude that the PIP is unfounded, has been used inappropriately, or has not been administered fairly. Nothing in this letter constitutes acceptance of the underlying performance assessment or a waiver of any right.</p>`,
      constraints: [
        "MUST reserve the right to grieve.",
        "MUST disclaim acceptance of the underlying assessment.",
      ],
      example: `<p>I reserve all my rights, including the right to raise a formal grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures should I conclude that the PIP is unfounded, has been used inappropriately, or has not been administered fairly. Nothing in this letter constitutes acceptance of the underlying performance assessment or a waiver of any right.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Yours sincerely,' or 'Kind regards,'.",
      scaffold: `<p>I look forward to the kick-off meeting and to engaging constructively with the process.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST be constructive and brief."],
      example: `<p>I look forward to the kick-off meeting and to engaging constructively with the process.</p>
<p>Kind regards,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}</p>`,
      constraints: ["MUST be name and role."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "pip_document",
      label: "The PIP document",
      required: true,
      description: "The performance plan you are responding to — objectives, timeline, evaluator names.",
      expectedKinds: ["document"],
    },
    {
      key: "objectives_evidence",
      label: "Evidence of meeting / missing objectives",
      required: false,
      description: "Per-objective: emails, dashboards, deliverable links, peer feedback.",
      expectedKinds: ["email", "screenshot", "document"],
    },
    {
      key: "prior_1to1s",
      label: "Prior 1:1 notes",
      required: false,
      description: "Your manager's prior feedback (or absence of it) on the same objectives.",
      expectedKinds: ["note", "document"],
    },
    {
      key: "context_factors",
      label: "Context factors",
      required: false,
      description: "Reasonable-adjustment requests, sickness, dependency on others, workload pivots.",
      expectedKinds: ["email", "note"],
    },
  ],
};

export const PIP_RESPONSE_US: LetterTemplate = {
  letterType: "pip_response",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US PIP Response — EMPLOYEE MODE):
- A PIP often precedes for-cause termination in at-will employment. Documenting engagement is important for: (i) defeating later assertions of unsatisfactory performance; (ii) preserving discrimination / retaliation arguments; (iii) demonstrating good-faith engagement.
- Where ADA disability is implicated, the interactive process should be triggered alongside the PIP.
- For pregnancy / new-parent, PWFA (42 U.S.C. §2000gg) accommodations may apply.
- Reserve right to file an internal complaint or EEOC charge if the PIP is pretextual.
- Constructive but defensive. Do NOT concede performance is substandard. American English.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. Line manager and HR.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Mr. Marcus Chen<br>Head of Marketing<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>.",
      scaffold: `<p><strong>Response to Performance Improvement Plan dated {{pipDate}}</strong></p>`,
      constraints: ["MUST reference PIP date."],
      example: `<p><strong>Response to Performance Improvement Plan dated May 5, 2026</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific or first name.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "opening",
      title: "Acknowledgement",
      instruction: "Acknowledge receipt; signal engagement; reserve position on underlying assessment.",
      scaffold: `<p>I acknowledge receipt of the Performance Improvement Plan dated {{pipDate}}. I am willing to engage constructively with the PIP and have set out below my response to each objective, together with the support I will need to be given a fair opportunity to meet them. I do not, by engaging with this process, accept the underlying assessment of my performance, on which I reserve my position.</p>`,
      constraints: [
        "MUST acknowledge.",
        "MUST signal engagement.",
        "MUST reserve position on assessment.",
      ],
      example: `<p>I acknowledge receipt of the Performance Improvement Plan dated May 5, 2026. I am willing to engage constructively with the PIP and have set out below my response to each objective, together with the support I will need to be given a fair opportunity to meet them. I do not, by engaging with this process, accept the underlying assessment of my performance, on which I reserve my position.</p>`,
    },
    {
      sectionId: "body",
      title: "Engagement with each objective",
      instruction: "For each: state, identify ambiguity, propose SMART restatement, request data.",
      scaffold: `<p>I engage with the objectives as follows:</p>
<ol>
  <li><strong>Objective 1:</strong> {{objective1AsStated}}<br><em>Response:</em> {{objective1Response}}</li>
  <li><strong>Objective 2:</strong> {{objective2AsStated}}<br><em>Response:</em> {{objective2Response}}</li>
  <li><strong>Objective 3:</strong> {{objective3AsStated}}<br><em>Response:</em> {{objective3Response}}</li>
</ol>`,
      constraints: [
        "MUST address each objective individually.",
        "MUST identify ambiguity.",
        "MUST propose SMART restatements.",
        "MUST NOT capitulate or refuse.",
      ],
      example: `<p>I engage with the objectives as follows:</p>
<ol>
  <li><strong>Objective 1:</strong> "Improve quality of campaign outputs to meet the standard expected of the role."<br><em>Response:</em> "Quality" and "the standard expected" are not defined. I would suggest restating as: "Deliver each Q2 campaign brief in accordance with the Group Marketing Brief Template and within the agreed timeline; quality benchmark to be agreed at kick-off with reference to specific named comparator briefs from FY2025." My Q1 review is clean (4/5 across all dimensions); please identify the specific Q2 outputs that have given rise to the concern.</li>
  <li><strong>Objective 2:</strong> "Demonstrate stronger leadership in cross-functional meetings."<br><em>Response:</em> Ambiguous as drafted. Suggested restatement: "Lead the weekly cross-functional Q2 launch stand-up, circulating an agenda 24 hours in advance and capturing actions; receive a written feedback summary from the Brand and Insights leads at mid-PIP."</li>
  <li><strong>Objective 3:</strong> "Resolve concerns raised by stakeholders about responsiveness."<br><em>Response:</em> Please identify the stakeholders, the concerns, and the dates. In the absence of specifics this objective is unmeasurable.</li>
</ol>`,
    },
    {
      sectionId: "terms",
      title: "Tools, training, accommodations requested",
      instruction:
        "Tools, training, ADA / PWFA interactive process where applicable, mid-PIP review.",
      scaffold: `<p>For me to be given a fair opportunity to meet the objectives, I request the following:</p>
<ul>
  <li>{{toolsTraining}}</li>
  <li>{{adaInteractiveProcess}}</li>
  <li>{{midPointReview}}</li>
</ul>`,
      constraints: [
        "MUST request specific support.",
        "MUST signal ADA interactive process where disability is in issue.",
        "MUST request mid-PIP review.",
      ],
      example: `<p>For me to be given a fair opportunity to meet the objectives, I request the following:</p>
<ul>
  <li>Access to the FY2025 comparator briefs referenced above and a session with the Insights Lead on the agreed quality benchmark by May 19, 2026.</li>
  <li>To the extent that any of my long-term medical condition (previously disclosed to HR) is relevant, I request an interactive process under the ADA (29 C.F.R. §1630.2(o)(3)) to discuss any reasonable accommodation that would assist me in meeting the objectives.</li>
  <li>A formal mid-PIP review at the four-week point with written feedback against each objective.</li>
</ul>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve right to file internal complaint or EEOC charge if PIP is pretextual.",
      scaffold: `<p>I reserve all of my rights, including the right to file an internal complaint or a charge with the U.S. Equal Employment Opportunity Commission or {{stateAgency}} should I conclude that the PIP is pretextual or has been administered unfairly. Nothing in this letter constitutes acceptance of the underlying performance assessment or a waiver of any right.</p>`,
      constraints: [
        "MUST reserve EEOC / state agency rights.",
        "MUST disclaim acceptance.",
      ],
      example: `<p>I reserve all of my rights, including the right to file an internal complaint or a charge with the U.S. Equal Employment Opportunity Commission or the California Civil Rights Department should I conclude that the PIP is pretextual or has been administered unfairly. Nothing in this letter constitutes acceptance of the underlying performance assessment or a waiver of any right.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short. 'Sincerely,' or 'Best regards,'.",
      scaffold: `<p>I look forward to the kick-off meeting and to engaging constructively with the process.</p>
<p>{{signOff}}</p>`,
      constraints: ["MUST be constructive and brief."],
      example: `<p>I look forward to the kick-off meeting and to engaging constructively with the process.</p>
<p>Best regards,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}</p>`,
      constraints: ["MUST be name and role."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "pip_document",
      label: "The PIP document",
      required: true,
      description: "The performance plan you are responding to — objectives, timeline, evaluator names.",
      expectedKinds: ["document"],
    },
    {
      key: "objectives_evidence",
      label: "Evidence of meeting / missing objectives",
      required: false,
      description: "Per-objective: emails, dashboards, deliverable links, peer feedback.",
      expectedKinds: ["email", "screenshot", "document"],
    },
    {
      key: "prior_1to1s",
      label: "Prior 1:1 notes",
      required: false,
      description: "Your manager's prior feedback (or absence of it) on the same objectives.",
      expectedKinds: ["note", "document"],
    },
    {
      key: "context_factors",
      label: "Context factors",
      required: false,
      description: "Reasonable-adjustment requests, sickness, dependency on others, workload pivots.",
      expectedKinds: ["email", "note"],
    },
  ],
};
