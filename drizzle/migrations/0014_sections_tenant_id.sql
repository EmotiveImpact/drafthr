-- Add sections.tenant_id — denormalized tenant isolation for the sections table
-- (security board 2026-07-04, finding F1). Previously sections had NO tenant
-- column and isolation was inherited only via the drafts FK + per-handler
-- discipline. This column makes it correct BY CONSTRUCTION (a direct
-- `where tenant_id = …` on every read/write) with no RLS backstop available on
-- Neon's pooler.
--
-- PHASE 1 of 2 (zero-downtime ordering — see 0015 for the NOT NULL flip):
--   1. add the column NULLABLE  — safe while the OLD code (which doesn't write
--      tenant_id) is still live: its inserts simply leave it NULL.
--   2. backfill from the parent draft.
--   3. add the FK (guarded against duplicate) + index.
-- Apply this migration, THEN deploy the new code (which writes tenant_id on
-- every section insert), THEN apply 0015 (SET NOT NULL). Each step is safe with
-- whatever code is running at that moment.
--
-- Idempotent so the direct runner (scripts/run-migrations-direct.mjs) can
-- re-apply safely after a partial run.

ALTER TABLE "sections" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
UPDATE "sections" SET "tenant_id" = "drafts"."tenant_id"
  FROM "drafts"
  WHERE "sections"."draft_id" = "drafts"."id" AND "sections"."tenant_id" IS NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sections_tenant_idx" ON "sections" USING btree ("tenant_id");
