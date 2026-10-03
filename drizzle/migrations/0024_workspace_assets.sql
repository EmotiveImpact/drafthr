CREATE TABLE "workspace_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" uuid,
	"pathname" text NOT NULL,
	"provider" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "workspace_assets_pathname_unique" UNIQUE("pathname"),
	CONSTRAINT "workspace_assets_status_check" CHECK ("workspace_assets"."status" in ('pending', 'ready')),
	CONSTRAINT "workspace_assets_size_check" CHECK ("workspace_assets"."size" > 0 and "workspace_assets"."size" <= 2097152),
	CONSTRAINT "workspace_assets_mime_check" CHECK ("workspace_assets"."content_type" in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'))
);
--> statement-breakpoint
ALTER TABLE "workspace_assets" ADD CONSTRAINT "workspace_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assets" ADD CONSTRAINT "workspace_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_assets_tenant_idx" ON "workspace_assets" USING btree ("tenant_id");