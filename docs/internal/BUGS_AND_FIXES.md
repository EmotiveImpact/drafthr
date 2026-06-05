# Bugs & Fixes Log

Canonical record of bugs found and fixed in DraftHR, newest first. Each
entry: what broke, where, how it was proven, and the fix. The `/loop`
maintenance task references and updates this file.

**Verification discipline:** the real gate is `npm run build` (`tsc -b` per
project — stricter than `tsc --noEmit`, which the root tsconfig no-ops) +
`npx vitest run`. A green `tsc --noEmit` is NOT sufficient — it missed a
3-hour prod outage (see 2026-05-30 #1). Prove at runtime where possible:
curl deployed endpoints; distinguish a Vercel HTML 404 (route unreachable)
from a handler JSON 401/403 (enforced).

---

## Open / queued

| # | Severity | Area | Summary | Why not yet fixed |
|---|----------|------|---------|-------------------|
| O2 | medium | `src/lib/dual-write.ts:190` | `matterId` is silently dropped on every server sync — local matter ids (`matter_…`) aren't UUIDs, so `serverUuidOrNull` writes `null`. There's no matters dual-write endpoint, so a draft filed under a matter appears unfiled in the Postgres mirror. | Needs a matters dual-write endpoint (so the UUID row exists) + id mapping — a feature, not a one-line fix. Data still safe locally. |

### Known infra note (not a bug)
- **Drizzle meta-snapshot drift:** `drizzle/migrations/meta/` only has snapshots `0000–0002` then `0009` (0003–0008 missing). `db:migrate` is unaffected (it tracks applied migrations in `__drizzle_migrations`), but `db:generate` diffs against the stale `0002` baseline and emits bogus `CREATE TABLE`s for tables that already exist. **Always read generated SQL before applying.** The `0009_snapshot.json` is a complete cumulative snapshot, so future generates off 0009 will be correct again.

---

## 2026-05-30 — 0.18.1 maintenance loop

### O3 (fixed) — localStorage quota → silent total persist failure — LOW/MED (data-loss)
- **Where:** `src/lib/store.ts` persist config (was bare `{ name }`); new `src/lib/storage/quota-safe-storage.ts`; `src/lib/finalize/healthChecks.ts`.
- **What:** letterhead/signature images were stored TWICE per draft — raw base64 in `answers` (wizard echo) AND validated on `employer` (the render source of truth; every export/preview reads `draft.employer.*DataUrl`, never `answers.*`). The `answers` copy is dead weight and a couple of large images push the store past the 5–10 MB quota. zustand's persist swallows the resulting `setItem` throw, so the store **silently stops persisting** — drafts lost on the next refresh, no warning.
- **Fix:** a `StateStorage` wrapper (`createQuotaSafeStorage`) that (a) strips `answers.{letterhead,signature}DataUrl` data: URLs from the persisted JSON before writing — in-memory state and the employer render copy untouched — and (b) surfaces ONE toast on a genuine `QuotaExceededError` instead of failing silently. Health-check presence readers (`checkSignature`/`checkLetterhead`) now prefer `employer.*DataUrl` so post-reload checks stay correct.
- **Proven:** `quota-safe-storage.test.ts` (7 tests) — strips `answers` images / keeps employer copy / keeps non-data URLs / fail-safe on bad JSON / quota toast fires once / rethrows non-quota errors. Build + 397 tests green. Content-safe: no other code reads the persist key directly; only render source (`employer.*`) drives exports.

### #4 (fixed) — dual-write server-ahead 409 diverged silently — MEDIUM
- **Where:** `src/lib/dual-write.ts` `syncDraft` / `syncAllPending` (409 branch).
- **What:** a 409 means the server copy is NEWER than this client's revision (the server guards on `clientRevision < server.updatedAt`, `drafts.ts:91/138`) — i.e. another tab/device wrote a higher revision. Dual-write is write-only (no pull/merge path), so the client's edits keep failing the revision guard and never land. The only signal was a `console.warn`; the user believed they were saved because localStorage persisted. (Contrast the delete-failure path, which already toasts.)
- **Fix:** added a consecutive-409 counter (`recordStaleConflict`) that surfaces ONE toast after >3 conflicts — mirrors `recordDeleteFailure`. Honest about the limitation ("reload to pull the latest"); does not pretend to merge. Counter resets on any successful sync.
- **Proven:** `dual-write.test.ts` — new test drives 4 server-ahead 409s (each a strictly-newer revision) and asserts exactly one toast. Also fixed pre-existing test pollution (shared `toast.error` mock not cleared between tests → added `vi.clearAllMocks()` in `beforeEach`). 390 passed.
- **Note:** full multi-device reconcile (a GET/pull/merge path) remains unbuilt — the toast is the interim honest signal, not the cure.

### O1 (fixed) — consultant_bookings user FKs: NOT NULL + SET NULL → CASCADE — MEDIUM
- **Where:** `src/db/schema.ts` `consultant_bookings` (`requesterUserId`, `consultantUserId`); migration `drizzle/migrations/0009_crazy_thanos.sql`.
- **What:** both columns are `.notNull()` but migration 0005 created them (inline `REFERENCES`) with `ON DELETE SET NULL` — contradictory. Deleting a referenced user raises a NOT NULL violation and aborts the delete (future user-deletion / GDPR-erase path 500s). Confirmed on live prod: `confdeltype='n'`, constraints auto-named `..._fkey`.
- **Fix:** schema → `onDelete:"cascade"` (matches every other `.notNull()` user FK). **Drizzle's auto-generated migration was unsafe** (snapshot drift → bogus `CREATE TABLE`s; would have added duplicate `..._fk` constraints alongside the broken `..._fkey` ones). Hand-authored a name-agnostic `DO $$` block that drops whichever FK constrains each column, then re-adds it as CASCADE. Idempotent.
- **Proven:** `npm run db:migrate` applied; re-queried prod → both FKs `confdeltype='c'` (CASCADE) with canonical drizzle names, old `_fkey` gone. Build + 389 tests green.

### #3 (fixed) — `dtoToProfile` could render `undefined` currency symbol — LOW
- **Where:** `src/lib/marketplaceSync.ts` `dtoToProfile` — `symbolByCode[dto.currency]` had no fallback (the sibling `dtoToConsultant` guards with `?? "£"`).
- **Impact:** any server currency drift (new enum value / legacy row) → `currency: undefined` → `ConsultantHome` renders `undefined150/hr`. Latent today (enum-constrained) but unguarded.
- **Fix:** `currency: symbolByCode[dto.currency] ?? "£"`.

### #2 (fixed) — completing/responding to a booking wiped consultant display fields — HIGH
- **Where:** `src/lib/marketplaceSync.ts` `pushBookingRespond` → `dtoToBooking`, against `api/marketplace/_handlers/respond.ts` `toClient`.
- **What:** `respond.ts`'s `toClient` returns the bare booking row — it does NOT include the join-only consultant fields (`consultantName/Role/PhotoUrl/Currency/Price`), which are produced only by the HR-side list join (`list-and-create.ts`). `pushBookingRespond` replaced the local row with `dtoToBooking(dto)`, setting those to `undefined`. After an HR user rated+completed (or accepted/delivered) a booking, the row lost the consultant's name/photo/price and fell back to `Specialist · INITIALS` with no avatar. Same class hit the consultant inbox (requester identity) until the next pull.
- **Fix:** `dtoToBooking` takes an optional `prior?: Booking`; absent display fields fall back to `prior?.<field>`. `pushBookingRespond` passes the existing local row as `prior`. Fresh DTO values still win when present.
- **Proven:** `src/lib/marketplaceSync.test.ts` (3 tests) — TDD: failed before the merge fix, passes after. Asserts fields survive a `complete`+rate, fresh values override prior, and soft-fail leaves the row untouched.

### #1 (fixed) — production build broken ~3h (validated photoUrl discarded) — CRITICAL (outage)
- **Where:** `api/marketplace/_handlers/profile.ts`.
- **What:** `writeProfile` computed a validated `photoUrl` (P3 sanitisation) then discarded it — `values.photoUrl` persisted the raw `body.photoUrl` instead. The unused local tripped `noUnusedLocals`, so `tsc -b` failed and **every production build since 0.18.0 errored** (prod stuck ~3h on pre-0.18 code; the marketplace vetting + photoUrl validation never shipped). `tsc --noEmit` locally was a false green because the root `tsconfig.json` is a references-only no-op shell.
- **Fix:** store the validated value (`photoUrl`, not raw body). Verified with `npm run build` + `tsc -p` per project.
- **Lesson:** verify with the build's own command, not `tsc --noEmit`. Codified at the top of this file.

### B3/P2 (shipped) — real server-gated consultant vetting
- Not a bug — feature. `requireAdmin` (`api/_utils/admin.ts`) fails closed on the server-only `DRAFTHR_ADMIN_EMAILS` allowlist; `admin-queue` (GET) + `admin-review` (POST) behind it; `/admin/consultants` UI bounces non-admins on 403. `admin.test.ts` proves fail-closed. Prod config: `DRAFTHR_ADMIN_EMAILS` set, `VETTING_AUTO_PUBLISH=0`.

---

## Earlier (0.18.0 security-hardening wave) — see CHANGELOG.md

- Fail-open auth on `/api/draft`, `/api/agent`, `/api/upload/image` (bypassed whenever `NODE_ENV !== production`, i.e. every Vercel preview) → fail-closed via explicit `DRAFTHR_DEV_NO_AUTH=1`.
- Workspace admin routes (`member-role`, `member-remove`, `invite-revoke`) 404'd in prod under Vercel's single-segment catch-all matcher → flattened to single-segment actions.
- Per-route role guards (`<Protected roles={[…]}>`) — wrong-role surfaces no longer render on direct URL nav.
- Tenant isolation made a build-enforced invariant (`tenant-isolation.guard.test.ts`).
- Booking duplicates (local placeholder + server UUID) → `pushBookingCreate` swaps placeholder for server row.
- Marketing CTAs hardcoded `localhost:5273` → relative URLs.
