import type { LetterTemplate } from "../types";

export const ACCOMMODATION_REQUEST_UK: LetterTemplate = {
  letterType: "accommodation_request",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Reasonable Adjustments — EMPLOYEE MODE):
- Equality Act 2010 ss.20-22 — duty to make reasonable adjustments where a provision, criterion or practice (PCP), a physical feature, or the absence of an auxiliary aid places a disabled employee at a substantial disadvantage compared with non-disabled comparators.
- "Disability" under s.6 EqA: a physical or mental impairment with a substantial and long-term adverse effect on the ability to carry out normal day-to-day activities.
- The duty is anticipatory in some contexts but, in employment, generally arises once the employer knows or ought reasonably to know of the disability and the disadvantage.
- Disclose only what the employee chooses — the employee is not required to disclose a diagnosis to engage the duty; disclosing the impairment in functional terms (the barrier and the adjustment) is generally sufficient.
- Frame as barriers + adjustments, not as capability failure.
- Request OH referral / interactive meeting.
- Tone: professional, business-case-led. Not adversarial. British English.
- This letter is not by itself tribunal-bound but a poorly handled response to it can found a discrimination claim. Reserve rights briefly.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "UK date format. Address to line manager and copy to HR, or to HR direct where preferred.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use UK date format."],
      example: `<p>12 May 2026<br><br>Mr Marcus Chen<br>Head of Marketing<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies as a request for reasonable adjustments under the Equality Act 2010. Mark as 'Private and Confidential'.",
      scaffold: `<p><strong>Private and Confidential — Request for Reasonable Adjustments under the Equality Act 2010</strong></p>`,
      constraints: [
        "MUST mark Private and Confidential.",
        "MUST cite the Equality Act 2010.",
      ],
      example: `<p><strong>Private and Confidential — Request for Reasonable Adjustments under the Equality Act 2010</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific or first name appropriate to relationship.",
      scaffold: `<p>Dear {{recipientFirstNameOrHonorific}},</p>`,
      constraints: ["MUST be one line."],
      example: `<p>Dear Marcus,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statutory basis and disclosure scope",
      instruction:
        "State the request is made under sections 20-22 of the Equality Act 2010. Disclose the impairment in functional terms only, to the extent the writer is content to disclose. The writer can choose how much to disclose; the duty is engaged once the employer knows or ought to know of the disability and disadvantage.",
      scaffold: `<p>I am writing to request reasonable adjustments under sections 20 to 22 of the Equality Act 2010. I have a disability within the meaning of section 6 of the Act, namely {{impairmentDescription}}, which has a substantial and long-term adverse effect on my ability to carry out certain day-to-day activities. I disclose this in confidence and ask that the contents of this letter be treated as confidential under the Company's data protection obligations.</p>`,
      constraints: [
        "MUST cite ss.20-22 and s.6 Equality Act 2010.",
        "MUST disclose the impairment in functional terms (the writer chooses how detailed).",
        "MUST request confidentiality.",
        "MUST NOT include detail beyond what the writer is content to disclose.",
      ],
      example: `<p>I am writing to request reasonable adjustments under sections 20 to 22 of the Equality Act 2010. I have a disability within the meaning of section 6 of the Act, namely a long-term auditory processing impairment with associated migraine, which has a substantial and long-term adverse effect on my ability to participate in long meetings, work in environments with significant background noise, and tolerate prolonged exposure to fluorescent lighting. I disclose this in confidence and ask that the contents of this letter be treated as confidential under the Company's data protection obligations.</p>`,
    },
    {
      sectionId: "body",
      title: "Barriers to job tasks",
      instruction:
        "Identify the specific PCPs / physical features / absence of aids that place the writer at a substantial disadvantage. Focus on the BARRIER, not the impairment. Be specific to the writer's role.",
      scaffold: `<p>The aspects of my role that currently present barriers to performance are:</p>
<ul>
  <li>{{barrier1Description}}</li>
  <li>{{barrier2Description}}</li>
  <li>{{barrier3Description}}</li>
</ul>`,
      constraints: [
        "MUST identify specific barriers (PCPs, physical features, aids).",
        "MUST link barriers to specific role tasks.",
        "MUST NOT describe inability to do the role.",
      ],
      example: `<p>The aspects of my role that currently present barriers to performance are:</p>
<ul>
  <li>The two-hour weekly leadership meeting on Mondays from 09.00, held in conference room C, where the lighting and ventilation noise consistently trigger migraine symptoms by mid-morning.</li>
  <li>The current open-plan seating in the marketing pod, where I am directly under a fluorescent strip and adjacent to a high-traffic corridor.</li>
  <li>The expectation that I lead live-streamed product launches with no captioning or interpreter support, where the auditory load combined with simultaneous Q&A triggers symptoms within 20-30 minutes.</li>
</ul>`,
    },
    {
      sectionId: "terms",
      title: "Specific adjustments requested",
      instruction:
        "Pair each barrier with a specific, practicable adjustment. Be specific. The employer can propose alternatives but specificity drives the interactive process.",
      scaffold: `<p>The adjustments I request are:</p>
<ul>
  <li>{{adjustment1Description}}</li>
  <li>{{adjustment2Description}}</li>
  <li>{{adjustment3Description}}</li>
</ul>
<p>I am open to discussing alternative adjustments that would achieve the same outcome.</p>`,
      constraints: [
        "MUST pair each barrier with a specific adjustment.",
        "MUST be specific (location, equipment, schedule, method).",
        "MUST signal openness to alternatives.",
      ],
      example: `<p>The adjustments I request are:</p>
<ul>
  <li>That the leadership meeting on Mondays be moved to Tuesdays at 11.00 in conference room A (which has natural light and is acoustically separated from the ventilation plant), or in the alternative that I be permitted to attend the Monday meeting via Teams from a quiet location.</li>
  <li>That my desk be relocated to the quiet zone on the south side of the third floor, with a desk lamp and the overhead fluorescent strip switched off above my workstation.</li>
  <li>That live captioning be enabled (Teams Live Captions or a contracted interpreter) for product launches I host, and that Q&A be moderated through a written-question queue rather than live audio where reasonably practicable.</li>
</ul>
<p>I am open to discussing alternative adjustments that would achieve the same outcome.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for OH referral / interactive meeting",
      instruction:
        "Offer to attend an OH appointment to support the assessment. Request a meeting with HR / line manager to discuss. Confirm willingness to share an OH report (with consent under the Access to Medical Reports Act 1988) where one would assist.",
      scaffold: `<p>I am willing to be referred to occupational health to inform the assessment of these adjustments and, with my consent under the Access to Medical Reports Act 1988, to share any OH report with the Company. I would welcome a meeting in the next two weeks to discuss this request and any practical concerns. In the interim, please confirm receipt of this letter.</p>`,
      constraints: [
        "MUST offer OH referral.",
        "MUST cite the Access to Medical Reports Act 1988 where consent to share is offered.",
        "MUST request a meeting.",
      ],
      example: `<p>I am willing to be referred to occupational health to inform the assessment of these adjustments and, with my consent under the Access to Medical Reports Act 1988, to share any OH report with the Company. I would welcome a meeting in the next two weeks to discuss this request and any practical concerns. In the interim, please confirm receipt of this letter.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Polite. 'Yours sincerely,'.",
      scaffold: `<p>Thank you for considering this request. I look forward to working with you to put the adjustments in place.</p>
<p>Yours sincerely,</p>`,
      constraints: ["MUST use 'Yours sincerely,'."],
      example: `<p>Thank you for considering this request. I look forward to working with you to put the adjustments in place.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role, employee number.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST be name, title, employee number."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee No. 04231</p>`,
    },
  ],
};

