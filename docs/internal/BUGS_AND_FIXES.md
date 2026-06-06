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

_Only X1 (needs the user) remains. Everything else has been fixed or verified-sound._

### Known infra note (not a bug)
- **Drizzle meta-snapshot drift:** `drizzle/migrations/meta/` only has snapshots `0000–0002` then `0009` (0003–0008 missing). `db:migrate` is unaffected (it tracks applied migrations in `__drizzle_migrations`), but `db:generate` diffs against the stale `0002` baseline and emits bogus `CREATE TABLE`s for tables that already exist. **Always read generated SQL before applying.** The `0009_snapshot.json` is a complete cumulative snapshot, so future generates off 0009 will be correct again.

---

## 2026-06-06 — auth render-gating + full multi-agent bug sweep (22 fixed)

Two user-requested passes. **(A)** Make the app fully auth-protected — no app
chrome or route content paints before authentication. **(B)** An exhaustive
multi-agent bug hunt (8 surfaces × find→adversarial-verify): 22 confirmed bugs
(1 candidate rejected as a false positive), ALL fixed. Final gate: `tsc -b`
clean · `vite build` OK · **453 tests** (+17). Verification used the real gate
(`npm run build` + `npx vitest run`), TDD where the seam allowed.

### (A) Auth render-gating — app no longer shows before sign-in
The route boundary was already sound (all 46 routes correctly classified;
server perimeter 401/400 to anon, re-confirmed at runtime). The leak was
CLIENT-SIDE rendering:
- **AUTH-1 (HIGH) — app shell painted pre-auth.** `Layout.tsx` chose
  sidebar-vs-minimal-shell purely by pathname, with no auth awareness — so an
  unauthenticated visitor to `/hr`, `/matters`, `/editor/x` saw the full
  `AppSidebar` (nav, recent drafts from localStorage, workspace name, user
  card) for the entire `/api/auth/session` round-trip before redirect. Fix:
  gate the shell on auth — render the minimal chromeless shell until a session
  (and a tenant, except on consultant `/c` routes where the tenant is minted
  lazily) is confirmed.
- **AUTH-2 (HIGH) — render-then-bounce in Protected.** `ProtectedGate`
  redirected via `useEffect` (post-render), and two states (signed-in-no-tenant,
  role-not-yet-resolved) had no render guard → the gated child mounted and fired
  effects for a frame before bouncing. Rewrote it to branch SYNCHRONOUSLY with
  `<Navigate>` (mirroring RootRedirect) so a non-authorized state commits no
  children at all. TDD: `src/lib/auth/Protected.test.tsx` (8) — child never
  renders while loading / signed-out / no-tenant / wrong-or-null-role; renders
  only when fully authorized; tenant-less consultant passes on `/c`;
  auth-disabled passes through.

### (B) Bug sweep — 22 fixed (severity order)

**HIGH**
- **#1 — rejected/pending AI suggestions leaked into PDF/DOCX/mobile exports.**
  `mergeAcceptedSuggestionsHtml` left rejected `<ins>` text intact, and
  `sanitizeLetterHtmlForExport` (KEEP_CONTENT + USE_PROFILES re-permitting
  `<ins>/<del>`) didn't strip them — so a clause the reviewer explicitly
  REJECTED reappeared as prose in the final legal document. Fix: a `forExport`
  merge mode (rejected/pending insertion → removed with text; rejected/pending
  deletion → unwrapped to original text) wired into all three export sinks, PLUS
  a defense-in-depth `stripSuggestionMarks` post-scrub in the export sanitiser.
  TDD: `suggestion-merge.test.ts` (+5), `sanitize.test.ts` (+3).
