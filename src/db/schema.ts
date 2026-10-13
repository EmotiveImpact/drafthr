// DraftHR workspace schema — Drizzle (Postgres / Neon).
// Hash-chained audit_events at the bottom is the defensibility moat.
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  integer,
  bigint,
  primaryKey,
  boolean,
  date,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --- workspace ---------------------------------------------------------------

// workos_org_id — when populated, audit_events for this tenant are mirrored
// to WorkOS Audit Logs (subject to WORKOS_AUDIT_LOGS_ENABLED). The local
// hash-chain stays the source of truth; WorkOS is a downstream sink so
// enterprise tenants can subscribe their SIEM. workos_audit_logs_last_sent_at
// is updated on each successful mirror — surfaced in the Settings card.
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    workosOrgId: text("workos_org_id").unique(),
    // Stripe customer for workspace-level billing (HR Starter/Pro/Business).
    stripeCustomerId: text("stripe_customer_id").unique(),
    workosAuditLogsLastSentAt: timestamp("workos_audit_logs_last_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("tenants_workos_org_id_idx").on(t.workosOrgId)],
);

// users.tenantId is the "home" tenant they were minted under — kept for
// backwards-compat, but the real per-workspace role lives in tenant_members.
// userType: 'customer' (HR team) or 'consultant' (marketplace). Mint default
// is 'customer'; consultants get flipped manually for the split UI.
//
// FK: ON DELETE SET NULL (not CASCADE) — deleting a tenant must NOT delete
// every user whose home tenant happens to point at it. tenant_members is the
// source of truth for tenant membership; users.tenant_id is a soft pointer.
// workos_directory_user_id — set when the row is provisioned via Directory
// Sync (SCIM / Google Workspace). Unique because every directory user maps
// to a single DraftHR user row. workos_directory_id records which directory
// the row came from, in case a tenant has more than one (rare but possible
// for multi-region orgs). Both nullable — users who signed up directly via
// AuthKit never get these populated.
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    externalId: text("external_id").notNull().unique(),
    email: text("email"),
    legalName: text("legal_name"),
    workspaceRole: text("workspace_role").notNull().default("drafter"),
    userType: text("user_type").notNull().default("customer"),
    workosDirectoryUserId: text("workos_directory_user_id"),
    workosDirectoryId: text("workos_directory_id"),
    // Stripe customer for user-level billing (Employee Plus, one-off letters,
    // credit packs). Distinct from the workspace customer on `tenants`.
    stripeCustomerId: text("stripe_customer_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("users_tenant_idx").on(t.tenantId),
    uniqueIndex("users_workos_directory_user_id_uniq").on(t.workosDirectoryUserId),
    index("users_workos_directory_id_idx").on(t.workosDirectoryId),
  ],
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
    // status — 'active' for normal membership. Directory Sync flips this to
    // 'deprovisioned' on dsync.user.deleted / dsync.group.user_removed so we
    // soft-delete the seat instead of dropping the row. Audit chain references
    // tenant_members.user_id; hard-deleting would corrupt the chain. The
    // deprovisioned_at timestamp lets the Settings UI show "removed by IdP on X".
    status: text("status").notNull().default("active"),
    deprovisionedAt: timestamp("deprovisioned_at", { withTimezone: true }),
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
    // Soft-delete tombstone. A deleted draft keeps its row (content scrubbed)
    // so the sync pull can tell other devices to drop it and a stale upsert of
    // the id is refused rather than re-creating the letter.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Bumped on every accepted write. Clients send the revision they last saw
    // and a write against an older one is rejected with 409.
    revision: integer("revision").notNull().default(0),
  },
  (t) => [
    index("drafts_tenant_idx").on(t.tenantId),
    index("drafts_tenant_deleted_idx").on(t.tenantId, t.deletedAt),
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
    // Denormalized from the parent draft so section isolation is correct BY
    // CONSTRUCTION (a direct `where tenant_id = …` on every read/write) rather
    // than only by the discipline of tenant-verifying the parent first. There
    // is no Postgres RLS backstop on Neon's pooler, so this column is the
    // schema-level guarantee. (Security board 2026-07-04, finding F1.)
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sectionId: text("section_id").notNull(),
    title: text("title").notNull(),
    html: text("html").notNull().default(""),
    status: text("status").notNull().default("empty"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sections_draft_idx").on(t.draftId), index("sections_tenant_idx").on(t.tenantId)],
);

// Per-draft "extras" — the small, structured collaboration data that the draft
// row + sections don't hold: comments, the event timeline, approvals, and the
// employee-mode outcomeSought. Kept in a SEPARATE table (one JSON blob per
// draft) so its sync is fully decoupled from the core draft write: a failed or
// absent extras write can never block a draft from saving, and the read is a
// separate best-effort fetch. Deliberately EXCLUDES evidence file blobs — those
// are base64 and belong in object storage, not a JSON column (tracked separately).
export const draftExtras = pgTable(
  "draft_extras",
  {
    draftId: uuid("draft_id")
      .primaryKey()
      .references(() => drafts.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    extrasJson: jsonb("extras_json").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("draft_extras_tenant_idx").on(t.tenantId)],
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
//
// seq is the per-tenant position in the chain (1, 2, 3, ...). It is assigned
// inside the append transaction while the tenant's chain head is held under an
// advisory lock, and the chain is ordered by seq, never by created_at: two
// appends in the same millisecond (or from instances with skewed clocks) used
// to tie on created_at and could fork the chain. The unique (tenant_id, seq)
// index makes a duplicate position impossible even if the lock were bypassed.
// Migration 0021 also installs a trigger that rejects UPDATE and DELETE on this
// table (other than the FK cascade/set-null paths), so the chain is append-only
// at the database level too.
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
    seq: bigint("seq", { mode: "number" }).notNull(),
    prevHash: text("prev_hash").notNull(),
    rowHash: text("row_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_events_tenant_created_idx").on(t.tenantId, t.createdAt.desc()),
    uniqueIndex("audit_events_tenant_rowhash_uniq").on(t.tenantId, t.rowHash),
    uniqueIndex("audit_events_tenant_seq_uniq").on(t.tenantId, t.seq),
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

// --- consultant marketplace -------------------------------------------------

/**
 * consultant_profiles — one row per user who has enrolled as a consultant.
 *
 * The data here drives the public marketplace card on /consultants. status
 * gates visibility: 'pending_review' rows are stored but NOT listed publicly
 * (the admin vetting step), 'published' rows are searchable, 'paused' lets a
 * consultant temporarily disappear from the marketplace without deleting
 * their profile, and 'rejected' / 'suspended' are admin actions.
 *
 * Mirrors the localStorage shape in lib/consultantProfile.ts so the
 * client-side store can be the cache layer once the backend is live.
 */
export const consultantProfiles = pgTable(
  "consultant_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    initials: text("initials").notNull(),
    fullName: text("full_name").notNull(),
    /** Single line title e.g. "Solicitor · 12 yrs · ex-DLA Piper". */
    role: text("role").notNull(),
    bio: text("bio").notNull(),
    /** Quote shown in the specialty box of the marketplace card. */
    specialty: text("specialty").notNull().default(""),
    /** Filter-chip tags driving /consultants search. JSON string array. */
    specialties: jsonb("specialties").notNull().default(sql`'[]'::jsonb`),
    price: integer("price").notNull().default(150),
    currency: text("currency", { enum: ["GBP", "USD", "EUR"] })
      .notNull()
      .default("GBP"),
    sla: text("sla").notNull().default("24-48h"),
    /** Availability window — drives the marketplace card badge and lets HR
     *  filter for consultants who can take urgent work. Persisted so the
     *  badge is correct cross-device (it isn't just a local UI preference). */
    availability: text("availability", {
      enum: ["this_week", "one_two_weeks", "three_four_weeks", "booked"],
    })
      .notNull()
      .default("this_week"),
    rating: integer("rating_x10").notNull().default(50), // stored x10 to avoid floats
    reviews: integer("reviews").notNull().default(0),
    photoUrl: text("photo_url"),
    /** Vetting / visibility state. */
    status: text("status", {
      enum: ["pending_review", "published", "paused", "rejected", "suspended"],
    })
      .notNull()
      .default("pending_review"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("consultant_profiles_status_idx").on(t.status),
    uniqueIndex("consultant_profiles_user_uniq").on(t.userId),
  ],
);

/**
 * consultant_bookings — lifecycle records for review requests.
 *
 * Lifecycle (forward-only, declined/completed are terminal):
 *   requested → accepted → delivered → completed
 *                      ↘ declined
 *
 * draftId is nullable so HR users can book a generic consultation (no
 * specific letter attached yet). tenantId is denormalised onto the row
 * for tenant-scoped reads (most queries filter by it).
 */
export const consultantBookings = pgTable(
  "consultant_bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** HR user who placed the booking. NOT NULL, so the FK must cascade —
     *  "set null" on a NOT NULL column would raise a constraint violation
     *  and abort any user delete. Matches the convention for every other
     *  .notNull() user FK in this schema (drafts, comments, etc.). */
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consultantUserId: uuid("consultant_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consultantProfileId: uuid("consultant_profile_id")
      .notNull()
      .references(() => consultantProfiles.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => drafts.id, { onDelete: "set null" }),
    matterTitle: text("matter_title"),
    message: text("message"),
    status: text("status", {
      enum: ["requested", "accepted", "declined", "delivered", "completed"],
    })
      .notNull()
      .default("requested"),
    responseNote: text("response_note"),
    deliveryNote: text("delivery_note"),
    rating: integer("rating"),
    /** Price agreed when the booking was placed, in minor units (pence/cents),
     *  and its lowercase ISO currency. Checkout charges from this snapshot,
     *  never the consultant's live rate, so a rate change after booking can't
     *  alter what the requester pays. Null only on legacy rows. */
    priceAmount: integer("price_amount"),
    priceCurrency: text("price_currency"),
    bookedAt: timestamp("booked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expectedDeliveryAt: timestamp("expected_delivery_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** When the consultant declined (null on rows declined before 0023). */
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    /** Random bearer token generated once the booking is paid. Tied
     *  to {bookingId, draftId}; expires shareTokenExpiresAt. Used by the
     *  consultant to fetch the specific draft they're reviewing without
     *  needing membership in the HR tenant. */
    shareToken: text("share_token"),
    shareTokenExpiresAt: timestamp("share_token_expires_at", { withTimezone: true }),
    /** Append-only thread between the consultant and requester. Each entry
     *  is { id, from: 'requester' | 'consultant', text, ts }. Jsonb so we
     *  don't need a separate messages table for what's typically <10
     *  messages per booking. */
    messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [
    index("consultant_bookings_consultant_idx").on(t.consultantUserId, t.status),
    index("consultant_bookings_requester_idx").on(t.requesterUserId, t.status),
    index("consultant_bookings_tenant_idx").on(t.tenantId),
    index("consultant_bookings_draft_idx").on(t.draftId),
    uniqueIndex("consultant_bookings_share_token_uniq").on(t.shareToken),
  ],
);

// --- Stripe (payments) -------------------------------------------------------
// SEPARATE tables so payment wiring is fully decoupled from the LIVE marketplace
// flows: the existing consultant_profiles / consultant_bookings handlers never
// touch these, so the marketplace keeps working even if migration 0012 isn't
// applied yet. Only the new Stripe endpoints + webhook read/write here.

// A consultant's Stripe Connect (Express) account, for receiving payouts.
export const stripeConnectAccounts = pgTable(
  "stripe_connect_accounts",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => consultantProfiles.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(), // acct_…
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    detailsSubmitted: boolean("details_submitted").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("stripe_connect_accounts_account_idx").on(t.accountId)],
);

// Payment state for a booking (HR pays once the consultant accepts; nothing is
// delivered and no draft access is granted until this row is "paid").
export const bookingPayments = pgTable(
  "booking_payments",
  {
    bookingId: uuid("booking_id")
      .primaryKey()
      .references(() => consultantBookings.id, { onDelete: "cascade" }),
    checkoutSessionId: text("checkout_session_id"),
    paymentIntentId: text("payment_intent_id"),
    // unpaid | processing (async method, e.g. Direct Debit, not yet settled) |
    // paid | failed | refunded (full refund) | disputed | dispute_lost.
    // Only "paid" unlocks delivery, completion, rating and draft access.
    status: text("status").notNull().default("unpaid"),
    amount: integer("amount"), // minor units (pence/cents)
    currency: text("currency"),
    /** Stripe charge and the destination-charge transfer to the consultant's
     *  Connect account, recorded from charge events so a refund can reverse it. */
    chargeId: text("charge_id"),
    transferId: text("transfer_id"),
    amountRefunded: integer("amount_refunded"), // minor units
    disputeId: text("dispute_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("booking_payments_session_idx").on(t.checkoutSessionId),
    index("booking_payments_payment_intent_idx").on(t.paymentIntentId),
  ],
);

// --- billing (subscriptions, one-off purchases, credit ledger) ---------------
// Direct-charge billing (DraftHR is the merchant), separate from the marketplace's
// Connect/destination charges. Stripe is the source of truth; these mirror it via
// idempotent webhooks. See docs/superpowers/plans/2026-07-02-billing-subscriptions.md.

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectType: text("subject_type").notNull(), // 'tenant' (HR plan) | 'user' (Employee Plus)
    subjectId: uuid("subject_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripePriceId: text("stripe_price_id").notNull(),
    plan: text("plan").notNull(), // 'starter' | 'pro' | 'business' | 'employee_plus'
    status: text("status").notNull(), // active | trialing | past_due | canceled | incomplete
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    // Set on invoice.payment_failed to now()+3d; access continues until then, then
    // locks. Cleared on invoice.paid. App-enforced 3-day grace (decided 2026-07-02).
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("subscriptions_subject_idx").on(t.subjectType, t.subjectId)],
);

export const entitlementPurchases = pgTable(
  "entitlement_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'letter_routine'|'letter_standard'|'letter_high'|'letter_tribunal'
    // |'pack_grievance'|'pack_settlement'|'pack_tribunal'
    kind: text("kind").notNull(),
    matterId: uuid("matter_id"), // nullable; packs/plus scope to a matter
    stripePaymentIntentId: text("stripe_payment_intent_id").notNull().unique(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }), // single-letter entitlements
    // Case packs are metered by count, not a single consumedAt: letters_total is
    // the pack's allowance (null for single-letter/credit purchases), letters_used
    // increments once per letter created against it. Remaining = total − used.
    lettersTotal: integer("letters_total"),
    lettersUsed: integer("letters_used").notNull().default(0),
    // Set when the purchase's charge is fully refunded (charge.refunded). A
    // refunded purchase authorises nothing and its included credits are revoked.
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("entitlement_purchases_user_idx").on(t.userId)],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectType: text("subject_type").notNull(), // 'tenant' (pooled) | 'user'
    subjectId: uuid("subject_id").notNull(),
    delta: integer("delta").notNull(), // + grant, - spend
    reason: text("reason").notNull(), // 'pack' | 'plan_drip' | 'letter_included' | 'ai_critique' | 'ai_critique_refund' | 'expire'
    expiresAt: timestamp("expires_at", { withTimezone: true }), // drip expires at cycle end; packs null
    // Idempotency anchor for grants that must land exactly once regardless of how
    // many webhook deliveries carry them — e.g. per-period plan drip keyed
    // `drip:<subId>:<windowStartUnix>` (one window per month, also for annual
    // plans), `purchase:<paymentIntentId>` for a one-off's included credits, and
    // `revoke:<grantRowId>` for a refund clawback that targets that one grant.
    // NULL for spends and spend refunds. Enforced by a partial-unique index.
    grantKey: text("grant_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("credit_ledger_subject_idx").on(t.subjectType, t.subjectId),
    uniqueIndex("credit_ledger_grant_key_uq")
      .on(t.grantKey)
      .where(sql`${t.grantKey} is not null`),
  ],
);

// Stripe webhook idempotency — insert the event id; a conflict means "already
// processed", so ack and skip. Prevents double-crediting on redelivery.
export const webhookEventsSeen = pgTable("webhook_events_seen", {
  eventId: text("event_id").primaryKey(),
  seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
});

// Durable rate-limit counters (api/_utils/rate-limit.ts). Fixed windows: one
// row per (key, window_start), incremented atomically with
// INSERT ... ON CONFLICT DO UPDATE ... RETURNING so every serverless instance
// shares the same count. Old windows are pruned opportunistically.
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index("rate_limits_window_start_idx").on(t.windowStart),
  ],
);

