import type { LetterTemplate } from "../types";

export const GRIEVANCE_UK: LetterTemplate = {
  letterType: "grievance",
  jurisdiction: "UK",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Formal Grievance — EMPLOYEE MODE):
- This is Step 1 of the ACAS Code of Practice on Disciplinary and Grievance Procedures. The letter must be in writing and set out the basis of the grievance plainly.
- Failure to follow the ACAS Code on either side may lead the tribunal to adjust awards by up to 25% under s.207A TULRCA 1992.
- Right to be accompanied at any grievance hearing under s.10 Employment Relations Act 1999 (colleague or trade union representative).
- Where protected characteristics are implicated under the Equality Act 2010, frame as BELIEF ('I believe these matters are connected to my [characteristic], in violation of the Equality Act 2010'). NEVER state discrimination as a legal conclusion of fact.
- This is OPEN correspondence — anything written may be disclosed in tribunal proceedings under r.31 ET Procedure Rules. No intensifiers ('clearly', 'blatantly', 'outrageously'), no admissions, no threats, no settlement language.
- Strict factual chronology with dates, named individuals, named witnesses. Avoid vague time references.
- British English throughout (organisation, behaviour, recognise, harassed).
- Reserve all rights at the close.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in UK format ('12 May 2026'), then the recipient (typically HR Director or named manager) on separate lines, wrapped in a single <p> with <br>. Address by job title and employer legal name.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format ('12 May 2026'), not '12/05/2026'.",
        "MUST address the letter to a specific named individual or, where unknown, to 'The HR Director'.",
        "MUST NOT include 'Dear' here.",
        "MUST place the date and address inside a single <p> separated by <br>.",
      ],
      example: `<p>12 May 2026<br><br>Ms Priya Sharma<br>HR Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject line in <strong>. Identify the letter as a 'Formal Grievance' under the ACAS Code. Do not name the protected characteristic in the subject line.",
      scaffold: `<p><strong>Formal Grievance under the ACAS Code of Practice</strong></p>`,
      constraints: [
        "MUST be a single line wrapped in <strong>.",
        "MUST identify the letter as a Formal Grievance.",
        "MUST NOT include 'Without Prejudice' (open correspondence).",
        "MUST NOT name the protected characteristic in the subject (preserves discretion).",
      ],
      example: `<p><strong>Formal Grievance under the ACAS Code of Practice</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "Render exactly one short <p>. Use 'Dear Mr/Ms/Dr {Surname},'. End with a comma.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST NOT use first names unless preferred form supplied.",
      ],
      example: `<p>Dear Ms Sharma,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statement that this is a formal grievance",
      instruction:
        "One short paragraph. State plainly that the letter constitutes a formal grievance under the ACAS Code of Practice. Identify the writer's role and length of service. Do not summarise the substance here.",
      scaffold: `<p>I am writing to raise a formal grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures. I have been employed by {{employerLegalName}} as {{employeeJobTitle}} since {{employeeStartDateUK}}. The matters set out below have caused me significant concern and I now ask that they be investigated and addressed through the formal grievance process.</p>`,
      constraints: [
        "MUST identify the letter as a formal grievance under the ACAS Code.",
        "MUST state job title and start date.",
        "MUST NOT summarise the substance — that belongs in the chronology.",
        "MUST NOT use intensifiers ('serious', 'severe').",
      ],
      example: `<p>I am writing to raise a formal grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures. I have been employed by Acme Holdings Limited as Senior Marketing Manager since 4 March 2022. The matters set out below have caused me significant concern and I now ask that they be investigated and addressed through the formal grievance process.</p>`,
    },
    {
      sectionId: "chronology",
      title: "Background and chronology",
      instruction:
        "Set out the facts in strict chronological order. Use dated paragraphs (or a numbered list where multiple discrete incidents). Each entry: date, named individual(s), what was said or done, who else was present. Paraphrase rather than quoting unless a verbatim record exists. 4-8 incidents is typical. No intensifiers.",
      scaffold: `<p>The matters giving rise to this grievance are as follows:</p>
<ol>
  <li><strong>{{incident1Date}}</strong> — {{incident1Description}}. {{incident1Witnesses}}</li>
  <li><strong>{{incident2Date}}</strong> — {{incident2Description}}. {{incident2Witnesses}}</li>
  <li><strong>{{incident3Date}}</strong> — {{incident3Description}}. {{incident3Witnesses}}</li>
