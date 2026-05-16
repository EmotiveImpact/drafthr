CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'drafter' NOT NULL,
	"invite_code" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant_members" (
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" text DEFAULT 'drafter' NOT NULL,
	"is_active_tenant" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_type" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_tenant_idx" ON "invites" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_invite_code_uniq" ON "invites" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_members_user_tenant_pk" ON "tenant_members" USING btree ("user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_members_user_active_idx" ON "tenant_members" USING btree ("user_id","is_active_tenant");