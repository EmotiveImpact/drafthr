CREATE TABLE "draft_extras" (
	"draft_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"extras_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_extras" ADD CONSTRAINT "draft_extras_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_extras" ADD CONSTRAINT "draft_extras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_extras_tenant_idx" ON "draft_extras" USING btree ("tenant_id");