</ol>
<p>{{patternOrEscalationParagraph}}</p>`,
      constraints: [
        "MUST present incidents in strict chronological order with specific dates.",
        "MUST name the individual(s) involved in each incident.",
        "MUST identify any witnesses by name and role.",
        "MUST paraphrase rather than quote, unless a verbatim record (email, recording transcript) was supplied.",
        "MUST NOT use intensifiers ('clearly', 'blatantly', 'outrageously', 'shocking').",
        "MUST NOT include findings of motive — describe conduct, not state of mind.",
      ],
      example: `<p>The matters giving rise to this grievance are as follows:</p>
<ol>
  <li><strong>14 January 2026</strong> — During a team meeting in the third-floor conference room, my line manager Marcus Chen referred to me in front of the team as "the diversity hire" and stated that I had been promoted "to fill a quota". The remarks were heard by Sarah Williams, James O'Brien and Aisha Rahman.</li>
  <li><strong>3 February 2026</strong> — Following an internal recruitment round for the Head of Brand role, for which I had applied, Mr Chen told me in a one-to-one meeting that I "wasn't quite the right fit for the leadership group" and that I should "stay focused on what you do well". A male colleague with shorter tenure and fewer line-management years was appointed.</li>
  <li><strong>21 March 2026</strong> — At the quarterly business review, Mr Chen interrupted my presentation twice to question my figures, then immediately afterwards praised an identical methodology used by Tom Bryant. This was witnessed by the entire UK leadership team.</li>
  <li><strong>10 April 2026</strong> — When I raised the pattern informally with Mr Chen, he told me I was "being oversensitive" and that I should "drop it before it became a problem".</li>
</ol>
<p>The conduct has continued and, in my view, has escalated since I declined to drop the matter. I no longer consider that the issues can be resolved informally.</p>`,
    },
    {
      sectionId: "witnesses",
      title: "Witnesses and supporting documents",
      instruction:
        "List, where known, the witnesses to the incidents and the documents the writer can produce or asks to be reviewed. One short paragraph or short list. Do not summarise what the witnesses will say.",
      scaffold: `<p>The following individuals witnessed one or more of the events set out above and may be able to assist your investigation:</p>
<ul>
  <li>{{witness1Name}}, {{witness1Role}}</li>
  <li>{{witness2Name}}, {{witness2Role}}</li>
</ul>
<p>The following documents are relevant: {{documentList}}.</p>`,
      constraints: [
        "MUST name witnesses with role/title.",
        "MUST list documents by category (emails, calendar invites, performance review, recruitment scoring sheets).",
        "MUST NOT summarise what witnesses 'will say' — leave that to the investigation.",
        "MUST NOT include witness contact details unless they are colleagues at the same employer.",
      ],
      example: `<p>The following individuals witnessed one or more of the events set out above and may be able to assist your investigation:</p>
<ul>
  <li>Sarah Williams, Senior Marketing Executive</li>
  <li>James O'Brien, Brand Manager</li>
  <li>Aisha Rahman, Marketing Co-ordinator</li>
