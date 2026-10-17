-- Priority expert reviews: back within 24 hours of payment, for a higher
-- price the expert sets. Off until the operator turns on
-- FEATURE_PRIORITY_REVIEWS (or VITE_FEATURE_PRIORITY_REVIEWS), and each
-- expert opts in by setting a priority price.
--
-- consultant_profiles.priority_price: the expert's priority rate in whole
-- units (like price). Null means they don't offer priority.
ALTER TABLE "consultant_profiles" ADD COLUMN IF NOT EXISTS "priority_price" integer;
--> statement-breakpoint
-- consultant_bookings.turnaround: 'standard' or 'priority', fixed at booking.
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "turnaround" text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
-- The standard rate when a priority booking was placed (minor units), so a
-- late delivery refunds exactly the difference.
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "standard_price_amount" integer;
--> statement-breakpoint
-- When a priority review is due: payment time plus 24 hours. Null until paid.
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "priority_due_at" timestamp with time zone;
--> statement-breakpoint
-- A late priority delivery refunds the difference: pending, refunded, owed
-- (to be refunded by hand) or failed. Null when nothing is owed.
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "late_refund_status" text;
--> statement-breakpoint
ALTER TABLE "consultant_bookings" ADD COLUMN IF NOT EXISTS "late_refund_amount" integer;
