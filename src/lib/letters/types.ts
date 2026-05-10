/* ============================================================================
 * Mode discriminator
 * ==========================================================================*/

export type Mode = "employer" | "employee";

/* ============================================================================
 * Jurisdiction & locality (shared across modes)
 * ==========================================================================*/

export type Jurisdiction = "UK" | "US";

export type UkRegion = "England & Wales" | "Scotland" | "Northern Ireland";

export type UsState =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "FL" | "GA"
  | "HI" | "ID" | "IL" | "IN" | "IA" | "KS" | "KY" | "LA" | "ME" | "MD"
  | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH" | "NJ"
  | "NM" | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI" | "SC"
  | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA" | "WV" | "WI" | "WY"
  | "DC";

export type WorkerClass = "employee" | "worker" | "contractor" | "casual";

export type Tone = "warm" | "neutral" | "formal" | "firm";
export type EmployeeTone = "conciliatory" | "assertive" | "forensic" | "tribunal_ready";

export type RiskClass = "low" | "medium" | "high";

/* ============================================================================
 * Letter type unions (mode-aware)
 * ==========================================================================*/

export type EmployerLetterTypeId =
  | "offer"
  | "contract_amendment"
  | "promotion"
  | "salary_increase"
  | "probation_outcome"
  | "warning"
  | "termination"
  | "redundancy"
  | "reference"
  | "leave_approval"
  | "resignation_acceptance"
  | "return_to_work"
  | "settlement_cover"
  | "right_to_work";

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

/* ============================================================================
 * Sections
 * ==========================================================================*/

export type SectionId =
  | "header"
  | "recipient_block"
  | "subject"
  | "salutation"
  | "opening"
  | "body"
  | "terms"
  | "compensation"
  | "benefits"
  | "conditions"
  | "next_steps"
  | "appeal_rights"
  | "closing"
  | "signature"
  // employee-side additions
  | "chronology"
  | "witnesses"
  | "statutory_basis"
  | "impact"
  | "outcome_sought"
  | "evidence_attached"
  | "reservation_of_rights"
  | "deadline";

export type SectionVersion = {
  id: string;
  createdAt: number;
  html: string;
  modelName?: string;
};

export type Section = {
  id: string;
  sectionId: SectionId;
  title: string;
  html: string;
  required: boolean;
  versions: SectionVersion[];
  status: "empty" | "streaming" | "ready" | "edited";
};

/* ============================================================================
 * Employer / employee party blocks
 * ==========================================================================*/

export type EmployerDetails = {
  legalName: string;
  address: string;
  registrationNumber?: string;
  hasLetterhead: boolean;
  signatoryName: string;
  signatoryTitle: string;
};

export type EmployeeDetails = {
  legalName: string;
  preferredName?: string;
  jobTitle: string;
  department?: string;
  address: string;
  email?: string;
  startDate: string;
  serviceMonths: number;
};

/* ============================================================================
 * Employee-mode-only — protected deadline & evidence
 * ==========================================================================*/

export type ProtectedCharacteristic =
  | "race"
  | "sex"
  | "age"
  | "disability"
  | "religion"
  | "sexual_orientation"
  | "gender_reassignment"
  | "pregnancy_maternity"
  | "marriage_civil_partnership"
  // US-only adds
  | "national_origin"
  | "genetic_information"
  | "veteran_status";

export type EvidenceItem = {
  id: string;
  kind: "email" | "calendar" | "document" | "screenshot" | "note";
  filename?: string;
  /** Free-text content (or summary) the user supplied. Stored client-side; never sent to LLM unless includeVerbatim=true. */
  content: string;
  parsedSummary?: string;
  uploadedAt: number;
  includeVerbatim: boolean;
};

export type ProtectedDeadline = {
  /** ISO date — the calculated tribunal/EEOC limitation deadline. */
  iso: string;
  /** Human-readable basis (e.g. "ERA s.111: 3 months less one day from act on 14 March 2026"). */
  basis: string;
};

/* ============================================================================
 * Letter context
 * ==========================================================================*/

