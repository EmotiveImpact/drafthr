-- Directory Sync (WorkOS SCIM / Google Workspace) — provisions DraftHR seats
-- from the IdP. workos_directory_user_id is the stable WorkOS-assigned id; we
-- upsert on it (per the dsync gotchas in the WorkOS docs, email is the SAFER
-- stable identity but we keep the id as the primary lookup so re-creates in
-- the IdP get caught as a "new" provisioning instead of silently merging).
-- workos_directory_id records which directory the user came from so a tenant
-- with multiple directories doesn't conflate users across them.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workos_directory_user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workos_directory_id" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'users_workos_directory_user_id_uniq'
  ) THEN
    CREATE UNIQUE INDEX "users_workos_directory_user_id_uniq" ON "users" USING btree ("workos_directory_user_id");
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_workos_directory_id_idx" ON "users" USING btree ("workos_directory_id");--> statement-breakpoint

-- Soft-delete for tenant memberships. dsync.user.deleted /
-- dsync.group.user_removed flip status to 'deprovisioned' and stamp
-- deprovisioned_at; we never hard-delete because the hash-chained audit log
-- references user_id and a missing user would break verification.
ALTER TABLE "tenant_members" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN IF NOT EXISTS "deprovisioned_at" timestamp with time zone;
