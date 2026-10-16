/**
 * Register-safety rules for employee-mode drafts.
 *
 * The opposite of the rights-preservation rule engine: instead of detecting
 * MISSING statutory phrases, this detects PRESENT dangerous phrases — legal
 * conclusions stated as fact, admissions, threats of litigation in open
 * letters, inflammatory language.
 *
 * Severities:
 *   block   — UI hard-blocks export until removed/edited
 *   warn    — surfaced strongly but does not block export
 *   suggest — soft hint
 */
export type RegisterSafetySeverity = "block" | "warn" | "suggest";

export type RegisterSafetyRule = {
  id: string;
  severity: RegisterSafetySeverity;
  label: string;
  description: string;
  /** Regex pattern run case-insensitive over the assembled letter text. */
  pattern: string;
  /** Pattern flags. Default "i". */
  flags?: string;
  /** Suggested rewrite or guidance. */
  recommendation: string;
  /** Skip this rule when the letter is in without-prejudice mode (admissions less risky). */
  skipIfWithoutPrejudice?: boolean;
};

export const REGISTER_SAFETY_RULES: RegisterSafetyRule[] = [
  // ============= BLOCK — Legal conclusions stated as fact ============= //
  {
    id: "rs_block_unlawful_disc_fact",
    severity: "block",
    label: "Legal conclusion stated as fact",
    description:
      "Stating 'this is unlawful discrimination' as a fact is a legal conclusion. Reframe as a belief.",
    pattern: "\\bthis (?:is|was) unlawful discrimination\\b|\\byou (?:committed|have committed) (?:unlawful )?discrimination\\b",
    recommendation: "Replace with: 'I believe this amounts to unlawful discrimination under [Equality Act 2010 / Title VII].'",
  },
  {
    id: "rs_block_breach_fact",
    severity: "block",
    label: "Breach of contract stated as fact",
    description:
      "Asserting a fundamental breach as fact (rather than as a belief / position) limits your room to manoeuvre and may be quoted against you.",
    pattern: "\\byou (?:are|have been) in breach of contract\\b",
    recommendation:
      "Replace with: 'I consider that your conduct amounts to a fundamental breach of contract.'",
  },
  {
    id: "rs_block_fraud_fact",
    severity: "block",
    label: "Fraud allegation stated as fact",
    description:
      "Calling something fraud as a fact is defamatory unless proven. Reframe.",
    pattern: "\\byou (?:committed|have committed) fraud\\b|\\bthis (?:is|was) fraud\\b",
    recommendation:
      "Replace with: 'I believe the conduct amounts to fraudulent misrepresentation' or refer to the relevant statutory category.",
  },
  {
    id: "rs_block_litigation_threat_open",
    severity: "block",
    label: "Threat of litigation in open correspondence",
    description:
      "Threats of suit ('I will sue you', 'see you in court') in OPEN correspondence undermine mediation, can be cited as malice, and look bad to a tribunal panel.",
    pattern: "\\b(?:i|we) (?:will|intend to|plan to) (?:sue|take you to court|see you in court)\\b",
    recommendation:
      "Reserve rights instead: 'I reserve all my rights, including any legal remedies.' Move any settlement-position language into a separate Without Prejudice letter.",
    skipIfWithoutPrejudice: true,
  },

  // ============= WARN — Admissions ============= //
  {
    id: "rs_warn_admission_temper",
    severity: "warn",
    label: "Admission: losing temper",
    description:
      "Admitting to losing your temper / shouting / behaving badly will be quoted in any subsequent disciplinary or tribunal proceeding.",
    pattern: "\\bi (?:lost|raised) my (?:temper|voice)\\b|\\bi shouted\\b",
    recommendation:
      "Reframe factually: 'The discussion became heated.' Or omit altogether unless central to your account.",
    skipIfWithoutPrejudice: true,
  },
  {
    id: "rs_warn_admission_shouldnt",
    severity: "warn",
    label: "Concession: 'I shouldn't have'",
    description: "'I shouldn't have...' is a self-incriminating admission.",
    pattern: "\\bi (?:should not have|shouldn[\\u2019']t have|admit (?:that )?i)\\b",
    recommendation: "Remove unless strategically necessary. Apologies and concessions weaken your evidential position.",
    skipIfWithoutPrejudice: true,
  },
  {
    id: "rs_warn_apology_to_employer",
    severity: "warn",
    label: "Apology to the employer",
    description:
      "Apologising for the employer's conduct (or for raising the issue) reads as concession.",
    pattern: "\\bi am sorry (?:to have to|for) (?:raise|bringing|trouble)\\b",
    recommendation: "Remove. You are entitled to raise the matter; no apology is owed.",
    skipIfWithoutPrejudice: true,
  },
  {
    id: "rs_warn_settlement_in_open",
    severity: "warn",
    label: "Settlement language in open letter",
    description:
      "Discussing settlement, sums, or 'walking away' in an OPEN letter destroys without-prejudice privilege and can be used at tribunal.",
    pattern: "\\b(?:walk away|settle (?:this|the matter)|in exchange for|ex gratia|severance)\\b",
    recommendation:
      "Move settlement discussion into a separate Without Prejudice & Subject to Contract letter. The header toggle is in the editor chrome.",
    skipIfWithoutPrejudice: true,
  },
  {
    id: "rs_warn_intensifier",
    severity: "warn",
    label: "Subjective intensifier",
    description:
      "'Clearly', 'obviously', 'blatantly', 'plainly' weaken assertions for a tribunal panel. If it's clear, the facts will speak.",
    pattern: "\\b(?:clearly|obviously|blatantly|plainly|absolutely|completely)\\b",
    recommendation: "Strip the intensifier; let the facts carry the assertion.",
  },

  // ============= SUGGEST — softer cues ============= //
  {
    id: "rs_suggest_vague_time",
    severity: "suggest",
    label: "Vague time reference",
    description:
      "'A while ago', 'recently', 'some time back': replace with a specific date if you have one.",
    pattern: "\\b(?:a while ago|some time ago|some time back|recently|the other day)\\b",
    recommendation: "Replace with a specific date. Tribunal panels disbelieve vague chronologies.",
  },
  {
    id: "rs_suggest_unattributed_quote",
    severity: "suggest",
    label: "Unattributed quote",
    description:
      "Putting words in quotes without attribution invites a 'they didn't say that' challenge.",
    pattern: "(?<!\\w)[\\u201C\\u201D\"][^\\u201C\\u201D\"\\n]{8,}[\\u201C\\u201D\"]",
    recommendation:
      "Attribute the quote ('[Manager] said on [date]: \"…\"') or paraphrase: 'in substance she said that…'.",
  },
  {
    id: "rs_suggest_undermining_adverb",
    severity: "suggest",
    label: "Undermining hedge",
    description:
      "'I think maybe', 'I sort of feel', 'kind of' pulls the rhetorical floor out from under your assertion.",
    pattern: "\\b(?:i think maybe|i sort of|kind of|kinda|sort of)\\b",
    recommendation:
      "Replace with 'I believe' or simply state the fact.",
  },
  {
    id: "rs_suggest_everyone_knows",
    severity: "suggest",
    label: "Unprovable absolute",
    description:
      "'Everyone knows', 'it's well known', 'no one would deny' are unprovable and give the employer a free hit.",
    pattern: "\\b(?:everyone knows|it[\\u2019']?s well known|no one would deny|nobody (?:disputes|would deny))\\b",
    recommendation: "Replace with attributable, dated facts.",
  },
];

export type RegisterSafetyHit = {
  rule: RegisterSafetyRule;
  match: string;
  index: number;
};

/**
 * Run all rules against the assembled letter text.
 * Caller decides what to do per severity (UI side).
 */
export function checkRegisterSafety(
  text: string,
  opts: { withoutPrejudice?: boolean } = {}
): RegisterSafetyHit[] {
  const hits: RegisterSafetyHit[] = [];
  for (const rule of REGISTER_SAFETY_RULES) {
    if (opts.withoutPrejudice && rule.skipIfWithoutPrejudice) continue;
    const re = new RegExp(rule.pattern, rule.flags ?? "ig");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ rule, match: m[0], index: m.index });
      if (!re.global) break;
    }
  }
  return hits;
}