export type LetterContext = {
  mode: Mode;
  jurisdiction: Jurisdiction;
  ukRegion?: UkRegion;
  usState?: UsState;
  workerClass: WorkerClass;
  letterType: LetterTypeId;
  effectiveDate: string;
  issueDate: string;
  deliveryMethod: "email" | "post" | "hand-delivery" | "recorded-delivery";
  /** Employer mode tone band. */
  tone: Tone;
  /** Employee mode tone band. */
  employeeTone?: EmployeeTone;
  confidentiality: "public" | "confidential" | "private_and_confidential";
  /** Employee mode — toggles "Without Prejudice and Subject to Contract" header. */
  withoutPrejudice?: boolean;
  /** Employee mode — protected characteristics implicated. */
  protectedCharacteristics?: ProtectedCharacteristic[];
  /** Employee mode — calculated tribunal/EEOC limitation deadline. */
  protectedDeadline?: ProtectedDeadline;
  counselReviewRequired: boolean;
  riskFlags: {
    protectedStatus: boolean;
    grievanceLast90Days: boolean;
    collectiveConsultation: boolean;
  };
};

export type LetterAnswers = Record<string, unknown>;

/* ============================================================================
 * Draft
 * ==========================================================================*/

export type ExportEvent = {
  id: string;
  format: "pdf" | "docx";
  exportedAt: number;
  reviewedBy?: string;
  reviewedOn?: string;
};

export type CollaboratorRole = "owner" | "editor" | "reviewer" | "viewer";

export type Collaborator = {
  id: string;
  email: string;
  name?: string;
  role: CollaboratorRole;
  /** Pending until the invitee opens the share link. Local-only flag for now. */
  status: "pending" | "active";
  invitedAt: number;
};

/**
 * Chat scope — what the AI agent should treat as the target of an
 * instruction. "letter" applies across all sections, "section" is the
 * caller's chosen section, "selection" is a quoted text range.
 */
export type AIChatScope = "letter" | "section" | "selection";

/**
 * A single AI-action proposal extracted from the agent's reply. The user
 * confirms each via an "Apply" button under the AI message; on apply, the
 * editor regenerates the named section with the given refinement.
 */
export type AIAction = {
  id: string;
  kind: "regenerate";
  sectionId: string;
  /** Human-readable section title at the time of capture (for display). */
  sectionTitle: string;
  /** Instruction passed through buildSectionPrompt as USER REFINEMENT. */
  instruction: string;
  /** Outcome state — set after the user clicks Apply. */
  status: "proposed" | "applied" | "failed";
  appliedAt?: number;
};

/**
 * A single message in the AI chat thread. Persisted per draft so the
 * agent has memory across sessions.
 */
export type AIChatMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: number;
  /** Scope the user picked when sending. Carried for the agent's context. */
  scope?: AIChatScope;
  /** When scope === "section", which section. */
  sectionId?: string;
  /** When scope === "selection", the quoted text. */
  quote?: string;
  /** Assistant messages may carry one or more proposed actions. */
  actions?: AIAction[];
  /** Streaming flag — the message is still being received. */
  streaming?: boolean;
};

/**
 * A comment on a draft. Threaded via parentId — top-level comments are
 * anchored to a section; replies are nested under another comment.
 */
export type Comment = {
  id: string;
  /** The section this comment is anchored to. Empty string = draft-level. */
  sectionId: string;
  /** Top-level comment id this is a reply to, if any. */
  parentId?: string;
  /** Stable identity of the author. For now: collaborator id, "me", or email. */
  authorId: string;
  authorName: string;
  authorEmail?: string;
  body: string;
  /** Plain-text quote of the spanned text when the comment is anchored to a range. */
  quote?: string;
  createdAt: number;
  resolved?: boolean;
};

export type Draft = {
  id: string;
  /** Denormalised from context.mode for fast filtering. */
  mode: Mode;
  letterType: LetterTypeId;
  context: LetterContext;
  employer: EmployerDetails;
  employee: EmployeeDetails;
  answers: LetterAnswers;
  sections: Section[];
  /** Employee-mode supporting evidence. */
  evidence?: EvidenceItem[];
  /** Outcome the employee wants. Surfaced explicitly in closing. */
  outcomeSought?: string;
  /** Each export attempt is logged here for audit + the Exported / Activity views. */
  exports?: ExportEvent[];
  /** Collaborators invited to this draft. Owner is implicit (the draft creator). */
  collaborators?: Collaborator[];
  /** Threaded comments on this draft. */
  comments?: Comment[];
  /** Persisted AI chat thread for this draft. */
  aiChat?: AIChatMessage[];
  createdAt: number;
  updatedAt: number;
};
