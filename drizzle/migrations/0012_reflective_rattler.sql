CREATE TABLE "booking_payments" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"checkout_session_id" text,
	"payment_intent_id" text,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"amount" integer,
	"currency" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_connect_accounts" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_payments" ADD CONSTRAINT "booking_payments_booking_id_consultant_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."consultant_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connect_accounts" ADD CONSTRAINT "stripe_connect_accounts_profile_id_consultant_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."consultant_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_payments_session_idx" ON "booking_payments" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "stripe_connect_accounts_account_idx" ON "stripe_connect_accounts" USING btree ("account_id");