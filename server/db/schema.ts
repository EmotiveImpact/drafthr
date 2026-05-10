import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Users — backed by Clerk for identity. We mirror just enough fields here for
 * joins and audit. Clerk remains the source of truth for auth.
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  role: text("role", { enum: ["hr", "employee", "admin"] }).notNull().default("employee"),
  orgId: uuid("org_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * Organisations — for HR users who belong to a company. Employee users don't
 * need an org row.
 */
export const orgs = pgTable("orgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["trial", "team", "enterprise"] }).notNull().default("trial"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Drafts — the user-facing letter being written.
 *
 * Note: `retentionUntil` is set on creation (default 90 days from now). A
 * scheduled task purges rows where retentionUntil < now().
 */
export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    mode: text("mode", { enum: ["EMPLOYER", "EMPLOYEE"] }).notNull().default("EMPLOYER"),
    letterType: text("letter_type").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull(),
    employer: jsonb("employer").$type<Record<string, unknown>>().notNull(),
    employee: jsonb("employee").$type<Record<string, unknown>>().notNull(),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
    counselReview: jsonb("counsel_review").$type<{
      reviewedBy: string;
      reviewedOn: string;
      attestedAt: number;
    } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }).notNull(),
  },
  (t) => ({
    userIdx: index("drafts_user_id_idx").on(t.userId),
    retentionIdx: index("drafts_retention_until_idx").on(t.retentionUntil),
  })
);

/**
 * Sections within a draft. One row per section. Versions stored separately.
 */
export const draftSections = pgTable(
  "draft_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    title: text("title").notNull(),
    html: text("html").notNull().default(""),
    status: text("status", { enum: ["empty", "streaming", "ready", "edited"] })
      .notNull()
      .default("empty"),
    position: integer("position").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    draftIdx: index("draft_sections_draft_id_idx").on(t.draftId),
  })
);

/**
 * Version history for sections. Append-only. Used for "restore previous version".
 */
export const draftVersions = pgTable(
  "draft_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull().references(() => draftSections.id, { onDelete: "cascade" }),
    html: text("html").notNull(),
    modelName: text("model_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sectionIdx: index("draft_versions_section_id_idx").on(t.sectionId),
  })
);

/**
 * Audit log — tracks user actions for compliance.
 * Retained for 24 months under our default retention policy.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    draftId: uuid("draft_id").references(() => drafts.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("audit_log_user_id_idx").on(t.userId),
    actionIdx: index("audit_log_action_idx").on(t.action),
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
  })
);

// Composite uniqueness: a section_key is unique per draft.
export const draftSectionUniq = pgTable(
  "draft_sections_uniq_view",
  {
    draftId: uuid("draft_id").notNull(),
    sectionKey: text("section_key").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.draftId, t.sectionKey] }),
  })
);
