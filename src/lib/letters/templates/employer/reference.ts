import type { LetterTemplate } from "../types";

export const REFERENCE_UK: LetterTemplate = {
  letterType: "reference",
  jurisdiction: "UK",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Reference / Employment Verification):
- The default for employer references in the UK is fact-only: dates of employment and last-held position. This limits exposure under the Spring v Guardian Assurance plc [1995] line of authority, which imposes a duty of care to provide a fair, accurate, true, and not misleading reference.
- A character reference (with views on performance and conduct) is permitted with authority but elevates risk. Where the employer chooses to provide one, statements must be balanced and based on documented evidence.
- Disclosure of salary, bonus, or any special-category data requires the employee's written consent under Article 6 and (where relevant) Article 9 UK GDPR / Data Protection Act 2018.
- A 'To Whom It May Concern' reference uses 'Yours faithfully,' as the sign-off; a named recipient uses 'Yours sincerely,'.
- Register: factual, neutral, professional. British English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'). If addressed to a named recipient (e.g., a prospective employer), include their name and address; otherwise render 'To Whom It May Concern' below the date.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientBlock}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST handle the named-recipient and 'To Whom It May Concern' branches correctly.",
        "MUST place date and recipient inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>Ms Sarah Patel<br>Recruitment Manager<br>Beacon Capital Partners LLP<br>30 King Street<br>London EC2V 8EH</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Employment Reference — {Employee Full Name}'.",
      scaffold: `<p><strong>Employment Reference — {{employeeFullName}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST include the employee's full name.",
      ],
      example: `<p><strong>Employment Reference — Daniel Okafor</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr/Ms/Dr {Surname},' for a named recipient, or 'Dear Sir or Madam,' for an unnamed recipient.",
      scaffold: `<p>{{salutationLine}}</p>`,
      constraints: [
        "MUST match the salutation to the recipient (named vs unnamed).",
        "MUST NOT use first-name salutation in a formal reference.",
      ],
      example: `<p>Dear Ms Patel,</p>`,
    },
    {
      sectionId: "body",
      title: "Confirmation of employment",
      instruction:
        "Provide a fact-only confirmation by default: full name, dates of employment, last-held position, and reason for leaving (where confirmation is appropriate). Where authority for a fuller character reference exists, two short paragraphs covering responsibilities and a balanced view of performance.",
      scaffold: `<p>I confirm that {{employeeFullName}} was employed by {{employerLegalName}} from {{employmentStartDate}} to {{employmentEndDate}} as {{lastHeldPosition}}. {{additionalFactualConfirmations}}</p>
<p>{{characterReferenceParagraph}}</p>`,
      constraints: [
        "MUST be factually accurate, fair, and not misleading (Spring v Guardian Assurance [1995]).",
        "MUST limit content to fact-only unless express authority for a character reference exists.",
        "MUST NOT disclose salary or bonus without the employee's written consent under UK GDPR.",
        "MUST NOT include speculative or unsubstantiated commentary on performance or conduct.",
      ],
      example: `<p>I confirm that Daniel Okafor was employed by Acme Holdings Limited from 14 March 2022 to 12 May 2026 as Senior Software Engineer based at our London office. He resigned to take up a new opportunity with effect from 13 May 2026.</p>
<p>This reference is provided in good faith and is based on records held by the company. It is given without legal liability on the part of the company or the signatory and should not be the sole basis of any employment decision.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph offering further information on request, followed by sign-off. 'Yours sincerely,' for a named recipient; 'Yours faithfully,' for 'To Whom It May Concern'.",
      scaffold: `<p>If you require any further information that the company is able to share, please contact me at {{signatoryEmail}}.</p>
<p>{{signOffLine}}</p>`,
      constraints: [
        "MUST use 'Yours sincerely,' for a named recipient.",
        "MUST use 'Yours faithfully,' for 'To Whom It May Concern'.",
        "MUST offer a contact for further enquiries.",
      ],
      example: `<p>If you require any further information that the company is able to share, please contact me at priya.sharma@acme.example.</p>
<p>Yours sincerely,</p>`,
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
      example: `<p>Priya Sharma<br>HR Director<br>Acme Holdings Limited</p>`,
    },
  ],
};

export const REFERENCE_US: LetterTemplate = {
  letterType: "reference",
  jurisdiction: "US",
  evidenceTier: "light",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Reference / Employment Verification):
- The dominant US practice is fact-only verification: dates of employment, last-held title, and (where authorized in writing by the former employee) salary. Many states grant good-faith immunity for truthful references (e.g., Cal. Civ. Code 47(c) qualified privilege; Tex. Lab. Code 103.003).
- 'Blacklisting' (preventing a former employee from securing employment by communicating false statements) is unlawful in California (Lab. Code 1050–1054), Colorado (C.R.S. 8-2-110), Indiana (IC 22-5-3-2), and other states. Stick to fact-only or fact-plus-positive.
- Salary disclosure: in pay-transparency states (CA Lab. Code 432.3, CO C.R.S. 8-5-201, NY Labor Law 194-b), former employees can request and obtain their own salary records; disclosure to a third party requires written authorization under FCRA where the requester is a consumer reporting agency.
- For background-check requests under the Fair Credit Reporting Act (15 USC 1681 et seq.), respond only with verified factual information.
- Register: neutral, factual. American English throughout.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'). Address to a named recipient if known; otherwise render 'To Whom It May Concern'.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientBlock}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST handle named-recipient and 'To Whom It May Concern' branches correctly.",
        "MUST place date and recipient inside a single <p> separated by <br>.",
      ],
      example: `<p>May 12, 2026<br><br>Ms. Sarah Patel<br>Talent Manager<br>Beacon Capital Partners LLC<br>1271 Avenue of the Americas<br>New York, NY 10020</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>: 'Employment Verification — {Employee Full Name}'.",
      scaffold: `<p><strong>Employment Verification — {{employeeFullName}}</strong></p>`,
      constraints: [
        "MUST be a single line.",
        "MUST include the employee's full name.",
      ],
      example: `<p><strong>Employment Verification — Daniel Okafor</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>: 'Dear Mr./Ms./Dr. {Surname},' or 'To Whom It May Concern:' for an unnamed recipient.",
      scaffold: `<p>{{salutationLine}}</p>`,
      constraints: [
        "MUST match the salutation to the recipient.",
      ],
      example: `<p>Dear Ms. Patel,</p>`,
    },
    {
      sectionId: "body",
      title: "Confirmation of employment",
      instruction:
        "Provide fact-only confirmation by default: full name, dates of employment, last-held title, and (with written authorization) compensation. Two short paragraphs maximum.",
      scaffold: `<p>I confirm that {{employeeFullName}} was employed by {{employerLegalName}} from {{employmentStartDate}} to {{employmentEndDate}} in the position of {{lastHeldPosition}} based at our {{workLocation}} office. {{additionalFactualConfirmations}}</p>
<p>This verification is provided in good faith based on company records and is given without warranty or admission of liability beyond the factual confirmations stated above.</p>`,
      constraints: [
        "MUST limit content to fact-only unless express written authorization permits more.",
        "MUST NOT disclose salary or compensation without written authorization from the former employee.",
        "MUST NOT include statements that could be construed as blacklisting under Cal. Lab. Code 1050.",
        "MUST NOT include unsubstantiated commentary on performance or conduct.",
      ],
      example: `<p>I confirm that Daniel Okafor was employed by Acme Inc. from March 14, 2022 to May 12, 2026 in the position of Senior Software Engineer based at our San Francisco, CA office. Mr. Okafor's separation was voluntary, effective May 12, 2026.</p>
<p>This verification is provided in good faith based on company records and is given without warranty or admission of liability beyond the factual confirmations stated above.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph offering further information on request, followed by 'Sincerely,'.",
      scaffold: `<p>If you require any further information that the company is authorized to share, please contact me at {{signatoryEmail}}.</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST offer a contact for further enquiries.",
      ],
      example: `<p>If you require any further information that the company is authorized to share, please contact me at priya.sharma@acme.example.</p>
<p>Sincerely,</p>`,
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
