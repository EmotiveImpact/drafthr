-- Adds the credit_ledger idempotency anchor for exactly-once grants (per-period
-- plan drip). IF NOT EXISTS guards keep this safe to re-run; the sibling
-- sections.tenant_id changes that drizzle-kit re-emitted here (already applied
-- by migrations 0014/0015, whose meta snapshots were lost to branch churn) were
-- removed by hand so this migration only carries the genuinely-new grant_key.
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "grant_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_grant_key_uq" ON "credit_ledger" USING btree ("grant_key") WHERE "grant_key" is not null;
