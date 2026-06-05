-- 0009 — fix consultant_bookings user FKs: SET NULL → CASCADE
--
-- requester_user_id and consultant_user_id are NOT NULL but were created
-- (migration 0005, inline REFERENCES) with ON DELETE SET NULL. That pair is
-- contradictory: deleting a referenced user raises a NOT NULL violation and
-- aborts the delete. Re-point both to ON DELETE CASCADE, matching every other
-- .notNull() user FK in the schema.
--
-- Name-agnostic: 0005 used inline REFERENCES, so Postgres auto-named the
-- constraints `..._fkey` (not drizzle's `..._fk`). We drop whichever FK
-- currently constrains each column, then add a canonical drizzle-named one.
-- Idempotent and safe to re-run.

DO $$
DECLARE
  cname text;
BEGIN
  -- requester_user_id
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'consultant_bookings'::regclass
    AND c.contype = 'f'
    AND a.attname = 'requester_user_id';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE consultant_bookings DROP CONSTRAINT %I', cname);
  END IF;

  -- consultant_user_id
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'consultant_bookings'::regclass
    AND c.contype = 'f'
    AND a.attname = 'consultant_user_id';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE consultant_bookings DROP CONSTRAINT %I', cname);
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "consultant_bookings" ADD CONSTRAINT "consultant_bookings_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_bookings" ADD CONSTRAINT "consultant_bookings_consultant_user_id_users_id_fk" FOREIGN KEY ("consultant_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
