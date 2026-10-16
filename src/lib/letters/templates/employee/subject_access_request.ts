import type { LetterTemplate } from "../types";

export const SUBJECT_ACCESS_REQUEST_UK: LetterTemplate = {
  letterType: "subject_access_request",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Subject Access Request — EMPLOYEE MODE):
- Statutory request under Article 15 UK GDPR. (Do not cite s.45 Data Protection Act 2018: it applies to law-enforcement processing, not an employer.)
- Statutory response window: one month from receipt (Art. 12(3) UK GDPR), extendable by up to two further months for complex / multiple requests, with notification to the data subject within the first month.
- No fee, except where the request is manifestly unfounded or excessive (Art. 12(5) UK GDPR).
- The data controller may request reasonable proof of identity under Art. 12(6) UK GDPR but must not use ID verification to delay or obstruct.
- Tone: neutral, procedural. Do NOT volunteer reasons for the request. Do NOT discuss any underlying dispute.
- British English throughout. Reserve rights briefly (the right to complain to the ICO under Art. 77 UK GDPR).
- Pre-empt the limited exemptions under Schedule 2 of the DPA 2018 (legal advice privilege, confidential references, management forecasts) by being precise about scope.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "UK date format. Address to the Data Protection Officer where named, otherwise to HR Director or to 'The Data Protection Officer / Privacy Lead' at the registered office.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST address to the DPO where the employer has a registered DPO; otherwise to a privacy lead or HR Director.",
      ],
      example: `<p>12 May 2026<br><br>The Data Protection Officer<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies as a Subject Access Request under Art. 15 UK GDPR.",
      scaffold: `<p><strong>Subject Access Request under Article 15 UK GDPR</strong></p>`,
      constraints: [
        "MUST identify the request as a SAR.",
        "MUST cite Art. 15 UK GDPR.",
      ],
      example: `<p><strong>Subject Access Request under Article 15 UK GDPR</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "One <p>. 'Dear Sir or Madam,' or 'Dear {Title} {Surname},'.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Sir or Madam,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statutory basis and identity confirmation",
      instruction:
        "Identify the writer (full legal name, employee number, date of birth where willing to provide) and offer reasonable proof of identity. State the request is made under Art. 15 UK GDPR. Do NOT explain why.",
      scaffold: `<p>I am writing to make a subject access request in respect of personal data of which I am the data subject and {{employerLegalName}} is the data controller. My full legal name is {{employeeLegalName}}; I am / was employed by the Company as {{employeeJobTitle}} (employee number {{employeeNumber}}) from {{employeeStartDateUK}}. I am willing to provide reasonable proof of identity if required, but ask that any such verification step be proportionate and not used to delay the response beyond the statutory period.</p>`,
      constraints: [
        "MUST identify the data subject (name, employment dates, employee number).",
        "MUST cite Art. 15 UK GDPR.",
        "MUST offer reasonable proof of identity.",
        "MUST NOT volunteer reasons for the request.",
        "MUST NOT discuss any underlying dispute.",
      ],
      example: `<p>I am writing to make a subject access request in respect of personal data of which I am the data subject and Acme Holdings Limited is the data controller. My full legal name is Sarah Anne Williams; I am employed by the Company as Senior Marketing Manager (employee number 04231) and have been employed since 4 March 2022. I am willing to provide reasonable proof of identity if required, but ask that any such verification step be proportionate and not used to delay the response beyond the statutory period.</p>`,
    },
    {
      sectionId: "body",
      title: "Specific scope (categories, timeframe, format)",
      instruction:
        "Specify the categories of personal data sought, the timeframe, and any specific custodians (line manager mailboxes, HR systems, payroll, recruitment, OH records). Be specific — broad 'all data' requests are easier to push back on as manifestly excessive. Include the format requested.",
      scaffold: `<p>The personal data I request is, without limitation, the following:</p>
<ol>
  <li><strong>HR file:</strong> all records held in my personnel file, including but not limited to performance reviews, one-to-one notes, disciplinary records, grievance records, and any informal notes held by HR.</li>
  <li><strong>Email and messaging:</strong> all emails, instant messages (Slack / Teams / equivalent), and meeting notes in which I am named, identified, or referred to (whether by name, role, or initials), held in the mailboxes / accounts of {{custodianList}}, for the period {{timeframe}}.</li>
  <li><strong>Payroll and benefits:</strong> all data held by payroll and benefits providers in respect of me.</li>
  <li><strong>Recruitment and promotion:</strong> all data held in respect of any internal recruitment or promotion process I have participated in, including scoring sheets and interviewer notes.</li>
  <li><strong>Occupational health:</strong> any reports held in respect of me, save those that are subject to lawful exemption.</li>
  <li><strong>Other:</strong> {{otherCategories}}.</li>
</ol>
<p>I would like the data provided in {{requestedFormat}}.</p>`,
      constraints: [
        "MUST list categories of data with specificity.",
        "MUST specify a timeframe (typically the period of employment or last 3 years).",
        "MUST identify custodians (mailboxes, systems) where known.",
        "MUST state the format (PDF, CSV, native files, encrypted USB).",
        "MUST NOT make a 'fishing' request for 'all data ever held' — that risks rejection as manifestly excessive.",
      ],
      example: `<p>The personal data I request is, without limitation, the following:</p>
<ol>
  <li><strong>HR file:</strong> all records held in my personnel file, including performance reviews, one-to-one notes, disciplinary records, grievance records, and any informal notes held by HR.</li>
  <li><strong>Email and messaging:</strong> all emails, Slack messages, and Teams messages in which I am named, identified, or referred to (whether by name, role, or initials), held in the mailboxes / accounts of Marcus Chen (Head of Marketing), Priya Sharma (HR Director), and David Whitfield (Managing Director), for the period 1 January 2025 to date.</li>
  <li><strong>Payroll and benefits:</strong> all data held in respect of me by payroll, the pension scheme, and the medical-cover provider.</li>
  <li><strong>Recruitment and promotion:</strong> all data held in respect of the Head of Brand recruitment process in February 2026, including scoring sheets, interviewer notes, and the comparative ranking of candidates.</li>
  <li><strong>Occupational health:</strong> any OH reports held in respect of me, save those subject to lawful exemption.</li>
</ol>
<p>I would like the data provided as PDFs, with native-file copies for any spreadsheets, delivered electronically by encrypted email or secure file-share link.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Statutory deadline and format request",
      instruction:
        "State the one-month statutory window (Art. 12(3) UK GDPR). Note the rule on extensions (further two months for complex / multiple requests, with notification within the first month). Note the no-fee position. Confirm the format requested.",
      scaffold: `<p>The Company is required to respond within one month of receipt under Article 12(3) UK GDPR. If the request is considered complex or multiple, the response period may be extended by a further two months provided the Company notifies me of that extension within the first month, with reasons. I do not expect any fee to be charged unless the request is found to be manifestly unfounded or excessive. Please confirm receipt and the date by which the response will be provided.</p>`,
      constraints: [
        "MUST cite the one-month window (Art. 12(3) UK GDPR).",
        "MUST mention the conditions for extension.",
        "MUST address fees.",
      ],
      example: `<p>The Company is required to respond within one month of receipt under Article 12(3) UK GDPR. If the request is considered complex or multiple, the response period may be extended by a further two months provided the Company notifies me of that extension within the first month, with reasons. I do not expect any fee to be charged unless the request is found to be manifestly unfounded or excessive. Please confirm receipt and the date by which the response will be provided.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reference the right to complain to the ICO under Art. 77 UK GDPR if the request is not met. Reserve rights generally.",
      scaffold: `<p>If the response is not provided in accordance with Article 15 UK GDPR, I reserve my right to lodge a complaint with the Information Commissioner's Office under Article 77 UK GDPR and to pursue any other remedy available to me, including under Article 82 UK GDPR. I reserve all my rights.</p>`,
      constraints: [
        "MUST reference Art. 77 UK GDPR ICO complaint right.",
        "MUST reserve all rights.",
      ],
      example: `<p>If the response is not provided in accordance with Article 15 UK GDPR, I reserve my right to lodge a complaint with the Information Commissioner's Office under Article 77 UK GDPR and to pursue any other remedy available to me, including under Article 82 UK GDPR. I reserve all my rights.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short, neutral. 'Yours faithfully,' if 'Dear Sir or Madam,' was used; 'Yours sincerely,' if a named recipient.",
      scaffold: `<p>I look forward to your acknowledgement and the timely response.</p>
<p>{{signOff}}</p>`,
      constraints: [
        "MUST use 'Yours faithfully,' if salutation was 'Dear Sir or Madam,'; otherwise 'Yours sincerely,'.",
        "MUST be neutral.",
      ],
      example: `<p>I look forward to your acknowledgement and the timely response.</p>
<p>Yours faithfully,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, employment role, employee number, contact address.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>Employee No. {{employeeNumber}}<br>{{employeeContactAddress}}</p>`,
      constraints: ["MUST include contact address for delivery of the response."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee No. 04231<br>14 Rosewood Avenue, London N4 2QX</p>`,
    },
  ],
};

