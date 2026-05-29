-- Persist consultant availability server-side. Previously availability
-- lived only in localStorage, so it reset to 'this_week' every time the
-- profile was pulled from the server (data loss) and HR users on other
-- devices saw a stale badge. Now it's a first-class column.

ALTER TABLE "consultant_profiles"
  ADD COLUMN IF NOT EXISTS "availability" text NOT NULL DEFAULT 'this_week'
  CHECK ("availability" IN ('this_week', 'one_two_weeks', 'three_four_weeks', 'booked'));