export const ACCOMMODATION_REQUEST_US: LetterTemplate = {
  letterType: "accommodation_request",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US ADA / PWFA Accommodation Request — EMPLOYEE MODE):
- Americans with Disabilities Act (ADA) Title I, 42 U.S.C. §12112(b)(5) — duty to provide reasonable accommodation to a qualified individual with a disability, absent undue hardship.
- The interactive process is triggered once the employee requests an accommodation; the employer must engage in good-faith dialogue (29 C.F.R. §1630.2(o)(3); EEOC Enforcement Guidance).
- Pregnant Workers Fairness Act (PWFA), 42 U.S.C. §2000gg — accommodations for pregnancy, childbirth, and related medical conditions.
- State law: California FEHA (Cal. Gov. Code §12940(m)), New York State Human Rights Law (N.Y. Exec. Law §296), and others may be more protective.
- Frame as barriers + accommodations, not as inability to perform the role. Affirm ability to perform the essential functions with the accommodation.
- Request the interactive meeting expressly.
- Disclose only as much medical detail as needed to substantiate the request — the writer may submit medical documentation through HR or directly to a third-party administrator.
- Tone: professional, business-case-led. American English. Reserve rights briefly.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction: "US date format. HR / line manager. Mark Confidential.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Ms. Priya Sharma<br>Chief People Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction: "Single <p>, <strong>. Mark Confidential.",
      scaffold: `<p><strong>Confidential — Request for Reasonable Accommodation under the ADA{{additionalStatutes}}</strong></p>`,
      constraints: [
        "MUST mark Confidential.",
        "MUST cite the ADA (and PWFA / state law where relevant).",
      ],
      example: `<p><strong>Confidential — Request for Reasonable Accommodation under the ADA and Cal. Gov. Code §12940(m)</strong></p>`,
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
      title: "Statutory basis and disclosure scope",
      instruction:
        "Cite the ADA, PWFA, and state law as applicable. Affirm ability to perform essential job functions with the accommodation. Disclose impairment in functional terms only.",
      scaffold: `<p>I am writing to request a reasonable accommodation under the Americans with Disabilities Act (42 U.S.C. §12112(b)(5)){{additionalStatutes}}. I have a disability as defined in 42 U.S.C. §12102(1), namely {{impairmentDescription}}, which substantially limits one or more major life activities. I am able to perform the essential functions of my role with the accommodations set out below, and I ask that the Company engage with me in the interactive process to identify and implement them.</p>`,
      constraints: [
        "MUST cite the ADA (and PWFA / state law where relevant).",
        "MUST affirm ability to perform essential functions with accommodation.",
        "MUST disclose impairment in functional terms.",
        "MUST NOT include detail beyond what is necessary.",
      ],
      example: `<p>I am writing to request a reasonable accommodation under the Americans with Disabilities Act (42 U.S.C. §12112(b)(5)) and California Fair Employment and Housing Act (Cal. Gov. Code §12940(m)). I have a disability as defined in 42 U.S.C. §12102(1), namely a long-term auditory processing impairment with associated migraine, which substantially limits the major life activities of hearing and concentrating. I am able to perform the essential functions of my role with the accommodations set out below, and I ask that the Company engage with me in the interactive process to identify and implement them.</p>`,
    },
    {
      sectionId: "body",
      title: "Barriers to job tasks",
      instruction: "Specific barriers tied to specific role tasks.",
      scaffold: `<p>The aspects of my role that currently present barriers are:</p>
<ul>
  <li>{{barrier1}}</li>
  <li>{{barrier2}}</li>
  <li>{{barrier3}}</li>
</ul>`,
      constraints: [
        "MUST identify specific barriers.",
        "MUST link to role tasks.",
      ],
      example: `<p>The aspects of my role that currently present barriers are:</p>
<ul>
  <li>The two-hour weekly leadership meeting on Mondays at 9:00am in conference room C, where the lighting and ventilation noise trigger migraine symptoms by mid-morning.</li>
  <li>The open-plan seating in the marketing pod, where I am directly under a fluorescent strip and adjacent to a high-traffic corridor.</li>
  <li>The expectation that I lead live-streamed product launches with no captioning, where the auditory load triggers symptoms within 20-30 minutes.</li>
</ul>`,
    },
    {
      sectionId: "terms",
      title: "Specific accommodations requested",
      instruction:
        "Pair each barrier with a specific accommodation. Signal openness to alternatives — this is the interactive process.",
      scaffold: `<p>The accommodations I request are:</p>
<ul>
  <li>{{accommodation1}}</li>
  <li>{{accommodation2}}</li>
  <li>{{accommodation3}}</li>
</ul>
<p>I am open to discussing alternative accommodations that would achieve the same outcome.</p>`,
      constraints: [
        "MUST pair each barrier with a specific accommodation.",
        "MUST signal openness to alternatives.",
      ],
      example: `<p>The accommodations I request are:</p>
<ul>
  <li>That the leadership meeting on Mondays be moved to Tuesdays at 11:00am in conference room A (which has natural light and is acoustically separated from the ventilation plant), or in the alternative that I be permitted to attend via Teams from a quiet location.</li>
  <li>That my desk be relocated to the quiet zone on the south side of the third floor, with a desk lamp and the overhead fluorescent strip switched off above my workstation.</li>
  <li>That live captioning be enabled for product launches I host, and that Q&A be moderated through a written-question queue rather than live audio where practicable.</li>
</ul>
<p>I am open to discussing alternative accommodations that would achieve the same outcome.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for interactive meeting / medical documentation",
      instruction:
        "Request an interactive meeting. Offer to provide medical documentation through HR or a third-party administrator. Reference the EEOC Enforcement Guidance on the interactive process.",
      scaffold: `<p>I request an interactive meeting in the next two weeks to discuss this request, consistent with the EEOC's guidance on the interactive process (29 C.F.R. §1630.2(o)(3)). I am willing to provide reasonable medical documentation in support of the request, through HR or a third-party administrator as the Company prefers. Please confirm receipt of this letter and the proposed meeting time.</p>`,
      constraints: [
        "MUST request an interactive meeting.",
        "MUST cite 29 C.F.R. §1630.2(o)(3).",
        "MUST offer medical documentation.",
      ],
      example: `<p>I request an interactive meeting in the next two weeks to discuss this request, consistent with the EEOC's guidance on the interactive process (29 C.F.R. §1630.2(o)(3)). I am willing to provide reasonable medical documentation in support of the request, through HR or a third-party administrator as the Company prefers. Please confirm receipt of this letter and the proposed meeting time.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Polite. 'Sincerely,'.",
      scaffold: `<p>Thank you for considering this request. I look forward to working with you to put the accommodations in place.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>Thank you for considering this request. I look forward to working with you to put the accommodations in place.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role, employee ID.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: ["MUST be name, title, employee ID."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee ID 04231</p>`,
    },
  ],
};
