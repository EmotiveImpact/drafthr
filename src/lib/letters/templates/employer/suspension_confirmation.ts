import type { LetterTemplate } from "../types";

export const SUSPENSION_CONFIRMATION_UK: LetterTemplate = {
  letterType: "suspension_confirmation",
  jurisdiction: "UK",
  evidenceTier: "medium",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Confirmation of Suspension):
- This letter confirms in writing that the employee is suspended while an allegation is investigated. It is the first letter of a disciplinary process, not an outcome.
- Follow paragraph 8 of the Acas Code of Practice on Disciplinary and Grievance Procedures: where suspension with pay is considered necessary, it should be as brief as possible, kept under review, and it must be made clear that suspension is not a disciplinary action.
- Follow the Acas guidance on suspension: give the reason, the date it started, how long it is expected to last and when it will be reviewed, the pay that applies, what the employee may and may not do, who to contact, and the support available.
- State plainly that suspension is not a disciplinary sanction and that no finding or decision has been made. The allegation is described in outline only, as an allegation.
- Pay: suspension is normally on full pay, including normal contractual benefits. Suspension on reduced or no pay is only lawful where the contract expressly allows it; otherwise it is likely to be an unlawful deduction from wages (Part II Employment Rights Act 1996). If suspensionPay is not true, describe the contractual pay that applies and add a [TBD] asking the user to confirm the contractual basis.
- Conditions must be proportionate: not contacting witnesses about the allegation, staying available for investigation meetings during normal working hours, not attending site or accessing systems without permission. The employee must still be able to contact their named contact, a trade union representative, and occupational health or the Employee Assistance Programme.
- If the ukRegion is Northern Ireland, the Labour Relations Agency Code of Practice on Disciplinary and Grievance Procedures applies in place of the Acas Code.
- Register: brief, calm, neutral and factual. No language that suggests guilt, and no expressions of regret that could be read as prejudging the matter. Plain English. British English spelling throughout. No em dashes.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then the employee's full legal name and home address. Mark the letter private and confidential above the name.",
      scaffold: `<p>{{issueDateUK}}<br><br>Private and confidential<br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST mark the letter 'Private and confidential'.",
        "MUST NOT include any greeting here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>Private and confidential<br>Mr Daniel Okafor<br>14 Rosewood Avenue<br>London N4 2QX</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Confirmation of suspension on full pay', or 'Confirmation of suspension' where full pay does not apply.",
      scaffold: `<p><strong>Confirmation of suspension{{onFullPaySuffix}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST NOT use the words 'disciplinary action', 'misconduct' or 'gross misconduct' in the subject.",
        "MUST NOT say 'on full pay' unless suspensionPay is true.",
      ],
      example: `<p><strong>Confirmation of suspension on full pay</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Render exactly one short <p>: 'Dear Mr/Ms/Dr {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Mr Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Confirmation of suspension",
      instruction:
        "Confirm in one short paragraph that the employee has been suspended from work from the suspension date while an allegation is investigated, and refer to the conversation in which they were told, if there was one.",
      scaffold: `<p>I am writing to confirm what {{toldByName}} explained to you on {{suspensionDate}}: you are suspended from work with effect from {{suspensionDate}} while we investigate an allegation that has been made. This letter sets out what that means for you.</p>`,
      constraints: [
        "MUST state the date the suspension started.",
        "MUST say the suspension is so that an allegation can be investigated.",
        "MUST NOT describe the employee as having committed misconduct.",
      ],
      example: `<p>I am writing to confirm what Aisha Khan explained to you on 11 May 2026: you are suspended from work with effect from 11 May 2026 while we investigate an allegation that has been made. This letter sets out what that means for you.</p>`,
    },
    {
      sectionId: "body",
      title: "Allegation and reason",
      instruction:
        "Describe the allegation in outline, as an allegation, in one or two sentences. Give the reason suspension was needed (for example to protect evidence or witnesses, or because of a risk to others) and, where known, that alternatives were considered. Then state clearly that suspension is not a disciplinary sanction and that no finding or decision has been made.",
      scaffold: `<p>The allegation is that {{allegationSummary}}. We have decided that suspension is necessary because {{suspensionReasonText}}. {{alternativesConsideredSentence}}</p>
