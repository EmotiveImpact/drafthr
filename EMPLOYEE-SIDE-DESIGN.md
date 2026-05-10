# Employee-Side Product Design — HR Letter Platform

**Status:** Design v1
**Audience:** Engineering, Legal, Product
**Companion docs:** `PLAN.md`, `HR-LETTER-KNOWLEDGE-BASE.md`

This document specifies the **EMPLOYEE mode** — a sibling product surface to the existing EMPLOYER mode that flips the legal angle from "help the employer comply with statutory procedure" to "help the employee preserve their rights, raise issues correctly, and not prejudice future claims." It is designed to ship under the same Vite/React/Tiptap codebase, the same auth, the same LLM provider abstraction, with a `mode` discriminator routed at the URL level (`/hr/*` vs `/me/*`).

The legal centre of gravity is different. HR letters worry about ACAS Code uplifts, WARN Act notice, and OWBPA waivers as defensive perimeters around the employer. Employee letters worry about preserving tribunal access, hitting limitation windows, framing facts in a way that survives disclosure, and not handing the employer a witness statement against the employee's own claim. The product must internalise that distinction in every wizard, every prompt, and every disclaimer.

---

## 1. Letter Type Taxonomy

The catalogue below is the v1 employee surface. Each entry mirrors the structure of `HR-LETTER-KNOWLEDGE-BASE.md`. Risk classes follow the same `low | medium | high` convention but are calibrated against **employee** exposure, not employer exposure — a "high-risk" employee letter is one where the wrong wording can defeat a future tribunal claim or trigger a counter-claim.

### 1.1 Formal Grievance

**Purpose.** UK: a formal Step 1 grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures. US: an internal harassment, discrimination, or hostile-work-environment complaint to HR, sized to satisfy the Faragher–Ellerth defence rebuttal (i.e., putting the employer on notice).

**When used.** When informal raise has failed or the issue is severe enough to skip informal (harassment, discrimination, safety, fraud).

**Sections.** Date | Recipient (HR or named manager) | "Formal Grievance" subject | Statement that this is a formal grievance under [ACAS Code / Company Policy / Title VII] | Specific facts (chronological, dated) | Witnesses | Documents referenced | Impact statement | Outcome sought | Request for grievance hearing within reasonable time | Reservation of rights | Signature.

**Required data.** Dates of incidents, names of those involved, witnesses, relevant documents, prior informal raises, desired outcome.

**UK considerations.** ACAS Code Step 1 requires the grievance to be in writing and to set out the basis. Failure to follow Code can affect tribunal awards by up to 25% (s.207A TULRCA 1992) — this cuts *for* the employee if they raised it correctly. The grievance itself is **not** a protected disclosure unless it falls within s.43A–B ERA 1996; the tool should treat that as a separate letter type.

**US considerations.** Title VII / ADEA / ADA / FEHA all rely on putting the employer on notice. The letter should specify the protected characteristic alleged (race, sex, age, disability, etc.) — "I felt singled out" is not enough; "I believe I was treated differently because of my [protected characteristic]" is the magic-words bar. Document delivery (email + read receipt + dated signature) starts the clock for retaliation claims.

**MUST say.** Date, factual specificity, named individuals, statement of belief in a protected-characteristic basis (where relevant), reservation of rights, requested remedy.

**MUST NOT say.** Threats ("I will sue"), admissions ("I shouldn't have raised my voice"), absolutes the employee can't prove ("everyone knows"), settlement demands inside an open grievance (those go in a separate without-prejudice channel), legal conclusions presented as fact ("this was unlawful discrimination" — say "I believe this amounts to" instead).

**Tone.** Formal, factual, calm. No emoji, no rhetoric, no italics for emphasis.

**Length.** 600–1,200 words.

### 1.2 Resignation (three sub-variants — clean / with-grievance / constructive dismissal)

These three letters look superficially similar and are legally radically different. The wizard must force the user to pick one **before** drafting starts, with explanatory copy on the consequences.

**1.2a Clean resignation.** Standard, gracious. Confirms last working day, expresses thanks, asks for handover process. No reservation of rights. No grievance referenced. Use when the relationship has ended on neutral or positive terms.

**1.2b Resignation with grievance.** Resigns and simultaneously lodges a grievance. The grievance survives the resignation; the employer's investigative duty under the ACAS Code persists at least to the extent of allowing a paper grievance to be considered. Use when the employee wants both the income exit and the rights preservation.

**1.2c Constructive dismissal resignation.** The legal nuclear option. Asserts that the employer's conduct constituted a fundamental breach of contract, that the employee resigns *in response to* that breach, and *without delay* (Western Excavating (ECC) Ltd v Sharp [1978]). UK: triggers a constructive unfair dismissal claim under s.95(1)(c) ERA 1996. US: the analogous "constructive discharge" doctrine in EEOC and most state law.

**Sections (constructive).** Date | Recipient | Subject "Resignation in Response to Fundamental Breach of Contract" | Statement of resignation effective date | Recital of the breach (specific incidents, dates, prior raises) | Statement that the employee treats the contract as terminated by reason of the employer's conduct | Reservation of all rights including unfair dismissal / constructive discharge | Without-prejudice settlement openness (optional, separately marked) | Signature.

**MUST say (constructive).** That the resignation is *in response to* the breach. That the employee resigns *without delay* (delay = affirmation of the contract). Specific breach particulars.

