-- Cross-device sync: server tombstones and write revisions for drafts.
--
-- deleted_at: a draft delete is now a SOFT delete. The row stays as a tombstone
-- (its letter content is scrubbed by the handler) so the sync pull can tell
-- other devices to drop their copy, and so a stale upsert of a deleted id is
-- refused instead of re-creating the letter and spending another credit.
--
-- revision: an integer bumped on every accepted write. Clients send the
-- revision they last saw; a write against an older revision is rejected with
-- 409 and the current row, so one device can no longer silently overwrite (or
-- revert the approval of) another device's edits.
--
-- Idempotent (IF NOT EXISTS) so the direct runner can re-apply safely. Existing
-- rows start at revision 0 and are not deleted.
ALTER TABLE "drafts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_tenant_deleted_idx" ON "drafts" USING btree ("tenant_id","deleted_at");
