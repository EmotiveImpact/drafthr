CREATE TABLE "workspace_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"created_by" uuid,
	"purpose" text NOT NULL,
	"format" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"pathname" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"draft_revision" integer NOT NULL,
	"snapshot_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "workspace_files_pathname_unique" UNIQUE("pathname"),
	CONSTRAINT "workspace_files_purpose_check" CHECK ("workspace_files"."purpose" in ('evidence', 'export')),
	CONSTRAINT "workspace_files_status_check" CHECK ("workspace_files"."status" in ('pending', 'ready')),
	CONSTRAINT "workspace_files_size_check" CHECK ("workspace_files"."size" > 0 and "workspace_files"."size" <= 26214400)
);
--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_files_tenant_draft_idx" ON "workspace_files" USING btree ("tenant_id","draft_id");--> statement-breakpoint
CREATE INDEX "workspace_files_tenant_status_idx" ON "workspace_files" USING btree ("tenant_id","status");