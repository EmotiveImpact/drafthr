/**
 * Case engine: shared types.
 *
 * The engine is plain code with no database, network or AI calls. It takes a
 * case history (everything said, answered, uploaded and drafted, in order),
 * rebuilds the case file from it, and runs a playbook over that file to work
 * out what is still missing, which checks fire, which deadlines apply and
 * which letter comes next.
 *
 * Playbooks are data (JSON-shaped, no functions) so they can later live in a
 * database and be edited in the staff Console. Dates are never worked out in
 * a playbook: a playbook names a rule and the facts to feed it, and the rules
 * code returns the date.
 */

/** A calendar date with no time or zone: "YYYY-MM-DD". */
export type IsoDate = string;

export type SituationId = "disciplinary" | "grievance" | "redundancy";

/** Who the user is in this case. */
export type Lens = "hr" | "employee" | "consultant";

/** The parts of the UK with different employment rules or bank holidays. */
export type UkNation = "england-wales" | "scotland" | "northern-ireland";

export type Jurisdiction =
  | { country: "uk"; nation: UkNation }
  | { country: "us"; state: string };

/** A fact's value. Dates are IsoDate strings. */
export type FactValue = string | number | boolean | string[] | null;

/** Where a fact came from. Every fact in a case file carries at least one. */
export type Source =
  | { kind: "story"; eventId: string; quote: string }
  | { kind: "answer"; eventId: string; questionKey: string }
  | { kind: "document"; eventId: string; documentId: string; quote?: string; page?: number }
  | { kind: "correction"; eventId: string }
  | { kind: "rule"; ruleUseId: string };

export type Actor = "user" | "reader" | "engine" | "staff";

type EventBase = { id: string; at: string; actor: Actor };

/**
 * One entry in the append-only case history. Nothing is ever edited or
 * removed: a correction or a "forget" is a new event that the case file
 * rebuild takes into account.
 */
export type CaseEvent =
  | (EventBase & {
      type: "case_opened";
      situation: SituationId;
      lens: Lens;
      jurisdiction: Jurisdiction;
    })
  | (EventBase & { type: "story_told"; text: string })
  | (EventBase & { type: "question_asked"; factKey: string; question: string })
  | (EventBase & {
      type: "fact_recorded";
      key: string;
      value: FactValue;
      source: Source;
      /** "stated": the user said it; "inferred": the Reader worked it out. */
      certainty?: "stated" | "inferred";
    })
  | (EventBase & { type: "fact_corrected"; key: string; value: FactValue; reason?: string })
  | (EventBase & { type: "fact_forgotten"; key: string; reason?: string })
  | (EventBase & { type: "document_added"; documentId: string; name: string })
  | (EventBase & { type: "letter_drafted"; stepId: string; letterId: string })
  | (EventBase & { type: "letter_sent"; stepId: string; sentOn: IsoDate });

/** A fact as the case file shows it: current value, sources, earlier values. */
export type FactEntry = {
  key: string;
  value: FactValue;
  sources: Source[];
  certainty: "stated" | "inferred" | "corrected";
  /** Earlier values for this key, oldest first, kept for the Memory tab. */
  earlier: { value: FactValue; source: Source; eventId: string }[];
  /**
   * Set when two sources disagree and nobody has corrected it yet, for
   * example two different suspension dates. The engine asks before relying
   * on a conflicted fact.
   */
  conflict?: { values: { value: FactValue; source: Source }[] };
};

/** The case file: rebuilt from the history every time, never stored as truth. */
export type CaseFile = {
  caseId: string;
  situation: SituationId;
  lens: Lens;
  jurisdiction: Jurisdiction;
  openedAt: string;
  story: { eventId: string; text: string }[];
  facts: Record<string, FactEntry>;
  /** Fact keys the user asked the engine to forget. Never re-asked automatically. */
  forgotten: string[];
  documents: { documentId: string; name: string; eventId: string }[];
  letters: { stepId: string; letterId: string; drafted: boolean; sentOn?: IsoDate }[];
  /** Fact keys whose question has been asked at least once. */
  asked: string[];
};

