ALTER TABLE "drafts" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_employee_idx" ON "drafts" USING btree ("employee_id");