-- Per-pack letter metering: a case pack authorises a fixed number of letters.
-- letters_total is the allowance (null for single-letter/credit buys), letters_used
-- increments once per letter created against the pack. IF NOT EXISTS keeps this
-- safe to re-run. The backfill stamps allowances onto any pack rows bought before
-- this migration so they aren't treated as already-exhausted (0 - null).
ALTER TABLE "entitlement_purchases" ADD COLUMN IF NOT EXISTS "letters_total" integer;--> statement-breakpoint
ALTER TABLE "entitlement_purchases" ADD COLUMN IF NOT EXISTS "letters_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "entitlement_purchases" SET "letters_total" = 4 WHERE "kind" = 'pack_grievance' AND "letters_total" IS NULL;--> statement-breakpoint
UPDATE "entitlement_purchases" SET "letters_total" = 6 WHERE "kind" = 'pack_settlement' AND "letters_total" IS NULL;--> statement-breakpoint
UPDATE "entitlement_purchases" SET "letters_total" = 8 WHERE "kind" = 'pack_tribunal' AND "letters_total" IS NULL;
