import type { Draft, Section } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { getSectionTemplate } from "@/lib/letters/templates";
import { evidencePromptBlock } from "@/lib/evidence";
import { FILING_DEADLINE_SAFETY } from "./employee/rights-preservation";
import {
  isQuestionVisible,
  letterStepsFor,
  universalStepsFor,
  type Question,
} from "@/lib/letters/questions";

/**
 * Build a section-specific user prompt. Pairs with the master system prompt
 * (see ./system.ts).
 *
 * Resolution order:
 *   1. If a template exists for (letterType, jurisdiction) and contains this
 *      sectionId, use the template's instruction + scaffold + constraints +
 *      example. This is the gold-standard path.
 *   2. Otherwise fall back to the generic SECTION_INSTRUCTIONS table below.
 *
 * Both paths still attach LEGAL_FENCES and the wizard's answers data dump.
 */
export function buildSectionPrompt(
  draft: Draft,
  section: Section,
  priorSectionTitles: string[],
  /**
   * Optional freeform user instruction biasing this single regeneration.
   * Wrapped as USER REFINEMENT and applied AFTER the structural constraints,
   * so the model honours the brief but can't break the section's hard rules.
   */
  refineInstruction?: string
): string {
  const meta = getLetterMeta(draft.letterType);
  const sectionFences = LEGAL_FENCES_BY_LETTER[draft.letterType]?.[draft.context.jurisdiction] ?? "";
  const lengthHint = LENGTH_HINTS_BY_SECTION[section.sectionId] ?? "Use the natural length for this section.";
  const dataDump = relevantData(draft);
  const evidenceDump = evidencePromptBlock(draft, section.id);
  const deadlineSafety = draft.mode === "employee" ? FILING_DEADLINE_SAFETY : "";

  const refineBlock = refineInstruction?.trim()
    ? `\n\nUSER REFINEMENT (highest priority — apply on top of everything below; if it conflicts with HARD CONSTRAINTS, explain in [TBD] rather than break a constraint):\n${refineInstruction.trim()}\n`
    : "";

  const previousBlock = section.html?.trim()
    ? `\n\nPREVIOUS DRAFT OF THIS SECTION (use as context for the refinement; rewrite, don't echo):\n${section.html.trim()}\n`
    : "";

  const tpl = getSectionTemplate(draft.letterType, draft.context.jurisdiction, section.sectionId);

  if (tpl) {
    const constraints = tpl.constraints.length > 0
      ? tpl.constraints.map((c) => `- ${c}`).join("\n")
      : "(no extra constraints)";
    return `Write the "${section.title}" section of this ${meta.title} letter using the template below.

POSITION: section comes after these prior sections (titles only, do not repeat them): ${priorSectionTitles.length > 0 ? priorSectionTitles.join(" → ") : "(this is the first section)"}.

SECTION INSTRUCTION (template-authored):
${tpl.instruction}

STRUCTURAL SCAFFOLD — preserve this structure, replace {{placeholders}} with the supplied data, but rewrite phrasing in the requested tone:
${tpl.scaffold}

HARD CONSTRAINTS:
${constraints}
${deadlineSafety}

GOLD-STANDARD EXAMPLE (for register/length calibration only — do NOT lift verbatim):
${tpl.example}

LENGTH BUDGET: ${lengthHint}

LEGAL FENCES (${draft.context.jurisdiction}):
${sectionFences}

DATA TO USE:
${dataDump}

EVIDENCE TO USE:
${evidenceDump}${refineBlock}${previousBlock}

Write only the HTML for this section. No preamble, no commentary. Do not echo the example.`;
  }

  // Fallback: pre-template generic instructions.
  const sectionInstr = SECTION_INSTRUCTIONS[section.sectionId] ?? "";
  return `Write the "${section.title}" section of this ${meta.title} letter.

POSITION: section comes after these prior sections (titles only, do not repeat them): ${priorSectionTitles.length > 0 ? priorSectionTitles.join(" → ") : "(this is the first section)"}.

SECTION INSTRUCTION:
${sectionInstr}

${deadlineSafety}

LENGTH BUDGET: ${lengthHint}

LEGAL FENCES (${draft.context.jurisdiction}):
${sectionFences}

DATA TO USE:
${dataDump}

EVIDENCE TO USE:
${evidenceDump}${refineBlock}${previousBlock}

Write only the HTML for this section. No preamble, no commentary, no headings unless the section format calls for one.`;
}