<p>Suspension is not a disciplinary sanction and it does not mean that any decision has been made about the allegation. It is a neutral act to allow the matter to be investigated fairly. You will have a full opportunity to give your account.</p>`,
      constraints: [
        "MUST describe the allegation in outline only and as an allegation ('it is alleged that').",
        "MUST give the reason suspension is necessary.",
        "MUST state that suspension is not a disciplinary sanction (Acas Code para 8).",
        "MUST state that no finding or decision has been made.",
        "MUST NOT name the person who raised the allegation or any witness.",
        "MUST NOT use language that suggests guilt or prejudges the outcome.",
      ],
      example: `<p>The allegation is that on 9 May 2026 you removed stock from the Hackney warehouse without authorisation. We have decided that suspension is necessary because the investigation will involve speaking to colleagues you work alongside each day, and we need to make sure the evidence can be gathered without any concern that it has been affected. We considered whether a temporary move to another site would be enough, but concluded that it would not.</p>
<p>Suspension is not a disciplinary sanction and it does not mean that any decision has been made about the allegation. It is a neutral act to allow the matter to be investigated fairly. You will have a full opportunity to give your account.</p>`,
    },
    {
      sectionId: "terms",
      title: "Pay, duration and review",
      instruction:
        "State the pay that applies during suspension (full pay and normal benefits, or the contractual pay that applies). Say how long the suspension is expected to last, that it will be kept as short as possible, and when it will next be reviewed. Say the employee will be told in writing of the outcome of each review.",
      scaffold: `<p>{{suspensionPayParagraph}}</p>
<p>We expect the suspension to last no longer than {{expectedDuration}} and we will keep it as short as possible. We will review it regularly, and the first review will take place by {{suspensionReviewDate}}. We will write to you after each review to confirm whether the suspension continues and why.</p>`,
      constraints: [
        "MUST state the pay that applies during suspension.",
        "MUST say 'full pay' only where suspensionPay is true; otherwise describe the contractual pay and add a [TBD] asking the user to confirm the contract allows it.",
        "MUST say how long the suspension is expected to last.",
        "MUST say the suspension will be kept under regular review and give the first review date, or a [TBD] if none is supplied.",
        "MUST NOT state an open-ended suspension with no review.",
      ],
      example: `<p>You will continue to receive your full pay and your normal contractual benefits while you are suspended.</p>
<p>We expect the suspension to last no longer than two weeks and we will keep it as short as possible. We will review it regularly, and the first review will take place by 18 May 2026. We will write to you after each review to confirm whether the suspension continues and why.</p>`,
    },
    {
      sectionId: "conditions",
      title: "During your suspension",
      instruction:
        "Set out, as a short list, what the employee must and must not do during suspension. Keep the conditions proportionate and explain that they protect the investigation. Make clear who they may still contact.",
      scaffold: `<p>While you are suspended, we ask that you:</p>
<ul><li>do not attend {{workplaceName}} or any other company site unless {{contactName}} has agreed in advance;</li><li>do not contact colleagues, customers or suppliers about the allegation, and in particular do not contact anyone who may be a witness;</li><li>do not access company systems other than {{permittedSystems}};</li><li>stay available during your normal working hours so that you can attend investigation meetings, and let {{contactName}} know if you are unwell or wish to take holiday.</li></ul>
<p>These conditions are there to protect the investigation, and they are not a sign that any decision has been made. You may still contact {{contactName}}, a trade union representative, occupational health or the Employee Assistance Programme at any time.</p>`,
      constraints: [
        "MUST ask the employee not to contact witnesses about the allegation.",
        "MUST ask the employee to stay available during normal working hours.",
        "MUST say the employee may not attend site without permission.",
        "MUST make clear who the employee may still contact.",
        "MUST NOT ban the employee from all contact with every colleague, or from speaking to a trade union representative.",
      ],
      example: `<p>While you are suspended, we ask that you:</p>
