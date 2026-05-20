-- Consultant marketplace — first-class user role with its own profile and
-- a booking lifecycle (requested → accepted → delivered → completed, with
-- declined as a side-exit). Profiles are gated by status='published' before
-- they appear in the public marketplace listing.

CREATE TABLE IF NOT EXISTS "consultant_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "initials" text NOT NULL,
  "full_name" text NOT NULL,
  "role" text NOT NULL,
  "bio" text NOT NULL,
  "specialty" text NOT NULL DEFAULT '',
  "specialties" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "price" integer NOT NULL DEFAULT 150,
  "currency" text NOT NULL DEFAULT 'GBP' CHECK ("currency" IN ('GBP', 'USD', 'EUR')),
  "sla" text NOT NULL DEFAULT '24-48h',
  "rating_x10" integer NOT NULL DEFAULT 50,
  "reviews" integer NOT NULL DEFAULT 0,
  "photo_url" text,
  "status" text NOT NULL DEFAULT 'pending_review' CHECK ("status" IN ('pending_review', 'published', 'paused', 'rejected', 'suspended')),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "consultant_profiles_status_idx" ON "consultant_profiles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultant_profiles_user_uniq" ON "consultant_profiles" USING btree ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "consultant_bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "requester_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "consultant_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "consultant_profile_id" uuid NOT NULL REFERENCES "consultant_profiles"("id") ON DELETE CASCADE,
  "draft_id" uuid REFERENCES "drafts"("id") ON DELETE SET NULL,
  "matter_title" text,
  "message" text,
  "status" text NOT NULL DEFAULT 'requested' CHECK ("status" IN ('requested', 'accepted', 'declined', 'delivered', 'completed')),
  "response_note" text,
  "delivery_note" text,
  "rating" integer,
  "booked_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expected_delivery_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "consultant_bookings_consultant_idx" ON "consultant_bookings" USING btree ("consultant_user_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultant_bookings_requester_idx" ON "consultant_bookings" USING btree ("requester_user_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultant_bookings_tenant_idx" ON "consultant_bookings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultant_bookings_draft_idx" ON "consultant_bookings" USING btree ("draft_id");