- **#2 — inline AI diff flattened images/tables/links/figure-refs; Accept made
  it permanent.** The default inline diff rebuilds a section from flattened
  text, silently dropping embedded evidence images, table structure, hyperlinks,
  and the `figure-ref`/`attachment-ref` spans the export resolves. Fix:
  `proposeSectionChange` now detects non-text content (`hasNonTextContent`) and
  falls back to CARD mode (Accept replaces verbatim — nothing flattened). TDD:
  `store.propose.test.ts`.
- **#3 — HR "Open draft" link broke after a booking synced.** `draftId` is
  hashed to a one-way UUID for the server; after sync `dtoToBooking` overwrote
  the readable id with the UUID, so the editor (keyed by readable ids) showed
  "Draft not found". Fix: a preserved `localDraftId` on `Booking`, threaded
  through `pushBookingCreate` / `pullMyBookings` / `pullInbox`; MyBookings links
  to `localDraftId ?? draftId`.
- **#4 — `refresh()` returned a stale pre-mutation session.** Inflight-coalescing
  meant a post-auth caller (workspace-create / sign-in / verify) could attach to
  a background focus-refresh reading the OLD cookie → observed null user/tenant →
  bounced backward (workspace-create loop, sign-in bounce-back). Fix:
  `refresh({ force: true })` bypasses the in-flight fetch; all 7 post-mutation
  callers now force.

**MEDIUM**
- **#5 — second AI proposal over an unresolved pending change corrupted
  prevHtml.** Diffed against already-marked-up html and overwrote the clean
  snapshot → Reject restored garbled marks. Fix: diff against (and preserve)
  the canonical `pendingChange.prevHtml`. *(store.ts; same change as #2)*
- **#6 — dual-write DELETE raced an in-flight upsert POST → ghost row + spurious
  `draft.created` audit.** Fix: client-side tombstone set (`deletedDraftIds`) +
  cancel pending timer on delete; `syncDraft` skips/re-deletes a tombstoned id.
  Also #13 server clamp hardens the create path. *(src/lib/dual-write.ts)*
- **#7 — bulk CSV duplicate header silently dropped/clobbered row data.** Fix:
  reject the CSV with a clear "Duplicate column" error. TDD: `csv.test.ts`.
- **#8 — Reports "Time to resolve" excluded archived matters** (disagreeing with
  `closedMatters()`). Fix: count both terminal states (`status !== "active"`).
- **#9 — PDF "Attachments" list double-numbered** ("1. 1.") — literal prefix
  inside a decimal `<ol>` with no Tailwind Preflight on PDF surfaces. Fix: drop
  the literal prefix, set explicit `list-style:decimal`.
- **#10 — broken "Open file" links in `evidence/index.html`.** The href
  re-derived from the raw filename while the file was written with a sanitised/
  extension-augmented name + full-array index. Fix: shared `evidenceFileName()`
  used by both the write loop and the index renderer (full-array index).
- **#11 — TXT export left HTML entities undecoded** (`&amp;`, `&lt;`). Fix:
  route through `div.textContent` (strips tags AND decodes), matching PDF/DOCX.
- **#12 — sign-up leaked verified-account existence via `userId:null`** (an
  enumeration oracle contradicting the anti-enumeration contract). Fix: always
  return the existing user's id; the body is now identical across fresh /
  duplicate-unverified / duplicate-verified. *(api/auth/_handlers/sign-up.ts)*
- **#13 — client-controlled `clientRevision` stored verbatim as
  `drafts.updatedAt`** → a far-future value permanently 409-locked the draft.
  Fix: `updatedAt` is server-authoritative (clamped to now + small skew); the
  client revision is used only for the stale comparison.
- **#14 — NotificationsBell popover stayed open after a click** (the bell lives
  in persistent chrome, so navigation doesn't unmount it). Fix: controlled
  Popover, `setOpen(false)` before every navigation.

**LOW**
- **#15 — selection-scope chat rendered raw `[scope:]`/`[selection:]`
  annotations.** Fix: parser regex tolerates a trailing `[selection:…]` block.
