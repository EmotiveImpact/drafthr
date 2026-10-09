import type { LetterTemplate } from "../types";

export const RIGHT_TO_WORK_UK: LetterTemplate = {
  letterType: "right_to_work",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Right-to-Work / Skilled Worker Sponsorship Letter):
- The Skilled Worker route requires a sponsor licence held by the employer (Home Office Sponsor Guidance, current edition) and the assignment of a Certificate of Sponsorship (CoS) — defined (for switching from outside the UK) or undefined (for in-country switches and certain extensions).
- Salary thresholds (check the current Home Office figures before issuing): general threshold 41,700 pounds per year from 22 July 2025, with lower rates for new entrants; the going rate for the relevant Standard Occupational Classification (SOC) code; or shortage / 'going-rate discount' rules where applicable. Confirm both the salary and the SOC code in the letter.
- Right-to-work checks under the Immigration, Asylum and Nationality Act 2006 (s.15 civil penalty regime) require either a manual check of List A / List B documents, or a Home Office online share-code check, or an Identity Service Provider (IDSP) check for British and Irish citizens, conducted before employment begins and (for time-limited permission) repeated before expiry.
- For a sponsorship letter supporting an application, confirm: the employer's sponsor licence number and rating, the role title and SOC code, the start date, the salary, the duties, and the qualifying conditions met.
- For an internal right-to-work confirmation, state the document type checked, the date of the check, and the next-check date if permission is time-limited.
- Register: factual, formal, plain. British English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then the recipient block (employee + Home Office or named recipient) on separate lines wrapped in a single <p>.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientBlock}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST identify the recipient (employee, Home Office, or other) clearly.",
        "MUST place date and recipient inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>UK Visas and Immigration<br>Home Office<br>PO Box 3468<br>Sheffield S3 8WA</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: identifying the purpose (sponsorship / right-to-work confirmation) and the employee.",
      scaffold: `<p><strong>{{purposeLabel}} — {{employeeFullName}}, {{passportOrCosReference}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the employee and any reference number (CoS, passport, share code).",
      ],
      example: `<p><strong>Skilled Worker Sponsorship Confirmation — Aisha Khan, CoS C2W6X8YZ123</strong></p>`,
    },
    {
      sectionId: "body",
      title: "Confirmation of employment and duties",
      instruction:
        "Confirm the employer's identity and sponsor licence (where applicable), the employee's full name and date of birth (per passport), the role title and SOC code, start date, salary, hours, and a precise summary of duties matching the SOC code.",
      scaffold: `<p>{{employerLegalName}} (Companies House registration number {{companiesHouseNumber}}, registered office {{registeredOfficeAddress}}), holder of a Skilled Worker sponsor licence under sponsor licence number {{sponsorLicenceNumber}} (current rating: {{sponsorRating}}), confirms that {{employeeFullName}} (date of birth {{employeeDOB}}, passport number {{employeePassportNumber}}) is employed by the company as {{jobTitle}} (Standard Occupational Classification code {{socCode}}) with effect from {{startDate}}.</p>
<p>The role is based at {{workLocation}}, with contractual working hours of {{contractualHoursPerWeek}} hours per week, and an annual gross salary of £{{grossAnnualSalary}}, which meets or exceeds both the general Skilled Worker threshold and the going rate for SOC code {{socCode}}. The principal duties of the role are: {{dutiesSummary}}.</p>`,
      constraints: [
        "MUST state the sponsor licence number and rating where the letter supports a sponsored application.",
        "MUST state the SOC code and confirm the salary meets the threshold.",
        "MUST identify the employee with date of birth and passport number for immigration verification.",
        "MUST list duties in a way that matches the SOC code.",
      ],
      example: `<p>Acme Holdings Limited (Companies House registration number 04812336, registered office 12 Bishopsgate, London EC2N 4BX), holder of a Skilled Worker sponsor licence under sponsor licence number 9X1H4QW2P (current rating: A), confirms that Aisha Khan (date of birth 14 February 1991, passport number 558231764) is employed by the company as Senior Software Engineer (Standard Occupational Classification code 2136) with effect from 1 June 2026.</p>
