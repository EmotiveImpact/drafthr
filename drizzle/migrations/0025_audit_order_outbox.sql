-- One atomic statement, including with the legacy direct migration runner.
-- Existing hashes/timestamps/payloads are NEVER rewritten. Derive order from
-- recorded hash links, not UUIDs or clocks. Forks require explicit review.
DO $$
DECLARE broken_tenant uuid;
BEGIN
  LOCK TABLE "audit_events" IN ACCESS EXCLUSIVE MODE;
  SELECT tenant_id INTO broken_tenant FROM audit_events
    GROUP BY tenant_id, prev_hash HAVING count(*) > 1 LIMIT 1;
  IF broken_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'Audit chain fork for tenant %. Migration aborted; preserve audit rows and investigate the hash links before retrying.', broken_tenant;
  END IF;
  SELECT tenant_id INTO broken_tenant FROM audit_events
    WHERE row_hash = repeat('0', 64) LIMIT 1;
  IF broken_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'Audit chain contains an invalid genesis hash for tenant %. Migration aborted; preserve audit rows and investigate before retrying.', broken_tenant;
  END IF;
  SELECT tenant_id INTO broken_tenant FROM audit_events
    GROUP BY tenant_id, row_hash HAVING count(*) > 1 LIMIT 1;
  IF broken_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'Audit chain contains duplicate hashes for tenant %. Migration aborted; preserve audit rows and investigate before retrying.', broken_tenant;
  END IF;
  -- Index the recursive successor lookup before walking a large history.
  CREATE UNIQUE INDEX "audit_events_tenant_prevhash_uniq" ON "audit_events" ("tenant_id", "prev_hash");
  ALTER TABLE "audit_events" ADD COLUMN "sequence" bigint;
  -- Unique predecessors/hashes and a nonzero row_hash mean any reachable
  -- cycle would need a duplicate predecessor or a genesis-valued row_hash.
  -- Those were rejected above; detached cycles remain unvisited below.
  -- No ever-growing path arrays: memory stays linear in history length.
  WITH RECURSIVE chain AS (
    SELECT id, tenant_id, row_hash, 1::bigint AS position
    FROM audit_events WHERE prev_hash = repeat('0', 64)
    UNION ALL
    SELECT child.id, child.tenant_id, child.row_hash, parent.position + 1
    FROM audit_events child JOIN chain parent
      ON child.tenant_id = parent.tenant_id AND child.prev_hash = parent.row_hash
  )
  UPDATE audit_events event SET sequence = chain.position FROM chain WHERE event.id = chain.id;
  SELECT tenant_id INTO broken_tenant FROM audit_events
    WHERE sequence IS NULL LIMIT 1;
  IF broken_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'Audit chain is disconnected, cyclic, or missing its genesis for tenant %. Migration aborted; preserve audit rows and investigate before retrying.', broken_tenant;
  END IF;
  ALTER TABLE "audit_events" ALTER COLUMN "sequence" SET NOT NULL;
  CREATE UNIQUE INDEX "audit_events_tenant_sequence_uniq" ON "audit_events" ("tenant_id", "sequence");
  ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_sequence_positive" CHECK ("sequence" > 0);
  CREATE TABLE "audit_log_deliveries" (
    "audit_event_id" uuid PRIMARY KEY NOT NULL,
    "tenant_id" uuid NOT NULL,
    "workos_org_id" text NOT NULL,
    "event_json" jsonb NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "first_attempt_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
    "lease_token" uuid,
    "lease_expires_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "last_error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "audit_log_deliveries_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "audit_events"("id") ON DELETE cascade,
    CONSTRAINT "audit_log_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade,
    CONSTRAINT "audit_log_deliveries_status_check" CHECK ("status" in ('pending', 'delivering', 'delivered', 'failed')),
    CONSTRAINT "audit_log_deliveries_attempts_check" CHECK ("attempts" >= 0)
  );
  CREATE INDEX "audit_log_deliveries_due_idx" ON "audit_log_deliveries" ("status", "next_attempt_at");
  CREATE INDEX "audit_log_deliveries_tenant_idx" ON "audit_log_deliveries" ("tenant_id", "status");
END $$;
