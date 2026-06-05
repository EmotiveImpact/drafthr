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

| # | Severity | Area | Summary | Status |
|---|----------|------|---------|--------|
| **X1** | **CRITICAL (feature gap)** | `src/lib/export/pack.ts` | **The "tribunal-grade" evidence pack is NOT signed and carries NO per-file hashes.** The crypto infra is fully built and sound (`src/lib/sign/pades.ts` PAdES-B-T signer, `api/sign/manifest.ts`, canonical-JSON + audit hash-chain — all verified clean) but has ZERO callers in the pack path. `buildManifest` records no SHA-256 for the PDF/DOCX/evidence files, and `exportLetterPack` never calls `/api/sign/manifest` or writes `manifest.sig`. A recipient can swap any file and nothing detects it — the core differentiator is unbacked today. **Also X3**: `manifest.json` uses pretty-printed/insertion-order JSON + a volatile `generatedAt`, so it's non-reproducible — must switch to `canonicalJson` before/when signing is wired. | **Needs the user.** This changes the export artifact's structure and is the product's headline claim — wants a deliberate design pass + the user's awareness, not an autonomous-loop change. Scoped & ready to build on green-light. |
| X4 | medium | `src/lib/export/docx.ts:~569` `imageSizeFromElement` | Images sized in one dimension (letterhead `max-height:120px` no width, signature `max-height:54px`) get a fabricated width via `height*4` heuristic → wrong aspect ratio (warped logo/signature in the .docx). `%`/absent → hard-coded 3.2"×1.1". | Fix: decode intrinsic w/h from image bytes (PNG IHDR / JPEG SOF) and preserve ratio. Own iteration (needs an image-header parser + tests). |
| X5 | medium | `src/lib/export/docx.ts:~549` `parseDataImage` | DOCX only accepts png/jpeg/jpg/gif, but `inlineImagesForExport` inlines **webp** (it's in `ALLOWED_MIME`). A webp letterhead becomes a `data:image/webp` URL the DOCX parser can't read → silently dropped (empty alt → vanishes). | Fix: drop webp from the DOCX inlining allowlist (so it falls back to a visible placeholder) or transcode to png. Small; pair with X4. |
| E1b | med | `src/routes/Editor.tsx` auto-generate effect (~314) | The auto-generate gate uses local `globallyStreaming` (resets on mount), so a remount during an in-flight first generation can still re-enter `runGenerateAll`. The unmount-abort (E1a, done) kills the orphan stream, which removes the *corruption* mechanism; this remaining half is belt-and-braces. | Deferred — low residual risk now that orphan streams are aborted on unmount. |

### Known infra note (not a bug)
- **Drizzle meta-snapshot drift:** `drizzle/migrations/meta/` only has snapshots `0000–0002` then `0009` (0003–0008 missing). `db:migrate` is unaffected (it tracks applied migrations in `__drizzle_migrations`), but `db:generate` diffs against the stale `0002` baseline and emits bogus `CREATE TABLE`s for tables that already exist. **Always read generated SQL before applying.** The `0009_snapshot.json` is a complete cumulative snapshot, so future generates off 0009 will be correct again.

---

## 2026-05-30 — 0.18.1 maintenance loop

### Export-pipeline audit — X2 fixed; X1/X3/X4/X5 queued
First audit of the export pipeline (PDF/DOCX/evidence-pack, ~1,900 LOC). **Headline: the cryptographic foundations are genuinely sound** — the audit hash-chain (`src/db/audit*.ts`, canonical-JSON, advisory-lock-serialised, genesis 64-zeros, retroactive-edit-breaks-chain) and the PAdES-B-T/CMS signer (`src/lib/sign/*` — SHA-256 message-digest, Ed25519 over DER SET-OF signed-attrs, RFC-3161 timestamp required, byte-compatible verifier) both verified clean with their own passing tests. The server PDF endpoint correctly inlines images before render. **The gap is wiring, not crypto**: the signer isn't connected to the export pack (X1/X3, queued above — needs the user). Image-handling edge cases X4/X5 queued. One fixed now:

- **X2 (HIGH) — counsel attestation dropped from exports.** `exportLetterPack(draft)` was called with NO attestation arg even when the counsel gate (`guardCounsel`) had just passed, so the pack's manifest/README/cover-sheet rendered "not attested" / "Required" for a letter the user *did* attest — understating the legal review in the tribunal artifact. The PDF/DOCX/marked-sent `recordExport` calls likewise recorded no `reviewedBy/On` (both fields already existed, optional, on `ExportEvent`). Fix: an `exportAttestation()` helper (`{reviewedBy: draftedBy, reviewedOn: toDateOnly(now)}` when the gate was satisfied by explicit confirmation, else undefined) threaded into the pack export + all four `recordExport` calls. *(src/routes/Finalize.tsx)*

Build (`tsc -b`) + 403 tests green.

### E1 (partial) + E4 (resolved) — editor streaming lifecycle + signatory fallback

- **E1a (MEDIUM) — orphaned AI stream after navigation, FIXED.** `Editor.tsx` had no unmount cleanup for `abortRef`, so leaving a draft mid-generation left the stream calling `appendToSection` against the store after the component was gone — and because the auto-generate gate uses local `globallyStreaming` (resets on remount), a remount could start a SECOND generation loop that interleaved with the orphan and corrupted section HTML. Fix: an unmount-only `useEffect(() => () => abortRef.current?.abort(), [])`. This removes the corruption *mechanism* (no orphan writer). The remaining half (E1b, gate auto-generate on store-derived streaming state) is now belt-and-braces and stays queued.
- **E4 (RESOLVED — false positive).** The `signatoryName ?? recipientName` fallback (`store.ts:~625`) is **intentional**, not a bug. The `employer.signatoryName` field is mode-overloaded: in employer mode it's the letter's signatory; in employee mode `system.ts:63` reads it as **"Person addressed"** — and the employer person addressed IS the recipient, so `recipientName` is the correct source. Verified: all 20 employee templates collect `recipientName` (none collect `signatoryName`), and NO export/render path uses `employer.signatoryName` as the employee-sender's signature (the employee signature block comes from the template scaffold). No code change; left a clarifying note.

### Editor undo/restore — E2 + E3 fixed
Cleared the two self-contained editor queue items from the AI-authoring audit.

- **E3 (MEDIUM) — version restore dropped current content.** `onRestore` (`Editor.tsx`) swapped in an old section version via `updateSection` without versioning the current html first. If the current text was never versioned (hand-edits only go through `updateSection`), restore permanently dropped it. Fix: read the LIVE current section from the store and `pushSectionVersion` it before overwriting (guarded on `current.html && current.html !== html`).
- **E2 (MEDIUM) — accept-all undo garbled inline diffs.** `onAcceptAll` snapshotted `s.html` for undo, but in inline mode that html already carries the staged `<ins>/<del>` marks — undo restored marked-up html and re-diffed it → nested/garbled marks. Fix: snapshot `pendingChange.prevHtml ?? s.html` (the clean pre-diff text), matching the store's own canonical restore (`rejectSectionPending` uses the same `isInline && prevHtml ?? sec.html`).

Build (`tsc -b`) + 403 tests green. E1 (streaming concurrency) + E4 (signatory fallback) remain queued.

### Editor/AI-authoring audit — 2 fixes (#9–#10), 4 queued (E1–E4)
First audit of the Editor + AI-authoring flow (~4,100 LOC + the llm/ streaming orchestration). The AI client (retry/backoff/abort/SSE), Wizard, health checks, and the per-section accept/reject paths all verified sound. Two fixed now; four (E1–E4) queued above (need concurrency/undo design, not one-liners).

- **#9 (HIGH) — section stranded in "streaming" forever on AI failure.** `regenerateSectionAsPending` (`src/lib/llm/draft.ts`) set status→`"streaming"` then `await streamDraft` with NO try/catch; on throw the status reset never ran, and the three AI-rail callers (`AIPanel` applyRegenerate/applyTighten/applyAddClause) only report the error to the model — they don't reset status. So a failed rewrite/tighten/add-clause left the section locked in a spinner with no recovery (that path doesn't set `globallyStreaming`, so the Stop button isn't even shown). Fix: try/catch resets status to the resting value (`edited` if it had content, else `empty`) on failure before rethrowing. TDD: `src/lib/llm/draft.test.ts` (3) — throw→reset, empty→empty, success→propose.
- **#10 (MEDIUM, security) — unsanitised AI HTML at a raw-HTML sink.** `SharedDraftReview` rendered `s.html` via `dangerouslySetInnerHTML` with NO sanitisation (MobileReadView already sanitises via `letterBodyHtml`). Section html is normally sanitised on write, but an aborted/partial AI stream leaves raw model deltas at rest — which a consultant viewing the share could receive unescaped. Fix: wrap the sink in `sanitizeLetterHtml(s.html)` (sanitise-at-render = robust defence-in-depth). *(src/routes/SharedDraftReview.tsx)*

Build (`tsc -b`) + 403 tests green.

### HR portfolio audit — 4 fixes (#5–#8)
First audit of the HR portfolio surface (matters/employees/reports/bulk). Mostly clean (Reports stat math, BulkOps CSV pipeline, matters/employees selectors all verified sound); four real bugs fixed:

- **#5 (HIGH) — stale-notes cross-employee corruption.** `EmployeeDetail`'s `notes` was `useState(employee?.notes ?? "")`, initialised once. Navigating between two profiles via history reused the component instance, so the textarea kept employee A's notes while the Save guard compared against B → Save wrote A's notes into B's record. Fix: split into a `key={employeeId}` inner component so React remounts (resets ALL local state) per employee. *(src/routes/EmployeeDetail.tsx)*
- **#6 (HIGH) — Letter History dead link.** Rows linked to `/draft/:id/edit`, a route that doesn't exist (the editor is `/editor/:draftId`). Every letter in an employee's history tab 404'd. Fix: `to={`/editor/${d.id}`}`. *(src/routes/EmployeeDetail.tsx)*
- **#7 (MEDIUM) — deleteMatter orphans tasks/events.** `deleteMatter` unfiled drafts but left `tasks`/`events` with the dangling `matterId` — leaked forever, would re-surface if an id were reused. Fix: also filter `tasks`/`events` by `matterId !== id`. TDD: `store.matters.test.ts`. *(src/lib/store.ts)*
- **#8 (LOW) — UTC date drift.** Two spots used `new Date(epoch).toISOString().slice(0,10)` (UTC) to format a local timestamp → off-by-one day in some timezones. Fix: `toDateOnly(new Date(epoch))` (local calendar). *(EmployeeDetail.tsx "Started", MatterTasks.tsx "completed")*

Build (`tsc -b`) + 400 tests green.

### O2 (fixed) — matters now mirror to Postgres (draft→matter membership) — MEDIUM (feature)
- **Where:** new `api/store/_handlers/matters.ts` + `api/store/[action].ts` dispatcher case; `src/lib/dual-write.ts`; `src/lib/store.ts` subscription.
- **What:** drafts carried a `matterId`, but there was no endpoint to mirror the matter row — so the draft dual-write wrote `matterId: null` (the local `matter_…` id isn't a UUID and `drafts.ts` rejects a matterId whose row doesn't exist in the tenant). A draft filed under a matter appeared unfiled in the Postgres mirror.
- **Fix:** `POST/DELETE /api/store/matters` (same guard chain as drafts: same-origin + dual-write flag + rate-limit + session/tenant + IDOR ownership + audit), mapping the local id → deterministic UUID via the existing `toServerUuid` bridge. The draft sync now mirrors a draft's matter FIRST (`pushMatter` in `syncDraft`/`syncAllPending`), then links the returned UUID — **race-free**: on ANY matter-sync failure it falls back to `matterId:null` (today's safe behaviour, never a 409 regression). Matter deletes mirror too.
- **Cap-safe:** handler lives under `_handlers/` and is dispatched by the existing `api/store/[action].ts`, so the Vercel Hobby 12-function cap is untouched (still 11). `matters` table + all written columns already exist in prod (migration 0000) — no DB change.
- **Proven:** `dual-write.test.ts` (now 9) — matter pushed before draft + draft links the UUID; matter-sync failure → `matterId:null` fallback; existing "no local ids to uuid refs" guard still green. Build (`tsc -b`) + 399 tests green.

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