**MUST NOT say (constructive).** "It's been a tough decision but I think it's time to move on" (that's affirmation language and kills the claim). Anything that suggests a normal new-job reason. "Thank you for the opportunities" (waiver risk). Apologies for the employer's conduct.

**UK considerations.** 3-month limitation period under s.111 ERA 1996, less one day, from the **effective date of termination** for tribunal. ACAS Early Conciliation must be lodged before the claim — the "EC clock" can extend the limitation by up to 6 weeks. Tool must surface this prominently.

**US considerations.** EEOC charge filing window: 180 days, extended to 300 days in deferral states. State-specific tolling. At-will exceptions vary by state.

**Tone.** Constructive: formal, narrative, devoid of warmth. Clean: professional, brief, courteous. With-grievance: formal, two-track.

**Length.** Clean 150–300; with-grievance 400–700; constructive 600–1,000.

### 1.3 Flexible Working Request

**Purpose.** UK: a statutory request under the Flexible Working (Amendment) Regulations 2023, in force April 2024 — flexible working is now a **day-one right**, employees can make two requests in 12 months, employer must respond within 2 months. US: state-by-state and FLSA-adjacent; California, Vermont, NH have right-to-request statutes.

**Sections.** Date | Subject "Statutory Flexible Working Request" | Statement that this is a request under [Employment Rights Act 1996 s.80F (UK) / state right-to-request statute (US)] | Current pattern | Proposed change | Effective date | Effect on the employee's work and how it can be managed | Effect on colleagues / customers / the business and proposed mitigations | Whether previous request made in last 12 months | Signature.

**UK considerations.** Statutory grounds for refusal are eight (s.80G ERA 1996). The employee's letter should pre-empt the most likely objection. Don't waive the right of appeal.

**US considerations.** Often discretionary; frame as an ADA accommodation request if disability-linked (separate letter type 1.7).

**Tone.** Practical, business-case-led. Not adversarial.

**Length.** 350–600 words.

### 1.4 Subject Access Request (SAR) / HR File Request

**Purpose.** Obtain the personal data the employer holds on the employee. Often the first move before a tribunal claim.

**UK.** Article 15 UK GDPR + s.45 Data Protection Act 2018. Employer has **one calendar month** to respond, extendable by two further months for complex requests. No fee (subject to manifestly unfounded/excessive exceptions).

**US.** No federal analogue. State statutes: California Labor Code §1198.5 (HR file inspection within 30 days), §226 (payroll records, 21 days), CCPA/CPRA for non-exempt categories. Connecticut, Illinois, Massachusetts, New Hampshire, Pennsylvania have HR file access statutes.

**Sections.** Date | "Subject Access Request" / "Request for Personnel File Inspection" subject | Identity confirmation | Specific scope (timeframe, categories — emails, performance records, disciplinary, recordings, OH reports) | Format requested (electronic preferred) | Statutory citation | Deadline | Reservation of rights | Signature.

**MUST say.** Statutory basis. Specific categories — generic SARs invite delay. Identity verification offer.

**MUST NOT say.** Reasons for the request (legally not required; volunteering them cues the employer that litigation is coming and accelerates the destruction-of-evidence problem).

**Tone.** Neutral, procedural.

**Length.** 250–500 words.

### 1.5 Appeal Against Warning / Dismissal / Redundancy Outcome

**Purpose.** Internal appeal of a disciplinary, performance, dismissal, or redundancy outcome. A non-negotiable step before tribunal because failure to appeal can reduce compensation under ACAS Code.

**Sections.** Date | Subject ("Appeal Against [Outcome] Decision of [Date]") | Statement of intention to appeal | Grounds of appeal (use the canonical four: procedural unfairness, factual error, severity disproportionate, new evidence) | Specific facts under each ground | Outcome sought (overturn, reduce sanction, rehearing) | Request for appeal hearing and right to be accompanied (UK s.10 ERelA 1999) | Reservation of rights | Signature.

**UK considerations.** ACAS Code Step 4 — appeal must be heard impartially, ideally by someone not previously involved. Polkey deduction risk if appeal not used (Polkey v AE Dayton Services [1987]).

**US considerations.** No federal procedural appeal right; document the failure to provide one as evidence in subsequent EEOC charge or wrongful termination action.

**Tone.** Formal, structured, evidence-led. The four-ground framing makes it scannable.

**Length.** 500–1,000 words.

### 1.6 Whistleblowing / Protected Disclosure

**Purpose.** Make a qualifying disclosure that triggers statutory protection.

**UK (this is the prize).** s.43A–L ERA 1996 (Public Interest Disclosure Act 1998). The disclosure must be (i) of information, (ii) tending to show one of six categories (criminal offence, breach of legal obligation, miscarriage of justice, danger to health and safety, environmental damage, deliberate concealment of any of the above), (iii) in the public interest, (iv) the worker reasonably believes the information to be substantially true. Detriment / dismissal for protected disclosure is automatically unfair (s.103A ERA), no service requirement, **no compensation cap**.

**US.** SOX §806 for publicly traded employers (180-day OSHA filing window — short!), Dodd-Frank, OSHA whistleblower statutes (most have 30-day filing windows — extremely short), Defend Trade Secrets Act 2016 immunity for confidential disclosure to lawyer/government, NLRA Section 7 for concerted activity, state-specific whistleblower laws (CA Labor Code §1102.5 is the broadest).

**Sections.** Date | Subject "Disclosure of Information in the Public Interest" | Statement that this is intended as a protected disclosure under [statute] | Identity of disclosing worker | Information disclosed (factual, dated, specific) | Why the worker reasonably believes the information to be substantially true | Why the worker reasonably believes disclosure is in the public interest | Recipient is correct under the prescribed-person regime (UK: Public Interest Disclosure (Prescribed Persons) Order 2014) | Request for response and protection | Reservation of rights | Signature.

**MUST say.** "I make this disclosure under [statute] and reasonably believe..." (reasonable belief is the threshold). Specific factual content. Public interest.

**MUST NOT say.** Personal grievance dressed up as whistleblowing (Chesterton Global v Nurmohamed [2017] limits this). Defamatory accusations. Speculation presented as fact.

**Tone.** Forensic, dispassionate, journalistic.

**Length.** 700–1,500 words. The product should warn that the worker should retain a verbatim copy and a delivery confirmation.

### 1.7 Reasonable Adjustment / ADA Accommodation Request

**Purpose.** Request adjustments under the Equality Act 2010 (UK) or the ADA / state law (US).

**UK.** s.20–22 Equality Act 2010 — duty applies where a "provision, criterion or practice" places the disabled employee at a substantial disadvantage. Disability defined in s.6 (physical or mental impairment + substantial + long-term + adverse effect on day-to-day activities).

**US.** ADA "interactive process" — the employee triggers it by making a request; the employer is obligated to engage in good-faith dialogue. The letter is the trigger and the date matters for accommodations and for any later failure-to-accommodate claim. PWFA 2023 mirrors this for pregnancy.

**Sections.** Date | Subject "Request for Reasonable Adjustment / Accommodation" | Statement of disability (only what the employee chooses to disclose) | Specific impairment-to-job-task barrier | Specific adjustments requested | Medical evidence available (employee's choice whether to attach) | Request for OH referral / interactive meeting | Statutory basis | Signature.

**MUST say.** That an adjustment is being requested formally. The barrier — task X is hindered by impairment Y. A specific ask.

**MUST NOT say.** A medical diagnosis the employee doesn't want disclosed. An admission of inability to perform the role (frame as barriers + adjustments, not capability failure).

**Tone.** Practical, collaborative, brief.

**Length.** 300–600 words.

### 1.8 Sickness Self-Certification / Fit-Note Response

**Purpose.** Discharge the duty to notify, and, where relevant, push back on a return-to-work demand that conflicts with a fit note.

**UK.** SSP under s.151 SSCBA 1992. Self-certify days 1–7; from day 8 a Fit Note (Statement of Fitness for Work) is required. Employer cannot ignore a Fit Note's "may be fit for work" recommendations without adjustments.

**US.** FMLA / ADA / state PFL — notice timing is statute-specific (FMLA 30 days advance for foreseeable, "as soon as practicable" otherwise).

**Sections.** Date | Subject | Statement of absence dates / proposed working pattern | Self-certification or Fit Note attached | Adjustments referenced in Fit Note | Request for OH referral if outstanding | Signature.

**Tone.** Brief, factual, neutral.

**Length.** 150–300 words.

### 1.9 Pay Dispute / Wage Claim

**Purpose.** Recover unpaid wages, holiday pay, expenses, commissions, or notice pay.

**UK.** s.13 ERA 1996 (unauthorised deduction from wages). 3-month limitation, less one day, from each deduction (or last in a series — but Bear Scotland v Fulton [2014] caps a "series" gap at three months).

**US.** FLSA (federal minimum wage / overtime), state wage-payment laws (CA Labor Code §201–204, NY Labor Law §198). Statute of limitations: FLSA 2 years (3 if willful), state varies (CA 3, NY 6).

**Sections.** Date | Subject "Notice of Pay Dispute" | Identification of the underpayment (line items, dates, amounts) | Calculation showing what is owed | Citation of the basis (contract, statute, policy) | Demand for payment within reasonable period | Reservation of rights including ACAS / DOL / tribunal | Signature.

**Tone.** Firm, accountant-like, specific.

**Length.** 400–700 words.

### 1.10 Notice of Redundancy / Consultation Concerns Response

**Purpose.** Engage an "at risk" individual consultation process actively rather than passively, preserving constructive dismissal and discrimination angles.

**Sections.** Date | Subject | Acknowledgement of at-risk notification | Specific questions on selection pool, criteria, scoring | Request for selection scores and methodology (UK) | Request for alternative employment information | Suggestions to avoid redundancy | Reservation of rights | Signature.

**UK.** Williams v Compair Maxam [1982] — the five-fold "good practice" criteria are still the lens tribunals apply. Active engagement strengthens the unfair-redundancy case if dismissal proceeds.

**Length.** 500–800 words.

### 1.11 Settlement Agreement Counter-Offer Letter

**Purpose.** Counter an offer from the employer. Almost always sent through a solicitor; the tool's role is to enable a first-pass draft for a legal review.

**Behavioural rule.** This is the **only** letter type where the tool should default to a hard "consult counsel" gate before allowing export. Settlement agreements are uniquely consequential and uniquely irreversible.

**Sections.** "Without Prejudice and Subject to Contract" header | Date | Subject | Acknowledgement of offer | Counter-offer terms (sums, references wording, restrictive covenants, non-disparagement) | Mutuality on the non-disparagement | Mutual indemnity reciprocity if employer asked for one-way | Tax-free element (UK: £30k under s.401 ITEPA 2003) | Legal-fee contribution | Deadline for response | Signature.

**Tone.** Neutral, transactional.

**Length.** 400–700 words.

### 1.12 Right-to-Disconnect / Overtime Objection

**Purpose.** Object to out-of-hours contact or unauthorised overtime.

**UK.** Working Time Regulations 1998 (48-hour week opt-out is voluntary, revocable on 7 days' notice). The Employment Rights Bill 2024–25 contains a right-to-switch-off provision (consultative).

**US.** FLSA overtime for non-exempt; state-specific predictive scheduling (NYC Fair Workweek, CA Labor Code §510).

**Tone.** Brief, polite, with a clear ask.

**Length.** 200–400 words.

### 1.13 Holiday Request / Refusal Challenge

**Purpose.** Request leave or challenge a refusal.

**UK.** Working Time Regulations 1998 reg.15 — employer can refuse on 1 day per day of leave notice. Reg.13 statutory minimum (28 days incl. bank holidays) — refusing all use is unlawful.

**US.** No federal statutory leave; state PTO carry-over rules (CA prohibits use-it-or-lose-it).

**Length.** 150–350 words.

### 1.14 Performance Improvement Plan (PIP) Response

**Purpose.** Respond to a PIP. Tactically critical — accepting a PIP without comment can later be cited against the employee; rejecting it outright invites termination.

**Sections.** Date | Subject | Acknowledgement | Engagement with each PIP objective (achievable, ambiguous, or unmeasurable) | Suggested clarifications | Request for tools / training / OH referral / reasonable adjustments | Reservation of right to grieve PIP if unfounded | Signature.

**Tone.** Constructive but defensive.

**Length.** 400–700 words.

### 1.15 Constructive Dismissal Warning ("Last Straw" Notice / Breach Affirmation)

**Purpose.** *Before* resigning under constructive dismissal, send a formal letter: "Your conduct on [date] amounts in my view to a fundamental breach. Unless you remedy by [date], I reserve all rights including resignation in response and constructive unfair dismissal proceedings." This preserves position and may pre-empt the affirmation argument.

**Sections.** Date | Subject "Notice of Fundamental Breach" | Specific breach particulars | Statement that the employee is treating it as a fundamental breach but not yet resigning | Demand for remedy with deadline | Reservation of rights | Signature.

**Length.** 400–700 words.

### 1.16 Reference Dispute

**Purpose.** Challenge an inaccurate or misleading reference.

**UK.** Spring v Guardian Assurance [1995] — duty of care to subject. Damages flow from negligent misstatement.

**US.** State qualified-privilege statutes (FL §768.095, CA Civ. Code §47(c)) — overcome by malice.

**Length.** 350–600 words.

### 1.17 Resignation Withdrawal

**Purpose.** Withdraw a resignation given in heat of moment. UK: Sothern v Franks Charlesly [1981] — words spoken in anger may not be unequivocal. The withdrawal letter, sent promptly, builds the record that there was no meeting of minds.

**Length.** 200–400 words.

### 1.18 ACAS Early Conciliation Notification / EEOC Charge Cover Letter

**Purpose.** Procedural cover. UK: notify the prospective claim to ACAS to start the EC clock — required before an employment tribunal claim. US: cover letter accompanying an EEOC charge of discrimination.

**Behavioural rule.** This is a **tribunal-bound** letter. Must show Tier 3 disclaimer including a hard recommendation to obtain advice before filing.

**Length.** 300–600 words.

### 1.19 Cover Letter for Tribunal / Court Claim

**Purpose.** Cover the ET1 (UK) or court complaint (US). Strictly procedural; the substantive claim is in the form, not the cover. Tier 3 disclaimer mandatory.

**Length.** 200–400 words.

---

## 2. Critical Legal Protections to Bake In

These are the **non-optional, system-surfaced legal scaffolds** that distinguish a real employee tool from a generic letter generator.

### 2.1 UK

| Mechanism | Why it matters | Where the system surfaces it |
|---|---|---|
| **3-month tribunal limitation (s.111 ERA 1996)** | One day late = jurisdiction dies. | Letter types tagged `tribunal_bound`: a banner showing the calculated deadline based on user-provided "date of act complained of." |
| **ACAS Early Conciliation** | Must be lodged before issuing a tribunal claim. EC clock pauses limitation up to 6 weeks. | Wizard step before any tribunal-cover letter. |
| **ACAS Code of Practice (Disciplinary & Grievance)** | Compliance affects awards by up to 25% (s.207A TULRCA 1992). | Compliance rail under "rights preservation": "Have you raised in writing? Have you allowed the employer reasonable time to respond?" |
| **PIDA / s.43A–L ERA whistleblower protection** | No service requirement, no comp cap if dismissal flows from disclosure. Dismissal automatically unfair (s.103A). | Whistleblowing letter type forces explicit "reasonable belief" and "public interest" attestation. |
| **Equality Act 2010 protected characteristics** | Discrimination claims have no service requirement and no comp cap. | Universal pre-flight question: "Do you believe the issue is connected to a protected characteristic?" — drives compliance flagging in grievance / appeal / dismissal letters. |
| **Without-prejudice privilege + s.111A pre-termination negotiations** | "Without prejudice" speech and s.111A protected conversations are inadmissible at tribunal (with caveats — improper behaviour exception). | UI flag toggling header between OPEN and WITHOUT PREJUDICE & SUBJECT TO CONTRACT. Settlement-related drafts default ON. |
| **2-year unfair dismissal qualifying period** | Sub-2-year employees should be steered to discrimination / automatic-unfair routes. ERB 2024–25 phasing in day-one right (commencement 2026) — system must be year-aware. | Triage screen for sub-2y employees: route to discrimination / whistleblower / automatic-unfair framing. |

### 2.2 US

| Mechanism | Why it matters | Where the system surfaces it |
|---|---|---|
| **EEOC 180/300-day filing window** | Federal default 180; 300 in deferral states (most). State agency (FEHA, DCR, etc.) parallel windows differ. | Banner with calculated deadline once jurisdiction state and date-of-act are entered. |
| **OSHA whistleblower 30-day window** | Catastrophically short. Many employees miss it. | Whistleblower wizard surfaces this with an animated countdown if the user picks an OSHA-covered statute. |
| **NLRA §7 concerted activity** | Two or more employees discussing wages / conditions are protected even in non-union workplaces. Affects internal-policy letters about pay disclosure rules. | Inline guidance on grievances about pay / scheduling: "discussing this with colleagues is protected activity under NLRA §7." |
| **FMLA notice timing** | 30 days advance for foreseeable; "as soon as practicable" otherwise. | Wizard prompt for leave letters. |
| **ADA interactive process** | Failure to engage is itself actionable. Employee triggers it by the request. | Reasonable accommodation letter forces the "request for interactive meeting" line. |
| **At-will exceptions** | Public policy, implied contract, covenant of good faith — vary by state. | State-specific compliance rule set on resignations and constructive-discharge framings. |
| **State-specific whistleblower laws** | CA Labor Code §1102.5 broader than federal SOX; SOX 180-day OSHA window vs CA 3-year statute of limitations. | Wizard offers parallel-filing recommendation when both apply. |
| **PWFA / pregnancy** | New 2023 statute; tools tend to lag. | Mapped into the accommodation-request letter. |

### 2.3 How prompts surface the protections

The system prompt for an EMPLOYEE letter, in addition to the existing scaffolding, gets a `RIGHTS PRESERVATION` block:

```
RIGHTS PRESERVATION (employee mode):
- Reserve all rights at the close: "I reserve all my rights, including any statutory, contractual, or common-law remedies."
- Where applicable, name the statutory basis (s.43A ERA / Title VII / ADA) without legal-conclusion language.
- Frame factual narrative chronologically with dates and named witnesses.
- Avoid admissions, concessions, threats, or settlement language unless this letter is explicitly without-prejudice.
- Do not quote the employer's words inaccurately; if a quote is offered, mark it as paraphrase unless a verbatim record is supplied.
```

A **cross-letter consistency auditor** (mirrors the existing one in `prompts/system.ts`) flags admission-y or threat-y language before the user can export.

---

## 3. Tone Strategy

Employee letters fail in two predictable directions: too soft (wishy-washy, no facts, no asks) and too hot (threats, hyperbole, admissions). A future tribunal panel — or the employer's solicitor preparing the ET3 response — will read this letter. Tone is not cosmetic. It is evidence.

### 3.1 Tone slider

A four-point slider replacing the existing employer slider, with substantively different stops:

| Stop | Use case | Linguistic register |
|---|---|---|
| **Conciliatory** | Internal, ongoing relationship preservation, first-time grievance, reasonable-adjustment ask. | "I would be grateful if…", "I trust we can resolve…", "with respect to your role as…" |
| **Assertive** (default) | Formal grievance, pay dispute, PIP response. | "I am writing formally to…", "I require a response by…", "I am entitled under [statute] to…" |
| **Forensic** | Whistleblowing, constructive-dismissal warning, appeal. | "On [date] I observed…", "The factual record establishes…", numbered paragraphs and dated sub-events. |
| **Tribunal-ready** | ACAS EC notification, ET1 cover, EEOC cover. | Strictly procedural; declaratory; minimal narrative; references statute and form. |

The slider does **not** include "Aggressive" or "Strong." Inflammatory tone is a footgun; we do not arm it.

### 3.2 Register-safety check (the new compliance-rail dimension)

Mirroring the existing `compliance.ts` regex-based rule engine but reversed: instead of detecting *missing* statutory phrases, it detects *present* dangerous phrases. Three severities:

| Severity | Trigger examples |
|---|---|
| **block** (cannot export) | Direct legal conclusions stated as fact — "this is unlawful discrimination", "you have committed fraud", "you are in breach of contract" — flagged with: "Phrase reads as a legal conclusion. Reframe as: 'I believe this amounts to…'". Threats of litigation in non-without-prejudice channels. |
| **warn** (export possible) | Admissions ("I shouldn't have", "I admit", "I lost my temper"). Apologies for the employer's conduct. Settlement language in an open letter. Subjective intensifiers ("clearly", "obviously", "blatantly"). |
| **suggest** | Vague time references ("a while ago" → ask user for date). Unattributed quotes. Adverbs that undermine assertion ("I think maybe"). |

Implementation file: `src/lib/letters/employee/register-safety.ts` (mirrors `compliance.ts`).

### 3.3 "Without prejudice" header toggle

A single UI control on the editor header, two states:

- **OPEN** — default. Letter is openly admissible.
- **WITHOUT PREJUDICE** — header inserts "Without Prejudice and Subject to Contract" (UK) or "Confidential — Without Prejudice / Settlement Discussion" (US). Tone slider snaps to "Conciliatory" (with override). Compliance rail switches to "settlement-mode" rules — admission-y language is *less* dangerous here, so suppress those warnings.

Toggling the flag triggers a re-render of the rights-preservation block in the system prompt.

---

## 4. Architecture

### 4.1 Two modes, one codebase

Recommendation: **`mode` discriminator, not duplicated trees.**

The reasoning: 80% of the platform is shared (Tiptap editor, sections, streaming, export, store, wizard primitives). Duplicating into `letters/employer/` and `letters/employee/` will leak inconsistencies — a fix to the streaming hook will land in one and not the other. A `mode` field, with mode-aware catalog/questions/compliance/prompts files, keeps the lift small and the surface area testable.

### 4.2 File layout

```
src/lib/letters/
├── types.ts                     # Mode added to Draft + LetterContext (see 4.4)
├── catalog/
│   ├── index.ts                 # Combined export with mode filter
│   ├── employer.ts              # (renamed from existing catalog.ts)
│   └── employee.ts              # NEW
├── questions/
│   ├── index.ts
│   ├── universal.ts             # Mode-aware: shared subset + branch
│   ├── employer.ts              # (renamed from existing LETTER_QUESTIONS)
│   └── employee.ts              # NEW
├── compliance/
│   ├── index.ts                 # rulesFor() takes mode
│   ├── employer.ts              # (renamed)
│   ├── employee.ts              # NEW — rights-preservation rules
│   └── register-safety.ts       # NEW — register-safety regex rules
└── disclaimers/
    ├── employer.ts              # (renamed from inline)
    └── employee.ts              # NEW

src/lib/prompts/
├── system.ts                    # Branches on mode internally
├── sections.ts                  # Mode-aware section instructions
└── employee/
    ├── rights-preservation.ts   # NEW — rights-preservation block
    └── tone-bands.ts            # NEW — register guidance per stop
```

### 4.3 Routing

```
/                                Landing — mode picker for new sign-ups
/hr/                             Employer mode (existing)
/hr/new/:letterType
/hr/editor/:draftId
/me/                             Employee mode (new)
/me/new/:letterType
/me/editor/:draftId
```

`App.tsx` routes both prefixes to the same components but injects a `<ModeProvider>` reading from the URL prefix. The store uses a single drafts dict; each Draft carries `mode: "employer" | "employee"`. The Home / Wizard / Editor route components read mode from context and select the right catalog / questions / compliance set.

### 4.4 Data model changes

```ts
// Additions to types.ts
export type Mode = "employer" | "employee";

export type EmployeeLetterTypeId =
  | "grievance"
  | "resignation_clean"
  | "resignation_with_grievance"
  | "resignation_constructive"
  | "flexible_working_request"
  | "subject_access_request"
  | "appeal"
  | "whistleblowing"
  | "accommodation_request"
  | "sickness_notification"
  | "pay_dispute"
  | "redundancy_consultation_response"
  | "settlement_counter_offer"
  | "right_to_disconnect"
  | "holiday_request"
  | "pip_response"
  | "constructive_dismissal_warning"
  | "reference_dispute"
  | "resignation_withdrawal"
  | "acas_ec_notification"
  | "tribunal_cover";

export type LetterTypeId = EmployerLetterTypeId | EmployeeLetterTypeId;

export type LetterContext = {
  mode: Mode;                                  // NEW
  withoutPrejudice?: boolean;                  // NEW (employee)
  protectedDeadline?: { iso: string; basis: string; }; // NEW (employee)
  // ... existing fields
};

export type Draft = {
  // ... existing fields
  mode: Mode;                                  // NEW (denormalised for fast filtering)
  evidence?: EvidenceItem[];                   // NEW (employee uploads)
};

export type EvidenceItem = {
  id: string;
  kind: "email" | "calendar" | "document" | "screenshot" | "note";
  filename?: string;
  contentRef: string;          // points to encrypted blob in IDB / cloud
  parsedSummary?: string;      // LLM-derived precis surfaced into the wizard
  uploadedAt: number;
};
```

### 4.5 Compliance-rail flip

The existing rail surfaces "you must include X to comply." For employee letters it surfaces:

- "You should reference [statute] to preserve [right]."
- "You should NOT say [phrase] because it [risk]."
- "Calculated tribunal deadline: [date]. ACAS EC must be lodged by [date - 6 weeks]."

The data structure in `compliance/employee.ts` mirrors `ComplianceRule` but adds:

```ts
export type EmployeeComplianceRule = ComplianceRule & {
  protects: "limitation" | "without_prejudice" | "rights_reservation"
          | "protected_disclosure" | "discrimination_claim" | "evidence_quality";
  appliesIf?: (draft: Draft) => boolean;
};
```

---

## 5. Auth and Feature Differences

### 5.1 Account model

| Dimension | Employer mode | Employee mode |
|---|---|---|
| Account scope | Company-level multi-seat | Individual |
| Seat assignment | HR Director / HR Manager / Hiring Manager roles | Single user |
| Drafts visible | Company-wide (with role-based filters) | Strictly private — no admin override |
| Audit log | Internal, retained 7 years | None for employee (or, employee-only) |
| Email domain check | Company SSO encouraged | Personal email default |

A single auth provider serves both modes. Mode is set at sign-up via a "I am drafting letters as…" picker. Users can hold both seats (e.g., an HR professional who later finds themselves dealing with their own employer).

### 5.2 Pricing

- **Employer:** per-seat, monthly, £39–£99/seat depending on volume (existing direction).
- **Employee:**
  - **Single letter:** £19 one-off, includes a 30-day editor window.
  - **Dispute subscription:** £19/month, unlimited drafts during an active dispute, includes a recommended-counsel handoff. Cancellable instantly.
  - **Free tier:** SAR template only (low cost, high goodwill, often the gateway to a paying dispute).

### 5.3 Privacy

Employee data is uniquely sensitive: whistleblowers, harassment victims, dismissed workers. The threat model includes an adversarial employer subpoenaing the platform's records, an employer identifying employees by IP / billing email, and the employee's own device being seized during an investigation.

Recommendations:

- **At-rest encryption with user-derived key.** Drafts are encrypted with a key derived from the user's password (PBKDF2 / scrypt). Server cannot read draft content. Disclosed in the privacy policy.
- **No employer-side admin override.** Even if an employer also has an employer-mode subscription, they cannot see drafts from a personal employee account.
- **Burn-after-export option.** On export, the user can choose to wipe the draft and all its versions from the cloud. Local copy remains.
- **Anonymous billing path.** The first version uses Stripe. Roadmap: a privacy-first billing path (prepaid voucher purchasable at retail).
- **Tor / VPN tolerated.** No anti-fraud rules that block on Tor exits. Genuine whistleblowers may use them.
- **Subject access request reply mode.** If served a SAR for the user's own data, we have a documented response and the user is notified.
- **Subpoena policy.** Documented, with a commitment to notify the user where lawful.

---

## 6. Question Taxonomy

### 6.1 Universal employee pre-flight

Replaces the existing employer pre-flight when mode = employee. Carries some fields, drops some, adds:

- Jurisdiction (UK / US) + sub-jurisdiction.
- Worker classification (employee / worker / contractor — with Pimlico Plumbers v Smith [2018] gloss for UK borderline cases).
- Length of service / start date.
- Employer name + address (for the recipient block).
- Manager and HR contact names.
- **Protected characteristics implicated?** (Multi-select: race, sex, age, disability, religion, sexual orientation, gender reassignment, pregnancy & maternity, marriage & civil partnership; US adds: national origin, genetic information, military / veteran status.) Drives discrimination-claim framing and the protected-deadline banner.
- **Date of the act complained of.** Drives limitation-period banner.
- **Have you raised this informally first?** Y/N. If N, suggest an informal step before formal grievance — but do not block.
- **What outcome do you want?** Always asked, free text, surfaced explicitly into the closing paragraph. A list of options to seed thinking: (i) acknowledgement and apology; (ii) policy change; (iii) procedural rectification (e.g., re-hearing); (iv) financial remedy; (v) reinstatement; (vi) reference correction; (vii) settlement and exit.

### 6.2 Per-letter-type questions

Each entry in §1's catalogue maps to a `QuestionStep[]` analogous to `LETTER_QUESTIONS` in `questions.ts`. Worked example for grievance below in §8.

### 6.3 Evidence intake

A new wizard step — "Have you got supporting evidence?" — accepts:

- Calendar of incidents (CSV or pasted text). Parsed into a chronological structured list, surfaced into the body.
- Emails received (text paste or .eml upload). Sender / date / verbatim quote suggested.
- HR documents (PDF / DOCX). Extracted via existing parser; key dates/figures lifted.
- Free-form notes ("anything else you want me to know").

The LLM uses this to write specific dated factual paragraphs instead of vague narrative. Privacy: stored encrypted client-side by default. The user can mark each item as "include verbatim in letter" or "use as background only."

---

## 7. Disclaimer Engine

### 7.1 Tier 1 — Universal (every letter)

> *This letter has been drafted with an AI tool and is not legal advice. For complex situations — particularly before signing settlement agreements, lodging tribunal claims, or making protected disclosures — obtain advice from a qualified employment solicitor (UK) or attorney (US).*

### 7.2 Tier 2 — Jurisdiction-specific resources

UK footer (auto-injected):

> *Free advice: ACAS helpline 0300 123 1100 (acas.org.uk). Citizens Advice (citizensadvice.org.uk). Working Families (workingfamilies.org.uk). Equality Advisory & Support Service (equalityadvisoryservice.com). Law Centres Network (lawcentres.org.uk).*

US footer:

> *Free advice: EEOC 1-800-669-4000 (eeoc.gov). NLRB Information Officer (nlrb.gov). State Department of Labor (find your state at dol.gov). Legal aid via lawhelp.org / National Employment Lawyers Association (nelahq.org).*

### 7.3 Tier 3 — High-risk (tribunal-bound and settlement-related)

Letter types tagged `tribunal_bound` (whistleblowing, ACAS EC notification, tribunal cover, constructive dismissal warning, settlement counter-offer):

> *IMPORTANT: This letter may be disclosed in employment tribunal or court proceedings. Anything you write may be used as evidence by you or against you. We strongly recommend a qualified employment solicitor or attorney reviews this letter before sending. The platform provider accepts no liability for content sent without legal review.*

A hard-stop modal precedes export for these types: "I confirm I have considered seeking legal advice." The modal has a third option: "Help me find advice" — links to the §7.2 footer plus a directory of pro-bono employment law clinics.

### 7.4 Tier 4 — Inline, contextual

- Constructive dismissal: "Your right to resign in response to the breach can be lost by delay (Western Excavating v Sharp). Send promptly."
- Whistleblowing: "Reasonable belief in the truth of the information is the threshold (s.43A ERA 1996 / state equivalent). Speculation is not protected."
- Settlement counter: "Any agreement is only valid if you take independent legal advice from a relevant adviser (s.203 ERA 1996 UK / advised to consult an attorney US)."

---

## 8. Sample Wizard Flow — UK Formal Grievance

**Screen 1 — Letter type picker.** User in `/me` lands on the catalogue. Picks "Formal grievance." Card shows risk class (high), tone band (Assertive), tribunal-bound (yes), legal-review recommended (strongly).

**Screen 2 — Triage.** Two questions. (i) "Have you raised this informally first?" — Yes / No / Not safe to. (ii) "How urgent is this — within 14 days, within 1 month, longer?" The "Not safe to" branch surfaces a recommendation to read the constructive-dismissal-warning letter type and consider it as an alternative or precursor.

**Screen 3 — Universal pre-flight (jurisdiction).** UK selected. England & Wales sub-jurisdiction. Worker classification = employee.

**Screen 4 — Universal pre-flight (employer).** Legal name. Registered address. Recipient — HR director or named manager — with a "I don't know who to address it to" helper that offers "the most senior HR officer of [legal name]."

**Screen 5 — Universal pre-flight (employee).** Name, role, department, start date, length of service auto-computed.

**Screen 6 — Protected characteristics.** Multi-select. Suppose user selects "Sex" and "Pregnancy & maternity." A banner appears: "Pregnancy and maternity discrimination has no qualifying period and no compensation cap. Equality Act 2010 ss.17–18."

**Screen 7 — Date of the act complained of.** User enters 14 March 2026 (assuming today is 9 May 2026). The system computes:

- Tribunal limitation: 13 June 2026 (3 months less one day).
- ACAS EC must be lodged before 13 June; up to 6 weeks pause.
- Banner sticks to the wizard until export.

**Screen 8 — Grievance facts.** Five free-form fields with prompts:

- "What happened?" — chronological narrative (hint: dates, who, what, where).
- "Who else was present or aware?" — named witnesses.
- "What documents back this up?" — list / link to evidence step.
- "Have you raised it before?" — prior raise dates.
- "What impact has this had on you?" — wellbeing, work performance, financial.

**Screen 9 — Outcome sought.** Options seeded from §6.1; user picks two: "Procedural rectification" (re-allocate role) and "Acknowledgement and apology."

**Screen 10 — Evidence intake.** Optional. User pastes three emails dated 14 March, 22 March, 5 April. Parser extracts senders, dates, quotes. User flags the 14 March email as "include verbatim."

**Screen 11 — Tone & format.** Slider defaults to Assertive. Confidentiality = "Private & Confidential."

**Screen 12 — Generate.** The wizard handoff to the editor. The Editor auto-runs the per-section streaming. Sections produced:

1. Date and recipient block.
2. "Private & Confidential" header.
3. Subject: "Formal Grievance under the ACAS Code of Practice — [Date Filed]."
4. Salutation.
5. Opening: "I am writing to raise a formal grievance under the ACAS Code of Practice on Disciplinary and Grievance Procedures and our company's grievance policy."
6. Background and chronology — incorporates the evidence-flagged 14 March email verbatim.
7. Witnesses and corroborating documents.
8. Statement of belief in protected-characteristic basis: "I believe these matters relate to my pregnancy and to my sex, contrary to the Equality Act 2010 sections 17 and 18."
9. Impact statement.
10. Outcome sought.
11. Request for grievance hearing within reasonable time + right to be accompanied.
12. Reservation of rights.
13. Sign-off.

The compliance rail shows in real-time:

- ✓ Statutory basis named (Equality Act 2010 ss.17–18).
- ✓ Reservation of rights present.
- ✓ Right to be accompanied requested.
- ⚠ Phrase detected: "completely unacceptable" — soft warning, "verbal intensifier; consider 'I considered this conduct unacceptable.'"
- ⚠ Tribunal limitation date: 13 June 2026 — shown as a sticky banner.

User accepts most, edits the soft warning. Exports as PDF. The Tier 3 disclaimer is appended automatically. The hard-stop modal asks for confirmation that legal advice has been considered. User clicks "Help me find advice" once; bookmarks the citizens advice link; comes back; exports.

---

## 9. Risks and Ethical Considerations

### 9.1 Are we encouraging litigation?

Yes, modestly. We help employees do something they were already going to attempt — write a difficult letter — and we help them do it well. The tribunal claims that flow from this are mostly claims that should have been brought; the employees who never write the letter are very often the ones with the most legitimate grievances and the least access to professional support.

The mitigation is a **triage layer** before drafting. For each high-risk letter type the wizard offers a 30-second self-assessment ("how strong is your evidence? how time-bound is your complaint? is there an informal route still open?") and points users with weak triage scores to the §7.2 free advice services first. This is the move ACAS, Citizens Advice, and the better employment-law charities make and it is the right one — it is also commercially sensible because successful, well-supported complaints generate referrals and brand goodwill; hopeless ones generate refunds and bad reviews.

### 9.2 Liability exposure to the platform

Modulated by disclaimers (§7) and the AI-not-legal-advice framing. Real risks:

- **A user sends a letter, claims the AI defamed someone.** Mitigation: prompts forbid stating legal conclusions as fact (s.3); the hard-stop modal requires user confirmation; the platform's terms of use state the user is the publisher.
- **A user sends a letter that defeats their own claim** (e.g., affirms the contract pre-constructive-dismissal). Mitigation: the constructive-dismissal letter type's prompt explicitly forbids affirmation language and the register-safety check flags it. Tier 3 disclaimer recommends counsel.
- **Data breach exposes whistleblower identities.** Mitigation: §5.3 encryption at rest + audit posture. This is the single biggest commercial-existence risk; underinvest at peril.
- **Regulator concern about unauthorised practice of law.** Mitigation: the product is a drafting assistant, not legal advice. UK SRA / US state bar rules generally permit document automation tools provided they do not represent themselves as legal services. The disclaimer language is compliant with the strictest reading.

### 9.3 Without-prejudice safety

The platform must respect that "without prejudice" is a substantive privilege, not an ornament. The header toggle (§3.3) does the right thing on open/closed status, but: a user copying without-prejudice draft text into an open email destroys the privilege. Add a UI affordance — the editor shows an obvious watermark on without-prejudice drafts and an export-time warning: "This letter is marked Without Prejudice. Send only as a discrete settlement communication; do not paste into open correspondence."

### 9.4 Vulnerability and crisis

A subset of users will be in personal crisis — bullying, harassment, discrimination, mental-health-impacting workplace conduct. The product should:

- Avoid gamification, streaks, "letters drafted this week" badges.
- Surface a "support" link to Samaritans (UK 116 123), Crisis Text Line (US text 741741), and counterpart resources.
- Include a "save and exit" option on every screen of the wizard.
- Avoid pushing for quick filings on tribunal-bound letters; respect that the user may need time.

---

## 10. Build Sequence — Cheapest Path

Given the existing codebase, the goal is to ship the employee mode as a separate product surface under the same login with minimal disruption to the working employer surface. The sequence:

### Phase A — Shared plumbing (1–2 days)

**Refactor (backwards-compatible):**

- `src/lib/letters/types.ts` — add `Mode`, `EmployeeLetterTypeId`, expand `LetterTypeId` union, add `mode` field to `Draft` and `LetterContext`. Default mode = `"employer"` for existing drafts.
- `src/lib/letters/catalog.ts` → split into `catalog/employer.ts` + new `catalog/employee.ts`; re-export from `catalog/index.ts` with `byMode(mode: Mode)` filter.
- `src/lib/letters/questions.ts` → split similarly. `UNIVERSAL_STEPS` becomes mode-aware (universal/employee.ts adds protected characteristics, date-of-act, outcome-sought).
- `src/lib/letters/compliance.ts` → split similarly.
- `src/lib/store.ts` — `createDraft(letterType, answers, mode)`. Existing call sites default to `"employer"`.
- `src/App.tsx` — split routes into `/hr/*` and `/me/*`. Existing routes redirect to `/hr/*`.
- `src/components/Layout.tsx` — read mode from URL prefix; reskin chrome subtly per mode (employee mode uses an envelope icon and a gentler palette; employer mode keeps existing).

**Effort:** 1 senior engineer-day, maybe 1.5.

### Phase B — Employee letter content (3–5 days, parallelisable)

- `catalog/employee.ts` — all 19 letter types from §1.
- `questions/employee.ts` — per-letter `QuestionStep[]` flows.
- `compliance/employee.ts` — rights-preservation rules per letter type and jurisdiction.
- `compliance/register-safety.ts` — phrase blocklists / warnlists / suggest-lists.
- `disclaimers/employee.ts` — Tier 1–4 strings.

This is the bulk of the work and can be split across two engineers / one engineer + one paralegal per jurisdiction.

**Effort:** 3–5 days for v1 content with one engineer and one US-qualified employment-law reviewer + one UK-qualified reviewer for sign-off.

### Phase C — Employee-mode prompts (1–2 days)

- `src/lib/prompts/system.ts` — branch on `draft.context.mode`. Add the rights-preservation block when `mode === "employee"`.
- `src/lib/prompts/sections.ts` — extend `SECTION_INSTRUCTIONS` with employee-relevant sections (`reservation_of_rights`, `chronology`, `outcome_sought`, `statutory_basis`, `evidence_attached`).
- `src/lib/prompts/employee/rights-preservation.ts` — the block.
- `src/lib/prompts/employee/tone-bands.ts` — the four-stop tone register guidance.

**Effort:** 1.5 days.

### Phase D — Wizard / editor surfaces (2–3 days)

- New mode picker on `/`.
- Triage screen (per high-risk letter type).
- Protected-deadline banner component, sticky in the editor for tribunal-bound letters.
- Without-prejudice header toggle in the editor chrome.
- Tone slider with four stops + register-safety panel in the right rail (replaces the compliance rail when mode = employee, with the same interaction model — click an item to scroll to / fix the source).
- Evidence intake step in the wizard.

**Effort:** 2–3 days.

### Phase E — Auth / billing / privacy (the longest, 5–10 days)

- Auth provider with mode-aware sign-up flow.
- Single-letter and subscription billing on Stripe (or compliant alternative).
- At-rest encryption with user-derived key (employee drafts only — employer drafts can stay company-readable).
- Burn-after-export.
- Subpoena and SAR-reply policies, documented and stored.

**Effort:** 5–10 days, mostly around the encryption and policy work.

### Phase F — Disclaimers, hard-stop modal, ethical safeguards (1 day)

- Tier 1–4 disclaimer engine, mode-aware.
- Hard-stop pre-export modal for tribunal-bound letters.
- Crisis support link in the footer.
- "Help me find advice" directory page.

### Total

A determined engineering team can ship the v1 employee surface in **12–20 working days**, gated by legal review on the catalogue content rather than by engineering complexity. The architecture choice (mode discriminator over duplicated tree) is the load-bearing decision: it keeps the cost down and the long-term maintenance honest.

---

## Authority Citations Used

**UK:** Employment Rights Act 1996 (ss. 1, 4, 13, 43A–L, 80F, 80G, 86, 95(1)(c), 98, 103A, 108, 111, 111A, 138, 162, 203); Equality Act 2010 (ss. 6, 17, 18, 20–22); Trade Union and Labour Relations (Consolidation) Act 1992 (ss. 188, 207A); Working Time Regulations 1998; Employment Relations Act 1999 (s.10); Public Interest Disclosure Act 1998; UK GDPR Art. 15; Data Protection Act 2018 (s.45); Flexible Working (Amendment) Regulations 2023; Public Interest Disclosure (Prescribed Persons) Order 2014; Social Security Contributions and Benefits Act 1992 (s.151); Employment Rights Bill 2024 (pending). Cases: Western Excavating (ECC) Ltd v Sharp [1978]; Williams v Compair Maxam [1982]; Sothern v Franks Charlesly [1981]; Spring v Guardian Assurance [1995]; Bear Scotland v Fulton [2014]; Polkey v AE Dayton Services [1987]; Chesterton Global v Nurmohamed [2017]; Pimlico Plumbers v Smith [2018]; Bateman v Asda [2010]; ACAS Code of Practice on Disciplinary and Grievance Procedures.

**US:** Title VII (42 USC §2000e); ADA; ADEA / OWBPA (29 USC §626(f)); FLSA (29 USC §201); FMLA (29 USC §2611); WARN Act (29 USC §2101); SOX §806 (18 USC §1514A); NLRA §7 (29 USC §157); OSHA whistleblower provisions; PWFA (2023); Defend Trade Secrets Act 2016; Cal. Labor Code §§201, 226, 510, 1102.5, 1198.5, 2810.5; Cal. Bus. & Prof. Code §16600; Cal. Civ. Code §47(c); NY Labor Law §§195, 195(6), 198; FL Stat. §768.095; EEOC enforcement guidance; *Faragher v City of Boca Raton* / *Burlington v Ellerth* affirmative defence framework.
