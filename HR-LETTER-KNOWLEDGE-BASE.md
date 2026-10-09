# HR Letter Knowledge Base — UK & US Markets

Canonical source for prompt scaffolding, wizard logic, and compliance rules. Any change to a letter type's content requirements, legal fences, or quality gates is made here first, then propagated to prompts in `src/lib/prompts/`.

---

## Part 0 — Universal Question Taxonomy (Wizard Pre-Flight)

These questions are asked **before** branching into letter-type-specific flows. They populate the global context every downstream prompt depends on.

### 0.1 Jurisdiction & Locality
1. Country of employment — `UK` | `US`
2. UK sub-jurisdiction (if UK) — England & Wales | Scotland | Northern Ireland
3. US state of employment — full list, deeper logic for CA, NY, TX, FL, IL, MA, WA, CO, NJ
4. Worker classification — Employee | Worker (UK only) | Contractor / 1099 | Casual / zero-hours

### 0.2 Employer (Company) Details
5. Legal entity name (exact, as registered)
6. Registered address (UK: Companies House address; US: principal place of business)
7. Companies House number (UK) / EIN (US, optional)
8. Letterhead in use? Y/N
9. Signatory name + job title
10. Signatory authority (HR Director, Line Manager, CEO)

### 0.3 Employee Details
11. Full legal name
12. Preferred name
13. Job title (current)
14. Department / division
15. Employee ID (record-matching only — never printed in body)
16. Personal address
17. Personal email vs work email
18. Start date (continuous service date)
19. Length of service (auto-computed)

### 0.4 Letter Context
20. Letter type
21. Effective date of the action
22. Issue date (today, default)
23. Delivery method — email | post | hand-delivery | recorded delivery
24. Tone — Warm | Neutral | Formal | Firm
25. Urgency — draft mode or final mode
26. Confidentiality flag — adds "Private & Confidential"
27. Witness / co-signatory required? Y/N
28. Counsel review required before sending? Y/N

### 0.5 Risk / Routing Flags
29. Protected status (pregnant, sick leave, whistleblower, trade union rep) → forces legal-review gate
30. Grievance raised in last 90 days → same gate
31. Collective bargaining / works council / TUPE / s.188 TULRCA collective consultation applicable

---

## Part 1 — Letter Types

### 1. Offer Letter / Employment Offer

**Purpose:** Formalises terms of proposed employment. UK: not the contract — s.1 ERA 1996 written statement is. US: typically non-binding at-will offer (except Montana).

**Sections (in order):**
1. Date
2. Recipient block (name + home address)
3. Subject ("Offer of Employment — [Role]")
4. Salutation
5. Opening congratulation paragraph
6. Position details (title, department, reporting line, location, hybrid policy)
7. Start date and probation period
8. Compensation (base, bonus, equity, currency, frequency)
9. Benefits summary (pension/401k, health, leave)
10. Working hours
11. Conditions of offer (background check, right-to-work, references, medical)
12. Confidentiality / IP / restrictive covenants reference
13. Acceptance instructions and deadline
14. Closing
15. Signature block + counter-signature line

**Required fields:** Job title, department, reporting manager, work location, remote/hybrid, salary, currency, pay frequency, bonus structure, equity grant + vesting + cliff, sign-on bonus + clawback, probation length, notice period (during/post-probation), annual leave, pension/401k details, healthcare, start date, offer-acceptance deadline, pre-conditions.

**UK legal fences:**
- Reference s.1 ERA 1996 written statement of particulars on day one
- Right-to-work check requirement (Immigration, Asylum and Nationality Act 2006)
- Pension auto-enrolment (Pensions Act 2008) for jobholders 22+ to State Pension age earning > £10,000
- Statutory minimum notice s.86 ERA 1996: 1 week after 1 month, then 1 week per year up to 12
- ACAS Code referenced where probation includes performance assessment
- Annual leave: Working Time Regs 1998 — 5.6 weeks min (incl. bank hols)
- AVOID: terms conflicting with NMW Act 1998 or WTR 1998