<ul><li>do not attend the Hackney warehouse or any other company site unless Helen Carter has agreed in advance;</li><li>do not contact colleagues, customers or suppliers about the allegation, and in particular do not contact anyone who may be a witness;</li><li>do not access company systems other than the People portal and your payslips;</li><li>stay available during your normal working hours so that you can attend investigation meetings, and let Helen Carter know if you are unwell or wish to take holiday.</li></ul>
<p>These conditions are there to protect the investigation, and they are not a sign that any decision has been made. You may still contact Helen Carter, a trade union representative, occupational health or the Employee Assistance Programme at any time.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Contact and next steps",
      instruction:
        "Name the contact for any questions during the suspension, with their contact details. Explain that the employee will be invited to an investigation meeting and will be kept informed of progress.",
      scaffold: `<p>Your contact during the suspension is {{contactName}}, {{contactTitle}}, who you can reach at {{contactDetails}}. {{contactName}} will keep in touch with you regularly and update you on progress. You will be invited in writing to an investigation meeting, where you will be able to give your account.</p>`,
      constraints: [
        "MUST name one contact and give their contact details.",
        "MUST say the employee will be kept informed.",
        "MUST NOT invite the employee to a disciplinary hearing in this letter.",
      ],
      example: `<p>Your contact during the suspension is Helen Carter, People Partner, who you can reach at helen.carter@acme.example or on 020 7946 0011. Helen will keep in touch with you regularly and update you on progress. You will be invited in writing to an investigation meeting, where you will be able to give your account.</p>`,
    },
    {
      sectionId: "closing",
      title: "Support and closing",
      instruction:
        "One short paragraph acknowledging that suspension can be difficult and pointing to support (Employee Assistance Programme, occupational health, wellbeing resources), followed by 'Yours sincerely,'.",
      scaffold: `<p>We recognise that being suspended can be stressful. {{supportParagraph}}</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST point to at least one source of support, such as the Employee Assistance Programme.",
        "MUST use 'Yours sincerely,'.",
        "MUST NOT apologise for the suspension or comment on the allegation.",
      ],
      example: `<p>We recognise that being suspended can be stressful. The Employee Assistance Programme is free and confidential, and you can call it on 0800 123 4567 at any time, day or night. If you would find a referral to occupational health helpful, please tell Helen and she will arrange it.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Three lines: signatory name, signatory title, employer legal name.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>HR Director<br>Acme Holdings Limited</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "allegation_record",
      label: "Record of the allegation",
      required: true,
      description: "The complaint, report or incident note that raised the allegation.",
      expectedKinds: ["email", "document", "note"],
    },
    {
      key: "suspension_decision",
      label: "Suspension decision note",
      required: false,
      description: "Why suspension was needed, who decided, and the alternatives considered.",
      expectedKinds: ["note", "document"],
    },
    {
      key: "contract_suspension_clause",
      label: "Contract or policy on suspension",
      required: false,
      description: "The clause or policy that covers suspension and pay during it.",
      expectedKinds: ["document"],
    },
  ],
};

export const SUSPENSION_CONFIRMATION_US: LetterTemplate = {
  letterType: "suspension_confirmation",
  jurisdiction: "US",
  evidenceTier: "medium",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Paid Administrative Leave Pending Investigation):
