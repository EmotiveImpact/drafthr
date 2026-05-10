import type { LetterTemplate } from "../types";

export const WHISTLEBLOWING_UK: LetterTemplate = {
  letterType: "whistleblowing",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Protected Disclosure / PIDA — EMPLOYEE MODE — TRIBUNAL CRITICAL):
- Statutory regime: Public Interest Disclosure Act 1998, inserted into the Employment Rights Act 1996 as ss.43A-43L.
- A "qualifying disclosure" under s.43B is a disclosure of INFORMATION (not a mere allegation — Cavendish Munro Professional Risks Management Ltd v Geduld [2010] IRLR 38) which the worker reasonably believes:
  (a) tends to show one of six categories: (i) criminal offence; (ii) breach of legal obligation; (iii) miscarriage of justice; (iv) danger to health & safety of any individual; (v) damage to environment; (vi) deliberate concealment of any of the foregoing; AND
  (b) is made in the public interest (Chesterton Global Ltd v Nurmohamed [2017] EWCA Civ 979 — interest of more than the worker; small group can suffice).
- The disclosure must be made to a "prescribed person" or otherwise satisfy s.43C-43H to be PROTECTED. Disclosure to the employer is the safest first step (s.43C).
- Once protected, the worker is protected from detriment under s.47B and from automatically unfair dismissal under s.103A — no minimum service period; no compensation cap.
- The letter must STATE the reasonable belief and public-interest basis IN TERMS to anchor the protection.
- Do NOT dress up a personal grievance as a protected disclosure (Chesterton — but Nurmohamed itself shows where lines are).
- This is OPEN correspondence and tribunal-bound. No intensifiers, no admissions, no settlement language. Reserve all rights.
- Counsel review strongly recommended.
- British English. The letter is high-stakes; precision over rhetoric.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "UK date format. Address to: (1) the employer (preferable first step under s.43C ERA 1996); or (2) the prescribed person under SI 2014/2418, if escalating. Where the discloser believes the employer is implicated in the wrongdoing, address to a non-executive director or audit committee chair.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format.",
        "MUST address to a sufficiently senior person (typically the Audit Committee Chair, Senior Independent Director, or General Counsel) where the wrongdoing implicates executives.",
        "Where addressed to a prescribed person, MUST identify the prescribed person under SI 2014/2418.",
      ],
      example: `<p>12 May 2026<br><br>Mr Charles Pettifer<br>Chair of the Audit Committee<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies the letter as a protected disclosure under PIDA / s.43A-L ERA 1996. Do NOT name the wrongdoer in the subject.",
      scaffold: `<p><strong>Disclosure of Information in the Public Interest — s.43A-L Employment Rights Act 1996</strong></p>`,
      constraints: [
        "MUST identify the letter as a protected disclosure / public interest disclosure.",
        "MUST cite ss.43A-L ERA 1996 (or PIDA 1998).",
        "MUST NOT name any individual wrongdoer in the subject.",
      ],
      example: `<p><strong>Disclosure of Information in the Public Interest — s.43A-L Employment Rights Act 1996</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal honorific."],
      example: `<p>Dear Mr Pettifer,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statement of intent — protected disclosure",
      instruction:
        "State plainly: this letter is a qualifying disclosure made in the public interest under s.43B Employment Rights Act 1996; the writer asks the recipient to treat it as such and to ensure that the writer is protected from detriment under s.47B and from automatically unfair dismissal under s.103A. Identify the writer's role and how the writer came to know the matters disclosed.",
      scaffold: `<p>I am writing to make a qualifying disclosure under section 43B of the Employment Rights Act 1996. I make this disclosure in the public interest and ask that I be afforded the protections from detriment and dismissal set out in sections 47B and 103A of the same Act.</p>