- **#16 — standalone matter rename/close/archive never synced** (only deletions
  + draft-triggered pushes did). Fix: debounced `enqueueMatterSync` on every
  matter create/update in the store subscription. *(dual-write.ts, store.ts)*
- **#17 — one-shot image migration could clobber a letterhead uploaded during
  the upload round-trip.** Fix: compare-and-set — only apply the migrated URL if
  the field still equals the original source value. *(App.tsx)*
- **#18 — mail-merge advertised camelCase wizard ids the snake_case substitution
  layer couldn't fill.** Fix: shared `foldKey` (camelCase→snake_case) for
  key derivation, dedup, and substitution. TDD: `mailmerge.test.ts` (+1).
- **#19 — marketplace bookings GET/POST 500'd on a non-UUID id** (unhandled
  Postgres 22P02). Fix: `serverUuidOrNull` guard → empty list (GET) / 404 (POST).
- **#20 — WorkspaceSwitcher swallowed a failed `/switch`** (silent no-op on a
  403 deprovisioned seat). Fix: toast the error + reload the list; also filter
  deprovisioned seats out of `/api/workspace/list`.
- **#21 — AuthCallback hung on "Signing you in…" under React StrictMode (dev).**
  The `cancelled` cleanup killed the only surviving run. Fix: drop the
  `cancelled` gating — the `started` ref is the single-run guard.
- **#22 — consultant sidebar "Home" and "Inbox" both pointed to `/c`** (both
  highlighted active; Inbox was a dead duplicate). Fix: render Inbox as a
  disabled "coming soon" placeholder until a real inbox route ships.

**Rejected (false positive):** "last-active-owner guard counts deprovisioned
owners" — the missing `status='active'` filter in the owner-count query is real,
but the claimed "zero owners" outcome is unreachable (three concurrent gates —
`canManageOwners`, no-self-target, and the session-level active-status check —
prevent it). Logged as a latent hardening note, not a live bug.

---

## 2026-06-06 — automated bug-fix sweep (0.18.1)

Multi-agent sweep over `src/`, `server/`, `api/`. Baseline was fully green
(tsc clean · 412 tests · build OK), so this was a latent-logic-bug hunt, not a
gate-failure cleanup. Six genuine bugs found; all fixed with tests where the
seam allowed. Final: `tsc -b` clean · **428 tests** (+16) · `vite build` OK.

### B1 (MEDIUM) — figure references validated against the wrong count
`checkEvidenceRefs` (`src/lib/finalize/healthChecks.ts`) and
`predicateBrokenEvidenceRefs` (`src/lib/reports/check-predicates.ts`) validated
`[See Fig N]` body tokens against `draft.evidence.length` (TOTAL evidence), but
figures are numbered only among figure-mode items (`figureLabelFor`). With more
attachments than figures, a ref pointing past the last real figure (e.g.
`[See Fig 4]` with 2 figures + 2 attachments) passed as "resolving" — a dangling
reference shipped in the letter. Fix: new shared `validFigureNumbers()` in
`src/lib/evidence.ts` derives the valid numbers straight from `figureLabelFor`
(so it also honours custom `figureLabel` overrides like "Fig 7"); both checks now
use it. TDD: `evidence.test.ts` (5) — figure-vs-evidence count, default
display-mode, custom-label override, no-figures, consistency with `figureLabelFor`.

### B2 (LOW) — consultant initials stranded when the name is cleared
`useConsultantStore.saveProfile` (`src/lib/consultantProfile.ts`) recomputed
initials under `if (patch.fullName)`, so clearing the name to `""` skipped the
recompute and left stale initials on the marketplace card — contradicting the
code's own "always stay in sync" comment. Fix: recompute whenever `fullName` is
part of the patch (`!== undefined`); `computeInitials("")` already yields `"??"`.
TDD: `consultantProfile.test.ts` (3) — set, clear-to-empty, unrelated-patch.

