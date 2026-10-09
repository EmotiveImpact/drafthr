-- Refunded one-off purchases: refunded_at marks a purchase whose charge was
-- fully refunded, so it no longer authorises a letter or pack. IF NOT EXISTS
-- keeps this safe to re-run.
ALTER TABLE "entitlement_purchases" ADD COLUMN IF NOT EXISTS "refunded_at" timestamp with time zone;