const SECTION_INSTRUCTIONS: Record<string, string> = {
  recipient_block:
    "Render the date and recipient address block. Format date in the locale style (UK: '12 May 2026'; US: 'May 12, 2026'). Then the recipient's full legal name and home address on separate lines, wrapped in a single <p>. If the company has letterhead, suppress the sender address.",

  subject:
    "Render a single <p> with a subject line in <strong>. The subject is short, formal, and identifies the letter precisely (e.g. 'Offer of Employment — Senior Engineer', 'Notice of Termination of Employment', 'Outcome of Disciplinary Hearing — First Written Warning').",

  salutation:
    "Render exactly one short <p> with the salutation. Use 'Dear Mr./Ms./Dr. {Surname},' unless a preferred first name is supplied, in which case 'Dear {PreferredName},'. Do not invent honorifics. End with a comma.",

  opening:
    "Write the opening paragraph(s). For positive letters (offer, promotion), be warm and congratulatory but precise. For decisions (termination, warning, settlement), be direct and reference the relevant prior process (hearing date, consultation, review meeting). One or two paragraphs.",

  body:
    "Write the main substantive content of the letter. Cover all required facts exactly once. Flowing paragraphs only — no bullets unless the content is structurally a list of items the recipient must do.",

  terms:
    "Write the terms paragraph(s) — notice period, final pay treatment, holiday accrual, garden leave, restrictive covenants, or other contractual mechanics relevant to this letter type. Be precise with figures and dates. If a figure is missing, use [TBD].",

  compensation:
    "Render the compensation details: base salary with currency and frequency; bonus structure if any; equity grant details if any; pay-period explanation. For offers, note whether amounts are gross/before tax. Use a small <table> only if comparing old vs new amounts; otherwise prose.",

  benefits:
    "Render the benefits and leave summary: pension/401(k), healthcare, annual leave entitlement, other benefits. Reference scheme names where supplied; otherwise refer generically to 'the company's pension scheme', 'the company's medical plan', etc.",

  conditions:
    "Render conditions of the offer (if applicable): right-to-work / I-9 / E-Verify checks, background checks, references, medical clearance. State that the offer is conditional on satisfactory completion of these. For terminations, this section instead covers return-of-property and reminders about confidentiality and restrictive covenants.",

  next_steps:
    "Render the call to action — what the recipient should do next, by when. For offers: how to accept and the deadline. For settlements: independent legal advice and signing deadline. For variations: confirm acceptance.",

  appeal_rights:
    "Render the right-of-appeal paragraph. Name the appeal officer, give a deadline (typically 5 working days), and direct the employee to address the appeal in writing. Reference the right to be accompanied where applicable (UK).",

  closing:
    "Render a short closing paragraph and sign-off. UK: 'Yours sincerely,' (named recipient) or 'Yours faithfully,' (To Whom It May Concern). US: 'Sincerely,' is universal. One or two short sentences before the sign-off.",

  signature:
    "Render the signature block. Three lines wrapped in <p> with <br>: signatory name, signatory title, employer legal name. Leave space above for a wet signature. Do not include any marketing footer.",

  // ===== Employee-mode-specific sections =====

  chronology:
    "Render a tight factual chronology of the events the employee is complaining about / asserting. Use specific dates and names. Flowing prose only — do NOT use bullets unless the user has asked for them. Do not state legal conclusions as fact (use 'I believe…' / 'I consider…'). Do not embellish or speculate. If a date is missing, use [TBD].",

  witnesses:
    "List in prose the named witnesses or third parties who were present or aware, and any documents that corroborate the employee's account. One short paragraph. No bullets unless the user supplied a list.",

  statutory_basis:
    "Render a paragraph naming the statutory or contractual basis the letter relies on (e.g. Equality Act 2010 ss.17–18, Article 15 UK GDPR, s.43A ERA 1996, Title VII, Cal. Lab. Code §1102.5). Frame protected-characteristic claims as belief, not legal conclusion: 'I believe these matters are connected to my [characteristic], in violation of [statute].'",

  impact:
    "One paragraph describing the impact on the employee — work performance, wellbeing, financial — in factual, calm terms. No emotional rhetoric, no intensifiers.",

  outcome_sought:
    "Render the outcome paragraph. Lead with 'I am asking that…' or 'The outcome I am seeking is…' followed by 1–3 specific asks. Tribunal panels expect a clear remedy. Avoid vague 'I hope you will look into this'.",

  evidence_attached:
    "Briefly note that the documents listed below are attached and form part of the letter. Use [TBD] if no list is supplied. Single short paragraph.",

  reservation_of_rights:
    "Render the reservation paragraph. Open with 'I reserve all my rights…' Include statutory, contractual, and common-law remedies. For tribunal-bound letters, reference the right to bring an Employment Tribunal / EEOC / state-agency claim.",

  deadline:
    "Reserve the employee's rights subject to the applicable time limits. No filing deadline has been verified. Do not calculate or state a filing date, duration or extension from an incident date or reminder, and do not assert that a claim is in time.",

  header:
    "If this is a Without-Prejudice draft, render exactly one <p><strong>Without Prejudice and Subject to Contract</strong></p> as the header. Otherwise render an empty string.",
};

