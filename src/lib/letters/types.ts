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

/**
 * A change the AI is proposing for a section, waiting for the user to
 * Accept or Reject. Two render modes:
 *   - "card" (legacy): section.html stays untouched; the proposal sits
 *     here and renders as a Cursor-style before/after card above the
 *     editor. Accept swaps proposedHtml in.
 *   - "inline" (default since 2026-05-16): proposeSectionChange computes
 *     a sentence-level diff between the current section.html and
 *     proposedHtml, stashes the diffed HTML in section.html (with
 *     <ins>/<del data-suggestion-id …> marks), and snapshots the
 *     ORIGINAL html into prevHtml so reject can restore it cleanly.
 *     Accept folds accepted suggestions in via mergeAcceptedSuggestionsHtml.
 */
export type PendingChange = {
  id: string;
  createdAt: number;
  /** New HTML the AI produced. Used as the "after" pane on card mode +
   *  as one input to the inline diff on inline mode. */
  proposedHtml: string;
  /** Human-readable description of what the AI did. */
  instruction: string;
  /** Where the proposal came from (for the audit trail). */
  source: "regenerate" | "addClause" | "tighten" | "manual" | "review";
  /** Optional model id that produced this. */
  modelName?: string;
  /** Who authored the suggestion. Absent = the AI (back-compat). Present =
   *  a human collaborator, so the card shows their name + colour instead of
   *  "AI proposed a change". authorId keys the per-collaborator colour. */
  authorId?: string;
  authorName?: string;
  /** Render mode — see comment above. Defaults to "inline" when unset. */
  diffViewMode?: "inline" | "card";
  /** When diffViewMode === "inline": snapshot of section.html taken just
   *  before the diff was staged, so Reject can restore the canonical text
   *  without lossy round-tripping through suggestion-merge. */
  prevHtml?: string;
};

export type Section = {
  id: string;
  sectionId: SectionId;
  title: string;
  html: string;
  required: boolean;
  versions: SectionVersion[];
  status: "empty" | "streaming" | "ready" | "edited";
  /** Set when the AI has proposed a change but the user hasn't yet
   * accepted or rejected it. UI surfaces a diff card per section. */
  pendingChange?: PendingChange;
};

/* ============================================================================
 * Employer / employee party blocks
 * ==========================================================================*/