<p>I am employed by {{employerLegalName}} as {{employeeJobTitle}}, since {{employeeStartDateUK}}. I came to know the matters set out below in the course of my role and have considered carefully whether to bring them to the Company's attention. I have reasonable belief that the information tends to show the matters set out below.</p>`,
      constraints: [
        "MUST cite s.43B ERA 1996 expressly.",
        "MUST request the protections of s.47B and s.103A by reference.",
        "MUST identify the writer's role and how the writer came to know the matters.",
        "MUST state 'reasonable belief' in terms.",
        "MUST NOT use intensifiers.",
      ],
      example: `<p>I am writing to make a qualifying disclosure under section 43B of the Employment Rights Act 1996. I make this disclosure in the public interest and ask that I be afforded the protections from detriment and dismissal set out in sections 47B and 103A of the same Act.</p>
<p>I am employed by Acme Holdings Limited as Senior Finance Controller, since 4 March 2022. I came to know the matters set out below in the course of my role in reviewing the Q1 2026 financial close and have considered carefully whether to bring them to the Company's attention. I have reasonable belief that the information tends to show the matters set out below.</p>`,
    },
    {
      sectionId: "chronology",
      title: "Information disclosed (factual, dated, specific)",
      instruction:
        "Information, not allegations. Specific, dated facts: who, what, when, where, how the writer knows. Reference documents the writer has seen. Numbered list. No motive findings; no rhetoric. This is the heart of the disclosure — a court will scrutinise whether what is disclosed is INFORMATION sufficient to engage s.43B.",
      scaffold: `<p>The information I disclose is as follows:</p>
<ol>
  <li><strong>{{fact1Date}}</strong> — {{fact1Description}}. {{fact1SourceOfKnowledge}}.</li>
  <li><strong>{{fact2Date}}</strong> — {{fact2Description}}. {{fact2SourceOfKnowledge}}.</li>
  <li><strong>{{fact3Date}}</strong> — {{fact3Description}}. {{fact3SourceOfKnowledge}}.</li>
</ol>
<p>{{ongoingPatternParagraph}}</p>`,
      constraints: [
        "MUST disclose INFORMATION (specific facts, dates, amounts, individuals) — not bare allegations.",
        "MUST identify how the writer came to know each fact (mailbox, system, meeting, document).",
        "MUST reference any document by date and title.",
        "MUST NOT include motive findings or speculation.",
        "MUST NOT use intensifiers.",
      ],
      example: `<p>The information I disclose is as follows:</p>
<ol>
  <li><strong>10 February 2026</strong> — In a finance leadership meeting attended by Marcus Chen (CFO), Daniel Okafor (Group Financial Controller) and me, Mr Chen instructed me to "hold back" recognition of two large customer credits totalling £1.84m relating to the Bayfield contract until the start of Q2. I expressed concern that the credits had been earned in Q1 under IFRS 15 and that delaying their recognition would inflate Q1 revenue. The minutes of the meeting (attached) record this instruction.</li>
  <li><strong>17 February 2026</strong> — I received an email from Mr Okafor (attached, sent at 18.42) directing me to "process the Bayfield credits in the period 1 to 7 April 2026 — final adjustment, no entries before". The email is in conflict with the Group Revenue Recognition Policy v.4 (clause 6.2), which requires credits to be recognised in the period earned.</li>
  <li><strong>3 March 2026</strong> — At the Q1 close on 3 March 2026 the £1.84m had not been recognised. The Q1 financial pack signed off by Mr Chen and presented to the Board on 18 March 2026 reported revenue of £42.6m; the figure on a compliant basis would, on my analysis, have been £40.76m.</li>
</ol>
<p>The arrangement appears to me to be ongoing: I have been asked, in a meeting on 28 April 2026, to apply the same approach to a further set of credits relating to the Northwood contract, totalling approximately £0.9m, in respect of Q2 2026.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Reasonable belief and public-interest basis",
      instruction:
        "State, in terms, the reasonable belief and the s.43B(1) category engaged. Address the public-interest test by reference to Chesterton v Nurmohamed [2017]. Address why the matter is not merely a personal grievance.",
      scaffold: `<p>I have reasonable belief that the information set out above tends to show: {{categoryEngaged}} (s.43B(1)({{subSection}}) ERA 1996). The bases of my reasonable belief are: {{basesOfBelief}}.</p>
<p>I make this disclosure in the public interest. The matters disclosed affect {{publicInterestGroup}} and not solely or primarily my personal interests; the Court of Appeal in Chesterton Global Ltd v Nurmohamed [2017] EWCA Civ 979 has confirmed that a sufficiently large group can satisfy the public-interest threshold. This disclosure does not arise from any personal grievance and I am not seeking any personal benefit by making it.</p>`,
      constraints: [
        "MUST identify the s.43B(1) category engaged ((a)-(f)).",
        "MUST state the bases of reasonable belief.",
        "MUST address the public-interest test and cite Chesterton v Nurmohamed.",
        "MUST disclaim that this is a personal grievance.",
        "MUST NOT state legal conclusions of fact.",
      ],
      example: `<p>I have reasonable belief that the information set out above tends to show: (a) the commission of one or more criminal offences (false accounting under s.17 Theft Act 1968 and / or fraud by false representation under s.2 Fraud Act 2006) and (b) a breach of legal obligation (compliance with IFRS 15 and the Companies Act 2006 requirement that the accounts give a true and fair view) (s.43B(1)(a) and (b) ERA 1996). The bases of my reasonable belief are: (i) the documents quoted above; (ii) my professional accounting qualification (ACA); and (iii) my direct involvement in the Q1 close.</p>
<p>I make this disclosure in the public interest. The matters disclosed affect the Company's shareholders, lenders, and any prospective investor relying on the Q1 financial information, as well as employees whose bonuses depend on the reported figures. The Court of Appeal in Chesterton Global Ltd v Nurmohamed [2017] EWCA Civ 979 has confirmed that a sufficiently large group can satisfy the public-interest threshold. This disclosure does not arise from any personal grievance and I am not seeking any personal benefit by making it.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for response and protection",
      instruction:
        "Ask for a confidential investigation by an independent investigator with no involvement in the matters disclosed. Ask for confirmation in writing of the protection from detriment under s.47B. Suggest external assistance (auditors, regulator) where escalation may be appropriate. Confirm willingness to assist the investigation.",
      scaffold: `<p>I ask the Company to:</p>
<ul>
  <li>investigate the matters set out above promptly and through an investigator with no prior involvement (and, where appropriate, by reference to the Company's external auditors and / or the Financial Reporting Council);</li>
  <li>confirm to me in writing that I will not be subjected to any detriment in the course of, or by reason of, my having made this disclosure (s.47B ERA 1996);</li>
  <li>provide me with a written outcome of the investigation in due course; and</li>
  <li>treat this letter and its enclosures as confidential to those who need to know for the purposes of the investigation.</li>
</ul>
<p>I am willing to be interviewed in connection with the investigation and to assist as required.</p>`,
      constraints: [
        "MUST request investigation by an investigator with no prior involvement.",
        "MUST request written confirmation of s.47B protection.",
        "MUST request confidentiality.",
        "MUST NOT impose a unilateral deadline that prejudices a proper investigation.",
      ],
      example: `<p>I ask the Company to:</p>
<ul>
  <li>investigate the matters set out above promptly and through an investigator with no prior involvement (and, where appropriate, by reference to the Company's external auditors and / or the Financial Reporting Council);</li>
  <li>confirm to me in writing that I will not be subjected to any detriment in the course of, or by reason of, my having made this disclosure (s.47B ERA 1996);</li>
  <li>provide me with a written outcome of the investigation in due course; and</li>
  <li>treat this letter and its enclosures as confidential to those who need to know for the purposes of the investigation.</li>
</ul>
<p>I am willing to be interviewed in connection with the investigation and to assist as required.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve rights including under s.47B (detriment) and s.103A (automatic unfair dismissal). Reference the right to make further protected disclosures to a prescribed person under SI 2014/2418 (e.g. FCA, FRC, HSE) if necessary.",
      scaffold: `<p>I reserve all my rights, including the right to bring proceedings under sections 47B and 103A of the Employment Rights Act 1996 in the event of any detriment or dismissal connected to this disclosure, and the right (without limitation of any other right) to make a further qualifying disclosure to a prescribed person under the Public Interest Disclosure (Prescribed Persons) Order 2014 (SI 2014/2418), including {{prescribedPersonExamples}}, if I consider it necessary in the public interest.</p>`,
      constraints: [
        "MUST reserve s.47B and s.103A ERA rights expressly.",
        "MUST reference the prescribed person regime (SI 2014/2418).",
      ],
      example: `<p>I reserve all my rights, including the right to bring proceedings under sections 47B and 103A of the Employment Rights Act 1996 in the event of any detriment or dismissal connected to this disclosure, and the right (without limitation of any other right) to make a further qualifying disclosure to a prescribed person under the Public Interest Disclosure (Prescribed Persons) Order 2014 (SI 2014/2418), including the Financial Conduct Authority and the Financial Reporting Council, if I consider it necessary in the public interest.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short, neutral. 'Yours sincerely,'.",
      scaffold: `<p>I look forward to your written acknowledgement.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST be neutral, no warmth.",
      ],
      example: `<p>I look forward to your written acknowledgement.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role, employee number, contact address (separate from work).",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>Employee No. {{employeeNumber}}<br>{{employeeContactAddress}}</p>`,
      constraints: [
        "MUST include a contact address (the writer's home or personal address) so any retaliation cannot intercept correspondence.",
      ],
      example: `<p>Sarah Williams<br>Senior Finance Controller (ACA)<br>Employee No. 04231<br>14 Rosewood Avenue, London N4 2QX</p>`,
    },
  ],
};