**US legal fences:**
- At-will statement: "Your employment will be at-will and may be terminated by either party at any time, with or without cause or notice." Except Montana (good-cause after probation, Wrongful Discharge from Employment Act).
- CA: Wage theft prevention notice (Labor Code §2810.5); non-competes void under §16600 (AB 1076 reaffirmation 2024)
- NY: WTPA notice required at hire (Labor Law §195); NYC pay transparency
- TX: at-will robust; covenants narrow per Tex. Bus. & Com. Code §15.50
- FL: at-will; covenants under Fla. Stat. §542.335; CHOICE Act 2025 high-earner non-compete
- CO/WA/IL/MA: pay transparency — must include salary range
- FLSA exempt vs non-exempt classification
- I-9 documentation; E-Verify states (FL, GA, AZ, MS, NC, TN, UT)

**Tone:** Warm but precise. Congratulatory opener, neutral-formal middle, warm closing.

**Common mistakes:** Implying guaranteed duration, "permanent role" without qualifier, promising bonuses without "discretionary", non-competes in CA/ND/OK/MN, missing acceptance deadline.

**Length:** 500–900 words.

---

### 2. Employment Contract Amendment / Variation Letter

**Purpose:** Formally vary an existing contractual term (hours, location, duties, pay structure).

**Sections:** Date | Recipient | Subject | Salutation | Reference to existing contract | Statement of change | Reason | Effective date | Other terms unchanged | Acceptance request | Closing | Signature.

**Required fields:** Original contract date, clause(s) varied, old vs new value, effective date, business reason, consultation history (UK).

**UK legal fences:**
- Mutual agreement required unless express variation clause (Bateman v Asda [2010])
- Written notification within 1 month of change (s.4 ERA 1996)
- Collective consultation if 20+ affected (s.188 TULRCA)
- Avoid "fire and rehire" post the Code of Practice on Dismissal and Re-engagement (2024)

**US legal fences:**
- Prospective unilateral changes generally permitted with notice
- CA: Labor Code §2810.5 wage change written notice within 7 days
- NY: Labor Law §195(2) advance written notice of pay changes
- ERISA notice if benefits change

**Tone:** Neutral, formal. No apologetic or coercive register.

**Mistakes:** Backdating effective date; bundling multiple changes without itemising; failing to identify the specific clause.

**Length:** 300–500 words.

---

### 3. Promotion Letter

**Purpose:** Confirms elevation to new role/level, usually with salary change.

**Sections:** Date | Recipient | Subject | Warm congratulatory opener | New title, level, department, reporting line | Effective date | New compensation | New responsibilities summary | Continuity of service statement | Closing | Signature.

**Required fields:** Old/new title, level/grade, old/new salary, new manager, effective date, new benefits tier.

**UK legal fences:** s.4 ERA 1996 written statement of changes within one month. Continuous service preserved.

**US legal fences:** Update FLSA exempt/non-exempt if duties change. CA: re-issue §2810.5 notice. NY: WTPA notice for executive promotions. Confirm at-will continues.

**Tone:** Warm, celebratory, professional with personal acknowledgment.

**Mistakes:** Implying tenure-based future promotions; omitting "other terms remain"; failing to re-classify exempt/non-exempt.

**Length:** 250–400 words.

---

### 4. Salary Increase / Compensation Change Letter

**Purpose:** Communicates pay rise without role change.

**Sections:** Date | Recipient | Subject | Warm opener | Old/new salary | Effective date | Pay-period explanation | Pro-rata note | Reason category | Confidentiality reminder | Thanks | Signature.

**Required fields:** Current/new base, effective date, first new-amount pay date, reason category, performance rating (if merit), bonus changes.

**UK legal fences:** s.4 ERA 1996 update within one month. Auto-enrolment pension recomputes. National Living Wage compliance for low-paid workers.

**US legal fences:** CA §2810.5 amended notice within 7 days. NY §195(2) advance notice. CO Equal Pay Transparency posting if role exists. FLSA exempt thresholds (federal $684/wk; CA $1,320/wk; NY $1,200/wk NYC).

**Tone:** Warm, brief, recognising contribution.

**Mistakes:** Disclosing comparator salaries; promising future increases; ignoring bonus impact.

**Length:** 150–300 words.

---

### 5. Probation Confirmation / Extension / Failure Letter

Three sub-variants — pass, extension, fail.

**Pass sections:** Date | Recipient | Subject ("Successful Completion of Probation") | Confirmation | Full notice period now effective | Continuity statement | Closing | Signature.

**Extension sections:** Date | Recipient | Subject | Reasons (specific) | New end date | Specific objectives | Support offered | Possible outcomes | Right to representation | Signature.

