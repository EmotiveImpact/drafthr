-- Review links: secure links for "someone you trust" and the shared progress
-- of teammate and expert reviews (api/review-links). Only the SHA-256 hash of
-- a link token is stored (token_hash), never the token itself.

CREATE TABLE IF NOT EXISTS "review_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "draft_id" uuid NOT NULL,
  "client_review_id" text NOT NULL,
  "kind" text NOT NULL,
  "token_hash" text,
  "booking_id" uuid,
  "reviewer_name" text NOT NULL,
  "reviewer_email" text,
  "reviewer_user_id" uuid,
  "asker_user_id" uuid NOT NULL,
  "asker_name" text NOT NULL,
  "ask" text,
  "due_at" timestamp with time zone,
  "share_evidence" boolean DEFAULT false NOT NULL,
  "share_hearing_notes" boolean DEFAULT false NOT NULL,
  "approve_in_same_step" boolean DEFAULT false NOT NULL,
  "letter" jsonb NOT NULL,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'out' NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "opened_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "state" jsonb DEFAULT '{"rounds":[],"messages":[],"points":[]}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "review_links_kind_check" CHECK ("kind" IN ('team', 'trusted', 'expert')),
  CONSTRAINT "review_links_status_check" CHECK ("status" IN ('out', 'back', 'recalled', 'finished')),
  CONSTRAINT "review_links_trusted_token_check" CHECK ("kind" <> 'trusted' OR ("token_hash" IS NOT NULL AND "expires_at" IS NOT NULL))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "review_links" ADD CONSTRAINT "review_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "review_links" ADD CONSTRAINT "review_links_booking_id_consultant_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."consultant_bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "review_links" ADD CONSTRAINT "review_links_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "review_links" ADD CONSTRAINT "review_links_asker_user_id_users_id_fk" FOREIGN KEY ("asker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_links_token_hash_uniq" ON "review_links" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_links_client_review_uniq" ON "review_links" USING btree ("tenant_id", "client_review_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_links_draft_idx" ON "review_links" USING btree ("tenant_id", "draft_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_links_booking_idx" ON "review_links" USING btree ("booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_links_reviewer_idx" ON "review_links" USING btree ("reviewer_user_id");
