// DraftHR workspace schema — Drizzle (Postgres / Neon).
// Hash-chained audit_events at the bottom is the defensibility moat.
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  boolean,
  date,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --- workspace ---------------------------------------------------------------

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// users.tenantId is the "home" tenant they were minted under — keep for
// backwards-compat, but the real per-workspace role lives in tenant_members.
// userType: 'customer' (HR team) or 'consultant' (marketplace). Mint default
// is 'customer'; consultants get flipped manually for the split UI.
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull().unique(),
    email: text("email"),
    legalName: text("legal_name"),
    workspaceRole: text("workspace_role").notNull().default("drafter"),
    userType: text("user_type").notNull().default("customer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("users_tenant_idx").on(t.tenantId)],
);

// tenant_members — many-to-many users <-> tenants. Source of truth for the
// per-tenant role (supersedes users.workspaceRole, which is left for compat).
// is_active_tenant: exactly one row per user should be true; the API toggles
// it on workspace switch.
export const tenantMembers = pgTable(
  "tenant_members",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("drafter"),
    isActiveTenant: boolean("is_active_tenant").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // primary key — drizzle expresses composite PK via uniqueIndex(true) on the
    // table builder; emulate with a unique index + an active-tenant lookup idx.
    uniqueIndex("tenant_members_user_tenant_pk").on(t.userId, t.tenantId),
    index("tenant_members_user_active_idx").on(t.userId, t.isActiveTenant),
  ],
);

// invites — pending workspace invitations. invite_code goes in the /join/{code}
// URL; expires_at defaults to now() + 7 days. accepted_at + accepted_by are set
// on redeem; revoked_at flags revoked invites (we keep them for audit).
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("drafter"),
    inviteCode: text("invite_code").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '7 days'`)
      .notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("invites_tenant_idx").on(t.tenantId),
    uniqueIndex("invites_invite_code_uniq").on(t.inviteCode),
  ],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    preferredName: text("preferred_name"),
    jobTitle: text("job_title"),
    department: text("department"),
    managerName: text("manager_name"),
    managerEmail: text("manager_email"),
    email: text("email"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    workerClass: text("worker_class"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("employees_tenant_idx").on(t.tenantId)],
);

// --- matters -----------------------------------------------------------------

export const matters = pgTable(
  "matters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mode: text("mode").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("active"),
    color: text("color"),
    riskBand: text("risk_band"),
    description: text("description"),
    primaryName: text("primary_name"),
    primaryContext: text("primary_context"),
    deadlineIso: date("deadline_iso"),
    deadlineLabel: text("deadline_label"),
    counselReviewed: boolean("counsel_reviewed").notNull().default(false),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    nextAction: text("next_action"),
    exposureGbp: integer("exposure_gbp"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("matters_tenant_idx").on(t.tenantId)],
);

export const matterParticipants = pgTable(
  "matter_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    // null employeeId = external party (counsel, third-party witness, etc.)
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("matter_participants_matter_idx").on(t.matterId)],
);

// --- drafts ------------------------------------------------------------------

// custom_templates declared first so drafts.template_source_id FK resolves.
export const customTemplates = pgTable(
  "custom_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    baseLetterType: text("base_letter_type").notNull(),
    mode: text("mode").notNull(),
    jurisdiction: text("jurisdiction"),
    sectionHtmlJson: jsonb("section_html_json").$type<Record<string, string>>().notNull(),
    answersJson: jsonb("answers_json").$type<Record<string, unknown>>(),
    emoji: text("emoji"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("custom_templates_tenant_idx").on(t.tenantId)],
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    letterType: text("letter_type").notNull(),
    mode: text("mode").notNull(),
    title: text("title"),
    jurisdiction: text("jurisdiction"),
    reviewStatus: text("review_status").notNull().default("draft"),
    submittedForReviewAt: timestamp("submitted_for_review_at", { withTimezone: true }),
    reviewDecidedAt: timestamp("review_decided_at", { withTimezone: true }),
    isTemplateSource: boolean("is_template_source").notNull().default(false),
    templateSourceId: uuid("template_source_id").references(() => customTemplates.id, {
      onDelete: "set null",
    }),
    contextJson: jsonb("context_json").$type<Record<string, unknown>>().notNull(),
    employerJson: jsonb("employer_json").$type<Record<string, unknown>>(),
    employeeJson: jsonb("employee_json").$type<Record<string, unknown>>(),
    answersJson: jsonb("answers_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("drafts_tenant_idx").on(t.tenantId),
    index("drafts_author_idx").on(t.authorUserId),
    index("drafts_matter_idx").on(t.matterId),
  ],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    sectionId: text("section_id").notNull(),
    title: text("title").notNull(),
    html: text("html").notNull().default(""),
    status: text("status").notNull().default("empty"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sections_draft_idx").on(t.draftId)],
);

export const sectionVersions = pgTable(
  "section_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    html: text("html").notNull(),
    modelName: text("model_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("section_versions_section_idx").on(t.sectionId)],
);

// --- collaboration -----------------------------------------------------------

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "set null" }),
    // self-fk for threading
    parentId: uuid("parent_id").references((): import("drizzle-orm/pg-core").AnyPgColumn => comments.id, {
      onDelete: "set null",
    }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    body: text("body").notNull(),
    quote: text("quote"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("comments_draft_idx").on(t.draftId)],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    filename: text("filename"),
    mimeType: text("mime_type"),
    // future S3 migration; null while content lives inline
    s3Key: text("s3_key"),
    content: text("content"),
    includeVerbatim: boolean("include_verbatim").notNull().default(false),
    displayMode: text("display_mode").notNull().default("figure"),
    figureLabel: text("figure_label"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("evidence_draft_idx").on(t.draftId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewerName: text("reviewer_name").notNull(),
    decision: text("decision").notNull(),
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("approvals_draft_idx").on(t.draftId)],
);

// --- moat: hash-chained audit log -------------------------------------------
// Chain is per-tenant (cross-tenant chains would leak workspace boundaries).
// row_hash = sha256(prev_hash || ':' || canonicalJson(payload) || ':' || kind ||
//                   ':' || subject_id || ':' || created_at_epoch_ms)
// Genesis prev_hash is 64 zeros.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    prevHash: text("prev_hash").notNull(),
    rowHash: text("row_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_events_tenant_created_idx").on(t.tenantId, t.createdAt.desc()),
    uniqueIndex("audit_events_tenant_rowhash_uniq").on(t.tenantId, t.rowHash),
    check(
      "audit_events_row_hash_hex64",
      sql`char_length(${t.rowHash}) = 64 AND ${t.rowHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "audit_events_prev_hash_hex64",
      sql`char_length(${t.prevHash}) = 64 AND ${t.prevHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

// --- inferred types ----------------------------------------------------------

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type Matter = typeof matters.$inferSelect;
export type MatterParticipant = typeof matterParticipants.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;
export type Section = typeof sections.$inferSelect;
export type SectionVersion = typeof sectionVersions.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type CustomTemplate = typeof customTemplates.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type NewTenantMember = typeof tenantMembers.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
