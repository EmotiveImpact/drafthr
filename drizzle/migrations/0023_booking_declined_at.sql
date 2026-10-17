-- When a consultant declined a booking, so My bookings can say
-- "Declined <date>: <reason>". Nullable: bookings declined before this
-- column existed show the reason without a date.
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "declined_at" timestamp with time zone;
