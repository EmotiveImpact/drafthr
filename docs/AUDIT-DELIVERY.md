# Audit ordering and durable WorkOS delivery

## Guarantees and boundaries

`audit_events.sequence` defines append order within each workspace. A transaction-scoped advisory lock serializes writers; unique sequence and predecessor indexes reject duplicate positions and forks. Wall-clock changes and UUID sort order cannot select the wrong chain head. The existing SHA-256 hash format is unchanged. Verification checks sequence continuity, predecessor links and each payload hash. This is tamper detection, not external notarization or regulatory WORM storage.

When `WORKOS_AUDIT_LOGS_ENABLED=true` and the workspace has a WorkOS organization, the same database transaction writes an immutable provider-event snapshot to `audit_log_deliveries`. This also covers caller-owned transactions: rollback removes both records. No provider request happens during workspace saves. Writes made while delivery is explicitly disabled or before an organization is linked are not retroactively queued.

The worker uses row locks, expiring leases, compare-and-set acknowledgements and a bounded batch/time budget. Provider failures never undo committed workspace writes. Retry bodies, organization IDs and event-ID idempotency keys stay fixed. Delivery is confirmed only after the awaited provider request succeeds and acknowledgement is committed. A success followed by a process crash is retried under the same key.

WorkOS idempotency expires after 24 hours and depends on the key **and event data** ([API reference](https://workos.com/docs/reference/audit-logs/event), [idempotency guide](https://workos.com/docs/audit-logs)). Automatic retries stop after eight attempts or before a conservative 23-hour window from first attempt. Permanent errors, changed organization mappings and ambiguous expired deliveries remain `failed`, with sanitized reason codes. They are never silently discarded or blindly replayed after the deduplication window.

## Migration and deployment

1. Back up and verify existing audit history. Migration 0025 walks recorded `prev_hash` links; it does not substitute timestamp/UUID order or recompute/rewrite old hashes. It atomically rejects forks, disconnected chains, cycles or missing roots with the tenant ID for investigation. Hash/payload integrity must also be verified before and after rollout; a successful structural backfill alone is not integrity proof.
2. Pause writes for the controlled application/migration switch. The new sequence column is required: pre-0025 application writers cannot keep writing after this migration. **Redeploying the old application alone is not a safe rollback.** Use a reviewed compatible application release or the coordinated database/application restore plan.
3. Apply the journaled migration with a transaction-capable runner, deploy the new writer and verify every tenant chain. No hosted migration is performed by these code changes.
4. Configure WorkOS credentials and allowed event schemas, opt in to delivery, and set a random deployment `CRON_SECRET` of at least 32 characters. The service endpoint is `GET /api/workos/audit-logs-dispatch`, authorized only by `Authorization: Bearer <CRON_SECRET>`; ordinary user sessions cannot drain cross-tenant jobs.
5. Activate an appropriate recurring schedule for the intended hosting plan. Target a cadence within the retry window, typically five minutes. Endpoint code alone does not configure a scheduler. Confirm real provider ingestion and the customer's log-stream delivery separately; provider acceptance does not prove SIEM receipt.

The read-only preflight works before and after migration 0025:

```sh
# Supply an explicitly approved direct URL through your environment manager;
# this tool never loads .env files. Do not paste credentials into documentation.
node --import tsx scripts/audit-preflight.ts --read-only
```

Set `AUDIT_PREFLIGHT_DATABASE_URL` for that invocation. It opens a read-only,
repeatable-read transaction and follows each tenant's hash links, recomputes
payload hashes, and checks sequences when that column exists. It reports only
counts, offending row/tenant IDs and reason codes; it never changes history.
Use a database role with complete visibility of `public.audit_events`. The
preflight sets `row_security=off` so policies that would filter rows cause an
error instead of a misleading clean/empty result; it does not bypass policies.
An empty database is a smoke test, not verification of an existing customer
history. The older `scripts/db-verify.ts` only tests a synthetic tenant and is
not this preflight. Do not use the legacy non-transactional direct migration
script for this rollout. Size the dispatch cadence/batch capacity against
actual event arrival rates and monitor oldest pending age, not just totals.

## Operations and reconciliation

Admin-only audit status reports pending, delivering, delivered and failed counts. The test-event endpoint reports `202` while delivery is unconfirmed and `200` only after provider acceptance. Monitor failed jobs, sustained pending-job age and scheduler failures. `last_error` contains a stable error code, never raw provider responses or HR payloads.

The audit card pins its status, diagnostic and portal requests to the displayed workspace and account; the API returns `409` if supplied pins no longer match the authenticated scope. Pins do not replace role/membership checks. Newly terminally failed jobs make the scheduled endpoint return `503` with aggregate counts so configured server-error alerts can report the failure; scheduled retries remain `200`.

For a failed/expired job: inspect the local event and provider export by audit event identity, establish whether it already arrived, correct configuration if needed, and explicitly reconcile the retained job. Do not reset first-attempt timestamps, regenerate the snapshot, change the organization or bulk replay expired keys merely to make the queue green. A historical backfill can duplicate earlier best-effort deliveries; it requires an explicit scoped review, not automatic replay during deployment.

Local integration tests use only an explicitly selected disposable localhost:55432 database ending in `_test`; no real WorkOS requests are made. Hosted scheduler, provider schema, data retention and alert activation remain deployment gates.
