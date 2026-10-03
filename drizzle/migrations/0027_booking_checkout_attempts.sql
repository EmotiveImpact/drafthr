ALTER TABLE "booking_payments" ADD COLUMN "checkout_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_payments" ADD COLUMN "checkout_params" jsonb;--> statement-breakpoint
ALTER TABLE "booking_payments" ADD COLUMN "checkout_requested_at" timestamp with time zone;