- Frame this as paid administrative leave pending an investigation, not as a disciplinary suspension. It is not discipline and no conclusion has been reached.
- Employment is at-will. The letter must not promise any particular process, outcome or length of employment, and must not create an implied contract. Do not say the employee will only be terminated for cause.
- Pay: paid administrative leave at the regular rate is the default. For exempt employees, an unpaid suspension risks the FLSA salary basis test unless it is in full-day increments for a workplace conduct rule violation under a written policy (29 CFR 541.602(b)(5)). If suspensionPay is not true, add a [TBD] recommending counsel review before sending.
- No admission language: do not describe the allegation as established, and do not include statements by the company that concede wrongdoing by anyone.
- Instructions must be narrow. Ask the employee not to discuss the allegation with potential witnesses or interfere with the investigation, and explain why. Do not impose a blanket ban on discussing terms and conditions of employment with coworkers (NLRA section 7, for non-supervisory employees).
- Do not ask for or mention medical information. Point to the Employee Assistance Program for support.
- Register: brief, neutral, professional. American English spelling throughout. No em dashes.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'), then 'Personal and confidential', then the employee's full legal name and home address.",
      scaffold: `<p>{{issueDateUS}}<br><br>Personal and confidential<br>{{employeeLegalName}}<br>{{employeeAddressLine1}}<br>{{employeeAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST mark the letter 'Personal and confidential'.",
        "MUST NOT include any greeting here.",
        "MUST place date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>May 12, 2026<br><br>Personal and confidential<br>Mr. Daniel Okafor<br>240 Pine Street, Apt 7<br>San Francisco, CA 94111</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Paid Administrative Leave Pending Investigation', or 'Administrative Leave Pending Investigation' where the leave is not paid.",
      scaffold: `<p><strong>{{paidPrefix}}Administrative Leave Pending Investigation</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST NOT use the words 'discipline', 'misconduct' or 'suspension for cause' in the subject.",
        "MUST NOT say 'Paid' unless suspensionPay is true.",
      ],
      example: `<p><strong>Paid Administrative Leave Pending Investigation</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Render exactly one short <p>: 'Dear Mr./Ms./Dr. {Surname},'.",
      scaffold: `<p>Dear {{employeeHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT invent a title.",
      ],
      example: `<p>Dear Mr. Okafor,</p>`,
    },
    {
      sectionId: "opening",
      title: "Confirmation of leave",
      instruction:
        "Confirm in one short paragraph that the employee has been placed on administrative leave from the start date while the company looks into a concern, referring to the conversation in which they were told, if there was one.",
      scaffold: `<p>This letter confirms what {{toldByName}} discussed with you on {{suspensionDate}}: effective {{suspensionDate}}, you have been placed on administrative leave while the company looks into a concern that has been raised.</p>`,
      constraints: [
        "MUST state the date the leave started.",
        "MUST say the leave is so that a concern can be looked into.",
        "MUST NOT describe the employee as having engaged in misconduct.",
      ],
      example: `<p>This letter confirms what Aisha Khan discussed with you on May 11, 2026: effective May 11, 2026, you have been placed on administrative leave while the company looks into a concern that has been raised.</p>`,
    },
    {
      sectionId: "body",
      title: "Concern and reason",
      instruction:
        "Describe the concern in outline, as an allegation, in one or two sentences. Give the business reason for the leave. State that administrative leave is not discipline and that no conclusion has been reached.",
      scaffold: `<p>The concern is that {{allegationSummary}}. The company has placed you on leave because {{suspensionReasonText}}.</p>
<p>Administrative leave is not a disciplinary action, and it does not mean that the company has reached any conclusion. You will have an opportunity to share your account.</p>`,
      constraints: [
        "MUST describe the concern in outline only and as an allegation.",
        "MUST state that administrative leave is not discipline and no conclusion has been reached.",
        "MUST NOT name the person who raised the concern or any witness.",
        "MUST NOT include any statement that admits wrongdoing by the employee or the company.",
      ],
      example: `<p>The concern is that on May 9, 2026, stock was removed from the Oakland warehouse without authorization. The company has placed you on leave because the review will involve speaking with coworkers on your shift, and we want to make sure information can be gathered without any concern that it has been affected.</p>
<p>Administrative leave is not a disciplinary action, and it does not mean that the company has reached any conclusion. You will have an opportunity to share your account.</p>`,
    },
    {
      sectionId: "terms",
      title: "Pay, duration and review",
      instruction:
        "State the pay and benefits that apply during the leave. Say how long the leave is expected to last, that the company will keep it as short as practical, and when it will next be reviewed. Confirm that employment remains at-will.",
      scaffold: `<p>{{suspensionPayParagraph}}</p>
<p>We expect the leave to last about {{expectedDuration}}, and we will keep it as short as practical. We will review it by {{suspensionReviewDate}} and let you know whether it will continue. Nothing in this letter changes the at-will nature of your employment with {{employerLegalName}}.</p>`,
      constraints: [
        "MUST state the pay that applies during the leave.",
        "MUST say 'paid' or 'full pay' only where suspensionPay is true; otherwise add a [TBD] recommending counsel review.",
        "MUST give an expected duration and a review date, or a [TBD] if none is supplied.",
        "MUST confirm that employment remains at-will.",
        "MUST NOT promise a particular outcome or process.",
      ],
      example: `<p>You will continue to receive your regular pay and benefits while you are on leave.</p>
<p>We expect the leave to last about two weeks, and we will keep it as short as practical. We will review it by May 18, 2026 and let you know whether it will continue. Nothing in this letter changes the at-will nature of your employment with Acme Inc.</p>`,
    },
    {
      sectionId: "conditions",
      title: "During your leave",
      instruction:
        "Set out, as a short list, what the employee should and should not do during the leave. Keep it narrow and explain that it protects the integrity of the investigation.",
      scaffold: `<p>While you are on leave, please:</p>
<ul><li>do not come to {{workplaceName}} or any other company location unless {{contactName}} has approved it in advance;</li><li>do not discuss the concern with anyone who may be a witness, and do not take any step that could interfere with the investigation;</li><li>do not access company systems other than {{permittedSystems}};</li><li>remain available by phone and email during your regular working hours so that you can take part in the investigation.</li></ul>
<p>These requests are intended to protect the integrity of the investigation. They do not limit your right to discuss your wages, hours or other terms and conditions of employment.</p>`,
      constraints: [
        "MUST ask the employee not to discuss the concern with potential witnesses or interfere with the investigation.",
        "MUST ask the employee to remain available during regular working hours.",
        "MUST say the employee may not come to company locations without approval.",
        "MUST NOT impose a blanket ban on discussing terms and conditions of employment with coworkers.",
      ],
      example: `<p>While you are on leave, please:</p>
<ul><li>do not come to the Oakland warehouse or any other company location unless Helen Carter has approved it in advance;</li><li>do not discuss the concern with anyone who may be a witness, and do not take any step that could interfere with the investigation;</li><li>do not access company systems other than the benefits portal and your pay stubs;</li><li>remain available by phone and email during your regular working hours so that you can take part in the investigation.</li></ul>
<p>These requests are intended to protect the integrity of the investigation. They do not limit your right to discuss your wages, hours or other terms and conditions of employment.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Contact and next steps",
      instruction:
        "Name the contact for questions during the leave, with contact details, and explain that the employee will be asked to meet as part of the investigation and will be kept informed.",
      scaffold: `<p>Your contact during the leave is {{contactName}}, {{contactTitle}}, at {{contactDetails}}. {{contactName}} will keep in touch with you and let you know when you will be asked to meet as part of the investigation.</p>`,
      constraints: [
        "MUST name one contact and give their contact details.",
        "MUST say the employee will be kept informed.",
      ],
      example: `<p>Your contact during the leave is Helen Carter, HR Business Partner, at helen.carter@acme.example or (415) 555 0142. Helen will keep in touch with you and let you know when you will be asked to meet as part of the investigation.</p>`,
    },
    {
      sectionId: "closing",
      title: "Support and closing",
      instruction:
        "One short paragraph pointing to support (Employee Assistance Program, wellbeing resources), followed by 'Sincerely,'.",
      scaffold: `<p>We understand that this may be a stressful time. {{supportParagraph}}</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST point to at least one source of support, such as the Employee Assistance Program.",
        "MUST use 'Sincerely,'.",
        "MUST NOT apologize for the leave or comment on the concern.",
      ],
      example: `<p>We understand that this may be a stressful time. The Employee Assistance Program is free and confidential, and you can reach it at (800) 555 0199 at any time.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Three lines: signatory name, signatory title, employer legal name.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>Vice President, People<br>Acme Inc.</p>`,
    },
  ],
  expectedEvidence: [
    {
      key: "allegation_record",
      label: "Record of the concern",
      required: true,
      description: "The complaint, report or incident note that raised the concern.",
      expectedKinds: ["email", "document", "note"],
    },
    {
      key: "leave_decision",
      label: "Leave decision note",
      required: false,
      description: "Why leave was needed and who decided.",
      expectedKinds: ["note", "document"],
    },
    {
      key: "leave_policy",
      label: "Policy on administrative leave",
      required: false,
      description: "The handbook section that covers administrative leave and pay during it.",
      expectedKinds: ["document"],
    },
  ],
};
