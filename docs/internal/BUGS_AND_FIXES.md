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
| O1 | medium | `src/db/schema.ts:491-497` | `consultant_bookings.requesterUserId` / `consultantUserId` are `.notNull()` **and** `onDelete:"set null"` — contradictory. Deleting a user who has bookings will raise a NOT NULL violation and abort the delete (future GDPR-erase / user-deletion path 500s). | Latent (no user-deletion path exists yet). Needs a Drizzle migration changing the FK action to `restrict` (or `cascade`) + careful prod apply — own iteration. |

---

## 2026-05-30 — 0.18.1 maintenance loop

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
