-- Ops and security hardening (hand-written, idempotent; safe to re-run).
--
-- 1. rate_limits: durable fixed-window counters shared by every serverless
--    instance (api/_utils/rate-limit.ts). The in-memory limiter stays as a
--    fast first check; this table is what makes auth limits actually hold.
-- 2. audit_events.seq: per-tenant monotonic chain position. Appends assign
--    seq = max(seq) + 1 while holding the tenant's advisory lock, and the chain
--    is walked by seq instead of created_at (millisecond ties used to fork it).
--    Existing rows are backfilled per tenant in (created_at, id) order, which is
--    the order the old verifier walked. A BEFORE INSERT trigger fills seq for
--    an insert that omits it (code deployed before this migration).
-- 3. audit_events append-only trigger: rejects UPDATE and DELETE. The only
--    exceptions are the two FK actions the schema already declares:
--      - ON DELETE CASCADE from tenants (tenant erasure): allowed only once the
--        owning tenant row is gone;
--      - ON DELETE SET NULL from users on actor_user_id: allowed only when
--        actor_user_id is the sole column changing, it changes to NULL, and the
--        referenced user no longer exists.

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY ("key", "window_start")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_window_start_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint

ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "seq" bigint;--> statement-breakpoint
-- Backfill only rows that have no seq yet. On a re-run this touches zero rows,
-- so the append-only trigger below (if already installed) never fires.
UPDATE "audit_events" AS ae
SET "seq" = numbered.rn
FROM (
  SELECT "id",
         row_number() OVER (PARTITION BY "tenant_id" ORDER BY "created_at" ASC, "id" ASC) AS rn
  FROM "audit_events"
) AS numbered
WHERE ae."id" = numbered."id" AND ae."seq" IS NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "seq" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_events_tenant_seq_uniq" ON "audit_events" USING btree ("tenant_id", "seq");--> statement-breakpoint
-- Number any row inserted without a seq. The deployed app and this migration
-- don't switch over atomically: until code that assigns seq is live (and again
-- after a rollback), appends arrive without it and would fail the NOT NULL,
-- and every caller swallows audit failures, so events would be lost silently.
-- Those appends already hold the tenant's advisory lock, so max + 1 is safe;
-- anything that skips the lock still hits the unique (tenant_id, seq) index.
-- A seq the app assigned is never overridden.
CREATE OR REPLACE FUNCTION "audit_events_assign_seq"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."seq" IS NULL THEN
    SELECT coalesce(max("seq"), 0) + 1 INTO NEW."seq"
    FROM "audit_events"
    WHERE "tenant_id" = NEW."tenant_id";
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_events_assign_seq" ON "audit_events";--> statement-breakpoint
CREATE TRIGGER "audit_events_assign_seq"
  BEFORE INSERT ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_assign_seq"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "audit_events_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Tenant erasure: the FK cascade from tenants runs after the tenant row is
    -- deleted, so it is no longer visible here. Any other delete is refused.
    IF NOT EXISTS (SELECT 1 FROM "tenants" WHERE "id" = OLD."tenant_id") THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_events is append-only: DELETE rejected for id %', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- ON DELETE SET NULL on actor_user_id after the actor's user row is removed.
    IF OLD."actor_user_id" IS NOT NULL
       AND NEW."actor_user_id" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD."actor_user_id")
       AND NEW."id" = OLD."id"
       AND NEW."tenant_id" = OLD."tenant_id"
       AND NEW."kind" = OLD."kind"
       AND NEW."subject_type" = OLD."subject_type"
       AND NEW."subject_id" = OLD."subject_id"
       AND NEW."payload_json" = OLD."payload_json"
       AND NEW."seq" IS NOT DISTINCT FROM OLD."seq"
       AND NEW."prev_hash" = OLD."prev_hash"
       AND NEW."row_hash" = OLD."row_hash"
       AND NEW."created_at" = OLD."created_at" THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_events is append-only: UPDATE rejected for id %', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_events_append_only" ON "audit_events";--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_mutation"();--> statement-breakpoint
-- TRUNCATE bypasses row triggers, so refuse it at statement level as well.
-- (A tenant erasure goes through the FK cascade, never TRUNCATE.)
CREATE OR REPLACE FUNCTION "audit_events_reject_truncate"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: TRUNCATE rejected'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_events_no_truncate" ON "audit_events";--> statement-breakpoint
CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_events_reject_truncate"();
