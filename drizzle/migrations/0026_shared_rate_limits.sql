CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_hits_check" CHECK ("rate_limit_buckets"."hits" > 0)
);
--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expiry_idx" ON "rate_limit_buckets" USING btree ("expires_at");