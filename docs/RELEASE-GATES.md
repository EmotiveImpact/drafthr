# DraftHR release work — 3 October 2026

This is the current release checklist. Older roadmap/activation notes describe
historical states and are not evidence that a deployed feature is ready.

## Scope and authority

Preserve the existing design. Complete correctness and persistence work first.
No production migration, provisioning, live payment, email send, merge or
deployment is authorized by this engineering pass. A local build is not a
production acceptance result.

## Implementation and regression gates

- [x] Deadline notifications do not fabricate an Acas date from a fixed offset;
      stored dates are labelled as reminders, not legal determinations.
- [x] Hosted browser security policy permits the installed Blob SDK upload
      endpoint while retaining restrictive framing/object/connect rules.
- [x] Marketplace business data uses server-authoritative writes and memory
      caches; stale session responses cannot repopulate another user's view.
      Legacy records are preserved outside active state, never blindly imported.
- [x] Audit chains use deterministic sequence order without changing historical
      hashes; WorkOS delivery is durably queued with idempotency and bounded retry.
- [x] Exported packs have exact per-file hashes and a canonical manifest;
      configured signing failure blocks export and unsigned status is explicit.
      Recipient verification requires an independently trusted key.
- [x] Request limits are shared across hosted workers and fail closed on database
      failure. Migration 0026 must precede deployment of the new limiter.
- [x] Shared request and AI-stream failure reporting emits redacted, structured
      events; optional alert
      receiver failures never change the application response.
- [x] Jurisdiction, storage explanation, signature claims and turnaround copy
      match the implementation rather than historical marketing text.
- [x] Full build/unit tests and disposable-Postgres integration tests pass.

## Corrections from the follow-up code review

- [x] ZIP verification accounts for every local record and its exact compressed
      payload. Hidden records, overlaps, inconsistent descriptors and trailing
      compressed bytes fail verification; ordinary and streaming exports pass.
- [x] Checkout reserves one immutable provider request per attempt in PostgreSQL.
      Concurrent clicks and uncertain retries reuse its Stripe key. Known expired
      or failed attempts can be replaced; paid and unresolved old attempts cannot.
- [x] Payment callbacks acknowledge only successful processing. Payment changes
      and event receipts commit together; callbacks match the session/attempt,
      amount and currency. Delayed success/failure and early callbacks are covered.
- [x] Deleted drafts cannot be attached or shared. Deletion revokes tokens in its
      transaction; concurrent acceptance cannot recreate access after deletion.
- [x] Failed session transitions release form controls and reconcile caches with
      a fresh read for the unchanged identity. Stale writes are never replayed.
- [x] Rate-limit cleanup skips locked rows instead of deadlocking with another
      worker's counter refresh. PostgreSQL contention tests exercise this path.

Payment migration 0027 must precede deployment. See
[Marketplace payment retries](MARKETPLACE-PAYMENTS.md) for event configuration
and recovery of unresolved provider outcomes. This review does not establish that
historical duplicate payments or missed callbacks have been reconciled.

## Local verification snapshot — 3 October 2026

- `npm run build`: passed, including TypeScript. Existing mixed static/dynamic
  import and large-bundle warnings remain (largest JavaScript asset about
  1.90 MB minified); hosted performance profiling is not complete.
- `npx vitest run --maxWorkers=2 --no-cache`: 178 files / 1,262 tests passed. Ten
  database-dependent files / 115 tests were skipped without database settings.
- `npm run test:database -- --maxWorkers=1 --no-file-parallelism --no-cache`:
  16 files / 173 tests passed using
  a disposable local PostgreSQL 17 instance. This separate command includes
  overlapping component tests, so its count must not be added to the default
  suite as a distinct-test total. CI is configured with PostgreSQL 16 and has
  not run remotely for these unpushed changes.
- Migrations 0000–0027 applied successfully to the fresh disposable database;
  a second bootstrap did not reapply them. `npx drizzle-kit check` passed.
- Read-only audit preflight and its sanitized invalid-input tests passed.
  The actual CLI smoke check used an empty test database, not customer history.
- Signed/unsigned pack, byte tampering, independently supplied test-key and
  offline ZIP verifier tests passed. No real KMS/provider acceptance is claimed.
- `git diff --check` passed. Pagedly was not changed. The temporary PostgreSQL
  server was stopped and this pass's disposable fixtures (about 41 MB) removed.
  Earlier disk pressure was relieved by clearing the repo's regenerable Vite
  cache (about 32 MB). The application's database was not modified. Provider
  responses in payment tests were mocked; locking and persistence used PostgreSQL.

These are local code and integration results. No production data was migrated;
no WorkOS, Stripe, email, alert receiver or hosted-upload provider acceptance was
performed. The isolated browser preview did not establish a working authenticated
journey, so the hosted/browser gates below remain open. These results cover
`codex/database-workspace-hardening`; consult Git for its current commit and
push status. No hosted deployment was performed by this verification pass.

## Deadline safety — intentional capability boundary