</ul>
<p>I can produce the email of 4 February 2026 from Mr Chen explaining the Head of Brand outcome, the recruitment scoring matrix (which I have requested through HR but not yet received), my last three performance reviews, and the calendar invitations for the meetings of 14 January, 3 February and 10 April 2026.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Protected-characteristic basis",
      instruction:
        "Frame any protected-characteristic angle as a BELIEF, not as a legal conclusion. Cite the Equality Act 2010 by section where appropriate (s.13 direct discrimination, s.19 indirect, s.26 harassment, s.27 victimisation). One short paragraph. Reservation language is mandatory.",
      scaffold: `<p>I believe that the matters set out above are connected to my {{protectedCharacteristic}} and may amount to {{discriminationType}} contrary to the Equality Act 2010 ({{relevantSections}}). I raise this on the basis of my reasonable belief and reserve my position as to the legal characterisation, which is a matter for any subsequent investigation, hearing, or proceedings.</p>`,
      constraints: [
        "MUST frame the discrimination point as 'I believe' / 'may amount to', NOT 'this is unlawful discrimination'.",
        "MUST cite the Equality Act 2010 and the relevant section(s).",
        "MUST reserve position as to legal characterisation.",
        "MUST NOT state findings of motive on the part of any individual.",
      ],
      example: `<p>I believe that the matters set out above are connected to my sex and race and may amount to direct discrimination and harassment contrary to sections 13 and 26 of the Equality Act 2010, and to victimisation contrary to section 27 in respect of events following 10 April 2026. I raise this on the basis of my reasonable belief and reserve my position as to the legal characterisation, which is a matter for any subsequent investigation, hearing, or proceedings.</p>`,
    },
    {
      sectionId: "impact",
      title: "Impact statement",
      instruction:
        "One short paragraph describing the practical impact on the writer's work and wellbeing. Factual, restrained. Mention any GP / OH involvement only if true. Do not exaggerate; do not minimise.",
      scaffold: `<p>The matters set out above have had a significant impact on my work and wellbeing. {{specificImpact}}.</p>`,
      constraints: [
        "MUST describe specific, observable impact (sleep, performance, attendance, GP visit, OH referral).",
        "MUST NOT use clinical labels ('I am clinically depressed') unless supported by a medical document.",
        "MUST NOT include speculative future impact.",
        "MUST NOT use intensifiers.",
      ],
      example: `<p>The matters set out above have had a significant impact on my work and wellbeing. I have experienced sustained anxiety, my sleep has been disrupted, and I have found it difficult to participate in meetings led by Mr Chen. I attended my GP on 18 April 2026 in connection with these symptoms and a copy of the fit note dated that day is available on request.</p>`,
    },
    {
      sectionId: "outcome_sought",
      title: "Outcome sought",
      instruction:
        "List 1-3 specific outcomes. Be precise: a formal investigation, a finding on the conduct, a sanction, a workplace adjustment, an apology, a pay correction. Use a short bulleted list.",
      scaffold: `<p>The outcomes I seek from this grievance are:</p>
<ul>
  <li>{{outcome1}}</li>
  <li>{{outcome2}}</li>
  <li>{{outcome3}}</li>
</ul>`,
      constraints: [
        "MUST list 1-3 specific, actionable outcomes.",
        "MUST NOT demand any specific sanction by name (the panel decides) — phrase as 'appropriate action'.",
        "MUST NOT include monetary demands here (those belong in settlement correspondence).",
        "MUST NOT use threatening language about consequences if outcomes not met.",
      ],
      example: `<p>The outcomes I seek from this grievance are:</p>
<ul>
  <li>A prompt and impartial investigation by an investigator with no prior reporting relationship with Mr Chen, with the witnesses interviewed and the documents reviewed.</li>
  <li>A finding on each of the incidents set out above and on the pattern they form.</li>
  <li>Appropriate action to ensure that, while the investigation is ongoing and thereafter, my reporting line is adjusted so that I no longer report to Mr Chen, and that I am not penalised for raising this grievance.</li>
</ul>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for hearing and accompaniment",
      instruction:
        "Request a grievance hearing under the ACAS Code, reference the right to be accompanied under s.10 ERelA 1999, and request a written outcome. One short paragraph.",
      scaffold: `<p>I would be grateful for confirmation of the next steps and the timetable for the grievance hearing. I confirm that I will be accompanied at the hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999, and I ask that the written outcome of the grievance and any right of appeal be confirmed to me in writing within a reasonable period after the hearing.</p>`,
      constraints: [
        "MUST request a grievance hearing.",
        "MUST cite s.10 ERelA 1999 for the right to be accompanied.",
        "MUST request a written outcome.",
        "MUST NOT impose a unilateral deadline on the employer (the ACAS Code requires reasonable timing).",
      ],
      example: `<p>I would be grateful for confirmation of the next steps and the timetable for the grievance hearing. I confirm that I will be accompanied at the hearing by a colleague or trade union representative under section 10 of the Employment Relations Act 1999, and I ask that the written outcome of the grievance and any right of appeal be confirmed to me in writing within a reasonable period after the hearing.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Mandatory single short paragraph. Reserve all rights, statutory, contractual, and common-law. Do not enumerate every potential claim.",
      scaffold: `<p>I reserve all my rights, including any statutory, contractual, and common-law remedies that may be available to me. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part.</p>`,
      constraints: [
        "MUST be a single paragraph reserving all rights.",
        "MUST NOT itemise specific tribunal claims by name.",
        "MUST NOT include 'Without Prejudice' marking (open correspondence).",
      ],
      example: `<p>I reserve all my rights, including any statutory, contractual, and common-law remedies that may be available to me. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short closing paragraph and 'Yours sincerely,'. Polite but not warm. No thanks for past treatment.",
      scaffold: `<p>I look forward to hearing from you and to engaging constructively with the grievance process.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,' (named recipient).",
        "MUST NOT include thanks, warmth, or 'I appreciate your time'.",
        "MUST NOT include any concession or expression of regret about raising the grievance.",
      ],
      example: `<p>I look forward to hearing from you and to engaging constructively with the grievance process.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Two or three lines wrapped in a <p> with <br>: writer's name, job title, employee number where supplied. No employer letterhead.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: [
        "MUST be employee's name, job title, and (where supplied) employee number.",
        "MUST NOT include any employer letterhead or footer.",
      ],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee No. 04231</p>`,
    },
  ],
};

