-- Append-only chat thread per booking. Each row carries an array of
-- { id, from, text, ts } message objects. We use jsonb instead of a
-- separate messages table because the volume per booking is tiny
-- (usually <10 messages) and the access pattern is "always read
-- alongside the booking" — keeping it inline avoids a join.

ALTER TABLE "consultant_bookings"
  ADD COLUMN IF NOT EXISTS "messages" jsonb NOT NULL DEFAULT '[]'::jsonb;