const LENGTH_HINTS_BY_SECTION: Record<string, string> = {
  recipient_block: "very short — date and address only.",
  subject: "one short sentence.",
  salutation: "one line.",
  opening: "1–2 paragraphs.",
  body: "2–4 paragraphs depending on letter type.",
  terms: "1–3 paragraphs.",
  compensation: "1–2 paragraphs or a small table.",
  benefits: "1–2 paragraphs.",
  conditions: "1–2 paragraphs.",
  next_steps: "1 short paragraph.",
  appeal_rights: "1 short paragraph.",
  closing: "1 paragraph + sign-off.",
  signature: "very short — name, title, company.",
  chronology: "2–4 paragraphs.",
  witnesses: "1 short paragraph.",
  statutory_basis: "1 paragraph.",
  impact: "1 short paragraph.",
  outcome_sought: "1 paragraph with 1–3 specific asks.",
  evidence_attached: "1 sentence.",
  reservation_of_rights: "1 short paragraph.",
  deadline: "1 sentence.",
  header: "header line only.",
};

const LEGAL_FENCES_BY_LETTER: Record<string, Record<"UK" | "US", string>> = {
  offer: {
    UK: `- Reference that a written statement of particulars under s.1 Employment Rights Act 1996 will be provided on or before day one.
- State that the offer is conditional on satisfactory right-to-work documentation (Immigration, Asylum and Nationality Act 2006).
- Reference auto-enrolment pension under the Pensions Act 2008 if eligible.
- State statutory minimum notice (s.86 ERA): 1 week after 1 month's service, then 1 week per year up to 12.
- DO NOT include a non-compete that is broader than reasonably necessary.
- Annual leave is at least 5.6 weeks including bank holidays (Working Time Regulations 1998).
- Use British English spelling.`,
    US: `- Include an explicit at-will employment statement: "Your employment will be at-will and may be terminated by either you or the company at any time, with or without cause or notice." Except Montana, where good-cause applies after probation.
- State that the letter is not a contract of employment for any specific term.
- Include the salary range if jurisdiction requires (CA, NY, CO, WA, IL, MA, etc.).
- Reference I-9 / E-Verify documentation requirement.
- DO NOT include a post-employment non-compete in CA, ND, OK, MN.
- Reference FLSA exempt vs non-exempt classification.
- Use American English spelling.`,
  },
  termination: {
    UK: `- Name the s.98 ERA potentially fair reason (capability, conduct, redundancy, statutory illegality, SOSR).
- Comply with the ACAS Code of Practice on Disciplinary and Grievance Procedures — non-compliance may uplift tribunal awards by up to 25% (s.207A TULRCA).
- Statutory minimum notice (s.86 ERA) and contractual notice — apply whichever is greater.
- MANDATORY right of appeal in writing — name appeal officer, deadline, and reminder of right to be accompanied.
- Confirm final pay date, accrued holiday pay, and treatment of any outstanding bonuses.
- Use British English spelling.`,
    US: `- At-will: no statutory reason needed but document a legitimate business reason to defeat discrimination claims.
- Reference COBRA continuation (29 USC §1166) — separate notice within 14 days.
- State-specific final pay timing: CA (immediate, Lab. Code §201), NY (next regular payday), TX (next regular payday §61.014), most others (next regular payday).
- Include accrued unused PTO in CA, CO, MA, IL where vested under policy.
- For mass layoffs (100+ employee employers, 50+ affected at single site): WARN Act 60-day notice (29 USC §2101).
- Use American English spelling.`,
  },
  warning: {
    UK: `- Comply with ACAS Code of Practice on Disciplinary and Grievance Procedures.
- Reference the disciplinary hearing date and confirm the right to be accompanied was offered (s.10 ERelA 1999).
- Be precise about the allegation, findings, and required improvement (specific, measurable, time-bound).
- State the level of warning, time on file, and that further issues may lead to further action up to and including dismissal.
- MANDATORY right of appeal — name appeal officer and 5-working-day deadline.`,
    US: `- Document the legitimate business reason and the specific performance/conduct issue.
- Reference any handbook policy if a progressive discipline policy is in place.
- If ADA disability or other protected status is implicated, separate the performance issue and document the interactive process separately.
- Include support offered (training, EAP) where appropriate.`,
  },
  redundancy: {
    UK: `- Reference the consultation history and outcome.
- For 20+ dismissals in 90 days: s.188 TULRCA collective consultation (30 days, or 45 days if 100+).
- State the selection pool, criteria, and that scoring was applied fairly and non-discriminatorily.
- Statutory redundancy pay (s.162 ERA): 22-40 = 1 week/year; 41+ = 1.5 weeks; <22 = 0.5 weeks; min 2y service; capped weekly amount.
- 4-week trial period in suitable alternative role (s.138 ERA).
- Right of appeal recommended.`,
    US: `- WARN Act 60-day notice for 100+ employers, 50+ affected at single site.
- CA-WARN: 75 employees, lower thresholds — 60 days. NY-WARN: 50 employees, 25+ affected, 90 days.
- OWBPA periods if releases by 40+: 21 days (45 group) to consider, 7 days to revoke.
- COBRA continuation notice.
- State unemployment insurance information.`,
  },
  warning_uk: { UK: "", US: "" },
  promotion: {
    UK: "- Reference s.4 ERA 1996 written statement of changes within one month. Confirm continuous service preserved. Confirm other terms unchanged.",
    US: "- Update FLSA exempt/non-exempt if duties change. CA: re-issue §2810.5 wage notice. NY: WTPA notice for executive promotions. Confirm at-will continues. Use American English.",
  },
  salary_increase: {
    UK: "- s.4 ERA 1996 update within one month. Auto-enrolment pension recomputes. National Living Wage compliance for low-paid workers.",
    US: "- CA §2810.5 amended notice within 7 days. NY §195(2) advance notice. CO Equal Pay Transparency posting if role exists. Confirm FLSA exempt threshold compliance.",
  },
  contract_amendment: {
    UK: "- Mutual agreement required unless an express variation clause exists. Section 4 ERA written notification within one month. Avoid 'fire and rehire' patterns following the 2024 Code of Practice.",
    US: "- Prospective unilateral changes generally permitted with notice. CA §2810.5 wage change written notice within 7 days. NY §195(2) advance notice. ERISA notice if benefits change.",
  },
  reference: {
    UK: "- Fact-only by default to limit risk. References must be fair, accurate, true, and not misleading (Spring v Guardian Assurance [1995]). Salary disclosure requires the employee's written consent (UK GDPR).",
    US: "- Many states grant good-faith immunity for truthful references. Avoid blacklisting language (illegal in CA Lab. Code §1050–1052). Fact-only is dominant practice.",
  },
  leave_approval: {
    UK: "- Reference applicable statutory regime (SMP/SPL/SSP/Carer's Leave/Unpaid Parental). State pay arrangement, KIT/SPLIT day allowance, benefits continuation, expected return, and right to request flexible working on return.",
    US: "- Reference FMLA designation if applicable; state CFRA/state PFL where relevant. ADA reasonable accommodation framing if disability-related. PWFA accommodations for pregnancy.",
  },
  resignation_acceptance: {
    UK: "- Confirm contractual notice and last working day. Garden leave only if contractual right exists. Restrictive covenants reminder permissible. Final pay and accrued leave treatment.",
    US: "- 'Two-week notice' is custom not law. CA: final pay within 72h if no notice; on last day if 72+h notice. Unused PTO must be paid in CA, CO, MA, IL, NE, ND.",
  },
  return_to_work: {
    UK: "- Right to return to same job after Ordinary Maternity Leave (first 26 weeks); same or suitable alternative after Additional Maternity Leave (s.71 ERA). Equality Act 2010 reasonable adjustments duty. OH referral protocol.",
    US: "- FMLA same or equivalent position (29 USC §2614). ADA interactive process. PWFA accommodations post-pregnancy. CA PDL: same role unless not available.",
  },
  settlement_cover: {
    UK: "- s.203 ERA Settlement Agreement: written; identify the particular complaint(s) waived; employee must receive independent legal advice from a relevant adviser; adviser insured; agreement states these conditions met. £30,000 tax-free under s.401 ITEPA where genuine compensation for loss of office.",
    US: "- OWBPA (29 USC §626(f)) for 40+: 21 days consider (45 group), 7 days revoke; written; advise to consult lawyer; identify ADEA claim. CA: cannot waive unwaivable rights; SB 331 limits NDAs in harassment/discrimination matters. §409A timing.",
  },
  right_to_work: {
    UK: "- Sponsor Licence under Skilled Worker route. CoS — defined or undefined. Salary at or above going rate (April 2024: £38,700 general). Right to Work check evidence (List A / List B / share code).",
    US: "- H-1B specialty occupation: bachelor's minimum, prevailing wage (LCA). L-1A/B intra-company transferee: qualifying relationship + 1-of-3y prior employment. O-1: evidence of acclaim. I-140 EB-2/EB-3: PERM labor certification. E-Verify states with mandatory enrolment.",
  },
  probation_outcome: {
    UK: "- Sub-2-years service: no ordinary unfair dismissal claim (exceptions: discrimination, whistleblowing, automatic unfair under s.103A–105 ERA). ACAS Code best practice for capability. s.10 ERelA 1999 right to be accompanied. s.86 ERA notice once 1 month service reached.",
    US: "- At-will throughout probation. Document reasons for discrimination defence. CA: final wages immediately if employer-initiated (Lab. Code §201, §203 penalty). NY: next regular payday. TX: next regular payday §61.014.",
  },

  // ===== EMPLOYEE-MODE LETTERS =====

  grievance: {
    UK: "- Reference the ACAS Code of Practice on Disciplinary and Grievance Procedures. Step 1 grievance — in writing, sets out the basis. Right to be accompanied at hearing (s.10 ERelA 1999). Frame any protected-characteristic basis as belief, not legal conclusion: 'I believe these matters are connected to my [characteristic], in violation of the Equality Act 2010.' Reserve all rights at the close. Do NOT use intensifiers, admissions, threats, or settlement language.",
    US: "- This letter puts the employer on notice for Faragher–Ellerth purposes. Title VII / ADA / ADEA / FEHA: name the protected characteristic in the form 'I believe I was treated differently because of my [characteristic].' Date and named individuals matter. NLRA §7 — discussing workplace conditions with colleagues is protected. Reserve all rights including EEOC charge / state-agency complaint.",
  },
  resignation_clean: {
    UK: "- Standard resignation. Confirm last working day computed from contractual notice. Offer handover. No reservation of rights (this is a clean exit). Use British English. Warm but professional.",
    US: "- 'Two weeks' notice' is custom not law in most states. Confirm last day, offer handover. No reservation of rights. Warm but professional.",
  },
  resignation_with_grievance: {
    UK: "- Two-track letter: notice of resignation AND a formal grievance. Note that the grievance survives the resignation — the employer's investigative duty under the ACAS Code persists at least to allow paper consideration. Reserve rights including unfair-dismissal-related claims.",
    US: "- Combined resignation + complaint. Reference the protected characteristic basis if applicable. Reserve all rights including EEOC charge.",
  },
  resignation_constructive: {
    UK: "- s.95(1)(c) ERA 1996 constructive dismissal. The resignation MUST be in response to the breach AND without delay (Western Excavating v Sharp [1978] — delay = affirmation). Recite specific breach particulars with dates. Reserve all rights INCLUDING unfair dismissal proceedings. NEVER include warmth/thanks/'tough decision'/'time to move on' (that is affirmation language and kills the claim).",
    US: "- Constructive discharge analogue. State the conduct that made working conditions intolerable. Reference EEOC / state agency rights. Reserve all rights.",
  },
  flexible_working_request: {
    UK: "- Statutory request under s.80F ERA 1996 / Flexible Working (Amendment) Regulations 2023 (day-one right since April 2024). Pre-empt the eight statutory grounds for refusal under s.80G. Note any prior request in last 12 months. Practical, business-case-led tone — not adversarial.",
    US: "- State-by-state right-to-request statutes (CA, VT, NH). Otherwise discretionary. If disability-linked, frame as ADA accommodation — see accommodation_request letter.",
  },
  subject_access_request: {
    UK: "- Article 15 UK GDPR + s.45 Data Protection Act 2018. 1-month statutory window (extendable to 3 months for complex). No fee. Specific scope (categories, timeframe, format). Identity verification offer. Do NOT volunteer reasons for the request. Neutral, procedural tone.",
    US: "- CA: Lab. Code §1198.5 (HR file, 30 days), §226 (payroll, 21 days), CCPA/CPRA. CT, IL, MA, NH, PA have HR file access statutes. Cite the specific statute(s).",
  },
  appeal: {
    UK: "- Reference ACAS Code Step 4. Use the four canonical grounds: procedural unfairness, factual error, severity disproportionate, new evidence. Request the right to be accompanied (s.10 ERelA 1999). State outcome sought (overturn / reduce / rehear). Reserve all rights including unfair-dismissal claim. Polkey deduction risk if appeal not used.",
    US: "- No federal procedural appeal right; document the absence as evidence for any subsequent EEOC charge. Frame around procedural unfairness, factual error, severity, new evidence.",
  },
  whistleblowing: {
    UK: "- s.43A–L ERA 1996 / PIDA 1998. Disclosure must be: (i) of information, (ii) tending to show one of six categories (criminal offence, breach of legal obligation, miscarriage of justice, danger to health & safety, environmental damage, deliberate concealment), (iii) in the public interest, (iv) reasonable belief substantially true. Cite the statute. State reasonable belief and public interest in terms. Recipient must be correct under the prescribed-person regime. Do NOT dress up a personal grievance as whistleblowing (Chesterton v Nurmohamed [2017]).",
    US: "- SOX §806 (180-day OSHA window), Cal. Lab. Code §1102.5, NLRA §7, OSHA whistleblower (often 30-day windows). Cite the specific statute. Defend Trade Secrets Act 2016 immunity for confidential disclosure to lawyer/government.",
  },
  accommodation_request: {
    UK: "- Equality Act 2010 ss.20–22 — duty to make reasonable adjustments where a PCP places the disabled employee at substantial disadvantage. Disclose only what the employee chooses (impairment vs barrier). Frame as barriers + adjustments, not capability failure. Request OH referral / interactive meeting.",
    US: "- ADA interactive process — the employee triggers it; employer must engage in good-faith dialogue. Request the meeting. Cite the ADA / PWFA / state law. Do NOT admit inability to perform the role.",
  },
  pay_dispute: {
    UK: "- s.13 ERA 1996 unauthorised deduction from wages. Itemise underpayment, calculation, contractual / statutory basis. A requested payment date is not a legal filing deadline. Reserve rights including ACAS / tribunal without asserting a filing window or implying that waiting for payment pauses it.",
    US: "- FLSA + state wage payment laws (Cal. Lab. Code §201–204; NY Labor Law §198). Itemise. Demand payment. Reserve rights including DOL complaint and state wage claim.",
  },
  settlement_counter_offer: {
    UK: "- WITHOUT PREJUDICE AND SUBJECT TO CONTRACT — open with that header. s.203 ERA 1996 settlement agreement requires independent legal advice from a relevant adviser. £30k tax-free under s.401 ITEPA 2003 for genuine compensation for loss of office. Counter terms (sums, references, restrictive covenants, mutual non-disparagement, mutual indemnity, legal-fee contribution). Neutral, transactional tone.",
    US: "- Confidential — Without Prejudice / Settlement Discussion. OWBPA periods if 40+: 21 days consider (45 group), 7 days revoke. CA SB 331 limits NDAs in harassment matters. Counter terms.",
  },
  constructive_dismissal_warning: {
    UK: "- Pre-resignation breach notice. State that you treat the employer's conduct as a fundamental breach but are NOT YET resigning. Demand specific remedy by deadline. Reserve all rights including the right to resign in response and bring unfair-dismissal proceedings. This preserves position and pre-empts the Sharp affirmation argument.",
    US: "- Pre-resignation notice of constructive discharge concerns. State conduct, demand remedy, reserve rights to file constructive-discharge claim with EEOC / state agency.",
  },
  pip_response: {
    UK: "- Engage with each PIP objective: achievable, ambiguous, or unmeasurable. Suggest clarifications. Request tools, training, OH referral, reasonable adjustments. Reserve right to grieve PIP if unfounded. Constructive but defensive tone — not capitulation, not refusal.",
    US: "- Document the PIP engagement. ADA: if disability is implicated, document the interactive process. Reserve rights.",
  },
  acas_ec_notification: {
    UK: "- Procedural cover for ACAS Early Conciliation. State intended claim type (unfair dismissal, discrimination, etc.) and brief basis. Filing rules depend on the claim, region, relevant dates and applicable early conciliation rules. Do not calculate a deadline, assert timeliness or assume a fixed extension. Counsel review strongly recommended.",
    US: "- EEOC charge cover. State protected characteristic, date(s) of act and brief factual basis. Applicable filing rules require case-specific confirmation. Do not infer a filing window from the incident date or assume every claim has the same deadline.",
  },
  tribunal_cover: {
    UK: "- ET1 cover. Reference ACAS Early Conciliation certificate number. Brief statement of attached claim. Strictly procedural — substance is in the form.",
    US: "- Court complaint cover. Reference EEOC right-to-sue letter where applicable. Brief.",
  },
};