**Fail sections:** Date | Recipient | Subject | Outcome statement | Specific reasons referenced to review | Termination effective date | Notice period | Final pay and accrued leave | Return of property | Reference position | Right to appeal | Closing | Signature.

**Required fields:** Probation start/end, review meeting date and attendees, evidence, support provided, objectives if extending, notice term.

**UK legal fences:**
- Sub-2-years service: no ordinary unfair dismissal claim (exceptions: discrimination, whistleblowing, automatic unfair under s.103A–105 ERA 1996)
- ACAS Code best practice for capability dismissals
- s.10 Employment Relations Act 1999 — right to be accompanied
- s.86 ERA notice once 1 month service reached

**US legal fences:**
- At-will throughout probation; document reasons for discrimination defence
- CA: final wages within 72h if employee resigns, immediately if employer-initiated (Labor Code §201, §203 penalty up to 30 days)
- NY: next regular payday
- TX: next regular payday (§61.014)
- FL: federal default

**Tone:** Pass — warm. Extension — supportive but firm. Fail — neutral, factual, dignified.

**Mistakes:** Vague performance language ("not a culture fit"); skipping the review meeting reference; omitting appeal rights; dismissing during pregnancy/sick leave without legal review.

**Length:** Pass 150–250; Extension 350–550; Fail 400–650.

---

### 6. Performance Warning (Verbal / Written / Final) — Disciplinary

**Sections:** Date | Recipient | "Private & Confidential" | Subject | Reference to investigation/hearing | Allegation summary | Findings of fact | Decision and rationale | Improvement required (specific, measurable) | Review period and date | Consequences of further issues | **Right of appeal** (named officer, deadline, right to be accompanied) | Time on file (UK 6–12 months) | Signature.

**Required fields:** Allegation specifics, hearing date, attendees, employee's representative, evidence considered, level of warning, duration on file, named appeal officer, support offered (Occupational Health, EAP).

**UK legal fences (critical):**
- ACAS Code of Practice — non-compliance can uplift tribunal awards by up to 25% (s.207A TULRCA 1992)
- Right to be accompanied (s.10 ERelA 1999) — confirm in writing it was offered
- Distinguish conduct vs capability
- Warnings remain "live" for a defined period
- Must be in writing to be relied on later

**US legal fences:**
- No federal procedural requirement but document everything
- CBAs/handbooks may create enforceable progressive discipline (esp. MA, MT)
- CA FEHA accommodation discussions if disability implicated
- ADA: separate performance from disability before warning

**Tone:** Firm, professional, no insults or irony. Verbal = warmer than final written.

**Mistakes:** Warning without hearing; vague standards; omitting appeal route; relying on out-of-date prior warnings; warning during protected leave.

**Length:** Verbal 250–400; Written 400–650; Final Written 500–800.

---

### 7. Termination / Dismissal Letter

Two variants — for cause / without cause.

**For cause sections:** Date | "Private & Confidential" | Recipient | Subject | Decision statement | Reference to disciplinary hearing | Reason category (gross misconduct, capability, redundancy, statutory illegality, SOSR) | Findings | Effective date | Notice/PILON | Final pay components | Accrued holiday | Return of property | Restrictive covenants reminder | Garden leave | **Right of appeal** | References policy | Closing | Signature.

**Without cause sections:** Date | Recipient | Subject ("Notice of Termination of Employment") | Decision | Effective date | Last working day | Severance (separate cover) | Final pay timing | COBRA notice | Return of property | Confidentiality reminder | Closing | Signature.

**Required fields:** Reason (named), effective date, notice/PILON, garden leave, severance, accrued leave, outstanding bonuses, equity vesting, restrictive covenants, appeal officer (UK), state-specific final-pay timing (US).

**UK legal fences:**
- Five potentially fair reasons under s.98 ERA 1996: capability, conduct, redundancy, statutory illegality, SOSR — name one
- 2 years' service required for ordinary unfair dismissal (s.108 ERA) — Employment Rights Bill 2024 reducing to day one (commencement 2026)
- ACAS Code applies — non-compliance increases compensation
- s.86 ERA statutory minimum notice + contractual (whichever greater)
- Right of appeal mandatory in writing
- Discrimination claims under Equality Act 2010 — no service requirement, no comp cap
- Protective Award risk if collective dismissal threshold met