export const WHISTLEBLOWING_US: LetterTemplate = {
  letterType: "whistleblowing",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Whistleblower Disclosure — EMPLOYEE MODE — LITIGATION CRITICAL):
- Multiple federal and state statutes provide whistleblower protection. Identify the applicable statute(s) precisely:
  - Sarbanes-Oxley §806 (18 U.S.C. §1514A) — publicly traded companies; 180-day window to file with OSHA after retaliation.
  - Dodd-Frank §922 (15 U.S.C. §78u-6) — securities-law violations; SEC bounty program.
  - False Claims Act 31 U.S.C. §3730(h) — government contracts.
  - Cal. Lab. Code §1102.5 — broad California whistleblower statute.
  - NLRA §7 (29 U.S.C. §157) — concerted activity.
  - OSHA whistleblower (29 U.S.C. §660(c)) — health and safety.
  - State-specific statutes (NY Labor Law §740, NJ CEPA, etc.).
- The Defend Trade Secrets Act 2016 (18 U.S.C. §1833(b)) provides immunity for confidential disclosure of trade secrets to a federal/state government official or attorney for the purpose of reporting or investigating a suspected violation of law — the letter should reference this where the writer is concerned about a trade-secret claim being used as retaliation.
- The disclosure must be of FACTS / INFORMATION, not bald allegations. Specificity matters.
- This is OPEN correspondence — no intensifiers, no admissions. Reserve all rights including the right to file with OSHA / SEC / DOL / state agency.
- American English. Counsel review strongly recommended.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "US date format. Address to a sufficiently senior person — typically the Audit Committee Chair, General Counsel, or Chief Compliance Officer — where the wrongdoing implicates executives.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST address to a sufficiently senior person.",
      ],
      example: `<p>May 12, 2026<br><br>Mr. Charles Pettifer<br>Chair, Audit Committee<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies as protected whistleblower disclosure under the relevant statute(s).",
      scaffold: `<p><strong>Protected Whistleblower Disclosure — {{statuteList}}</strong></p>`,
      constraints: [
        "MUST identify the letter as a protected whistleblower disclosure.",
        "MUST cite the specific statute(s).",
      ],
      example: `<p><strong>Protected Whistleblower Disclosure — Sarbanes-Oxley §806 (18 U.S.C. §1514A) and Cal. Lab. Code §1102.5</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal."],
      example: `<p>Dear Mr. Pettifer,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statement of intent — protected disclosure",
      instruction:
        "State plainly: this is a protected whistleblower disclosure under the cited statute(s); the writer has a reasonable belief that the conduct violates the listed laws/regulations; and asks for protection from retaliation.",
      scaffold: `<p>I am writing to make a protected whistleblower disclosure under {{statuteList}}. I make this disclosure based on my reasonable belief that the matters set out below constitute a violation of {{lawsViolated}}, and I ask that I be afforded the protections from retaliation provided under those statutes.</p>