DraftHR no longer calculates tribunal, agency or court filing deadlines from a
single incident date. This is an intentional safety limit, not a replacement
calculator. Existing saved dates and their historical metadata are preserved;
the UI and calendar exports show valid dates only as **unverified reminders**.
No synthetic Acas date is produced by subtracting six weeks. Claim-related
employee drafts still warn users to confirm time limits even without a date.
Unverified reminder metadata is excluded from drafting prompts; related
templates and automatic clause suggestions no longer assert a blanket filing
window or that the user is in time. This does not rewrite already-saved letters
or previously downloaded calendars: those need review before reuse.

Checked against [Acas employment tribunal time limits](https://www.acas.org.uk/employment-tribunal-time-limits)
(updated 1 October 2026) and [EEOC filing time limits](https://www.eeoc.gov/time-limits-filing-charge)
on 3 October 2026. Claim type, location, worker category, relevant dates and
procedural events can change the applicable rules. A future verified-deadline
workflow requires suitable inputs, professional review and maintained rules;
an incident date, a reminder or a green content check is not that verification.
Generated text and existing letters still require appropriate legal review.

## Hosted acceptance — still required

Use an isolated staging workspace and fictional records, not customer data.

1. Confirm the intended Vercel project, Neon database/region and migration
   history. Review and apply migrations to an isolated staging branch only after
   approval, using the direct (unpooled) connection and a transaction-capable
   migration runner. Migration 0025 requires a controlled write pause and
   compatible application switch; deploying the old writer alone is not a safe
   rollback. Follow `AUDIT-DELIVERY.md` for pre/post integrity verification.
   Never run the local test bootstrap against application/customer databases.
2. Verify WorkOS hosted sign-in, invite, membership removal, expiry/refresh and
   workspace switching. No local auth bypass in hosted environments.
3. In two independent signed-in browser sessions, exercise employee → matter →
   draft → review → private export → reopen, then conflicts, revoked access,
   interrupted uploads/saves and recovery. Confirm persisted graph and exact file
   bytes, not only page text. Test anonymous and wrong-workspace file denial.
4. Import legacy records/files with explicit ownership and safe read-back before
   removal. Older templates with draft-bound exhibit references need explicit
   remediation. Quarantined marketplace records require an owner-reviewed
   reconciliation path; they are not automatically copied into a new account.
5. Inspect long PDF/DOCX/ZIP outputs in the actual readers, including tables,
   images, page breaks and many attachments. Exercise renderer/provider errors,
   large-file transfer and retries under the hosted response/time limits.
6. Enable an authenticated audit-outbox schedule with `CRON_SECRET`; choose a
   cadence supported by the hosting plan. `vercel.audit-cron.example.json` is an
   inactive five-minute configuration fragment, not an enabled schedule; merge
   its `crons` property into the intended project's configuration only after
   confirming plan support and launch approval. Preview deployments do not run
   Vercel cron jobs, so staging requires an authorized manual invocation.
   Check delivery lag and failed jobs.
   Reconcile jobs outside the provider's idempotency window before replay.
7. Verify the approved production signer, key custody/rotation and independent
   public-key distribution. A CMS sidecar is not legal review, trusted timestamp,
   an embedded PDF signature, regulatory WORM or proof that content is true.
8. Test email delivery and billing/Connect/webhook reconciliation in provider
   test environments. Switch to paid live operation only with explicit approval.
   Marketplace email notifications remain best-effort; durable queued delivery
   and retry/reconciliation are not implemented by the audit-event outbox.
   Paid consultant checkout now reserves a serialized request with fixed price,
   currency, destination and fee. Apply migration 0027 before deploying it and
   configure all Checkout success/failure events listed in
   `MARKETPLACE-PAYMENTS.md`. Provider test-mode acceptance is still required.
9. Connect `DRAFTHR_ERROR_REPORT_URL` to an approved HTTPS alert receiver (optional
   bearer token). Prove an alert reaches the operator. Structured runtime logs
   alone are not a staffed monitoring/incident-response process. This pass does
   not certify every historical `console` call as privacy-safe; review provider
   error logging and log access/retention before using real HR data.

## Owner and professional-review gates

- Confirm launch scope (core letters, consultant marketplace, enterprise claims).
- Approve retention/deletion, abandoned-upload expiry, quotas and scanning policy.
- Perform a coordinated database-and-private-file restore into an isolated target;
  record recovery time, missing-data checks and rollback compatibility.
- Obtain current UK/US employment-content and privacy/terms review; confirm
  business details, subprocessors, data locations, notices and operational rights
  handling. Source-checked reminder wording is not legal certification.
  Privacy/Terms now show a fixed pre-launch draft revision, not a moving
  effective date. Their remaining legal clauses are not production-approved.
- Review the complete diff and CI; merge only when authorized, then perform a
  controlled deployment with an accountable rollback/monitoring owner.

## Local verification commands

`npm run verify` checks types, build and the default unit suite. Database tests
are a separate gate: `npm run test:database` requires all of the following:

- `DRAFTHR_LOCAL_DATABASE_URL`: disposable localhost PostgreSQL on port 55432,
  database name ending in `_test`.
- `DRAFTHR_LOCAL_WORKOS_EMULATOR=1` (local tests only).
- `DRAFTHR_ALLOW_TEST_DATABASE_MIGRATIONS=1`.

The bootstrap never loads `.env` files or drops a database. CI provisions a
disposable PostgreSQL service and runs this gate independently of unit tests.
