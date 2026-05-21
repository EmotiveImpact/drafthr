-- Matter-scoped share tokens for accepted consultant bookings.
-- Generated server-side on accept; consultant uses the token to fetch the
-- specific draft they were booked to review without needing membership
-- in the HR tenant. Expires shareTokenExpiresAt.

ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "share_token" text;--> statement-breakpoint
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "share_token_expires_at" timestamp with time zone;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'consultant_bookings_share_token_uniq'
  ) THEN
    CREATE UNIQUE INDEX "consultant_bookings_share_token_uniq" ON "consultant_bookings" USING btree ("share_token");
  END IF;
END $$;