<p>I am employed by {{employerLegalName}} as {{employeeJobTitle}}, since {{employeeStartDateUS}}. I came to know the matters set out below in the course of my role and have considered carefully whether to bring them to the Company's attention.</p>`,
      constraints: [
        "MUST cite the specific statute(s) by name and section.",
        "MUST state reasonable belief in terms.",
        "MUST identify the laws/regulations the writer believes have been violated.",
        "MUST request anti-retaliation protection.",
      ],
      example: `<p>I am writing to make a protected whistleblower disclosure under Sarbanes-Oxley §806 (18 U.S.C. §1514A) and Cal. Lab. Code §1102.5. I make this disclosure based on my reasonable belief that the matters set out below constitute a violation of (i) the federal securities laws, including 17 C.F.R. §240.10b-5 and SEC Regulation S-X; (ii) Sections 13 and 15(d) of the Securities Exchange Act of 1934; and (iii) the Company's obligations under the Sarbanes-Oxley Act, and I ask that I be afforded the protections from retaliation provided under those statutes.</p>
<p>I am employed by Acme Inc. as Senior Finance Controller, since March 4, 2022. I came to know the matters set out below in the course of my role in reviewing the Q1 2026 financial close.</p>`,
    },
    {
      sectionId: "chronology",
      title: "Information disclosed (factual, dated, specific)",
      instruction:
        "Information, not allegations. Numbered list. Specific facts, dates, amounts, individuals, source of knowledge. Reference documents. No motive findings; no rhetoric.",
      scaffold: `<p>The information I disclose is as follows:</p>
<ol>
  <li><strong>{{fact1Date}}</strong> — {{fact1Description}}. {{fact1SourceOfKnowledge}}.</li>
  <li><strong>{{fact2Date}}</strong> — {{fact2Description}}. {{fact2SourceOfKnowledge}}.</li>
  <li><strong>{{fact3Date}}</strong> — {{fact3Description}}. {{fact3SourceOfKnowledge}}.</li>
</ol>
<p>{{ongoingPatternParagraph}}</p>`,
      constraints: [
        "MUST disclose INFORMATION (specific facts, dates, amounts).",
        "MUST identify how the writer came to know each fact.",
        "MUST reference documents by date and title.",
        "MUST NOT include motive findings.",
        "MUST NOT use intensifiers.",
      ],
      example: `<p>The information I disclose is as follows:</p>
<ol>
  <li><strong>February 10, 2026</strong> — In a finance leadership meeting attended by Marcus Chen (CFO), Daniel Okafor (Group Financial Controller), and me, Mr. Chen instructed me to "hold back" recognition of two large customer credits totaling $2.3M relating to the Bayfield contract until the start of Q2. I expressed concern that the credits were earned in Q1 under ASC 606 and that delaying their recognition would inflate Q1 revenue. The minutes of the meeting (attached) record this instruction.</li>
  <li><strong>February 17, 2026</strong> — I received an email from Mr. Okafor (attached, sent at 6:42pm) directing me to "process the Bayfield credits in the period April 1 to 7, 2026 — final adjustment, no entries before". The email conflicts with the Group Revenue Recognition Policy v.4 (§6.2).</li>
  <li><strong>March 3, 2026</strong> — At the Q1 close on March 3, 2026 the $2.3M had not been recognized. The Q1 financial pack signed off by Mr. Chen and presented to the Board on March 18, 2026 reported revenue of $52.6M; the figure on a compliant basis would, on my analysis, have been $50.3M.</li>
</ol>
<p>The arrangement appears to be ongoing: in a meeting on April 28, 2026 I was asked to apply the same approach to a further set of credits relating to the Northwood contract, totaling approximately $1.1M, in respect of Q2 2026.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Reasonable belief and statutory basis",
      instruction:
        "State the reasonable belief in terms; identify the laws / SEC regulations / company policies the writer believes are violated. Disclaim that this is a personal grievance.",
      scaffold: `<p>I have reasonable belief that the information set out above tends to show: {{violationsList}}. The bases of my reasonable belief are: {{basesOfBelief}}.</p>
<p>This disclosure does not arise from any personal grievance and I am not seeking any personal benefit by making it. I make it because I consider that I am required to do so by my professional obligations and because the matters disclosed affect the Company's shareholders, lenders, and any prospective investor relying on the financial information.</p>`,
      constraints: [
        "MUST identify the specific laws / regulations the writer believes are violated.",
        "MUST state bases of reasonable belief.",
        "MUST disclaim that this is a personal grievance.",
      ],
      example: `<p>I have reasonable belief that the information set out above tends to show: (i) materially misleading public financial statements in violation of 17 C.F.R. §240.10b-5; (ii) inadequate internal controls over financial reporting in violation of Sections 302 and 404 of the Sarbanes-Oxley Act; and (iii) violations of generally accepted accounting principles, specifically ASC 606 (Revenue from Contracts with Customers). The bases of my reasonable belief are: (a) the documents referenced above; (b) my professional accounting qualification (CPA, California, license #142387); and (c) my direct involvement in the Q1 close.</p>
<p>This disclosure does not arise from any personal grievance and I am not seeking any personal benefit by making it. I make it because I consider that I am required to do so by my professional obligations and because the matters disclosed affect the Company's shareholders, lenders, and any prospective investor relying on the financial information.</p>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for response and protection",
      instruction:
        "Request: independent investigation; written confirmation of anti-retaliation protection; confidentiality. Reference the Defend Trade Secrets Act 2016 immunity for any confidential information referenced.",
      scaffold: `<p>I ask the Company to:</p>
<ul>
  <li>investigate the matters set out above promptly and through an investigator with no prior involvement (and, where appropriate, by reference to the Company's external auditors and the Audit Committee);</li>
  <li>confirm to me in writing that I will not be subjected to any retaliation in the course of, or by reason of, my having made this disclosure;</li>
  <li>provide me with a written outcome of the investigation in due course; and</li>
  <li>treat this letter and its enclosures as confidential to those who need to know for the purposes of the investigation.</li>
</ul>
<p>To the extent that any information referenced in this letter is or may be a trade secret, I disclose it pursuant to the immunity provided by 18 U.S.C. §1833(b) (Defend Trade Secrets Act of 2016) for confidential disclosure to a federal or state government official or attorney for the purpose of reporting or investigating a suspected violation of law.</p>`,
      constraints: [
        "MUST request independent investigation, anti-retaliation confirmation, and confidentiality.",
        "MUST reference 18 U.S.C. §1833(b) DTSA immunity.",
      ],
      example: `<p>I ask the Company to:</p>
<ul>
  <li>investigate the matters set out above promptly and through an investigator with no prior involvement (and, where appropriate, by reference to the Company's external auditors and the Audit Committee);</li>
  <li>confirm to me in writing that I will not be subjected to any retaliation in the course of, or by reason of, my having made this disclosure;</li>
  <li>provide me with a written outcome of the investigation in due course; and</li>
  <li>treat this letter and its enclosures as confidential to those who need to know for the purposes of the investigation.</li>
</ul>
<p>To the extent that any information referenced in this letter is or may be a trade secret, I disclose it pursuant to the immunity provided by 18 U.S.C. §1833(b) (Defend Trade Secrets Act of 2016) for confidential disclosure to a federal or state government official or attorney for the purpose of reporting or investigating a suspected violation of law.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve rights including the right to file with OSHA, SEC, DOL, state agency. Reference SOX §806 180-day window where applicable.",
      scaffold: `<p>I reserve all of my rights, including the right (without limitation) to file a complaint with the Occupational Safety and Health Administration under Section 806 of the Sarbanes-Oxley Act within the 180-day window from any retaliatory act, the right to make a tip to the U.S. Securities and Exchange Commission under the Dodd-Frank whistleblower program, the right to file a complaint with the {{stateAgency}}, and the right to bring suit. Nothing in this letter should be construed as a waiver of any right.</p>`,
      constraints: [
        "MUST reserve OSHA / SOX rights with the 180-day window where applicable.",
        "MUST reserve state agency / SEC / DOL rights as relevant.",
      ],
      example: `<p>I reserve all of my rights, including the right (without limitation) to file a complaint with the Occupational Safety and Health Administration under Section 806 of the Sarbanes-Oxley Act within the 180-day window from any retaliatory act, the right to make a tip to the U.S. Securities and Exchange Commission under the Dodd-Frank whistleblower program, the right to file a complaint with the California Labor Commissioner under Cal. Lab. Code §1102.5, and the right to bring suit. Nothing in this letter should be construed as a waiver of any right.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction: "Short, neutral. 'Sincerely,'.",
      scaffold: `<p>I look forward to your written acknowledgement.</p>
<p>Sincerely,</p>`,
      constraints: ["MUST use 'Sincerely,'."],
      example: `<p>I look forward to your written acknowledgement.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, role with credentials, employee ID, personal contact address.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>Employee ID {{employeeNumber}}<br>{{employeeContactAddress}}</p>`,
      constraints: ["MUST include a personal contact address."],
      example: `<p>Sarah Williams, CPA<br>Senior Finance Controller<br>Employee ID 04231<br>124 Pine Street, San Francisco, CA 94108</p>`,
    },
  ],
};
