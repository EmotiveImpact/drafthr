-- Marketplace payment rules. Hand-written and idempotent (IF NOT EXISTS guards,
-- backfills only touch NULL rows) so it is safe to re-run.
--
-- 1. Price snapshot on the booking: what checkout charges, in minor units.
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "price_amount" integer;--> statement-breakpoint
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "price_currency" text;--> statement-breakpoint
-- Backfill legacy bookings: prefer the amount a checkout was already started
-- for, otherwise fall back to the consultant's current rate (the best record
-- available for a booking placed before snapshots existed).
UPDATE "consultant_bookings" b SET "price_amount" = p."amount", "price_currency" = lower(p."currency")
  FROM "booking_payments" p
  WHERE p."booking_id" = b."id" AND b."price_amount" IS NULL AND p."amount" IS NOT NULL AND p."currency" IS NOT NULL;--> statement-breakpoint
UPDATE "consultant_bookings" b SET "price_amount" = c."price" * 100, "price_currency" = lower(c."currency")
  FROM "consultant_profiles" c
  WHERE c."id" = b."consultant_profile_id" AND b."price_amount" IS NULL AND c."price" > 0;--> statement-breakpoint
-- 2. Refund / dispute bookkeeping on the payment row.
ALTER TABLE "booking_payments" ADD COLUMN IF NOT EXISTS "charge_id" text;--> statement-breakpoint
ALTER TABLE "booking_payments" ADD COLUMN IF NOT EXISTS "transfer_id" text;--> statement-breakpoint
ALTER TABLE "booking_payments" ADD COLUMN IF NOT EXISTS "amount_refunded" integer;--> statement-breakpoint
ALTER TABLE "booking_payments" ADD COLUMN IF NOT EXISTS "dispute_id" text;--> statement-breakpoint
-- Charge and dispute events are matched to a booking by payment intent.
CREATE INDEX IF NOT EXISTS "booking_payments_payment_intent_idx" ON "booking_payments" USING btree ("payment_intent_id");--> statement-breakpoint
-- 3. Draft access now opens on payment, not on acceptance. Withdraw share
-- links that were minted for bookings that were never paid.
UPDATE "consultant_bookings" b SET "share_token" = NULL, "share_token_expires_at" = NULL
  WHERE b."share_token" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "booking_payments" p WHERE p."booking_id" = b."id" AND p."status" = 'paid'
    );