**US legal fences:**
- At-will: no statutory reason needed
- WARN Act: 60 days for 100+ employee employers, 50+ affected at single site
- CA-WARN: 75 employees, 50+ affected, 60 days
- NY-WARN: 50 employees, 25+ affected (or 250+), 90 days
- CA: final wages immediately for employer-initiated termination (Labor Code §201); §203 penalty up to 30 days' wages
- NY: by next regular payday + Labor Law §195(6) written notice of termination
- TX: by next regular payday (§61.014)
- COBRA notice within 14 days
- EEOC: avoid pretextual reasons; document legitimate business reason
- Final paycheck must include accrued PTO in CA, CO, MA, IL

**Tone:** Formal, neutral, dignified. No editorialising. Brief.

**Mistakes:** Mixing cause/without-cause language; promising references; emotional language; missing COBRA paperwork; missing CA immediate-pay rule; dismissing on protected leave without legal review.

**Length:** 400–800 words.

---

### 8. Redundancy Letter (UK) / Layoff Letter (US)

**UK sections:** Date | "Private & Confidential" | Recipient | Subject | At-risk consultation history | Outcome of selection | Statement role is redundant | Selection criteria applied | Suitable alternative employment search outcome | Termination date | **Statutory redundancy pay calculation** | Notice or PILON | Holiday pay | Right to time off to seek work (s.52 ERA — once notice given, with 2y service) | Right of appeal | Reference offer | Counsel/EAP support | Signature.

**US sections:** Date | Recipient | Subject ("Notice of Layoff") | Effective date | Last working day | Reason (RIF, restructure, elimination) | Severance package | COBRA continuation | Outplacement services | Final pay timing | Recall rights | Release of claims (separate document) | Signature.

**Required fields:** Pool, selection criteria, scoring (UK), consultation dates, alternative role search, statutory redundancy multiplier (UK), severance formula (US), recall rights, outplacement provider.

**UK legal fences:**
- Statutory redundancy pay (s.162 ERA): 22–40 = 1 week/year; 41+ = 1.5 weeks; <22 = 0.5 weeks; min 2y service; capped weekly amount (£719/wk 2024–25, annually uprated)
- Individual consultation required
- Collective consultation for 20+ in 90 days — min 30 days (45 for 100+) before first dismissal (s.188 TULRCA)
- HR1 notification to Secretary of State for collective redundancies
- Selection criteria: objective, fair, non-discriminatory
- Suitable alternative employment search and offer
- 4-week trial period in alternative role (s.138 ERA)

**US legal fences:**
- WARN Act federal — 60 days, 100+ employee employers, 50+ affected
- CA-WARN stricter (75 employees)
- NY-WARN 90 days, 50+ employees
- Severance not required but typical 1–4 weeks/year
- OWBPA for releases by 40+: 21 days consider, 7 days revoke; 45 days + disclosure for groups
- COBRA notice
- State unemployment insurance information

**Tone:** Formal, empathetic, dignified. No performance fault implication.

**Mistakes:** Conflating redundancy with poor performance; missing consultation; failing to score selection criteria; missing WARN; OWBPA non-compliance.

**Length:** 600–1100 words.

---

### 9. Reference Letter / Employment Verification

**Sections:** Date | Recipient (or "To Whom It May Concern") | Subject | Confirmation of employment | Job title | Dates of employment | Salary (if authorised) | Reason for leaving (often omitted) | Closing | Signature with title.

**Required fields:** Confirmed dates, job title, employment status (FT/PT), salary (with employee written consent), purpose of letter, addressee.

**UK legal fences:**
- No general legal duty to provide a reference (FCA-regulated firms excepted)
- If given: fair, accurate, true, not misleading (Spring v Guardian Assurance [1995])
- Negligent misstatement liability to recipient and subject
- Fact-only references common to limit risk
- Subject to UK GDPR — references SAR-able

**US legal fences:**
- Many states grant good-faith immunity for truthful references (FL §768.095, CA Civ. Code §47(c) qualified privilege)
- Service-letter laws in MO, MN, KS — reasons-for-leaving on request
- Avoid blacklisting language (illegal in CA Lab. Code §1050–1052)
- I-9 / E-Verify separate from reference

**Tone:** Neutral-formal. If positive, warm but factual.

**Mistakes:** Opinion without policy authority; salary disclosure without consent; speculating on departure reasons; embellishment.

**Length:** 100–250 (verification); up to 400 (full character reference).

---

### 10. Leave Approval (Parental, Sick, Sabbatical, FMLA, Statutory)

