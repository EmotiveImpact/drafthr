CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"reviewer_user_id" uuid,
	"reviewer_name" text NOT NULL,
	"decision" text NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"payload_json" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"row_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_row_hash_hex64" CHECK (char_length("audit_events"."row_hash") = 64 AND "audit_events"."row_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "audit_events_prev_hash_hex64" CHECK (char_length("audit_events"."prev_hash") = 64 AND "audit_events"."prev_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"section_id" uuid,
	"parent_id" uuid,
	"author_user_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_email" text,
	"body" text NOT NULL,
	"quote" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_letter_type" text NOT NULL,
	"mode" text NOT NULL,
	"jurisdiction" text,
	"section_html_json" jsonb NOT NULL,
	"answers_json" jsonb,
	"emoji" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"matter_id" uuid,
	"letter_type" text NOT NULL,
	"mode" text NOT NULL,
	"title" text,
	"jurisdiction" text,
	"review_status" text DEFAULT 'draft' NOT NULL,
	"submitted_for_review_at" timestamp with time zone,
	"review_decided_at" timestamp with time zone,
	"is_template_source" boolean DEFAULT false NOT NULL,
	"template_source_id" uuid,
	"context_json" jsonb NOT NULL,
	"employer_json" jsonb,
	"employee_json" jsonb,
	"answers_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"preferred_name" text,
	"job_title" text,
	"department" text,
	"manager_name" text,
	"manager_email" text,
	"email" text,
	"start_date" date,
	"end_date" date,
	"worker_class" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text,
	"mime_type" text,
	"s3_key" text,
	"content" text,
	"include_verbatim" boolean DEFAULT false NOT NULL,
	"display_mode" text DEFAULT 'figure' NOT NULL,
	"figure_label" text,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matter_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matter_id" uuid NOT NULL,
	"employee_id" uuid,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"color" text,
	"risk_band" text,
	"description" text,
	"primary_name" text,
	"primary_context" text,
	"deadline_iso" date,
	"deadline_label" text,
	"counsel_reviewed" boolean DEFAULT false NOT NULL,
	"owner_user_id" uuid,
	"next_action" text,
	"exposure_gbp" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "section_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"html" text NOT NULL,
	"model_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"title" text NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'empty' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"email" text,
	"legal_name" text,
	"workspace_role" text DEFAULT 'drafter' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_templates" ADD CONSTRAINT "custom_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_templates" ADD CONSTRAINT "custom_templates_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_template_source_id_custom_templates_id_fk" FOREIGN KEY ("template_source_id") REFERENCES "public"."custom_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_participants" ADD CONSTRAINT "matter_participants_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_participants" ADD CONSTRAINT "matter_participants_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_versions" ADD CONSTRAINT "section_versions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_draft_idx" ON "approvals" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_created_idx" ON "audit_events" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_tenant_rowhash_uniq" ON "audit_events" USING btree ("tenant_id","row_hash");--> statement-breakpoint
CREATE INDEX "comments_draft_idx" ON "comments" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "custom_templates_tenant_idx" ON "custom_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "drafts_tenant_idx" ON "drafts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "drafts_author_idx" ON "drafts" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "drafts_matter_idx" ON "drafts" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_idx" ON "employees" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "evidence_draft_idx" ON "evidence" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "matter_participants_matter_idx" ON "matter_participants" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "matters_tenant_idx" ON "matters" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "section_versions_section_idx" ON "section_versions" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "sections_draft_idx" ON "sections" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id");