export const SUBJECT_ACCESS_REQUEST_US: LetterTemplate = {
  letterType: "subject_access_request",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Personnel File / CCPA Request — EMPLOYEE MODE):
- US has no general federal employee data-access right. Rights are state-based:
  - California: Cal. Lab. Code §1198.5 (personnel file, 30 days), §226 (payroll records, 21 days), §432 (signed documents). CCPA/CPRA Cal. Civ. Code §1798.100 et seq. applies to employee data since January 1, 2023, with a 45-day response window.
  - Connecticut: Conn. Gen. Stat. §31-128a et seq.
  - Illinois: 820 ILCS 40/1 et seq. (Personnel Record Review Act).
  - Massachusetts: Mass. Gen. Laws ch. 149, §52C.
  - New Hampshire: NH RSA 275:56.
  - Pennsylvania: 43 Pa. Stat. §1321 et seq.
  - Other states: variable. Where no statute applies, the request is discretionary.
- Cite the specific statute(s) applicable to the writer's state of employment.
- Tone: neutral, procedural. Do NOT volunteer reasons.
- American English. Reserve rights briefly.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "US date format. Address to HR or Privacy Officer.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: ["MUST use US date format."],
      example: `<p>May 12, 2026<br><br>Privacy Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Cite specific statute(s).",
      scaffold: `<p><strong>Request for Personnel Records and Personal Information — {{statuteList}}</strong></p>`,
      constraints: [
        "MUST cite the specific statute(s) by name.",
      ],
      example: `<p><strong>Request for Personnel Records and Personal Information — Cal. Lab. Code §1198.5, §226, and CCPA/CPRA</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "One <p>.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Privacy Officer,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statutory basis and identity confirmation",
      instruction:
        "Identify the writer. Cite the specific state statute(s) and CCPA/CPRA where applicable. Offer reasonable proof of identity. Do not give reasons.",
      scaffold: `<p>I am writing to request access to records pursuant to {{statuteList}}. My full legal name is {{employeeLegalName}}; I am / was employed by the Company as {{employeeJobTitle}} (employee ID {{employeeNumber}}) since {{employeeStartDateUS}}. I am willing to provide reasonable proof of identity if required.</p>`,
      constraints: [
        "MUST cite specific state statute(s) and CCPA/CPRA where applicable.",
        "MUST identify the writer.",
        "MUST offer proof of identity.",
        "MUST NOT volunteer reasons.",
      ],
      example: `<p>I am writing to request access to records pursuant to California Labor Code §§1198.5 and 226 and the California Consumer Privacy Act / California Privacy Rights Act (Cal. Civ. Code §1798.100 et seq.). My full legal name is Sarah Anne Williams; I am employed by the Company as Senior Marketing Manager (employee ID 04231) and have been employed since March 4, 2022. I am willing to provide reasonable proof of identity if required.</p>`,
    },
    {
      sectionId: "body",
      title: "Specific scope (categories, timeframe, format)",
      instruction:
        "Specify categories: personnel file, payroll records, signed documents, CCPA categories. Identify custodians and timeframe. Format.",
      scaffold: `<p>The records and personal information I request are, without limitation, the following:</p>
<ol>
  <li><strong>Personnel file (Lab. Code §1198.5):</strong> all records used or that have been used to determine my qualifications for employment, promotion, additional compensation, or termination.</li>
  <li><strong>Payroll records (Lab. Code §226):</strong> all wage statements and underlying payroll records for my employment.</li>
  <li><strong>Signed documents (Lab. Code §432):</strong> copies of all documents I have signed in connection with my employment.</li>
  <li><strong>CCPA/CPRA categories:</strong> the categories of personal information collected, the sources, the purposes, the categories of third parties to whom it has been disclosed, and the specific pieces of personal information held about me, for the period {{timeframe}}.</li>
  <li><strong>Email and messaging:</strong> all emails and messages in which I am named, held in the accounts of {{custodianList}}, for the period {{timeframe}}.</li>
  <li><strong>Recruitment and promotion:</strong> records of any internal application, including scoring sheets and interviewer notes.</li>
</ol>
<p>I would like the data provided as {{requestedFormat}}.</p>`,
      constraints: [
        "MUST cite specific Cal. Lab. Code sections (or equivalent state code) for each category.",
        "MUST specify timeframe.",
        "MUST identify custodians where known.",
        "MUST state format.",
      ],
      example: `<p>The records and personal information I request are, without limitation, the following:</p>
<ol>
  <li><strong>Personnel file (Lab. Code §1198.5):</strong> all records used to determine my qualifications for employment, promotion, additional compensation, or termination.</li>
  <li><strong>Payroll records (Lab. Code §226):</strong> all wage statements and underlying payroll records for my employment.</li>
  <li><strong>Signed documents (Lab. Code §432):</strong> copies of all documents I have signed in connection with my employment.</li>
  <li><strong>CCPA/CPRA categories:</strong> the categories of personal information collected, sources, purposes, categories of third parties to whom it has been disclosed, and the specific pieces of personal information held about me, for the period January 1, 2025 to date.</li>
  <li><strong>Email and messaging:</strong> all emails, Slack and Teams messages in which I am named, held in the accounts of Marcus Chen (Head of Marketing), Priya Sharma (Chief People Officer), and David Whitfield (CEO), for the period January 1, 2025 to date.</li>
  <li><strong>Recruitment and promotion:</strong> records of the Head of Brand internal recruitment in February 2026.</li>
</ol>
<p>I would like the data provided as PDFs and native files, delivered by secure file-share link.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Statutory deadlines and format",
      instruction:
        "State the applicable deadlines: §1198.5 (30 days), §226 (21 days), CCPA (45 days, extendable by 45 if notified). Address fees.",
      scaffold: `<p>The Company is required to respond within the following statutory periods: {{statutoryDeadlines}}. Please confirm receipt and the date by which the response will be provided.</p>`,
      constraints: [
        "MUST cite specific statutory response windows.",
      ],
      example: `<p>The Company is required to respond within the following statutory periods: 30 days under Cal. Lab. Code §1198.5; 21 calendar days under Cal. Lab. Code §226; and 45 days under the CCPA/CPRA, extendable by a further 45 days where the Company notifies me within the first 45 days. Please confirm receipt and the date by which the response will be provided.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve rights including the right to file with the relevant state agency or sue under the CCPA/CPRA private right of action.",
      scaffold: `<p>If the response is not provided in accordance with the statutes cited above, I reserve my right to seek recourse with the California Privacy Protection Agency, the California Labor Commissioner, and any other agency or court with jurisdiction. I reserve all my rights.</p>`,
      constraints: [
        "MUST reference the relevant state agency.",
        "MUST reserve all rights.",
      ],
      example: `<p>If the response is not provided in accordance with the statutes cited above, I reserve my right to seek recourse with the California Privacy Protection Agency, the California Labor Commissioner, and any other agency or court with jurisdiction. I reserve all my rights.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Neutral. 'Sincerely,'.",
      scaffold: `<p>I look forward to your acknowledgement and the timely response.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>I look forward to your acknowledgement and the timely response.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role, employee ID, contact address.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>Employee ID {{employeeNumber}}<br>{{employeeContactAddress}}</p>`,
      constraints: ["MUST include contact address for delivery."],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee ID 04231<br>124 Pine Street, San Francisco, CA 94108</p>`,
    },
  ],
};