**Sections:** Date | Recipient | Subject | Confirmation of approval | Leave type | Start/expected return date | Pay during leave | Benefits continuation | Cover arrangements | Contact during leave (KIT/SPLIT UK) | Return-to-work expectations | Signature.

**Required fields:** Leave type, start, end, statutory entitlement, occupational top-up, pay schedule, KIT day allowance (UK), benefits accrual rules, contact frequency.

**UK legal fences:**
- Statutory Maternity Leave 52 weeks; SMP 39 weeks (90% earnings 6 weeks, then £184.03/week or 90% if lower — 2024–25)
- Statutory Paternity Leave 1–2 weeks (extended under 2024 reforms)
- Shared Parental Leave up to 50 weeks shared
- SSP up to 28 weeks. From 6 April 2026 (Employment Rights Act 2025) it is paid from day 1 at the standard weekly rate or 80% of average weekly earnings if lower, with no lower earnings limit; check the current rate each April
- KIT days: 10 maternity / 20 SPLIT
- Unpaid Parental Leave: 18 weeks per child up to age 18
- Carer's Leave Act 2023: 1 week/year unpaid (Apr 2024)
- Neonatal Care Leave (2025)

**US legal fences:**
- FMLA: 12 weeks unpaid, job-protected; 50+ employees within 75-mile radius; 12mo / 1,250hr service
- Designation Notice within 5 business days (Eligibility Notice within 5 days of request)
- CA: CFRA mirrors FMLA, broader (5+ employees post-2021); PFL up to 8 weeks at 60–70% via SDI
- NY: PFL up to 12 weeks, 67% AWW
- NJ, RI, WA, MA, OR, CO, CT, DE, MD: state-specific PFL programs
- ADA reasonable accommodation leave — interactive process documented separately
- PWFA (2023): pregnancy / childbirth / related conditions

**Tone:** Warm, supportive, clear.

**Mistakes:** Confusing FMLA/CFRA stacking; not confirming benefits continuation; forgetting KIT day rules; vague return date.

**Length:** 250–500 words.

---

### 11. Resignation Acceptance Letter

**Sections:** Date | Recipient | Subject | Acknowledgment of receipt | Last working day | Notice period clarification (worked / PILON / garden leave) | Outstanding leave | Final pay date | Return of property | Restrictive covenants reminder | References policy | Best wishes | Signature.

**Required fields:** Resignation receipt date, notice end date, garden-leave decision, accrued leave balance, expense reimbursement timing, equity treatment, exit interview date.

**UK legal fences:** Confirm contractual notice. Garden leave only if contractual right exists. Restrictive covenants reminder permissible.

**US legal fences:** "Two-week notice" is custom not law. CA final pay within 72h if no notice; on last day if 72+h notice. Unused PTO must be paid in CA, CO, MA, IL, NE, ND.

**Tone:** Warm, gracious. Never punitive.

**Mistakes:** Reducing notice unilaterally; clawing back signing bonuses without contractual basis; missing equity vesting cutoff; missing final paycheck timing.

**Length:** 200–350 words.

---

### 12. Return-to-Work Letter

**Sections:** Date | Recipient | Subject | Welcome back | Return date | Role and duties (same / phased) | Hours and location | Pay reinstatement | Benefits restoration | Phased return plan | Reasonable adjustments noted | OH report reference | Signature.

**Required fields:** Leave end date, RTW date, phased schedule, OH recommendations, ergonomic adjustments, line manager check-in cadence.

**UK legal fences:**
- Right to return to same job after Ordinary Maternity Leave (first 26 weeks); same or suitable alternative after Additional Maternity Leave (s.71 ERA)
- Equality Act 2010 reasonable adjustments duty
- Occupational Health referral protocol
- Right to request flexible working from day one (post-2024 reform)

**US legal fences:**
- FMLA same or equivalent position (29 USC §2614)
- ADA interactive process
- PWFA accommodations post-pregnancy
- CA PDL: same role unless not available

**Tone:** Warm, supportive, practical.

**Mistakes:** Demoting on return without legitimate organisational reason; failing to reinstate equivalent role; ignoring OH recommendations.

**Length:** 300–500 words.

---

### 13. Settlement / Severance Agreement Cover Letter

