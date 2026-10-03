import type { LetterTemplate } from "../types";

export const RESIGNATION_CONSTRUCTIVE_UK: LetterTemplate = {
  letterType: "resignation_constructive",
  jurisdiction: "UK",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (UK Constructive Resignation — EMPLOYEE MODE — TRIBUNAL CRITICAL):
- This letter triggers a claim of constructive unfair dismissal under s.95(1)(c) Employment Rights Act 1996. The legal test is set out in Western Excavating (ECC) Ltd v Sharp [1978] ICR 221 (CA): (i) a fundamental / repudiatory breach of contract by the employer; (ii) the employee resigning IN RESPONSE to that breach; (iii) without delay (delay = affirmation = claim defeated); (iv) the breach need not be a single incident — it can be a "last straw" in a course of conduct (Omilaju v Waltham Forest LBC [2005] EWCA Civ 1493).
- The implied term of mutual trust and confidence (Malik v BCCI [1997] UKHL 23) is the most commonly relied-upon term: the employer must not, without reasonable and proper cause, conduct itself in a manner calculated or likely to destroy or seriously damage the relationship of trust and confidence.
- AFFIRMATION-KILLS-CLAIM: NEVER include warmth, thanks, gratitude for past treatment, "tough decision", "time to move on", "after careful thought", "with regret", "best wishes", or any language that suggests the employee is leaving on neutral or positive terms. This language is fatal under Western Excavating.
- The resignation MUST be unequivocal and stated to be IN RESPONSE TO the employer's conduct, not "for personal reasons", not "to take up another role".
- Recite the breach particulars with strict factual chronology — dates, named individuals, named witnesses. Identify the "last straw" if relying on a course of conduct.
- Identify the contractual term breached (express clauses by number; or the implied term of mutual trust and confidence at common law).
- This is OPEN correspondence and tribunal-bound. No intensifiers, no admissions, no settlement language, no threats.
- Reserve all rights expressly including any available unfair dismissal proceedings under Part X ERA 1996. Applicable filing rules require case-specific confirmation; do not derive a deadline or fixed extension from a termination date.
- For protected-characteristic angles, frame as belief and cite the Equality Act 2010 — but note that automatic unfair dismissal claims (e.g. s.103A whistleblowing, s.99 pregnancy/maternity, s.104 assertion of statutory right) should be flagged where relevant.
- DO NOT give long notice. The resignation should ordinarily be effective immediately or on a short timeframe — a long notice period weakens the "in response" element. Where the user gives notice, the letter must state it is given without prejudice to the constructive dismissal position.
- British English throughout. Counsel review is strongly recommended; this template is a defensible first draft, not a substitute for legal advice.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "UK date format. Address to HR Director or Managing Director — the most senior person who can act on the matter, NOT the line manager who is the subject of the breach.",
      scaffold: `<p>{{issueDateUK}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use UK date format ('12 May 2026').",
        "MUST address to a senior officer (HR Director, MD, CEO).",
        "MUST NOT address the line manager who is the subject of the alleged breach.",
      ],
      example: `<p>12 May 2026<br><br>Mr David Whitfield<br>Managing Director<br>Acme Holdings Limited<br>30 Finsbury Square<br>London EC2A 1AG</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single short <p>, <strong>. Identify as resignation in response to fundamental breach. Do NOT label as a clean resignation.",
      scaffold: `<p><strong>Notice of Resignation in Response to Fundamental Breach of Contract</strong></p>`,
      constraints: [
        "MUST identify the letter as resignation in response to fundamental breach.",
        "MUST NOT mark Without Prejudice (this is open correspondence).",
        "MUST NOT use a neutral subject like 'Notice of Resignation' (that would weaken the 'in response' framing).",
      ],
      example: `<p><strong>Notice of Resignation in Response to Fundamental Breach of Contract</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "One <p>. Honorific + surname. No first names.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: [
        "MUST be 'Dear Mr/Ms/Dr {Surname},'.",
        "MUST NOT use first names.",
      ],
      example: `<p>Dear Mr Whitfield,</p>`,
    },
    {
      sectionId: "opening",
      title: "Effective date of resignation",
      instruction:
        "State plainly that the writer resigns IN RESPONSE TO the employer's conduct, with the effective date. Either immediate or with short notice. Where notice is given, expressly state it is without prejudice to the constructive dismissal position. NO warmth, NO thanks, NO 'tough decision', NO 'time to move on'.",
      scaffold: `<p>I am writing to resign from my role as {{employeeJobTitle}} at {{employerLegalName}}. I am compelled to take this step in response to the Company's conduct, which I treat as a fundamental and repudiatory breach of my contract of employment. My resignation is effective {{effectiveDateOrNoticeStatement}}.</p>`,
      constraints: [
        "MUST state the resignation is 'in response to' the employer's conduct.",
        "MUST identify the conduct as a 'fundamental' or 'repudiatory' breach.",
        "MUST state the effective date or notice arrangement clearly.",
        "MUST NOT include warmth, thanks, 'tough decision', 'after careful thought', 'with regret', or 'best wishes'.",
        "MUST NOT use 'I have decided to move on' or 'the time is right to leave' (affirmation language).",
        "MUST NOT use 'for personal reasons' or attribute the resignation to anything other than the employer's conduct.",
        "Where notice is given, MUST state it is without prejudice to the constructive dismissal position.",
      ],
      example: `<p>I am writing to resign from my role as Senior Marketing Manager at Acme Holdings Limited. I am compelled to take this step in response to the Company's conduct, which I treat as a fundamental and repudiatory breach of my contract of employment. My resignation is effective immediately. To the extent that I have been required to give notice under my contract, I do so under protest and without prejudice to my position that the Company's conduct entitles me to treat the contract as discharged.</p>`,
    },
    {
      sectionId: "chronology",
      title: "Recital of breach (specific incidents, dates, prior raises)",
      instruction:
        "Strict factual chronology. Numbered list of incidents. Dates, named individuals, witnesses. Where relying on a 'last straw' under Omilaju, identify the final act expressly. Reference any prior raises (informal complaints, grievances) and the employer's response (or lack of one) — this evidences why the breach was repudiatory and why the employee did not affirm. Paraphrase, do not quote unless verbatim record exists. No intensifiers.",
      scaffold: `<p>The conduct I rely on consists of the following matters:</p>
<ol>
  <li><strong>{{incident1Date}}</strong> — {{incident1Description}}. {{incident1Witnesses}}</li>
  <li><strong>{{incident2Date}}</strong> — {{incident2Description}}. {{incident2Witnesses}}</li>
  <li><strong>{{incident3Date}}</strong> — {{incident3Description}}. {{incident3Witnesses}}</li>
  <li><strong>{{lastStrawDate}}</strong> — {{lastStrawDescription}}. This is the act that has caused me to resign and that I rely on as the final act in a course of conduct.</li>
</ol>
<p>{{priorRaisesParagraph}}</p>`,
      constraints: [
        "MUST present incidents in strict chronological order with specific dates.",
        "MUST identify the 'last straw' expressly where relying on a course of conduct (Omilaju v Waltham Forest LBC [2005]).",
        "MUST reference any prior informal complaint or grievance and the employer's response.",
        "MUST name individuals and witnesses by name.",
        "MUST paraphrase rather than quote unless verbatim record supplied.",
        "MUST NOT use intensifiers ('clearly', 'blatantly', 'shocking', 'outrageous').",
        "MUST NOT include any sentence suggesting the writer was content to continue working.",
      ],
      example: `<p>The conduct I rely on consists of the following matters:</p>
<ol>
  <li><strong>14 January 2026</strong> — During a team meeting in the third-floor conference room, my line manager Marcus Chen referred to me in front of the team as "the diversity hire" and stated I had been promoted "to fill a quota". The remarks were heard by Sarah Williams, James O'Brien and Aisha Rahman.</li>
  <li><strong>3 February 2026</strong> — Following the internal recruitment round for the Head of Brand role, Mr Chen told me in a one-to-one meeting that I "wasn't quite the right fit for the leadership group". A male colleague with shorter tenure was appointed. I asked for the scoring rationale; none has ever been provided despite repeated requests.</li>
  <li><strong>21 March 2026</strong> — Mr Chen interrupted my presentation at the quarterly business review twice and immediately afterwards praised an identical methodology used by Tom Bryant.</li>
  <li><strong>10 April 2026</strong> — When I raised the pattern with Mr Chen, he told me I was "being oversensitive" and should "drop it before it became a problem". I escalated the matter to HR by email of 11 April 2026, addressed to Priya Sharma; I received an acknowledgement on 14 April 2026 but no further substantive response.</li>
  <li><strong>5 May 2026</strong> — I was excluded from the senior leadership offsite of 5-6 May 2026, despite having attended in each of the previous three years. When I asked Mr Chen on 6 May why I had not been invited, he told me, in substance, that "the leadership group felt the offsite would be more productive without you". This is the final act in the course of conduct on which I rely and is the act that has caused me to resign.</li>
</ol>
<p>I had raised these matters with Mr Chen on 10 April 2026 and with HR on 11 April 2026. The Company has not addressed them, has not offered any investigation, and the conduct has continued and escalated. I have not by my conduct affirmed the contract; I have continued to attend work only because I was awaiting a substantive response from the Company before taking this step.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Statement that contract is treated as terminated by the employer's conduct",
      instruction:
        "State the legal basis: the conduct is a fundamental breach of express terms (cite by clause number where known) and/or of the implied term of mutual trust and confidence (Malik v BCCI [1997] UKHL 23). The writer treats the contract as discharged by the breach and resigns in response under s.95(1)(c) ERA 1996. Where protected characteristics are implicated, frame as belief and cite the Equality Act 2010.",
      scaffold: `<p>The conduct set out above amounts to a fundamental breach of {{contractualTermsBreached}}, including the implied term of mutual trust and confidence as recognised in Malik v BCCI [1997] UKHL 23 — the Company has, without reasonable and proper cause, conducted itself in a manner calculated or likely to destroy or seriously damage the relationship of trust and confidence. I treat the contract as discharged by the Company's breach and I resign in response to that breach under s.95(1)(c) of the Employment Rights Act 1996.</p>
<p>{{protectedCharacteristicParagraph}}</p>`,
      constraints: [
        "MUST cite s.95(1)(c) ERA 1996 and Malik v BCCI [1997] UKHL 23.",
        "MUST identify the contractual term breached (express clauses where known; or the implied term of mutual trust and confidence).",
        "MUST state the writer 'resigns in response to' the breach (not 'as a result of', not 'because of').",
        "MUST frame any protected-characteristic angle as belief and cite the Equality Act 2010 with section.",
        "MUST NOT state legal conclusions of fact ('this was unlawful discrimination').",
      ],
      example: `<p>The conduct set out above amounts to a fundamental breach of clauses 6 (mutual co-operation) and 14 (equal opportunity) of my contract of employment, and of the implied term of mutual trust and confidence as recognised in Malik v BCCI [1997] UKHL 23 — the Company has, without reasonable and proper cause, conducted itself in a manner calculated or likely to destroy or seriously damage the relationship of trust and confidence. I treat the contract as discharged by the Company's breach and I resign in response to that breach under s.95(1)(c) of the Employment Rights Act 1996.</p>
<p>I further believe that the matters set out above are connected to my sex and race and may amount to direct discrimination, harassment and victimisation contrary to sections 13, 26 and 27 of the Equality Act 2010, in respect of which I reserve my position.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of all rights including unfair dismissal",
      instruction:
        "Reserve all rights expressly, including any available Employment Tribunal claim for constructive unfair dismissal under Part X ERA 1996, subject to applicable time limits and procedural requirements. Do not state a filing window, an unverified reminder date or an assumed extension. Reference any Equality Act claim if applicable. Confirm the writer is treating the contract as discharged.",
      scaffold: `<p>I reserve all my rights, including any available proceedings in the Employment Tribunal for constructive unfair dismissal under Part X of the Employment Rights Act 1996, for breach of contract, and for any claim under the Equality Act 2010 to which I may be entitled. These rights remain subject to the applicable time limits and procedural requirements, including any relevant ACAS Early Conciliation rules. Nothing in this letter should be construed as a waiver of any right or as an admission on my part, and any continued attendance at work during a notice period (if any) is without prejudice to my position that the contract has been discharged by the Company's breach.</p>`,
      constraints: [
        "MUST reserve the right to claim constructive unfair dismissal under Part X ERA 1996.",
        "MUST make any ACAS Early Conciliation reference conditional on the applicable procedural requirements.",
        "MUST state continued attendance (if any) is without prejudice.",
        "MUST NOT enumerate every potential claim by name.",
        "MUST NOT include settlement-position language.",
      ],
      example: `<p>I reserve all my rights, including any available proceedings in the Employment Tribunal for constructive unfair dismissal under Part X of the Employment Rights Act 1996, for breach of contract, and for any claim under the Equality Act 2010 to which I may be entitled. These rights remain subject to the applicable time limits and procedural requirements, including any relevant ACAS Early Conciliation rules. Nothing in this letter should be construed as a waiver of any right or as an admission on my part, and any continued attendance at work during a notice period (if any) is without prejudice to my position that the contract has been discharged by the Company's breach.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "One short paragraph dealing only with practical matters: arrangements for return of property and final pay. NO thanks, NO warmth, NO 'best wishes'. Sign off 'Yours sincerely,'.",
      scaffold: `<p>I will return all Company property in my possession within a reasonable period and ask that my final pay, including pay in respect of accrued but untaken statutory holiday under the Working Time Regulations 1998, be paid in accordance with the Company's normal practice. Please direct any further correspondence to me at {{employeeContactAddress}}.</p>
<p>Yours sincerely,</p>`,
      constraints: [
        "MUST use 'Yours sincerely,'.",
        "MUST address only practical matters (return of property, final pay).",
        "MUST NOT include thanks for past treatment.",
        "MUST NOT include 'best wishes', 'kind regards', or any warmth.",
        "MUST NOT include any sentence that could be read as affirmation of the conduct complained of.",
      ],
      example: `<p>I will return all Company property in my possession within a reasonable period and ask that my final pay, including pay in respect of accrued but untaken statutory holiday under the Working Time Regulations 1998, be paid in accordance with the Company's normal practice. Please direct any further correspondence to me at 14 Rosewood Avenue, London N4 2QX.</p>
<p>Yours sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Two or three lines: name, former job title, employee number.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: [
        "MUST be name, job title, employee number where supplied.",
      ],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee No. 04231</p>`,
    },
  ],
};

export const RESIGNATION_CONSTRUCTIVE_US: LetterTemplate = {
  letterType: "resignation_constructive",
  jurisdiction: "US",
  evidenceTier: "heavy",
  letterSystemAddendum: `LETTER-WIDE NOTES (US Constructive Discharge — EMPLOYEE MODE — LITIGATION CRITICAL):
- This letter triggers a claim of constructive discharge. The federal standard (Pennsylvania State Police v. Suders, 542 U.S. 129 (2004)) requires that working conditions were so intolerable that a reasonable person in the employee's position would have felt compelled to resign, AND the employer's conduct was directly attributable to the protected basis or other unlawful conduct.
- State analogues exist: California (Turner v. Anheuser-Busch, 7 Cal. 4th 1238 (1994) — "objectively intolerable"); New York; etc.
- AFFIRMATION-WEAKENS-CLAIM: NEVER include warmth, thanks, gratitude for past treatment, "tough decision", "time to move on", "after careful thought", "with regret", "best wishes", or any neutral exit language. The resignation must be expressly attributed to the employer's conduct.
- The resignation should ordinarily be effective immediately or with very short notice. A long notice period weakens the intolerability element.
- Recite the conduct factually: dates, named individuals, witnesses. Reference any prior internal complaints and the employer's response (or lack thereof).
- Cite Title VII / ADA / ADEA / PWFA / state law (FEHA, NYSHRL, etc.) where applicable. For whistleblower-related discharges cite SOX §806, NLRA §7, Cal. Lab. Code §1102.5 as relevant.
- Reserve all rights including any available charge with the EEOC or state agency, subject to applicable filing rules and procedural requirements. Do not assume every claim has the same filing window or derive one from an incident date.
- This is OPEN correspondence — no intensifiers, no admissions, no settlement language.
- American English throughout. Counsel review is strongly recommended.`,
  sections: [
    {
      sectionId: "recipient_block",
      title: "Date and recipient block",
      instruction:
        "US date format. Senior officer (CEO, CHRO), not the line manager subject to the alleged conduct.",
      scaffold: `<p>{{issueDateUS}}<br><br>{{recipientName}}<br>{{recipientTitle}}<br>{{employerLegalName}}<br>{{employerAddressLine1}}<br>{{employerAddressLine2}}</p>`,
      constraints: [
        "MUST use US date format.",
        "MUST address to a senior officer.",
        "MUST NOT address the line manager subject of the alleged conduct.",
      ],
      example: `<p>May 12, 2026<br><br>Mr. David Whitfield<br>Chief Executive Officer<br>Acme Inc.<br>500 Market Street, Suite 1200<br>San Francisco, CA 94105</p>`,
    },
    {
      sectionId: "subject",
      title: "Subject line",
      instruction:
        "Single <p>, <strong>. Identifies the letter as resignation due to constructive discharge.",
      scaffold: `<p><strong>Notice of Resignation — Constructive Discharge</strong></p>`,
      constraints: [
        "MUST identify constructive discharge in the subject.",
        "MUST NOT mark Without Prejudice.",
        "MUST NOT use neutral subject ('Notice of Resignation').",
      ],
      example: `<p><strong>Notice of Resignation — Constructive Discharge</strong></p>`,
    },
    {
      sectionId: "salutation",
      title: "Salutation",
      instruction: "Honorific + surname.",
      scaffold: `<p>Dear {{recipientHonorificSurname}},</p>`,
      constraints: ["MUST be formal honorific."],
      example: `<p>Dear Mr. Whitfield,</p>`,
    },
    {
      sectionId: "opening",
      title: "Effective date of resignation",
      instruction:
        "State that the writer resigns BECAUSE working conditions have become intolerable as a result of the Company's conduct. Effective immediately or with short notice. NO warmth, NO thanks, NO 'tough decision'.",
      scaffold: `<p>I am writing to resign from my role as {{employeeJobTitle}} at {{employerLegalName}}. I am compelled to take this step because the conditions of my employment have become so intolerable that a reasonable person in my position would feel compelled to resign. My resignation is effective {{effectiveDateOrNoticeStatement}}.</p>`,
      constraints: [
        "MUST state working conditions have become intolerable.",
        "MUST attribute the resignation to the Company's conduct.",
        "MUST state the effective date.",
        "MUST NOT include warmth, thanks, 'tough decision', 'time to move on'.",
        "MUST NOT use 'for personal reasons' or attribute the resignation to anything other than the Company's conduct.",
      ],
      example: `<p>I am writing to resign from my role as Senior Marketing Manager at Acme Inc. I am compelled to take this step because the conditions of my employment have become so intolerable that a reasonable person in my position would feel compelled to resign. My resignation is effective immediately, May 12, 2026.</p>`,
    },
    {
      sectionId: "chronology",
      title: "Recital of conduct (specific incidents, dates, prior raises)",
      instruction:
        "Strict chronological order, dated, named individuals, named witnesses. Identify the final precipitating event. Reference prior internal complaints and the employer's response. Paraphrase. No intensifiers.",
      scaffold: `<p>The conduct I rely on consists of the following matters:</p>
<ol>
  <li><strong>{{incident1Date}}</strong> — {{incident1Description}}. {{incident1Witnesses}}</li>
  <li><strong>{{incident2Date}}</strong> — {{incident2Description}}. {{incident2Witnesses}}</li>
  <li><strong>{{incident3Date}}</strong> — {{incident3Description}}. {{incident3Witnesses}}</li>
  <li><strong>{{lastIncidentDate}}</strong> — {{lastIncidentDescription}}. This is the precipitating event.</li>
</ol>
<p>{{priorComplaintsParagraph}}</p>`,
      constraints: [
        "MUST present incidents in strict chronological order, dated.",
        "MUST identify the precipitating event.",
        "MUST reference any prior internal complaint and the Company's response.",
        "MUST name individuals and witnesses.",
        "MUST paraphrase unless verbatim record supplied.",
        "MUST NOT use intensifiers.",
      ],
      example: `<p>The conduct I rely on consists of the following matters:</p>
<ol>
  <li><strong>January 14, 2026</strong> — During a team meeting, my supervisor Marcus Chen referred to me in front of the team as "the diversity hire" and said I had been promoted "to fill a quota". Witnesses: Sarah Williams, James O'Brien, Aisha Rahman.</li>
  <li><strong>February 3, 2026</strong> — Following the internal recruitment for the Head of Brand role, Mr. Chen told me I "wasn't quite the right fit for the leadership group". A male colleague with shorter tenure was appointed; the scoring rationale has never been provided.</li>
  <li><strong>March 21, 2026</strong> — At the quarterly business review, Mr. Chen interrupted my presentation twice and immediately afterward praised an identical methodology used by Tom Bryant.</li>
  <li><strong>April 10, 2026</strong> — Mr. Chen told me I was "being oversensitive" and should "drop it before it became a problem". I escalated to HR (Priya Sharma) by email of April 11; I received an acknowledgement on April 14 but no substantive response.</li>
  <li><strong>May 5, 2026</strong> — I was excluded from the senior leadership offsite, despite attending in each of the previous three years. When I asked Mr. Chen the next day, he stated, in substance, that "the leadership group felt the offsite would be more productive without you". This is the precipitating event.</li>
</ol>
<p>I had raised these matters internally on April 11, 2026. The Company has not investigated, has not addressed the conduct, and the conduct has escalated. I have continued to attend work during this period only while awaiting a substantive response and taking advice on my position.</p>`,
    },
    {
      sectionId: "statutory_basis",
      title: "Statement that conditions are intolerable and resignation is forced",
      instruction:
        "State the legal basis: the conduct constitutes constructive discharge under Pennsylvania State Police v. Suders (federal) and any applicable state standard. Where protected characteristics are implicated, frame as belief and cite Title VII / ADA / ADEA / PWFA / state law.",
      scaffold: `<p>The conduct set out above has, in my view and that of any reasonable person in my position, made my continued employment intolerable. I treat my resignation as a constructive discharge for purposes of Pennsylvania State Police v. Suders, 542 U.S. 129 (2004){{stateLawAddon}}.</p>
<p>{{protectedCharacteristicParagraph}}</p>`,
      constraints: [
        "MUST cite Pennsylvania State Police v. Suders (or relevant state-law analogue).",
        "MUST state that a reasonable person in the writer's position would feel compelled to resign.",
        "MUST frame any protected-characteristic angle as belief and cite Title VII / ADA / ADEA / PWFA / state law.",
        "MUST NOT state legal conclusions as fact.",
      ],
      example: `<p>The conduct set out above has, in my view and that of any reasonable person in my position, made my continued employment intolerable. I treat my resignation as a constructive discharge for purposes of Pennsylvania State Police v. Suders, 542 U.S. 129 (2004) and the analogous standard under California law (Turner v. Anheuser-Busch, 7 Cal. 4th 1238 (1994)).</p>
<p>I further believe that the matters set out above were directed at me because of my sex and race and may violate Title VII of the Civil Rights Act of 1964 and the California Fair Employment and Housing Act (Cal. Gov. Code §12940 et seq.). I raise this in good faith and reserve my position as to legal characterization.</p>`,
    },
    {
      sectionId: "reservation_of_rights",
      title: "Reservation of all rights including constructive discharge / EEOC",
      instruction:
        "Reserve all rights expressly, including any available EEOC, state agency or court remedies, subject to applicable filing rules and procedural requirements. Do not state a filing window or an unverified reminder date. State that any continued attendance during notice (if any) is without prejudice.",
      scaffold: `<p>I reserve all of my rights, including any available charge with the U.S. Equal Employment Opportunity Commission or {{stateAgency}}, any available court proceedings, and any other statutory, contractual, or common-law remedy, subject to the applicable time limits and procedural requirements. Nothing in this letter should be construed as a waiver of any right or as an admission on my part. Any continued attendance at work during a notice period (if any) is without prejudice to my position that I have been constructively discharged.</p>`,
      constraints: [
        "MUST reserve any available EEOC rights subject to applicable filing rules, without asserting a filing window.",
        "MUST reserve state agency rights where applicable.",
        "MUST state continued attendance (if any) is without prejudice.",
      ],
      example: `<p>I reserve all of my rights, including any available charge with the U.S. Equal Employment Opportunity Commission or the California Civil Rights Department, any available court proceedings, and any other statutory, contractual, or common-law remedy, subject to the applicable time limits and procedural requirements. Nothing in this letter should be construed as a waiver of any right or as an admission on my part. Any continued attendance at work during a notice period (if any) is without prejudice to my position that I have been constructively discharged.</p>`,
    },
    {
      sectionId: "closing",
      title: "Closing",
      instruction:
        "Practical matters only — return of property, final pay (referencing state-specific timing where applicable, e.g. Cal. Lab. Code §202). NO warmth, NO thanks, NO best wishes. 'Sincerely,'.",
      scaffold: `<p>I will return all Company property in my possession within a reasonable period and ask that my final pay, including any accrued unused vacation where required by state law, be paid in accordance with applicable state timing requirements. Please direct any further correspondence to me at {{employeeContactAddress}}.</p>
<p>Sincerely,</p>`,
      constraints: [
        "MUST use 'Sincerely,'.",
        "MUST address only practical matters.",
        "MUST NOT include thanks or warmth.",
        "MUST NOT include any sentence that could be read as affirmation of the conduct.",
      ],
      example: `<p>I will return all Company property in my possession within a reasonable period and ask that my final pay, including all accrued unused vacation as required by Cal. Lab. Code §227.3, be paid in accordance with the timing requirements of Cal. Lab. Code §202. Please direct any further correspondence to me at 124 Pine Street, San Francisco, CA 94108.</p>
<p>Sincerely,</p>`,
    },
    {
      sectionId: "signature",
      title: "Signature block",
      instruction: "Name, former job title, employee ID.",
      scaffold: `<p>{{employeeLegalName}}<br>{{employeeJobTitle}}<br>{{employeeNumber}}</p>`,
      constraints: [
        "MUST be name, title, employee ID.",
      ],
      example: `<p>Sarah Williams<br>Senior Marketing Manager<br>Employee ID 04231</p>`,
    },
  ],
};