export const GRIEVANCE_US: LetterTemplate = {
  letterType: "grievance",
  jurisdiction: "US",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Internal Complaint — EMPLOYEE MODE):
- This letter puts the employer on formal notice for Faragher v. City of Boca Raton / Burlington Industries v. Ellerth purposes — the employer's affirmative defense to vicarious liability for hostile work environment turns on whether it had the chance to respond.
- Title VII / ADA / ADEA / FEHA / state anti-discrimination law: where a protected characteristic is implicated, frame as 'I believe I was treated differently because of my [characteristic]'. NEVER state discrimination as a legal conclusion.
- This is OPEN correspondence — anything written may be produced in EEOC charge proceedings or federal/state court litigation. No intensifiers, no admissions, no settlement language.
- Strict factual chronology with dates, named individuals, named witnesses.
- American English throughout (color, organization, behavior, recognized).
- Reserve all rights including the right to file an EEOC charge or state agency complaint.
- For NLRA-protected concerted activity, NLRA §7 protects discussion of working conditions.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "Render the issue date in US format ('May 12, 2026'), then the recipient (typically Director of HR or Chief People Officer) on separate lines, wrapped in a single <p> with <br>.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format ('May 12, 2026'), not '5/12/2026'.",
        "MUST address to a specific named individual or 'Director of Human Resources'.",
        "MUST NOT include greeting here.",
      ],
      example: `<p>May 12, 2026<br><br>Ms. Priya Sharma<br>Chief People Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Render a single short <p> with the subject in <strong>. Identify as 'Formal Internal Complaint' to put the employer on notice for Faragher–Ellerth purposes. Do not name the protected class in the subject.",
      scaffold: `<p><strong>Formal Internal Complaint — Notice Pursuant to Company Anti-Harassment Policy</strong></p>`,
      constraints: [
        "MUST identify the letter as a formal internal complaint.",
        "MUST NOT name protected class in the subject.",
        "MUST NOT mark Without Prejudice (open).",
      ],
      example: `<p><strong>Formal Internal Complaint — Notice Pursuant to Company Anti-Harassment Policy</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction:
        "One short <p>. 'Dear Mr./Ms./Dr. {Surname},'. End with a comma.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: [
        "MUST be one line.",
        "MUST use US-style honorific with period.",
      ],
      example: `<p>Dear Ms. Sharma,</p>`,
    },
    {
      sectionId: "opening",
      title: "Statement that this is a formal complaint",
      instruction:
        "One short paragraph. State plainly that the letter is a formal internal complaint pursuant to the company's anti-harassment / anti-discrimination policy. Identify the writer's role and length of service. Do not summarise substance here.",
      scaffold: `<p>I am writing to file a formal internal complaint pursuant to {{employerLegalName}}'s anti-harassment and anti-discrimination policy. I have been employed by the Company as {{employeeJobTitle}} since {{employeeStartDateUS}}. The matters set out below are the basis of this complaint and I request that the Company investigate and address them through its formal complaint process.</p>`,
      constraints: [
        "MUST identify the letter as a formal internal complaint under company policy.",
        "MUST state job title and start date.",
        "MUST NOT summarize substance here.",
      ],
      example: `<p>I am writing to file a formal internal complaint pursuant to Acme Inc.'s anti-harassment and anti-discrimination policy. I have been employed by the Company as Senior Marketing Manager since March 4, 2022. The matters set out below are the basis of this complaint and I request that the Company investigate and address them through its formal complaint process.</p>`,
    },
    {
      sectionId: "chronology",
      title: "Background and chronology",
      instruction:
        "Strict chronological order, dated, named individuals, named witnesses. Numbered list of incidents. Paraphrase, do not quote unless verbatim record exists.",
      scaffold: `<p>The matters giving rise to this complaint are as follows:</p>
<ol>
  <li><strong>{{incident1Date}}</strong> — {{incident1Description}}. {{incident1Witnesses}}</li>
  <li><strong>{{incident2Date}}</strong> — {{incident2Description}}. {{incident2Witnesses}}</li>
  <li><strong>{{incident3Date}}</strong> — {{incident3Description}}. {{incident3Witnesses}}</li>
</ol>
<p>{{patternOrEscalationParagraph}}</p>`,
      constraints: [
        "MUST present incidents in chronological order with specific dates.",
        "MUST name individuals and witnesses by name and role.",
        "MUST paraphrase rather than quote unless verbatim record supplied.",
        "MUST NOT use intensifiers ('clearly', 'blatantly', 'shocking').",
        "MUST NOT include findings of motive — describe conduct.",
      ],
      example: `<p>The matters giving rise to this complaint are as follows:</p>
<ol>
  <li><strong>January 14, 2026</strong> — During a team meeting in the third-floor conference room, my supervisor Marcus Chen referred to me in front of the team as "the diversity hire" and stated that I had been promoted "to fill a quota." The remarks were heard by Sarah Williams, James O'Brien, and Aisha Rahman.</li>
  <li><strong>February 3, 2026</strong> — Following an internal recruitment round for the Head of Brand role, for which I had applied, Mr. Chen told me in a one-to-one meeting that I "wasn't quite the right fit for the leadership group." A male colleague with shorter tenure was appointed.</li>
  <li><strong>March 21, 2026</strong> — At the quarterly business review, Mr. Chen interrupted my presentation twice to question my figures, then immediately afterward praised an identical methodology used by Tom Bryant. This was witnessed by the U.S. leadership team.</li>
  <li><strong>April 10, 2026</strong> — When I raised the pattern with Mr. Chen, he told me I was "being oversensitive" and should "drop it before it became a problem."</li>
</ol>
<p>The conduct has continued and, in my view, has escalated since I declined to drop the matter. I no longer consider that the issues can be resolved informally.</p>`,
    },
    {
      sectionId: "witnesses",
      title: "Witnesses and supporting documents",
      instruction:
        "List, where known, the witnesses to the incidents and the documents that should be reviewed. Short list. Do not summarise what witnesses will say.",
      scaffold: `<p>The following individuals witnessed one or more of the events set out above and may assist the investigation:</p>
<ul>
  <li>{{witness1Name}}, {{witness1Role}}</li>
  <li>{{witness2Name}}, {{witness2Role}}</li>
</ul>
<p>The following documents are relevant: {{documentList}}.</p>`,
      constraints: [
        "MUST name witnesses with role.",
        "MUST list documents by category.",
        "MUST NOT preview witness testimony.",
      ],
      example: `<p>The following individuals witnessed one or more of the events set out above and may assist the investigation:</p>
<ul>
  <li>Sarah Williams, Senior Marketing Specialist</li>
  <li>James O'Brien, Brand Manager</li>
  <li>Aisha Rahman, Marketing Coordinator</li>
</ul>
<p>The following documents are relevant: the email of February 4, 2026 from Mr. Chen explaining the Head of Brand outcome; the recruitment scoring matrix (which I have requested through HR but not yet received); my last three performance reviews; and the calendar invitations for the meetings of January 14, February 3, and April 10, 2026.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Protected-characteristic basis",
      instruction:
        "Frame as belief, not legal conclusion. Cite Title VII, ADA, ADEA, PWFA, FEHA, or applicable state statute. One short paragraph. Reserve characterization.",
      scaffold: `<p>I believe that the conduct set out above was directed at me because of my {{protectedCharacteristic}} and that it has created a work environment I cannot reasonably be expected to tolerate. I raise this in good faith and on the basis of my reasonable belief that the conduct may violate {{statuteList}}, including {{titleViiOrAda}} and applicable state law. I reserve my position as to the legal characterization of the conduct, which is a matter for any subsequent investigation or proceedings.</p>`,
      constraints: [
        "MUST frame as 'I believe' / 'may violate', NOT 'this is discrimination'.",
        "MUST cite the relevant federal statute (Title VII, ADA, ADEA, PWFA) and state law where applicable.",
        "MUST reserve position as to legal characterization.",
      ],
      example: `<p>I believe that the conduct set out above was directed at me because of my sex and race and that it has created a work environment I cannot reasonably be expected to tolerate. I raise this in good faith and on the basis of my reasonable belief that the conduct may violate Title VII of the Civil Rights Act of 1964, the California Fair Employment and Housing Act (Cal. Gov. Code §12940 et seq.), and applicable state law. I reserve my position as to the legal characterization of the conduct, which is a matter for any subsequent investigation or proceedings.</p>`,
    },
    {
      sectionId: "impact",
      title: "Impact statement",
      instruction:
        "Factual, observable impact. Single short paragraph. No clinical labels unless documented.",
      scaffold: `<p>The matters set out above have had a significant impact on my work and wellbeing. {{specificImpact}}.</p>`,
      constraints: [
        "MUST describe specific impact (sleep, performance, attendance, physician visit).",
        "MUST NOT use clinical labels without medical documentation.",
        "MUST NOT exaggerate.",
      ],
      example: `<p>The matters set out above have had a significant impact on my work and wellbeing. I have experienced sustained anxiety, my sleep has been disrupted, and I have found it difficult to participate in meetings led by Mr. Chen. I attended my physician on April 18, 2026 in connection with these symptoms; documentation is available on request.</p>`,
    },
    {
      sectionId: "outcome_sought",
      title: "Outcome sought",
      instruction:
        "List 1-3 specific outcomes. Investigation, finding, reporting-line adjustment, anti-retaliation assurance.",
      scaffold: `<p>The outcomes I seek through this complaint are:</p>
<ul>
  <li>{{outcome1}}</li>
  <li>{{outcome2}}</li>
  <li>{{outcome3}}</li>
</ul>`,
      constraints: [
        "MUST list 1-3 specific outcomes.",
        "MUST NOT demand a specific sanction (the Company decides).",
        "MUST NOT include monetary demand.",
        "MUST NOT use threatening language.",
      ],
      example: `<p>The outcomes I seek through this complaint are:</p>
<ul>
  <li>A prompt and impartial investigation by an investigator with no prior reporting relationship with Mr. Chen, with witnesses interviewed and documents reviewed.</li>
  <li>A written finding on each of the incidents and on the pattern they form.</li>
  <li>Appropriate action to ensure that, while the investigation is ongoing and thereafter, my reporting line is adjusted so that I no longer report to Mr. Chen, and that I am not subjected to retaliation for raising this complaint.</li>
</ul>`,
    },
    {
      sectionId: "next_steps",
      title: "Request for meeting and process",
      instruction:
        "Request an investigatory meeting. Reference Faragher–Ellerth notice and the Company's policy. Request written outcome.",
      scaffold: `<p>I ask that the Company acknowledge receipt of this complaint and confirm in writing the next steps, including the identity of the investigator and the expected timetable. I am willing to participate in an investigatory interview and to provide the documents and witness names referenced above. I ask that the Company confirm its anti-retaliation obligations toward me during and after the investigation, and that the written outcome and any right of appeal be confirmed to me in writing.</p>`,
      constraints: [
        "MUST request acknowledgement of receipt and confirmation of next steps.",
        "MUST request written confirmation of anti-retaliation obligations.",
        "MUST NOT impose a unilateral deadline.",
      ],
      example: `<p>I ask that the Company acknowledge receipt of this complaint and confirm in writing the next steps, including the identity of the investigator and the expected timetable. I am willing to participate in an investigatory interview and to provide the documents and witness names referenced above. I ask that the Company confirm its anti-retaliation obligations toward me during and after the investigation, and that the written outcome and any right of appeal be confirmed to me in writing.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of rights",
      instruction:
        "Reserve all rights, including the right to file a charge with the EEOC or state agency. Single short paragraph.",
      scaffold: `<p>I reserve all of my rights, including any statutory, contractual, and common-law remedies that may be available to me, and including without limitation the right to file a charge with the U.S. Equal Employment Opportunity Commission or the relevant state agency. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part.</p>`,
      constraints: [
        "MUST reserve EEOC / state agency rights expressly.",
        "MUST NOT waive any right.",
      ],
      example: `<p>I reserve all of my rights, including any statutory, contractual, and common-law remedies that may be available to me, and including without limitation the right to file a charge with the U.S. Equal Employment Opportunity Commission or the California Civil Rights Department. Nothing in this letter should be construed as a waiver of any such right or as an admission on my part.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short closing paragraph. 'Sincerely,'. Polite, not warm.",
      scaffold: `<p>I look forward to your acknowledgement and to engaging constructively with the Company's investigation.</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST NOT include warmth or thanks for past treatment.",
      ],
      example: `<p>I look forward to your acknowledgement and to engaging constructively with the Company's investigation.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction:
        "Two or three lines: name, job title, employee ID where supplied.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: [
        "MUST be name, title, and employee ID where supplied.",
        "MUST NOT include personal contact details unless company directory permits.",
      ],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee ID 04231</p>`,
    },
  ],
};
