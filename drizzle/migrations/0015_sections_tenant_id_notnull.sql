-- PHASE 2 of 2 for sections.tenant_id (see 0014).
--
-- Flip tenant_id to NOT NULL. Apply this ONLY AFTER the new code (which writes
-- tenant_id on every section insert) has been deployed — otherwise the old
-- code's tenant_id-less inserts would violate the constraint. By this point
-- 0014's backfill has populated every existing row and all live writers set it,
-- so the column has no NULLs and the flip is instant.
--
-- Idempotent: re-running SET NOT NULL on an already-NOT NULL column is a no-op.
-- Guarded against the (impossible-after-backfill) NULL case with a pre-check so
-- a mis-ordered apply fails loudly instead of half-way.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sections" WHERE "tenant_id" IS NULL) THEN
    RAISE EXCEPTION 'sections.tenant_id has NULLs — run 0014 backfill and deploy the tenant_id-writing code before applying 0015';
  END IF;
  ALTER TABLE "sections" ALTER COLUMN "tenant_id" SET NOT NULL;
END $$;