### B3 (LOW) — DOCX image squashed past the size caps (completes X4)
The X4 fix (2026-05-30) derived the missing dimension from the true ratio, but
`imageSizeFromElement`'s FINAL caps still clamped width and height
*independently* — so any image exceeding the 6in width or 2.5in height cap was
re-distorted (e.g. 800×400 ratio-2 letterhead → 576×400, ratio 1.44). Fix:
extracted an exported pure `clampImageSizePx()` that, when the ratio is known,
scales BOTH axes by a single factor to fit both caps (ratio preserved); falls
back to independent clamps only when the ratio is unknown. TDD: `docx.test.ts`
(6) — within-bounds, width-cap, height-cap, the regression case, no-ratio
fallback, min-floor.

### B4 (LOW) — booking chat message lost under concurrent posts
`api/marketplace/_handlers/message.ts` appended via read-modify-write
(`select` → write `[...existing, msg]`), so two participants posting at once
clobbered each other — last writer wins, one message lost. Fix: append
atomically inside the single UPDATE with a jsonb concat
(`coalesce(messages,'[]'::jsonb) || $1::jsonb`) and `RETURNING` the
authoritative post-append array. (No unit test — needs a live Postgres; verified
by typecheck + standard-pattern construction.)

### B5 (MEDIUM) — directory webhook could create a 2nd active tenant
DISTINCT from the 2026-05-30 audit (which correctly cleared the *conflict-update*
path for not touching `isActiveTenant`). This is the **insert** path: `provisionUser`
(`api/workos/_handlers/directory-webhook.ts`) inserted every new membership with
`isActiveTenant:true`. When a user matched **by email** already had an active
membership in another tenant, the new row made TWO memberships active at once —
violating the "exactly one active tenant per user" invariant and silently
switching their workspace. Fix: query for an existing active membership first
and insert active only when none exists (first membership → active; additional
→ inactive). The conflict `set` still leaves `isActiveTenant` untouched, so
re-syncs never flip the active workspace. TDD: `directory-webhook.test.ts` (+2,
with fake-DB mock extended for the active-membership query) — email-matched user
already-active-elsewhere joins inactive; first-membership user joins active.
*Residual: a true concurrent provision into two different tenants could still
both observe "no active" and both insert active — a rarer race; the deterministic
common case is fixed. A DB partial-unique index on `(user_id) WHERE is_active_tenant`
would close it fully.*

### B6 (MEDIUM) — dead TSA certificate pin (security; removed, flagged)
`FREETSA_TSA_KEY_SHA256_PINS[0]` in `api/_utils/tsa.ts` was a **65-char** hex
string (one stray digit). `certificatePinCandidates()` only ever produces
64-char SHA-256 hashes, so the pin could NEVER match — the legacy
(pre-March-2026) FreeTSA key verification path was silently broken. The correct
64-char value was unrecoverable (no cert in-repo to re-derive; the original hash
was lost), and guessing a security pin is unacceptable — so the dead pin was
**removed** (removal changes no behaviour: a dead pin never matched anything) and
a module-load guard now throws on any non-64-char-hex pin to stop a wrong-length
pin being reintroduced. **Action for the team:** if pre-rotation FreeTSA
timestamps must stay verifiable, re-add the authoritative 64-char SHA-256 of the
legacy FreeTSA signing certificate.

### Verified clean (no change)
The React frontend agent did a comprehensive pass (wizard/forms, transforms,
stores, effects/timers, routing/auth) and found no genuine high/medium-confidence
runtime bug — the stores are heavily hardened (versioned migrate/backfill,
StrictMode/unmount guards, undefined-key guards). Backend auth/IDOR/CSRF/rate-limit
surfaces re-confirmed sound (consistent with the 2026-05-30 audits).

---

## 2026-05-30 — 0.18.1 maintenance loop