**Sections:** Date | "Without Prejudice and Subject to Contract" (UK) / "Confidential" (US) | Recipient | Subject | Context paragraph | Summary of key terms (sums, timing, references, restrictions) | Pointer to enclosed agreement | Independent legal advice requirement | Deadline | Next steps | Closing | Signature.

**Required fields:** Termination reason, ex gratia amount, notice/PILON, statutory tax-free element (UK £30k cap), benefits continuation, references wording, restrictive covenants, confidentiality, non-disparagement, legal-fees contribution, advisor certification deadline, signing deadline, OWBPA periods (US, 40+).

**UK legal fences:**
- Settlement Agreement under s.203 ERA 1996 — written; identify the particular complaint(s) waived; employee must receive independent legal advice from a relevant adviser; adviser must be insured; agreement must state these conditions met
- £30,000 tax-free under s.401 ITEPA 2003 for genuine compensation for loss of office
- "Without prejudice" privilege; pre-termination negotiations under s.111A ERA 1996 separately protected
- ACAS conciliation alternative (COT3)

**US legal fences:**
- OWBPA (29 USC §626(f)) for 40+: 21 days consider (45 group), 7 days revoke, written, advise to consult lawyer, identify ADEA claim
- CA: cannot waive unwaivable rights (DLSE wages, workers comp); SB 331 (2022) limits NDAs in harassment/discrimination; 2024 amendments restrict no-rehire
- NY: GOL §5-336 limits NDAs in harassment cases
- §409A timing; W-2 vs 1099

**Tone:** Formal, neutral, precise.

**Mistakes:** Failing to advise on independent legal advice (UK invalidates); wrong tax treatment; OWBPA non-compliance; over-broad NDA in CA/NY.

**Length:** 400–700 words.

---

### 14. Right-to-Work / Immigration Support Letter

**Sections:** Date | "To Whom It May Concern" or named officer | Subject | Confirmation of employment | Role, duties, salary | Sponsor licence number (UK) | CoS reference (UK) | Petition reference (US) | Statement of intent to continue | Dates and salary on letterhead | Signature with title.

**Required fields:** Sponsorship licence (UK), CoS, SOC code, salary at/above going rate, US petition number (I-129, I-140), USCIS receipt number, role description with educational requirements (H-1B specialty occupation), beneficiary details.

**UK legal fences:**
- Sponsor Licence under Skilled Worker route — Home Office compliance
- CoS — defined or undefined
- Right to Work checks (List A / List B) — share code for non-British/Irish
- Going-rate salary thresholds (general threshold £41,700 from 22 July 2025; check current Home Office figures)

**US legal fences:**
- H-1B specialty occupation — bachelor's minimum, prevailing wage (LCA)
- L-1A/B intra-company — qualifying relationship + 1-of-3y prior employment
- O-1 — evidence of acclaim
- I-140 — PERM (EB-2/EB-3)
- E-Verify states with mandatory enrolment

**Tone:** Formal, factual, on letterhead.

**Mistakes:** Embellished duties; salary below prevailing/going rate; missing reference numbers; weak nexus to specialty occupation criteria.

**Length:** 300–600 words.

---

## Part 2 — Section-Level Prompt Strategy

Each section is generated by an **independent LLM call** with a stable contract: input = `{ global_context, letter_context, section_name, prior_sections (titles only) }`, output = section markdown. Regenerate any section by re-calling that section's prompt without disturbing siblings.

### Master Section-Prompt Template

```
ROLE: You are an HR letter author writing the [SECTION_NAME] section of a [LETTER_TYPE] letter.

GLOBAL CONTEXT:
- Jurisdiction: [UK | US]
- Sub-jurisdiction: [England&Wales | Scotland | NI | <US state>]
- Employer: [legal_name, address]
- Employee: [name, role, start_date, length_of_service]
- Tone: [warm | neutral | formal | firm]
- Confidentiality: [public | confidential | private_and_confidential]

SECTION CONTRACT:
- Section name: [SECTION_NAME]
- Position in letter: [N of M]
- Required to cover: [bulleted required fields for this section]
- Must NOT include: [exclusions — e.g., "do not state at-will if UK"]
- Length budget: [X to Y words]
- Tone within section: [if differs]

LEGAL FENCE (jurisdiction-specific):
[Inject the letter type's UK or US legal rules from this knowledge base]

PRIOR SECTIONS (titles only, for continuity):
[Section 1 title], [Section 2 title], ...

DATA:
[only the fields this section needs]

OUTPUT:
- Plain prose, no headings unless format requires them
- Markdown bold only where structurally required
- No commentary, no preamble, no quotation of these instructions
- Use ASCII punctuation only
- British English spelling for UK letters; American English for US

QUALITY GATES:
- Does it satisfy each required field?
- Does it violate any "must not" rule?
- Does it fit the length budget?
- Does it match the requested tone?
- Does it include forbidden phrases?
```

