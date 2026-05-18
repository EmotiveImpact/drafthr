-- WorkOS Audit Logs sink: tenant-level config + last-sent timestamp.
-- workos_org_id is nullable — only enterprise tenants opt in to the mirror.
-- The unique constraint mirrors the one-to-one mapping between a DraftHR
-- tenant and its WorkOS organization.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "workos_org_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "workos_audit_logs_last_sent_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_workos_org_id_unique'
  ) THEN
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_workos_org_id_unique" UNIQUE ("workos_org_id");
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_workos_org_id_idx" ON "tenants" USING btree ("workos_org_id");