### E1b (fixed) — streaming re-entry guard now store-derived
Completed the deferred half of E1. `runGenerateAll`'s re-entry guard and the auto-generate effect both checked only the LOCAL `globallyStreaming` flag, which resets to `false` on every mount — so navigating A→B→A while A's first generation was still in flight could re-enter and start a second `generateAllSections` loop, interleaving `appendToSection` writes. Fix: both gates now ALSO check store-derived streaming state (`draft.sections.some(s => s.status === "streaming")`), which survives remounts. Strictly additive — a genuinely fresh draft has no streaming section, so first-generation is never blocked. With E1a (unmount-abort) this closes both the corruption mechanism (orphan writer) and the re-entry trigger. Build (`tsc -b`) + 412 tests green.

### Directory-sync webhook second-pass — VERIFIED SOUND (no change)
Audited `api/workos/_handlers/directory-webhook.ts` (provision/deprovision/HMAC/idempotency). **Sound — no fix needed.** HMAC verified via the SDK's `constructEvent`; all verification failures collapse to a uniform 400 (no wrong-secret-vs-bad-timestamp oracle); processing errors return 500 so WorkOS retries (no silent provisioning gaps); upserts are single-statement `onConflictDoUpdate` (race-safe); deprovision soft-deletes (`status='deprovisioned'`, keeps the row for audit-chain integrity); `state==="inactive"` on an update is correctly treated as deprovision; events are org→tenant scoped via `workos_org_id`.
- **Resolved a flagged false-positive (audit finding #3):** the `onConflictDoUpdate.set` on `dsync.user.updated` does NOT include `isActiveTenant` (an existing member's active-workspace choice is preserved — the audit was wrong about that). The unconditional `status:"active"` re-provision is also NOT a leak: this app's model is **directory-level access** — presence as an active directory user = tenant access (it provisions identically on `user.created` / `user.updated` / `group.user_added`; the handler comment at L167 says "group membership simply confirms the user should be active"). A `group.user_removed`→`user.updated` re-provision is therefore the intended behaviour, not an escalation. No group-level access gating exists to violate.

### Membership/invite second-pass — deprovisioned-seat privilege retention (S3) + paired reactivation (S4)
Audited the invite/join/membership/tenant-switch/auth-handler flow. **Verified SOUND** across the board — invites are email-bound to the verified session (not body-supplied), single-use + expiring + revocable, unguessable (190-bit), role taken from the inviter; role-change/member-remove are admin-gated with last-owner protection and server-side tenant-scoped target lookups; tenant-switch requires membership; sign-up can't attach to a tenant; account-enumeration defenses uniform; OAuth state CSRF + webhook HMAC present. **One real vuln found + fixed:**

- **S3 (HIGH→CRITICAL) — deprovisioned member retains API access + old role.** When an IdP removes a user, the directory webhook soft-deletes the seat (`tenant_members.status='deprovisioned'`, `isActiveTenant=false`) but keeps the row (audit integrity). `session.ts` (client view) correctly excludes `status='deprovisioned'`, but the ENFORCEMENT points didn't: `requireSessionAndTenant` (`session-with-tenant.ts:95`) selected the active member with NO status filter, and `switch.ts` checked only that a `(userId,tenantId)` row *exists*. So a still-signed-in offboarded user (cookie valid ≤7d) could `POST /api/workspace/switch {tenantId}` to re-activate their seat and regain their **old admin/owner role** — reading members, minting invites, changing roles — after the IdP explicitly removed them. Fix: add `eq(tenantMembers.status,"active")` to both gates (only `active`/`deprovisioned` are ever written, so this is exact). *(api/_utils/session-with-tenant.ts, api/workspace/_handlers/switch.ts)*
- **S4 (paired correctness) — re-invite must reactivate.** `accept-invite`'s existing-seat branch set only `isActiveTenant:true`, leaving `status='deprovisioned'` — which (post-S3) would lock out a user who accepted a valid admin re-invite. Fix: also set `status:"active", deprovisionedAt:null, role:invite.role` (a re-invite grants the inviter's chosen role, not the stale prior one). Test updated to assert the full reactivation. *(api/workspace/_handlers/accept-invite.ts)*