### Cross-Section Consistency Pass

```
ROLE: Consistency auditor.
TASK: Read the assembled letter. Identify any inconsistency in: dates, names, role titles, salary figures, jurisdiction-specific terms.
OUTPUT: JSON list of { section, issue, suggested_fix }. Do not rewrite — only flag.
```

---

## Part 3 — Quality Criteria

Score on 1–5 across:

1. **Clarity** — sentence avg < 22 words; plain language. Red flag < 3.
2. **Legal Safety** — required statutory references present; no prohibited content for jurisdiction. Hard fail on red rule violation.
3. **Tone Match** — within letter type's permissible band.
4. **Completeness** — all required fields present and non-empty. Hard fail on missing required.
5. **Brevity** — within recommended word range ±15%. Red flag at ±25%.
6. **Specificity** — no vague placeholders unless legally required.
7. **Factual Consistency** — dates/figures/names match across sections. Hard fail on numeric mismatch.
8. **Inclusivity & Bias-Free Language** — gender-neutral; no protected-class references. Hard fail on biased phrasing.
9. **Format Hygiene** — locale date format; currency; en-GB vs en-US.
10. **Actionability** — clear next steps for recipient.

Composite < 3.5 or any hard fail blocks finalisation; user shown issue list and "regenerate flagged section" option.

---

## Part 4 — Disclaimers

### Tier 1 — Universal Footer (every letter)
> *This letter has been generated using a template-assisted drafting tool and should be reviewed by a qualified HR professional or employment-law adviser before issuance. It does not constitute legal advice.*

### Tier 2 — Medium-Risk (variation, salary change, probation extension, leave, RTW, reference)
> *This letter draws on general legal frameworks for [UK / US — state]. Specific employment terms, collective agreements, and jurisdictional updates may affect its validity. Confirm compliance with your governing contract and applicable law.*

### Tier 3 — High-Risk (warning, termination, redundancy/layoff, settlement, immigration)
> *IMPORTANT: This is a high-risk communication. It must be reviewed by qualified employment-law counsel before issuance. Failure to follow statutory procedures (UK: ACAS Code of Practice, Employment Rights Act 1996; US: WARN Act, OWBPA, Title VII, state-specific final-pay and notice rules) may expose the organisation to compensation awards, statutory penalties, or unfair-dismissal/discrimination claims. The platform provider accepts no liability for content used without legal review.*

### Inline (Settlement)
> *You are advised to seek independent legal advice from a [UK: relevant adviser as defined in s.203(3A) ERA 1996 / US: licensed attorney] before signing the enclosed agreement.*

### Audit (record-keeping)
> *Generated [TIMESTAMP] using model [MODEL_ID] vRev [VERSION]. Section regeneration history available in admin log.*

---

## Authority Citations Used

**UK:** Employment Rights Act 1996 (ss. 1, 4, 10, 52, 71, 86, 98, 108, 138, 162, 203, 207A); Equality Act 2010; Trade Union and Labour Relations (Consolidation) Act 1992 (s.188); Working Time Regulations 1998; Employment Relations Act 1999 (s.10); Pensions Act 2008; Immigration, Asylum and Nationality Act 2006; ACAS Code of Practice on Disciplinary and Grievance Procedures; ACAS Code of Practice on Dismissal and Re-engagement (2024); Employment Rights Bill 2024 (pending).

**US:** FLSA (29 USC §201); FMLA (29 USC §2611); WARN Act (29 USC §2101); OWBPA / ADEA (29 USC §626(f)); Title VII (42 USC §2000e); ADA; PWFA (2023); ERISA; COBRA (29 USC §1166); Cal. Lab. Code §§201, 203, 1050–1052, 1400, 2810.5; Cal. Bus. & Prof. Code §16600; NY Labor Law §§195, 195(6); Tex. Lab. Code §61.014; Tex. Bus. & Com. Code §15.50; Fla. Stat. §§542.335, 768.095; Colorado Equal Pay for Equal Work Act; EEOC enforcement guidance.