export type EmployerDetails = {
  legalName: string;
  address: string;
  registrationNumber?: string;
  hasLetterhead: boolean;
  /**
   * Optional letterhead image as a data URL (base64). Rendered at the top
   * of exported letters. Stored on the profile so it applies to every
   * draft created in employer mode; can be overridden per draft.
   */
  letterheadDataUrl?: string;
  /**
   * Optional signature image as a data URL — sits above the typed
   * signatory name in exports. Same persistence model as letterhead.
   */
  signatureDataUrl?: string;
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

/**
 * How an evidence item appears in the letter + export pack.
 *
 * - figure:    Numbered exhibit on a dedicated index page in the ZIP
 *              (Fig 1, Fig 2, …). The letter body refers to it with a
 *              "[See Fig N]" text token at a position the user picks.
 * - inline:    Embedded directly at a user-chosen cursor position in the
 *              letter (image, blockquote, or file link inline with prose).
 * - attached:  Listed under an auto-generated "Attachments" section at
 *              the end of the letter; full files in the ZIP.
 * - pack_only: Bundled in the ZIP but never appears in the letter prose.
 */
export type EvidenceDisplayMode = "figure" | "inline" | "attached" | "pack_only";

export type EvidenceItem = {
  id: string;
  kind: "email" | "calendar" | "document" | "screenshot" | "note";
  filename?: string;
  mimeType?: string;
  fileDataUrl?: string;
  /** Section ids this evidence supports. Empty/undefined means general draft evidence. */
  sectionIds?: string[];
  /** Free-text summary or key text supplied by the user. Sent to the LLM as evidence context; includeVerbatim controls exact-content labelling. */
  content: string;
  parsedSummary?: string;
  uploadedAt: number;
  includeVerbatim: boolean;
  /** How this item appears in the letter + pack. Defaults to "figure" when unset. */
  displayMode?: EvidenceDisplayMode;
  /** Label shown on the exhibit index and in the [See …] reference text.
   * Defaults to "Fig {N}" where N is the order among figures.
   * User-editable so legal teams can use "Exhibit A" etc. */
  figureLabel?: string;
};

export type ProtectedDeadline = {
  /** ISO date — the calculated tribunal/EEOC limitation deadline. */
  iso: string;
  /** Human-readable basis (e.g. "ERA s.111: 6 months less one day from an act on or after 1 October 2026"). */
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
  /** "marked-sent" is a state transition — recorded here so Activity shows
   * the moment a letter was finalised, even though no file was produced. */
  format: "pdf" | "docx" | "txt" | "pack" | "marked-sent";
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

export type DraftTimelineEventKind =
  | "created"
  | "details_updated"
  | "sections_updated"
  | "section_generated"
  | "without_prejudice_updated"
  | "evidence_updated"
  | "comment_added"
  | "comment_resolved"
  | "comment_deleted"
  | "collaborator_invited"
  | "collaborator_removed"
  | "collaborator_role_updated"
  | "ai_message"
  | "ai_applied"
  | "ai_cleared"
  | "exported"
  | "counsel_review"
  | "review_submitted"
  | "review_approved"
  | "review_changes_requested"
  | "review_withdrawn";

export type DraftTimelineEvent = {
  id: string;
  kind: DraftTimelineEventKind;
  createdAt: number;
  title: string;
  detail?: string;
  sectionId?: string;
  sectionTitle?: string;
  actorName?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
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
  /** Workspace user id of the author. Stamped by the server on sync, and set
   *  locally when signed in, so teammates' comments never render as "me". */
  authorUserId?: string;
  /** Bumped on resolve / reopen so the newer state wins across devices. */
  updatedAt?: number;
  resolvedAt?: number;
  resolvedBy?: string;
};

/** A deleted comment, kept so the delete reaches other devices and a device
 *  that still has the comment can't bring it back. */
export type CommentTombstone = {
  id: string;
  deletedAt: number;
};

/**
 * Approval workflow state machine for the Business-tier review queue.
 * - draft:              author still working
 * - in_review:          submitted, waiting on reviewer
 * - approved:           reviewer signed off — clear to send
 * - changes_requested:  reviewer pushed back; back to author for revision
 */
export type ReviewStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "changes_requested";

export type ApprovalEntry = {
  id: string;
  /** Free-text now — becomes userId when WorkOS lands. */
  reviewerName: string;
  decision: "approved" | "changes_requested" | "submitted";
  /** Required on changes_requested; optional on approve/submit. */
  body?: string;
  createdAt: number;
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
  /** Deleted comment ids (synced as tombstones). */
  commentTombstones?: CommentTombstone[];
  /** Kept on this device only and never synced. Set on the copy that holds
   *  this device's version after a sync conflict with another device. */
  localOnly?: boolean;
  /** Persisted AI chat thread for this draft. */
  aiChat?: AIChatMessage[];
  /** Append-only audit trail for high-signal draft events. */
  timeline?: DraftTimelineEvent[];
  /** Optional named Matter (case / project / hiring round) this draft belongs to.
   * undefined = unaffiliated; appears in auto-groups on Home until promoted. */
  matterId?: string;
  /** User-editable display title shown above the canvas on the editor.
   * Falls back to the letter-type meta title when unset. Persists with
   * the draft so renames survive reloads + show in sidebars / lists. */
  title?: string;
  /**
   * Cached evidence tier derived from the source template at draft
   * creation time. Drives the Edit page's default behaviour for the
   * evidence drawer + handoff card. When unset, consumers can compute
   * it via `getEvidenceTier()` against the draft's letter type. Stored
   * on the draft so the Edit page can render the right default without
   * resolving the full template registry on mount.
   */
  evidenceTier?: "light" | "medium" | "heavy";
  /** When true, this draft is a template authoring surface — the editor
   * topbar swaps "Export" for "Save template" and saves push state into
   * the linked customTemplate row. Filter these out of normal Drafts
   * lists (BrowseLetters, Home, etc.). */
  isTemplateSource?: boolean;
  /** When isTemplateSource is true, points at the CustomTemplate id this
   * draft authors. Set on first save; updates re-save in place. */
  templateSourceId?: string;
  /** Approval workflow state. Defaults to "draft" for legacy + new drafts. */
  reviewStatus?: ReviewStatus;
  /** When the latest "submit for approval" happened. */
  submittedForReviewAt?: number;
  /** When the latest review decision happened. */
  reviewDecidedAt?: number;
  /** Append-only review history. */
  approvals?: ApprovalEntry[];
  createdAt: number;
  updatedAt: number;
};

/* ============================================================================
 * Matters — named containers for related drafts
 *
 * A Matter is a discrete case / workstream that bundles letters that belong
 * together: a discrimination claim, a PIP, a hiring round, a redundancy
 * consultation. Auto-grouping covers the simple case (single user + one
 * employer / one employee); Matters give the explicit named-case-with-
 * deadline structure when the workstream gets complex.
 *
 * Both modes use Matters. Differences:
 *   - Employee mode: matter typically corresponds to ONE employer (the
 *     primaryName is the employer's legal name).
 *   - Employer mode: matter typically corresponds to ONE employee or one
 *     hiring round (primaryName is the employee, or "Spring 2026 hires").
 *
 * Drafts join via Draft.matterId. A draft can be in zero or one matter.
 * ==========================================================================*/

export type MatterStatus = "active" | "closed" | "archived";

/** Swatch colour key for sidebar dot + matter card hero. */
export type MatterColor = "red" | "amber" | "blue" | "violet" | "green" | "slate";

export type Matter = {
  id: string;
  /** Human-readable case / project name. E.g. "Acme discrimination 2026". */
  name: string;
  /** Mode is locked at creation — a matter belongs to either HR drafts or
   * employee drafts but never crosses. Matches Draft.mode. */
  mode: Mode;
  status: MatterStatus;
  color: MatterColor;
  /** Optional free-text descriptor. */
  description?: string;
  /** Cached party context for cheap display. Source of truth is each
   * draft's employer/employee block — this is derived. */
  parties?: {
    /** In HR mode: the employee. In employee mode: the employer. */
    primaryName?: string;
    /** Optional department / role / context. */
    primaryContext?: string;
  };
  /** Optional deadline (ISO date) for the countdown chip. */
  deadlineISO?: string;
  /** What the deadline represents in plain English. */
  deadlineLabel?: string;
  /** Counsel-reviewed flag — surfaces a chip on the matter hero. */
  counselReviewed?: boolean;
  /** Case type — what kind of HR matter this is. Defaults to "investigation"
   * for legacy matters that pre-date this field. */
  type?: MatterType;
  /** Risk band — drives the risk register surface on the Dashboard. */
  riskBand?: RiskBand;
  /** Participants beyond the primary subject. */
  participants?: MatterParticipant[];
  /** Who owns this matter in the workspace. Free-text userId-or-name for now. */
  ownerUserId?: string;
  /** Short label for the dashboard "what needs doing next" card. */
  nextAction?: string;
  /** Estimated tribunal/dispute exposure in pounds, for the risk register
   * heatmap. AI-derived from the draft content. */
  exposureGBP?: number;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
};

/* ============================================================================
 * Employee — normalized HR-side party (HR mode only)
 *
 * Today the "employee" appears denormalized on every Draft. For the
 * HR/Management portal at scale we lift it to a workspace-level entity:
 * one record per person across many drafts and many matters. Employee
 * mode users never have more than one Employee record (themselves).
 * ==========================================================================*/
export type EmploymentStatus = "active" | "notice" | "left" | "on-leave";

export type Employee = {
  id: string;
  legalName: string;
  preferredName?: string;
  jobTitle?: string;
  department?: string;
  managerName?: string;
  managerEmail?: string;
  email?: string;
  startDate?: string;     // ISO date
  endDate?: string;       // ISO date — set when status flips to "left"
  workerClass?: WorkerClass;
  status: EmploymentStatus;
  /** Personal note jot — never sent to AI. */
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

/* ============================================================================
 * Tasks — actionable next steps on a Matter (HR mode primarily)
 * ==========================================================================*/
export type TaskStatus = "open" | "done" | "skipped";

export type Task = {
  id: string;
  matterId: string;
  label: string;
  /** ISO date — when this needs to happen. */
  dueISO?: string;
  status: TaskStatus;
  /** Who owns it. Free-text for now (will become userId when WorkOS ships). */
  assignee?: string;
  createdAt: number;
  updatedAt: number;
  doneAt?: number;
};

/* ============================================================================
 * Events — meetings, hearings, deadlines on a Matter calendar
 * ==========================================================================*/
export type EventKind = "meeting" | "hearing" | "deadline" | "review";

export type MatterEvent = {
  id: string;
  matterId: string;
  kind: EventKind;
  label: string;
  /** ISO datetime (when known to the minute) or ISO date. */
  whenISO: string;
  /** Optional secondary line — location, participants, etc. */
  detail?: string;
  createdAt: number;
};

/* ============================================================================
 * Matter expansion — type, risk, participants, owner, nextAction
 *
 * Backwards-compatible: every field added below is optional. Existing
 * Matters in the persisted store load fine.
 * ==========================================================================*/
export type MatterType =
  | "investigation"
  | "grievance"
  | "disciplinary"
  | "performance"
  | "absence"
  | "redundancy"
  | "restructure"
  | "settlement"
  | "tribunal"
  | "onboarding"
  | "offboarding"
  | "other";

export type RiskBand = "low" | "moderate" | "high" | "critical";

/** A participant in a Matter beyond the primary subject. E.g. for a
 * grievance: grievant + accused + 2 witnesses. */
export type MatterParticipantRole =
  | "subject"          // The primary person the matter is about
  | "manager"
  | "accused"
  | "complainant"
  | "witness"
  | "representative"
  | "other";

export type MatterParticipant = {
  /** Employee id if known; null for external parties (witnesses from another company). */
  employeeId: string | null;
  /** Display name fallback when employeeId is null. */
  name: string;
  role: MatterParticipantRole;
};

/* ============================================================================
 * Custom templates — workspace-saved reusable letters.
 *
 * A user-defined template captured from an existing draft. Starting a new
 * draft from one pre-fills sections (keyed by canonical SectionId) and
 * answers. The base letter type still drives section outline + meta on
 * render — the custom template just supplies starting content.
 * ==========================================================================*/
export type CustomTemplate = {
  id: string;
  /** User-given name. Required. */
  name: string;
  /** Optional one-liner. */
  description?: string;
  /** Base letter type — drives the default sections + meta on render. */
  baseLetterType: LetterTypeId;
  mode: Mode;
  /** Optional jurisdiction default — UK or US — to pre-set when starting a new draft from this template. */
  jurisdiction?: Jurisdiction;
  /** Per-section starting HTML. Map keyed by sectionId (Section.sectionId, the canonical id like "opening" / "body"), not the per-draft Section.id. */
  sectionHtml: Partial<Record<SectionId, string>>;
  /** Initial answers — copied verbatim into LetterAnswers when a new draft is created. */
  answers?: LetterAnswers;
  createdAt: number;
  updatedAt: number;
  /** Optional emoji or short label for the card thumbnail. */
  emoji?: string;
};