Build (`tsc -b`) + 412 tests green.

### Auth boundary second-pass — 2 hardening fixes (S1, S2)
Re-audited the auth/session boundary now that all marketplace + store endpoints exist. **Verified SOUND for the critical classes** — no cross-tenant access, privilege escalation, or auth bypass. Cookie hardening (HttpOnly/SameSite=Lax/Secure, 7-day TTL, ≥32-char secret), OAuth state CSRF, IDOR ownership checks on every store mutation, no body-supplied-identity trust, and `enforceSameOrigin` coverage on every state-mutating handler all confirmed. Two hardening gaps fixed:

- **S1 (HIGH) — rate limit defeated by a spoofed `X-Forwarded-For`.** `clientIp` keyed on `x-forwarded-for.split(",")[0]` — the LEFTMOST, client-controlled value. An attacker rotates `X-Forwarded-For: <random>` per request → a fresh bucket every time → brute-force/mailbomb limits (auth-password 10/min, sign-up 3/min, password-reset) fully bypassed. Fix: prefer `x-real-ip`, else take the LAST XFF hop (the real client IP the platform proxy appends). TDD: `rate-limit.test.ts` (3) — spoofed leftmost still limited by constant rightmost; x-real-ip preferred; distinct IPs isolated. *(Note: still per-instance in-memory — a shared store, KV/Upstash, is the full fix and stays a known limitation; the keying fix removes the trivial bypass.)*
- **S2 (MEDIUM) — `enforceSameOrigin` missing-Origin allowance keyed on `NODE_ENV`.** A request with no `Origin` header was allowed whenever `NODE_ENV !== "production"` — but public Vercel *preview* deployments don't set `NODE_ENV=production`, so this silently disabled the CSRF layer on every preview URL. Fix: gate the allowance on the explicit `DRAFTHR_DEV_NO_AUTH=1` dev flag (already set in `.env.local`, never on Vercel) — matching `production-auth.ts`'s identical lesson. Previews/prod now fail closed; local dev unchanged. TDD: `request.test.ts` — allowed only behind the flag; fails closed (403) without it even in `development`.

Build (`tsc -b`) + 412 tests green.

### DOCX image fixes — X4 + X5
Cleared the two self-contained DOCX-image queue items.

- **X4 (MEDIUM) — warped letterhead/signature in .docx.** `imageSizeFromElement` fabricated the missing dimension with a fixed multiplier (`height*4` / `width*0.25`), so a letterhead (`max-height:120px`, no width) or signature (`max-height:54px`) was stretched to a 4:1 box regardless of true shape. Fix: new `intrinsicImageSize(bytes)` decoder (PNG IHDR / GIF screen descriptor / JPEG SOF) — `renderImageRun` already has `parsed.bytes` — and `imageSizeFromElement` now derives the missing dimension from the REAL ratio, falling back to the old heuristic only when the format is unparseable. TDD: `docx.intrinsic.test.ts` (5) — PNG/GIF/JPEG decode + null for unknown/webp.
- **X5 (MEDIUM) — webp letterhead silently vanished from .docx.** `inlineImagesForExport` inlines webp (valid for the PDF path) but the DOCX `parseDataImage` can't embed it, and the letterhead `<img>` has empty `alt` → `renderImageRun` returned `""` and the logo disappeared with no trace. Fix: when a `data:image/*` URL can't be parsed and there's no alt, emit a visible `[Image omitted — image/webp not supported in Word export]` placeholder instead of nothing. (Kept webp in the shared inlining allowlist — it's fine for PDF; the fix is at the DOCX consumer.)

Build (`tsc -b`) + 408 tests green.

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
