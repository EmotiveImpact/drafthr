/**
 * review_links: one row per review a letter is sent out for (migration
 * 0022_trusted_review_links). It carries the secure link for "someone you
 * trust" (only the SHA-256 hash of the token, never the token itself), the
 * letter as it was shared, the files the asker chose to share, and the
 * review's progress (rounds, messages, the reviewer's points) so the asker's
 * browser can follow it.
 *
 *   trusted  token_hash set; opened by the token alone, no account
 *   team     reviewer_user_id set; the teammate works inside the app
 *   expert   booking_id set; the consultant on that paid booking
 *
 * The integrator mirrors this table in src/db/schema.ts (see the review
 * builder's lead requests). Kept here so the review-links handler compiles
 * without touching the shared schema file.
 */
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { consultantBookings, tenants, users } from "../../src/db/schema.js";

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
    uniqueIndex("review_links_token_hash_uniq").on(t.tokenHash),
    uniqueIndex("review_links_client_review_uniq").on(t.tenantId, t.clientReviewId),
    index("review_links_draft_idx").on(t.tenantId, t.draftId),
    index("review_links_booking_idx").on(t.bookingId),
    index("review_links_reviewer_idx").on(t.reviewerUserId),
  ],
);

export type ReviewLinkRow = typeof reviewLinks.$inferSelect;
export type NewReviewLinkRow = typeof reviewLinks.$inferInsert;