// ---------------------------------------------------------------------------
// Conditions: a small JSON language for "when" clauses in playbooks.
// ---------------------------------------------------------------------------

/** A date to compare against: a literal date, another fact, or "today". */
export type DateOperand = IsoDate | { fact: string } | { today: true };

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  /** The fact is known (has a non-null value, not forgotten). */
  | { known: string }
  /** The fact equals the value (for lists: contains it). */
  | { fact: string; is: FactValue }
  /** The fact's value is one of these (for lists: contains any of them). */
  | { fact: string; in: FactValue[] }
  /** Number comparisons. */
  | { fact: string; atLeast: number }
  | { fact: string; below: number }
  /** Date comparisons against a date operand. */
  | { fact: string; before: DateOperand }
  | { fact: string; onOrAfter: DateOperand }
  /** Whole calendar days from `from` (default today) to the fact's date are at most N. */
  | { fact: string; withinDays: number; from?: DateOperand }
  | { lens: Lens | Lens[] }
  | { nation: UkNation | UkNation[] }
  | { country: "uk" | "us" }
  | { state: string | string[] }
  /** A deadline from one of this playbook's rule uses falls within N days of today. */
  | { deadline: string; withinDays: number }
  /** A route step's letter has been drafted. */
  | { drafted: string };

// ---------------------------------------------------------------------------
// Playbooks
// ---------------------------------------------------------------------------

export type FactPriority = "must" | "should" | "nice";

export type FactType = "date" | "text" | "boolean" | "number" | "choice" | "list";

/** Text that can differ by lens; a plain string applies to every lens. */
export type LensText = string | Partial<Record<Lens, string>>;

export type FactSpec = {
  key: string;
  label: string;
  type: FactType;
  choices?: string[];
  /** Priority per lens. A lens missing here is never asked this fact. */
  priority: Partial<Record<Lens, FactPriority>>;
  /** The question in plain language, by lens where wording differs. */
  question: LensText;
  /** Only ask when this holds (for example, only if there was a suspension). */
  askIf?: Condition;
  /** Health, pregnancy, religion and the like: shown and briefed only when needed. */
  specialCategory?: boolean;
  /** Short note on why the fact matters, shown under the question. */
  why?: string;
};

export type CheckLevel = "act_now" | "worth_checking" | "for_information";

export type CheckSpec = {
  id: string;
  level: CheckLevel;
  when: Condition;
  message: LensText;
  /** Source tags from the playbook draft, for example ["S8", "Code para 9"]. */
  sources?: string[];
  /** True while a lawyer has not confirmed the point. */
  toVerify?: boolean;
  /** A product choice rather than law. */
  proposal?: boolean;
};

/** Every rule the rules code provides. See rules/index.ts. */
export type RuleId =
  | "uk.tribunalTimeLimit"
  | "uk.earlyConciliation"
  | "uk.companionPostponement"
  | "uk.qualifyingService"
  | "uk.writtenReasons"
  | "uk.statutoryNotice"
  | "uk.suspensionReview"
  | "uk.collectiveConsultation"
  | "uk.hr1Deadline"
  | "uk.protectiveAwardMax"
  | "uk.statutoryRedundancyPay"
  | "uk.familyLeaveProtectedPeriod"
  | "uk.trialPeriodEnd"
  | "uk.sexualHarassmentDuty"
  | "us.eeocCharge"
  | "us.caCivilRights"
  | "us.warnNotice"
  | "us.owbpa";

export type RuleInputSpec = { fact: string } | { value: FactValue };

/** One use of a rule inside a playbook, with the facts that feed it. */
export type RuleUse = {
  /** Unique within the playbook, for example "tribunal_unfair_dismissal". */
  id: string;
  label: LensText;
  rule: RuleId;
  inputs: Record<string, RuleInputSpec>;
  when?: Condition;
  lens?: Lens[];
};