<p>The role is based at our Manchester office, 1 Spinningfields Square, with contractual working hours of 37.5 hours per week, and an annual gross salary of £72,000, which meets or exceeds both the general Skilled Worker threshold and the going rate for SOC code 2136. The principal duties of the role are: design, development, and maintenance of distributed software systems; technical leadership of feature delivery within the Platform engineering group; mentoring of mid-level engineers; participation in the on-call rota; and contribution to architectural decisions for the platform roadmap.</p>`,
    },
    {
      sectionId: "terms",
      title: "Sponsorship and Certificate of Sponsorship references",
      instruction:
        "State the CoS reference, the type of CoS (defined / undefined), the assignment date, and the sponsor's confirmation that the genuine vacancy and salary tests are met. For internal right-to-work confirmations, state the document type checked, the date and outcome, and the follow-up date for time-limited permission.",
      scaffold: `<p>The Certificate of Sponsorship assigned for this employment is reference {{cosReference}} ({{cosType}}), assigned on {{cosAssignedDate}}. The company confirms that this is a genuine vacancy and that the role meets the skill level and salary requirements of the Skilled Worker route under Appendix Skilled Worker of the Immigration Rules. The right-to-work check required under section 15 of the Immigration, Asylum and Nationality Act 2006 was completed on {{rtwCheckDate}} using the {{rtwCheckMethod}}, and a follow-up check is scheduled for {{rtwFollowUpDate}}.</p>`,
      constraints: [
        "MUST cite s.15 Immigration, Asylum and Nationality Act 2006.",
        "MUST state the CoS reference, type, and assignment date for sponsorship letters.",
        "MUST state the right-to-work check date, method, and follow-up date.",
        "MUST NOT misstate the sponsor licence rating.",
      ],
      example: `<p>The Certificate of Sponsorship assigned for this employment is reference C2W6X8YZ123 (defined), assigned on 28 April 2026. The company confirms that this is a genuine vacancy and that the role meets the skill level and salary requirements of the Skilled Worker route under Appendix Skilled Worker of the Immigration Rules. The right-to-work check required under section 15 of the Immigration, Asylum and Nationality Act 2006 was completed on 1 June 2026 using the Home Office online share-code check, and a follow-up check is scheduled for 14 May 2029, prior to the expiry of the current permission.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph offering further information on request, followed by sign-off. 'Yours faithfully,' for the Home Office or 'To Whom It May Concern'; 'Yours sincerely,' for a named recipient.",
      scaffold: `<p>If you require any further information in support of this confirmation, please contact me at {{signatoryEmail}} or by telephone on {{signatoryPhone}}.</p>
<p>{{signOffLine}}</p>`,
      constraints: [
        "MUST match the sign-off to the recipient.",
        "MUST offer a contact for further information.",
      ],
      example: `<p>If you require any further information in support of this confirmation, please contact me at priya.sharma@acme.example or by telephone on +44 161 555 0142.</p>
<p>Yours faithfully,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Three lines: signatory name, signatory title (typically Authorising Officer / Key Contact / Level 1 User on the sponsor licence), employer legal name.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST identify the role of the signatory in the sponsorship structure where relevant.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>HR Director and Authorising Officer<br>Acme Holdings Limited</p>`,
    },
  ],
};

export const RIGHT_TO_WORK_US: LetterTemplate = {
  letterType: "right_to_work",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Immigration Support Letter):