// --- inferred types ----------------------------------------------------------

// --- review links (migration 0022_trusted_review_links) ----------------------
// One row per review a letter is sent out for: the secure link for "someone
// you trust" (only the SHA-256 hash of the token), the letter as shared, the
// files the asker chose to share, and the review's progress (rounds,
// messages, the reviewer's points). Used by api/review-links.
//   trusted  token_hash set; opened by the token alone, no account
//   team     reviewer_user_id set; the teammate works inside the app
//   expert   booking_id set; the consultant on that paid booking
export const reviewLinks = pgTable(
  "review_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** The letter (server uuid). No foreign key: a letter can live only on
     *  the asker's device, and the reviewer works from the snapshot below. */
    draftId: uuid("draft_id").notNull(),
    /** The review request's id in the asker's browser (reviews.ts). */
    clientReviewId: text("client_review_id").notNull(),
    kind: text("kind", { enum: ["team", "trusted", "expert"] }).notNull(),
    /** trusted: hex SHA-256 of the link token. Null for team and expert. */
    tokenHash: text("token_hash"),
    bookingId: uuid("booking_id").references(() => consultantBookings.id, { onDelete: "set null" }),
    reviewerName: text("reviewer_name").notNull(),
    reviewerEmail: text("reviewer_email"),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
    askerUserId: uuid("asker_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    askerName: text("asker_name").notNull(),
    ask: text("ask"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    shareEvidence: boolean("share_evidence").notNull().default(false),
    shareHearingNotes: boolean("share_hearing_notes").notNull().default(false),
    approveInSameStep: boolean("approve_in_same_step").notNull().default(false),
    /** The letter as shared: { title, letterType, jurisdiction, mode, company, sections }. */
    letter: jsonb("letter").notNull(),
    /** Only the evidence the asker chose to share. */
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    status: text("status", { enum: ["out", "back", "recalled", "finished"] })
      .notNull()
      .default("out"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** { rounds, messages, points } */
    state: jsonb("state")
      .notNull()
      .default(sql`'{"rounds":[],"messages":[],"points":[]}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("review_links_kind_check", sql`${t.kind} IN ('team', 'trusted', 'expert')`),
    check("review_links_status_check", sql`${t.status} IN ('out', 'back', 'recalled', 'finished')`),
    check(
      "review_links_trusted_token_check",
      sql`${t.kind} <> 'trusted' OR (${t.tokenHash} IS NOT NULL AND ${t.expiresAt} IS NOT NULL)`,
    ),
    uniqueIndex("review_links_token_hash_uniq").on(t.tokenHash),
    uniqueIndex("review_links_client_review_uniq").on(t.tenantId, t.clientReviewId),
    index("review_links_draft_idx").on(t.tenantId, t.draftId),
    index("review_links_booking_idx").on(t.bookingId),
    index("review_links_reviewer_idx").on(t.reviewerUserId),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type EntitlementPurchase = typeof entitlementPurchases.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;

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
export type ConsultantProfile = typeof consultantProfiles.$inferSelect;
export type NewConsultantProfile = typeof consultantProfiles.$inferInsert;
export type ConsultantBooking = typeof consultantBookings.$inferSelect;
export type NewConsultantBooking = typeof consultantBookings.$inferInsert;
export type ReviewLinkRow = typeof reviewLinks.$inferSelect;
export type NewReviewLinkRow = typeof reviewLinks.$inferInsert;