export type RouteStep = {
  /** Unique within the playbook, for example "hearing_invite". */
  id: string;
  title: LensText;
  /**
   * The letter type. "employer/warning" style ids point at a template that
   * exists in the app today; ids starting "new:" are letters still to build.
   */
  letter: string;
  lens: Lens[];
  /** The step only applies when this holds. */
  when?: Condition;
  /** Steps that must be drafted first. */
  after?: string[];
  /** Fact keys that must be known before this letter can be drafted. */
  needs?: string[];
  /** Reasons the engine refuses to draft this letter right now. */
  blockedIf?: { when: Condition; reason: LensText }[];
};

export type HandOff = {
  id: string;
  to: SituationId | "expert" | "lawyer" | "acas" | "lra" | "eeoc";
  when: Condition;
  message: LensText;
};

export type Playbook = {
  id: SituationId;
  name: string;
  version: string;
  status: "draft" | "reviewed" | "live";
  /** Words and phrases that suggest this situation, for the Reader. */
  recognise: { phrases: string[]; notThis?: string[] };
  facts: FactSpec[];
  checks: CheckSpec[];
  rules: RuleUse[];
  route: RouteStep[];
  handOffs: HandOff[];
  /** Tone and privacy rules handed to every AI brief. */
  tone: { lens: Partial<Record<Lens, string[]>>; privacy: string[] };
};

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export type RuleContext = { jurisdiction: Jurisdiction; today: IsoDate };

export type RuleInput = Record<string, FactValue | undefined>;

export type RuleResult = {
  /** The date the rule returns, or null when it returns no date. */
  date: IsoDate | null;
  /** One or two plain sentences on the legal basis, shown with the date. */
  basis: string;
  /** Citations, for example ["ERA 1996 s111", "SI 2026/954 reg 4"]. */
  sources: string[];
  /** Input names the rule needed but did not get. When set, date is null. */
  missing?: string[];
  /** Points in the answer a lawyer has not yet confirmed. */
  toVerify?: string[];
  /** Extra values, for example { months: 6 } or { amount: 4506 }. */
  detail?: Record<string, FactValue>;
  /** The rule does not apply here (for example a UK rule on a US case). */
  notApplicable?: string;
};

export type RuleFn = (input: RuleInput, ctx: RuleContext) => RuleResult;

// ---------------------------------------------------------------------------
// Runner output
// ---------------------------------------------------------------------------

export type MissingFact = {
  key: string;
  label: string;
  priority: FactPriority;
  question: string;
  why?: string;
  /** True when the fact is known but two sources disagree. */
  conflicted?: boolean;
};

export type FiredCheck = {
  id: string;
  level: CheckLevel;
  message: string;
  sources: string[];
  toVerify: boolean;
  proposal: boolean;
};

export type Deadline = {
  ruleUseId: string;
  rule: RuleId;
  label: string;
  date: IsoDate | null;
  /** Whole days from today, when there is a date. Negative means passed. */
  daysLeft: number | null;
  basis: string;
  sources: string[];
  missing: string[];
  toVerify: string[];
  detail?: Record<string, FactValue>;
};

export type RouteStatus =
  | "drafted"
  | "sent"
  | "next"
  | "waiting"
  | "needs_facts"
  | "blocked"
  | "not_applicable";

export type RouteEntry = {
  stepId: string;
  title: string;
  letter: string;
  status: RouteStatus;
  /** For needs_facts: the keys still missing. */
  missing?: string[];
  /** For blocked: why. */
  reason?: string;
};

export type RunResult = {
  caseId: string;
  playbook: { id: SituationId; version: string };
  lens: Lens;
  jurisdiction: Jurisdiction;
  today: IsoDate;
  /** Must facts first, then should, in playbook order. Nice facts never appear. */
  missing: MissingFact[];
  nextQuestion: MissingFact | null;
  checks: FiredCheck[];
  deadlines: Deadline[];
  route: RouteEntry[];
  nextLetter: RouteEntry | null;
  handOffs: { id: string; to: HandOff["to"]; message: string }[];
  conflicts: string[];
};