- Identify the visa lane being supported. H-1B specialty occupation under 8 USC 1101(a)(15)(H)(i)(b) and 8 CFR 214.2(h): bachelor's degree minimum in the specialty, employer-employee relationship, prevailing wage certified on the LCA (ETA Form 9035), USCIS petition (Form I-129).
- L-1A (intracompany transferee, executive/managerial) and L-1B (specialized knowledge) under 8 USC 1101(a)(15)(L) and 8 CFR 214.2(l): 1 of 3 years' qualifying foreign employment with a parent, branch, subsidiary, or affiliate of the US petitioner; managerial/executive or specialized-knowledge role.
- O-1 (extraordinary ability) under 8 USC 1101(a)(15)(O) and 8 CFR 214.2(o): documented extraordinary ability evidence in the field.
- I-140 / EB-2 / EB-3 immigrant petitions: PERM labor certification (ETA Form 9089), prevailing wage determination, recruitment, and compliance with 20 CFR 656.
- I-9 employment eligibility verification under the Immigration Reform and Control Act 1986 (8 USC 1324a; 8 CFR 274a.2): completion within 3 business days; List A or combination of List B + List C documents; E-Verify enrollment where the employer participates.
- For internal right-to-work / I-9 follow-up letters, state the document type, the date of the check, and any reverification date.
- Register: factual, formal, plain. American English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'), then the recipient block (USCIS / consular post / employee) on separate lines.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientBlock}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST identify the recipient (USCIS service center, consular post, or employee).",
        "MUST place date and recipient inside a single <p> separated by <br>.",
      ],
      example: `<p>May 12, 2026<br><br>U.S. Citizenship and Immigration Services<br>California Service Center<br>P.O. Box 10129<br>Laguna Niguel, CA 92607-1012</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: identifying the visa lane, the beneficiary, and the petition / case number.",
      scaffold: `<p><strong>{{visaLane}} Petition Support Letter — {{employeeFullName}}, {{petitionOrReceiptNumber}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST identify the visa lane, the beneficiary, and the case reference.",
      ],
      example: `<p><strong>H-1B Petition Support Letter — Aisha Khan, Receipt Number EAC-26-145-12345</strong></p>`,
    },
    {
      sectionId: "body",
      title: "Confirmation of employment and duties",
      instruction:
        "State the petitioner's identity, the beneficiary's identity (full name, date of birth, country of birth, passport number), the role title, the start date, the salary (annualized gross), and a precise summary of duties keyed to the visa lane requirements (specialty occupation; managerial/executive; specialized knowledge; etc.).",
      scaffold: `<p>{{employerLegalName}} ({{petitionerEntityType}}, FEIN {{employerFEIN}}, principal place of business {{principalPlaceOfBusiness}}) confirms that it has offered employment to {{employeeFullName}} (date of birth {{employeeDOB}}, country of birth {{employeeCountryOfBirth}}, passport number {{employeePassportNumber}}) as {{jobTitle}}, with effect from {{startDate}}, at an annualized gross base salary of {{currencySymbol}}{{annualizedGrossSalary}}.</p>
<p>The position is a {{visaLaneClassification}} within the meaning of {{statutoryReference}}. The principal duties of the role are: {{dutiesSummary}}. These duties require {{minimumQualificationsRequired}}, which the beneficiary possesses as evidenced by {{credentialsEvidence}}.</p>`,
      constraints: [
        "MUST cite the statutory authority for the visa lane (8 USC 1101(a)(15)(H)(i)(b) for H-1B; (L) for L-1; (O) for O-1; INA 203(b) for I-140).",
        "MUST state the salary in a way that establishes prevailing-wage compliance for H-1B.",
        "MUST list duties keyed to the visa-lane test.",
        "MUST identify the beneficiary with date of birth and passport for consular/USCIS verification.",
      ],
      example: `<p>Acme Inc. (a Delaware corporation, FEIN 81-2345678, principal place of business 600 Montgomery Street, San Francisco, CA 94111) confirms that it has offered employment to Aisha Khan (date of birth February 14, 1991, country of birth United Kingdom, passport number 558231764) as Senior Software Engineer, with effect from October 1, 2026, at an annualized gross base salary of $185,000.</p>
<p>The position is a specialty occupation within the meaning of 8 USC section 1101(a)(15)(H)(i)(b) and 8 CFR section 214.2(h)(4)(ii), in that it requires the theoretical and practical application of a body of highly specialized knowledge and the attainment of a bachelor's degree or higher in computer science or a closely related field as a minimum for entry. The principal duties of the role are: design, development, and maintenance of distributed software systems; technical leadership of feature delivery within the Platform engineering organization; mentoring of mid-level engineers; participation in the on-call rotation; and contribution to architectural decisions for the platform roadmap. These duties require a bachelor's degree (or higher) in computer science or a closely related field, which the beneficiary possesses as evidenced by her BSc (Hons) in Computer Science from the University of Manchester (2013) and her MSc in Computer Science from Imperial College London (2014), credentials of which evaluations are enclosed.</p>`,
    },
    {
      sectionId: "terms",
      title: "Petition references and compliance",
      instruction:
        "State the LCA (for H-1B) certification number, the PERM case number (for I-140), the petition receipt number, the prevailing-wage determination, and any I-9 / E-Verify status.",
      scaffold: `<p>The Labor Condition Application certified by the U.S. Department of Labor for this position is identified by ETA case number {{etaCaseNumber}}, certified on {{lcaCertifiedDate}}, with the prevailing wage determined at {{currencySymbol}}{{prevailingWageAmount}} per year for the Standard Occupational Classification {{socCode}} in the area of intended employment. The petitioner has filed Form I-129 (or, where applicable, Form I-140) with USCIS under receipt number {{petitionReceiptNumber}}. The petitioner participates in the U.S. Department of Homeland Security E-Verify program (employer ID {{eVerifyEmployerID}}) and has completed Form I-9 within three business days of employment start in accordance with the Immigration Reform and Control Act of 1986, 8 USC section 1324a.</p>`,
      constraints: [
        "MUST cite the LCA / PERM compliance for H-1B / I-140 lanes.",
        "MUST cite IRCA 1986 / 8 USC 1324a for I-9.",
        "MUST state E-Verify participation only where accurate.",
        "MUST NOT misstate the prevailing wage or other compliance facts.",
      ],
      example: `<p>The Labor Condition Application certified by the U.S. Department of Labor for this position is identified by ETA case number I-200-26095-456789, certified on April 15, 2026, with the prevailing wage determined at $172,058 per year for the Standard Occupational Classification 15-1252 (Software Developers) in the San Francisco-Oakland-Berkeley, CA Metropolitan Statistical Area, Level III. The petitioner has filed Form I-129 with USCIS under receipt number EAC-26-145-12345. The petitioner participates in the U.S. Department of Homeland Security E-Verify program (employer ID 123456) and has completed Form I-9 within three business days of employment start in accordance with the Immigration Reform and Control Act of 1986, 8 USC section 1324a.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph offering further information on request, followed by 'Sincerely,' (or 'Respectfully,' for USCIS / consular correspondence).",
      scaffold: `<p>If any further information would assist in the adjudication of this matter, please contact me at {{signatoryEmail}} or by telephone on {{signatoryPhone}}.</p>
<p>{{signOffLine}}</p>`,
      constraints: [
        "MUST use 'Sincerely,' (named recipient) or 'Respectfully,' (USCIS/consular).",
        "MUST offer a contact for further information.",
      ],
      example: `<p>If any further information would assist in the adjudication of this matter, please contact me at priya.sharma@acme.example or by telephone on +1 (415) 555-0142.</p>
<p>Respectfully,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Three lines: signatory name, signatory title, employer legal name.",
      scaffold: `<p>{{signatoryName}}<br>{{signatoryTitle}}<br>{{employerLegalName}}</p>`,
      constraints: [
        "MUST be exactly three lines.",
        "MUST NOT include any marketing footer.",
      ],
      example: `<p>Priya Sharma<br>Vice President, People<br>Acme Inc.</p>`,
    },
  ],
};