/** Map of question id → question for the draft's mode + letter type, so the
 *  data dump can apply the same visibility gates as the wizard. */
function questionIndex(draft: Draft): Map<string, Question> {
  const index = new Map<string, Question>();
  for (const step of [...universalStepsFor(draft.mode), ...letterStepsFor(draft.letterType)]) {
    for (const q of step.questions) index.set(q.id, q);
  }
  return index;
}

function relevantData(draft: Draft): string {
  const a = draft.answers as Record<string, unknown>;
  // Answers persist across a jurisdiction switch (deliberately — switching
  // back shouldn't lose data), but the prompt must only see answers whose
  // question is visible for the CURRENT jurisdiction. Without this filter a
  // UK→US switch fed e.g. the UK "Disciplinary hearing date" into a US
  // termination letter (wrong-jurisdiction data in the letter text).
  const questions = questionIndex(draft);
  const gates = { ...a, jurisdiction: draft.context.jurisdiction };
  const lines: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    // Imported legacy reminder metadata is not letter evidence.
    if (k === "protectedDeadline") continue;
    if (v == null || v === "") continue;
    const q = questions.get(k);
    if (q && !isQuestionVisible(q, gates)) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (Array.isArray(v) && typeof v[0] === "object" && v[0] !== null) {
      // Structured repeater data — render as numbered list so the AI can
      // map cleanly to template placeholders like {{incident1Date}} etc.
      lines.push(`- ${k}:`);
      (v as Array<Record<string, unknown>>).forEach((item, i) => {
        const inner = Object.entries(item)
          .filter(([, vv]) => vv != null && vv !== "")
          .map(([kk, vv]) => `${kk}=${formatScalar(vv)}`)
          .join("; ");
        if (inner) lines.push(`  ${i + 1}. ${inner}`);
      });
      continue;
    }
    lines.push(`- ${k}: ${formatValue(v)}`);
  }
  return lines.join("\n") || "(no additional data supplied)";
}

function formatValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(formatScalar).join(", ");
  return JSON.stringify(v);
}

function formatScalar(v: unknown): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (v == null) return "";
  return String(v);
}
