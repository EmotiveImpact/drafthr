# Database-first workspace migration

Status: in progress. The coordinated database-first workspace is enabled in the isolated local demo only. It must not yet be advertised as production-ready or cross-device-certified. See WORKSPACE-COMPLETION-PLAN.md for the current implementation and verification log; the initial draft-only slice below is historical context.

## Implemented in this slice

- Added a complete draft JSON snapshot and monotonic revision to the existing `drafts` table, with an additive migration. Existing indexed draft/section columns remain for current API consumers.
- Added tenant-scoped, paginated full-document reads and compare-and-swap writes. Legacy partial writers cannot overwrite a full snapshot, and promotion of a legacy row compares its last-update timestamp too.
- Added an opt-in browser client (`VITE_DRAFTHR_DATABASE_DRAFTS`) with explicit legacy import, recoverable conflict copies, visible unsaved state, and a sign-out/workspace-switch flush guard. The server flag is `DRAFTHR_DATABASE_DRAFTS`.
- Verified full-document round trip, stale-writer rejection and cross-tenant isolation against the disposable local PostgreSQL instance.

**Do not turn these flags on for general users yet.** The later `DRAFTHR_DATABASE_WORKSPACE` / `VITE_DRAFTHR_DATABASE_WORKSPACE` cutover now includes linked workspace records and settings, disables the older dual-write lifecycle, and coordinates hydration and saves. Legacy-file migration, remaining recovery cases and hosted verification still need acceptance testing before a customer cutover.

## Decision

Postgres is the authority for customer workspace records. The browser may hold an in-memory editing buffer and a temporary recovery copy, but a successful save means the server has acknowledged a durable, tenant-scoped write. Files are private objects with metadata and ownership in Postgres; a public URL or browser-only blob is not a durable record.

## Record inventory

| Record | Current app source | Target authority |
| --- | --- | --- |
| Draft body, answers, section history, evidence references, comments, review decisions, export history, AI thread | `useDraftStore` in localStorage; partial optional mirror | Complete draft aggregate in `drafts` (with indexed projections in `sections` and related tables) |
| Matters and participants | `useDraftStore`; optional write-only mirror | `matters` and `matter_participants` |
| Employees | `useDraftStore` | `employees` |
| Matter tasks and calendar events | `useDraftStore` | New tenant-scoped relational tables |
| Custom templates | `useDraftStore` | `custom_templates` |
| Personal/workspace settings | `useProfileStore`; some server-owned fields | Tenant/user settings tables, with server role and entitlement authoritative |
| Uploaded evidence and branding files | Browser data URLs or private Blob URLs | Private object storage, with tenant-scoped metadata in Postgres |

`localStorage` data from existing users is a migration source, **not** an authority after migration. Never erase it just because a POST was attempted or a GET failed.

## Delivery sequence and acceptance gates

1. **Draft vertical slice.** Save the *complete* draft aggregate, not just editor HTML. Use a monotonic server revision and compare-and-swap writes. Hydrate from the server on a second browser. Import a legacy browser draft only after checking whether its server ID already exists; preserve conflicts as recoverable copies. Show pending, saved, and failed/conflict states. Sign-out/workspace switch must not discard an unacknowledged edit.
2. **Workspace records.** Add symmetric list/create/update/delete for matters (including participants), employees, tasks, calendar events and custom templates. Use per-record revisions and server-side tenant checks. Do not use a whole-workspace JSON overwrite that can lose another teammate's changes.
3. **Files and collaboration.** Move evidence/branding bytes to private object storage; persist file metadata and access policy in Postgres. Make comments, review events, signatures, exports and AI history durable and attributable. No browser-only fallback that masquerades as a saved record.
4. **Cutover.** Import and verify legacy browser data per workspace, compare record counts and representative content, then disable old dual-write/localStorage persistence. Keep a recoverable export during rollout; remove it only after verified backup and retention policy. A flag-only return to the old browser store is not a verified rollback: it lacks newer database-owned records. Preserve the authoritative database, private files and unsaved recovery, and validate a compatible application rollback before cutover.
5. **Launch gate.** Automated tenant-isolation, revision-conflict, delete/retry, offline/reconnect and two-browser sign-out/sign-in tests. Exercise real local Postgres + authenticated API, then a non-production hosted database branch. Backups, restore drill, monitoring, retention and privacy/security review are required before production activation.

## Rules for the implementation

- Reads and writes require a server-verified session and active tenant. Every query is tenant-scoped; references must belong to the same tenant.
- A write is acknowledged only after the database transaction commits. The UI must not call an unconfirmed edit "saved".
- Revision conflicts never silently overwrite either copy. Keep the local edit available and offer an explicit reconciliation path.
- Deletion has a durable server result (or pending intent); failed deletes must not resurrect records on the next pull.
- Large files are not silently stripped from a draft. Until the private-file path is complete, reject an oversized write visibly and retain its recovery copy.
- The local test/demo setup is not production data. No production environment flag is enabled by this plan.

## Import retry safety

Legacy imports use an exclusive origin-wide Web Lock and fresh database reads on every attempt. The complete rewritten graph is checked for prior-import edits/deletions before the first workspace-record write; file staging may already have completed. Parent-first writes use revision checks; an exact already-saved snapshot is skipped on retry, including after a lost acknowledgement. Import writes do not use the normal editing queue. Browser originals are removed only after the full database verification and unchanged-source/session checks.

Changing the explicit settings choice to “keep database settings” cannot replay a failed browser-settings import. Recovery entries left by the older importer are retired only when they exactly match that import and its verified database outcome. Other pending edits remain separate recovery work.

Large evidence and section/history image files now use migration 0023's staged private-file path: extract and validate bytes, privately upload and verify them, rewrite references, then save and verify the complete graph. Staging does not create placeholder drafts. File ownership is attached in the destination draft's database transaction. A six-megabyte fixture has passed through the actual client and local database/file handlers. This is not full cutover sign-off: branding/signature and template-image paths, larger batches, independent browsers and hosted-provider behavior remain acceptance work; see PRIVATE-FILES.md.
