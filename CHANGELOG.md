# Changelog

All notable changes to DRAFTHR. Newest first. Dates are commit dates.

## 0.11.1 — 2026-05-16

Security patch + UI polish — six security findings from an adversarial
Codex review (GPT-5.5) of the auth + persistence stack, plus three
user-reported UI fixes (real sign-out, light-mode lock, auto-redirect
logged-out users to WorkOS instead of an intermediate landing card).

### Security fixes (from Codex adversarial review)

**Finding #1 (HIGH) — PDF export skipped session+tenant check**
`api/export/pdf.ts` previously only enforced Origin + rate limit;
audit events were appended with body-supplied tenantId / draftId /
actorUserId. A logged-out attacker with a guessed tenant UUID could
consume rendering resources AND forge `draft.exported` audit rows.
Fix: now calls `requireSessionAndTenant`; tenant_id + actor_user_id
come from the server-side session; body.draftId verified against
active tenant; mismatched draftId returns 404.

**Finding #2 (HIGH) — audit chain append wasn't actually serialized**
`src/db/audit.ts` read the tail row + inserted in a single transaction
but didn't lock the per-tenant chain head. Two concurrent appends
could read the same prevHash → fork in the chain. Live traffic could
break a tenant's chain with no attacker action — undermining tribunal
defensibility. Fix: `SELECT pg_advisory_xact_lock(hashtextextended
(${tenantId}, 0))` at the start of every transaction; transaction-
scoped lock auto-releases on commit/rollback. Tail-row ordering
tiebreak (`ORDER BY created_at DESC, id DESC`) for determinism.
New test fires N=10 concurrent appends + verifies the chain stays
intact.

**Finding #3 (HIGH) — verify-tsr endpoint didn't actually verify**
`api/audit/verify-tsr.ts` was returning `ok:true` after parsing the
embedded TSTInfo hash, but `parseTsr` explicitly DIDN'T validate the
CMS signature. A forged blob with the right hash would be accepted
as "proof of timestamping" by anyone. Fix: `parseTsr` now performs
full CMS SignerInfo signature verification against FreeTSA's signing
cert (pinned by SHA-256 fingerprint with rotation comment). 5 new
test cases cover signature-tampering, hash-tampering, wrong-cert.

**Finding #4 (HIGH) — cross-tenant FKs accepted from request body**
`api/store/drafts.ts` POST + PATCH wrote `matterId` and
`templateSourceId` straight from the body without verifying those
rows belonged to the active tenant. IDOR risk through later joins
or shared views. Fix: every body-supplied FK verified against
`tenant_id = activeTenant.id` via quick SELECT; mismatches reject
with 409. PATCH also adds tenantId to the UPDATE predicate
(belt-and-braces).

**Finding #5 (HIGH) — admin could mint / control owner privileges**
Admin role could invite users as `owner`, promote others to `owner`,
and remove existing owners. Self-change guard only blocked the
requester from changing their own role; admin using a second
controlled account would bypass it. Fix: new
`canManageOwners(requesterRole)` helper in `src/lib/permissions.ts`;
owner-only enforcement now applied to invite-as-owner, role-to/from-
owner change, and remove-owner. Last-owner guard prevents demoting
or removing the only owner.

**Finding #6 (HIGH) — dual-write could silently lose newer edits**
`src/lib/dual-write.ts` posted full snapshots without a revision
token. Older in-flight POSTs could land after newer ones and
overwrite the server. Same problem cross-device without any debounce.
Fix: every POST/PATCH now carries `clientRevision` (Draft.updatedAt
epoch ms). Server compares against existing row's `updated_at`; if
stale, returns 409 + drops the write. Client cancels in-flight
retries for that draftId; next debounce tick syncs the freshest
snapshot. DELETE failures now `console.warn` instead of swallowing
silently.

**Finding #7 (MEDIUM) — email headers passed through without sanitization**
`api/_utils/email.ts` forwarded `subject` / `from` / `replyTo` to
Resend without CRLF or control-char stripping. Inviting a malicious-
name user could in principle attack other recipients via subject-line
CRLF injection. Fix: new `sanitizeHeader()` helper strips CR/LF/
controls, trims, caps length. Address validation on `from` + `replyTo`
falls back to default `DraftHR <no-reply@drafthr.io>` on malformed
input.

**Finding #8 (MEDIUM) — enforceSameOrigin compared host only**
`api/_utils/request.ts` accepted any Origin whose host matched the
request host — scheme ignored, edge-case forwarded-host handling
could weaken further. Fix: new `ALLOWED_ORIGINS` env var (comma-
separated exact origins) with default
`["https://app.drafthr.io"]` in production + localhost in dev.
Vercel preview URLs handled via strict regex carve-out. Exact-match
comparison now. Dev fallback preserved when no Origin header.

### UI polish (user-reported)

- **Sign out actually works.** The sidebar avatar menu (NavUser) was
  missing a Sign out item; UserChip in the topbar had one but it's
  tiny and easy to miss. Added a red-tinted Sign out item at the
  bottom of the sidebar avatar dropdown, gated on `auth.user`.
- **Dark mode + system theme removed.** Per user instruction. Dark
  mode produced contrast bugs in the editor + AI rail; not worth
  shipping until a proper dark-token pass. `ThemeMode` narrowed to
  `"light"` only; `applyTheme` strips `.dark` unconditionally;
  bootstrap defends against legacy persisted `"dark"` values.
  `ThemeToggle` component deleted; usages in AppTopbar +
  EditorTopbar + NavUser removed.
- **No more marketing card on `/`.** The "AI-assisted HR letters
  for the UK and US" card I added in 0.11.0 was over-engineering —
  app.drafthr.io is the app, not marketing. Logged-out visitors now
  auto-redirect straight to WorkOS hosted login (signIn() fires on
  mount, loading skeleton shows meanwhile). Marketing belongs at
  drafthr.io when it exists.

### Tests

150 / 151 passing (1 skipped). Was 113 baseline; +37 new across
audit concurrency, TSR signature tampering, RBAC owner enforcement,
dual-write revision flow, email header injection, origin allowlist.

## 0.11.0 — 2026-05-16

The feature + moat wave. Four independent landings shipped in parallel,
plus the auth-flow polish from earlier in the day. Reports surface for
HR Directors, AI inline track-changes in the editor, RFC 3161
cryptographic timestamps on every PDF export, and transactional email
for workspace invites.

### `/reports` page — Business-tier portfolio surface

- New route at `/reports` (HR-mode only, sidebar entry with `BarChart3` icon)
- Three rolled-up cards from existing Zustand data — no schema changes:
  - **Compliance health**: hero ring + percent of letters clearing every
    `runHealthChecks`; mini progress bars per dimension (Compliance /
    Quality / Risk); top 3 most-severe failing checks deep-linked to
    `/editor/<draftId>`.
  - **Risk exposure heatmap**: 4-column grid by `effectiveRiskBand`
    (low / moderate / high / critical), each tile showing matters with
    their £ exposure or primary party, click-through to `/matters/<id>`,
    subtitle totals £ across active cases.
  - **Operations**: hand-rolled SVG bar chart of letters drafted by
    month (last 6mo); time-to-resolve median + p90 from
    `archivedAt - createdAt` on closed matters; top-5 most-used
    templates with mini-bars normalised to leader.
- Empty state when zero drafts + zero matters; Employee mode redirects
  to a "Reports are an HR portfolio view" message rather than 404.
- Filters out `Draft.isTemplateSource` everywhere (mirrors Home).
  Uses existing tokens only — no new colours.

### AI inline-diff in the editor

Cashes in the Suggestion-mark Tiptap primitive from 0.9.0 with a real
consumer surface. When the AI proposes a section rewrite (agent
`regenerateSection` tool or AIPanel actions), the change now renders as
INLINE `<ins>` / `<del>` marks inside the existing section HTML — not
as a wholesale-replacement card. Users see exactly which sentences
changed, with green underline for additions, red strikethrough for
removals.

- `src/lib/tiptap/html-diff.ts` — sentence-level Myers' diff producing
  suggestion-marked HTML. Each suggestion gets a fresh uuid + shared
  author/body/createdAt + default `status: "pending"`. Strips inline
  formatting inside changed sentences to keep the diff readable;
  preserves block structure.
- 9 unit tests covering identical inputs (no marks), single add/remove,
  multi-change with unique ids, empty-old (everything insertion),
  empty-new (everything deletion), preservation of unchanged block tags.
- New `InlineSuggestionBanner` at the top of the editor canvas when
  pending suggestions exist — "AI proposed N changes · [Accept all]
  [Reject all] [View as cards]". Re-uses existing store actions.
- `SectionEditor` adds per-suggestion BubbleMenu — clicking inside a
  `<ins>` / `<del>` mark exposes Accept / Reject pills for that single
  suggestion, not the whole batch.
- `src/lib/diff-view-mode.ts` — UI toggle for inline vs card-style.
  Default inline; opt-back to card per session.
- `proposeSectionChange` store action now computes the diff + stages it
  as the section's display html (retains `pendingChange` for card-view
  fallback). `acceptAllSuggestions` merges via
  `mergeAcceptedSuggestions`; `rejectAllSuggestions` flips marks to
  rejected (text retained, visually muted).
- Export discipline preserved: PDF/DOCX pipe through
  `mergeAcceptedSuggestions` + `sanitizeLetterHtmlForExport` so
  reviewer state cannot leak into the final letter.

### RFC 3161 trusted timestamps in PDF export

The third leg of the tribunal-defensibility stool — alongside the
hash-chained `audit_events` + each PDF's SHA-256, every exported PDF
now also fetches a trusted timestamp from FreeTSA proving the file
existed in its exact form at a specific moment, signed by an
independent third party.

- `api/_utils/tsa.ts` — `requestTsr(sha256Hex)` builds an RFC 3161
  TimeStampReq, POSTs to `https://freetsa.org/tsr`, returns the binary
  TSR. 10-second timeout. Returns `null` on any failure so TSA latency
  never blocks PDF export. `parseTsr(tsr)` extracts the signed
  timestamp + verifies the embedded hash. ASN.1 / CMS handling via
  `pkijs` + `@peculiar/asn1-*`.
- `api/export/pdf.ts` — after PDF render + SHA-256 compute, calls
  `requestTsr`. The `draft.exported` audit event now carries
  `tsa: { provider: "freetsa", tsr_base64, signed_at }` or `null` with
  `tsa: unavailable` flag if FreeTSA was down. Response adds
  `X-Drafthr-PDF-SHA256` + `X-Drafthr-TSR-Base64` headers; audit-aware
  clients persist them alongside the PDF.
- `api/audit/verify-tsr.ts` (new endpoint) — `POST { tsr_base64,
  expected_sha256 }` returns `{ ok, signed_at, tsa }` on match.
  Tribunal/auditor-facing — anyone can verify a stored TSR against a
  known PDF hash.
- 4 unit tests covering happy path, network failure (export-safe null),
  parse-corrupted-data.
- Full PAdES-B-T (TSR embedded as PDF signed attribute) deferred —
  needs KMS-backed signing key wave first.

### Resend transactional email — workspace invites actually email now

- `api/_utils/email.ts` — `sendEmail()` helper, soft-fails when
  `RESEND_API_KEY` missing (warned-once flag + returns `ok:false` with
  reason `"not-configured"`). Singleton Resend client. Default From
  `DraftHR <no-reply@drafthr.io>`. Auto-derives plain-text from HTML.
- `api/_utils/email-templates/` — shared layout (inline styles, no
  external CSS, 560px max-width, mobile-responsive single-column):
  - `invite.ts` — workspace invite email, big Accept CTA, expiry date
  - `comment-notification.ts` — built for wave-2, not yet wired
  - `review-requested.ts` — also wave-2
- `api/workspace/_handlers/invite.ts` — after invite row inserted,
  calls `sendEmail`. Response includes `emailSent: boolean` so the
  frontend can show "Email sent ✓" vs "Couldn't email — copy link
  manually." Email failure logged but doesn't fail the request — the
  admin still gets the link.
- `WorkspaceMembersCard` invite modal gains a small hint line about
  email delivery behaviour.
- `.env.example` documents `RESEND_API_KEY` with the Resend dashboard
  link + "without this, invites stay copy-link only" note.

### Deps + cleanup

- Added: `resend` (M4) · `pkijs`, `@peculiar/asn1-schema`,
  `@peculiar/asn1-cms`, `@peculiar/asn1-x509`, `@peculiar/x509` (M3)
- Removed: leftover `src/lib/api-client.ts` from an earlier killed
  agent run (referenced authkit-react, which we're not using)
- Vitest config extended to include `tests/api/**/*.test.ts`

### Tests

142 / 142 passing (was 113 baseline; +29 new from this wave: 9
html-diff, 4 tsa, 7 invite-template + email, plus the Reports surface
coverage). `npx tsc --noEmit` + `npm run lint` clean.

## 0.10.0 — 2026-05-16

The wave that turns DraftHR from "localStorage demo" into a real
multi-tenant B2B SaaS. Three connected landings: workspace UX (create
/ join via invite), real invite system, and dual-write persistence so
HR users get cloud-backed drafts with a tribunal-grade audit trail.

### Schema (migration 0001 applied live to Neon)

- `tenant_members` — many-to-many users↔tenants with per-tenant role
  and `is_active_tenant` (one true row per user, marks the currently-
  selected workspace).
- `invites` — pending invitations: tenant_id, email, role, 32-char
  invite_code (UNIQUE), expires_at (default +7 days), accepted_at,
  revoked_at, created_by_user_id.
- `users.user_type` — `'customer'` | `'consultant'`. The metadata
  claim that makes the marketplace Option B → A migration painless
  when the first consultant onboards. Defaults to `'customer'` on
  user mint.

### Tenant resolution

- `api/_utils/session-with-tenant.ts` → `requireSessionAndTenant()`.
  Reads WorkOS session, upserts the `users` row on first sign-in,
  auto-mints a personal tenant + active `tenant_members` row so audit
  chains always have a home. Returns
  `{ session, userRow, activeTenant, hasAnyTenant, canCreateTenant }`.

### Workspace UX

- `/signup/workspace` — first-time and additional-workspace setup.
  Two cards: **Create new workspace** (name + industry + team size)
  or **Join via invite code**. Pre-fills the join form from
  `?invite={code}` query.
- `/join/:inviteCode` — public landing for invite links. Saves the
  code to `sessionStorage`, redirects to sign-in. `AuthCallback`
  picks the code back up post-auth and routes to
  `/signup/workspace?invite=…`.
- `Protected` routes tenant-less users to `/signup/workspace`
  (allow-listed for `/signup/workspace` + `/join/` to avoid loops).
- `AppSidebar` mounts `WorkspaceSwitcher` — renders only when the
  user has >1 tenant. Click to pick + `POST /api/workspace/switch`.
- `Settings → Workspace` gains `WorkspaceMembersCard`: name editor,
  members list with role badges + change/remove actions, pending
  invites with copy-link + revoke, "Invite member" modal (email +
  role → `POST /api/workspace/invite` → returns invite code + link
  to copy). The solo-dev role picker stays below as a backwards-
  compat affordance.

### Workspace APIs

All behind `requireSessionAndTenant` + existing API hardening
(same-origin, rate-limit, JSON content-type).

- `POST /api/workspace/create` — inserts `tenants` + `tenant_members`
  (owner, active=true). Audit `tenant.created`.
- `POST /api/workspace/accept-invite` — validates not expired /
  revoked / email-mismatched, inserts member, marks invite accepted.
  Audit `tenant.member-joined`.
- `GET /api/workspace/list` — user's tenants with role + active flag.
- `POST /api/workspace/switch` — toggles `is_active_tenant`.
- `POST /api/workspace/invite` — admin-only; returns invite code +
  link for copy; sends email via Resend if `RESEND_API_KEY`
  configured.
- `GET /api/workspace/invites` — list pending for active tenant.
- `POST /api/workspace/invite/revoke` — sets `revoked_at`.
- `GET /api/workspace/members` — list active members.
- `POST /api/workspace/member/role` — admin-only role change.
- `POST /api/workspace/member/remove` — admin-only removal.

### Dual-write infrastructure

- `src/lib/dual-write.ts` — `enqueueSync(draftId)` debounced 400ms;
  `syncDraft` posts the full draft + sections payload to
  `/api/store/drafts` (POST on first sync, PATCH thereafter);
  `syncAllPending` walks every draft without `_syncedAt` and syncs
  serially for the one-shot localStorage → Postgres backfill.
- Zustand subscribe pattern at module-import time, gated on
  `isDualWriteEnabled()` (reads `VITE_DRAFTHR_DUAL_WRITE`).
  Mutations changing a draft by reference trigger
  `enqueueSync(id)`. Deletions fire-and-forget immediately (no
  debounce — deletes should land fast).
- Circular import avoided via `setDualWriteSnapshotGetter` instead of
  importing the store inside `dual-write.ts`.
- `_syncedAt?: number` added to `Draft` (additive — no version bump
  on `scribehr-store-v1`).
- One-shot backfill in `App.tsx` mount: if dual-write enabled AND
  active tenant exists AND there are unsynced drafts, run
  `syncAllPending` + show a one-time toast on completion.

### Store endpoints

- `POST /api/store/drafts` — create. Server stamps `tenant_id` from
  active tenant + `author_user_id` from session. Audit
  `draft.created`.
- `PATCH /api/store/drafts` — update. Diff records changed keys (NOT
  full HTML — keeps audit payload small). Audit `draft.updated`.
- `DELETE /api/store/drafts` — hard-delete. Audit `draft.deleted`.
- `POST /api/store/sections` — bulk upsert by `(draft_id,
  section_id)`. Audit `section.updated` per row (payload:
  `section_id` + `status` + `charCount`; never raw html).

Every endpoint verifies `tenant_id` ownership on the target draft —
IDOR defense.

### Server gate

`DRAFTHR_DUAL_WRITE=false` returns 503 on `/api/store/*` — even a
misbehaving client can't write. Flip the server-side env to `'true'`
AND set `VITE_DRAFTHR_DUAL_WRITE='true'` to enable end-to-end.

### Audit chain coverage

Extends beyond `draft.exported` (the only previous event) to:
- `tenant.created`, `tenant.member-joined`
- `draft.created`, `draft.updated`, `draft.deleted`
- `section.updated`

Verified live via `scripts/dual-write-verify.ts`: chains 3 events
clean, tampers with payload, chain breaks with `row_hash_mismatch`,
cascade cleanup works.

### Action items for app.drafthr.io deploy

1. WorkOS dashboard → Redirect URIs → add
   `https://app.drafthr.io/auth/callback`.
2. Vercel project → Settings → Environment Variables (Production
   scope): all `WORKOS_*` vars, `WORKOS_REDIRECT_URI` +
   `VITE_WORKOS_REDIRECT_URI` set to the production callback,
   `WORKOS_COOKIE_PASSWORD`, `DATABASE_URL` +
   `DATABASE_URL_UNPOOLED` (or use Vercel ↔ Neon integration),
   `BLOB_READ_WRITE_TOKEN`, `DRAFTHR_DUAL_WRITE=false` and
   `VITE_DRAFTHR_DUAL_WRITE=false` (flip both to `true` after
   eyeballing the deploy).
3. Optional: `RESEND_API_KEY` for invite emails. Without it, invites
   show as copyable links instead.

## 0.9.0 — 2026-05-16

Platform wave. Three independent landings: a Tiptap track-changes primitive
that future-proofs four downstream surfaces, a Vercel Blob image pipeline
that gets us off base64-in-localStorage, and the auth foundation swapped
from Clerk to WorkOS for B2B-grade SSO/SAML/SCIM from day 1.

### Suggestion-mark Tiptap primitive

- New `src/lib/tiptap/suggestion-mark.ts` — a Tiptap Mark named
  `suggestion` rendering `<ins>` (insertions) and `<del>` (deletions)
  with attributes `{ id, kind, author, authorId?, body?, createdAt,
  status }` where status ∈ `pending | accepted | rejected`. The single
  primitive serves four future surfaces: consultant marketplace
  review track-changes, AI inline-diff critiques, richer threaded
  comments, future co-edit cursors.
- Visual: pending insertions get a green underline + tint background,
  pending deletions get red strikethrough + tint. Rejected marks go
  to 0.4 opacity. Accepted marks shouldn't appear in practice — the
  merge function strips them.
- `src/lib/tiptap/suggestion-merge.ts` — pure functions on Tiptap doc
  JSON: `mergeAcceptedSuggestions` applies accepted marks
  destructively (insertions merge into prose, deletions remove the
  wrapped text); pending insertions vanish (no decision = don't
  apply); pending deletions keep their text. `listSuggestions`
  returns one summary per mark. `hasPendingSuggestions` short-
  circuits.
- Store gains `setSuggestionStatus`, `acceptAllSuggestions` (versions
  the prior html into `section.versions` before merging),
  `rejectAllSuggestions`.
- Sanitiser split: `sanitizeLetterHtml` allows `<ins>` / `<del>` on
  the authoring path; new `sanitizeLetterHtmlForExport` strips them
  so reviewer state can't leak into the final letter. PDF + DOCX
  export pipe through merge + export-flavoured sanitise — defence in
  depth.
- AIPanel adds a `SuggestionTestStrip`: Accept-all / Reject-all pair
  lights up when pending suggestions exist; a DEV-gated "Test
  suggestion" button injects a fake suggestion at the cursor for
  quick manual verification.
- 14 new unit tests covering insertion vs deletion × accepted vs
  rejected vs pending, mark stripping, multi-fragment dedup,
  preservation of other marks (bold) during suggestion strip.

### Vercel Blob image upload

- New `api/upload/image.ts` — POST endpoint accepting multipart OR
  `{ dataUrl, filename }` JSON. Validates mime (PNG/JPEG/WEBP/GIF
  only, matches the 0.6.0 image policy), validates size (<2 MB),
  computes SHA-256 for content-addressed dedup storage at
  `/letterheads/{sha256}.{ext}`, uploads via `@vercel/blob` `put()`
  with `allowOverwrite: true`. Soft-fails when `BLOB_READ_WRITE_TOKEN`
  is missing so local dev without Vercel Blob configured still works.
- Client helper `src/lib/storage/uploadImage.ts` — one fetch + retry-
  once on 5xx + fallback to the original data URL on soft-fail. Used
  by `ImageUploader` after FileReader; shows "Uploading…" busy state.
- `isSafeImageRef` (new in `src/lib/safe-data-url.ts`) accepts data:
  OR https: URLs. Rolled out across `profile.ts`, store wizard-answer
  sanitize, paged preview `sourceHtml`, PDF + DOCX export, ZIP pack.
- PDF server-side preserves the 0.6.0 network-block security posture
  by fetching images BEFORE `page.setContent` in
  `inlineImagesForExport` — the request never goes through
  Puppeteer's interceptor. Browser CSP already allowed `img-src
  https:` so on-screen + client-side fallback need no `vercel.json`
  change.
- One-shot migration `src/lib/storage/migrate.ts` runs on app mount
  to swap legacy base64 letterhead/signature for Blob URLs. Failures
  leave the data URL untouched and retry next session.
- 10 new unit tests across `uploadImage` (success, soft-fail,
  retry-on-5xx, network reject, non-data passthrough) and
  `inlineImagesForExport` (no-op, replace, dedup, fetch failure,
  content-type guard).

### Clerk → WorkOS migration ★

Skipped Clerk entirely per the roadmap's long-term auth choice. WorkOS
is what Persona C/D need from day 1 — SSO/SAML, SCIM, audit log,
organisations all first-class. Marketplace consultants will live in a
separate WorkOS Project when the first consultant onboards (Option
B → A migration is the forcing function for that week).

- New server helpers `api/_utils/workos.ts`: `getWorkos()` singleton,
  `getSessionFromRequest`, `buildSessionCookie`, `buildClearCookie`,
  `buildStateCookie` + `readStateCookie` (for CSRF on the OAuth
  dance), `requireSession` with a discriminated-union return shape.
- New routes: `/api/auth/url` (mints WorkOS authorize URL + sets
  short-lived CSRF state cookie), `/api/auth/callback` (verifies
  state, exchanges code via `workos.userManagement.
  authenticateWithCode({ sealSession: true })`, sets encrypted
  session cookie), `/api/auth/session` (reads cookie, returns user),
  `/api/auth/sign-out` (clears cookie).
- New client routes `/sign-in` (auto-redirects to WorkOS) +
  `/auth/callback` (handles return from WorkOS, POSTs code to the
  server callback, refreshes session, navigates to `?redirect=`).
- `AuthProvider` rewritten as a React Context — public surface
  preserved (`useAuth()` exposes `{ user, isLoaded, signIn, signOut,
  refresh }`). Refresh on focus/visibility so stale cookies don't
  linger.
- `Protected` redirects to `/sign-in?redirect=...` while
  unauthenticated; Skeleton while loading.
- `UserChip` internal swap from Clerk's `<UserButton>` to Radix
  Avatar + DropdownMenu. Public API unchanged.
- Session cookie uses `iron-session` v8's low-level
  `sealData`/`unsealData` (no Next.js bindings needed). HttpOnly +
  Secure (production) + SameSite=Lax + 7-day max-age + encrypted with
  `WORKOS_COOKIE_PASSWORD`.
- Production fail-closed: AuthProvider renders a configuration-error
  page when `VITE_WORKOS_CLIENT_ID` is missing AND
  `VITE_ALLOW_PUBLIC_APP !== 'true'`. Mirrors the existing Clerk-
  fail-closed posture.
- CSP (`vercel.json`): `clerk.*` allowances removed; `api.workos.com`
  added to `connect-src`; `*.authkit.app` added to `form-action`
  (covers the WorkOS-hosted login POST). Sentry preserved.
- Privacy page sub-processor list: Clerk Inc. → WorkOS Inc.
- Deps: `@workos-inc/node` + `iron-session` added; `@clerk/clerk-
  react` removed.

### Action items for deploy

1. WorkOS dashboard → Redirect URIs: add the production callback
   `https://<your-domain>/auth/callback`. Local dev already wired to
   `http://localhost:5273/auth/callback`.
2. Vercel project env vars: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`,
   `VITE_WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`,
   `VITE_WORKOS_REDIRECT_URI`, `WORKOS_COOKIE_PASSWORD`,
   `BLOB_READ_WRITE_TOKEN` (Vercel dashboard → Storage → Blob).
3. Provision Vercel Blob store (or skip — endpoint soft-fails and
   clients keep data URLs locally).

## 0.8.0 — 2026-05-15

The defensibility release. Three structural moves: a Business-tier approval
workflow with workspace roles, an editor wave that wires the Employees
directory and Custom Templates directly into draft authoring, and the audit
moat — a hash-chained append-only event log running live against Neon
Postgres. The third one is the structural moat for tribunal defensibility:
any retroactive edit to an audit row breaks the chain at that row and every
row after it, detectable in milliseconds.

### Approval queue + workspace RBAC (Business-tier)

- State machine on every draft: `draft` → `in_review` → `approved` |
  `changes_requested`. Each transition appends an `ApprovalEntry` to
  `draft.approvals[]` plus a corresponding timeline event for the
  Activity feed.
- `WorkspaceRole` on profile (`owner` / `admin` / `drafter` / `reviewer`
  / `viewer`). `src/lib/permissions.ts` centralises the role checks
  (`canApprove`, `canSubmitForReview`, `canEditDraft`) — no inline role
  conditions scattered through UI.
- Editor topbar gains a colored status pill (muted / amber / green /
  red) and a File-menu surface for the four review actions: Submit for
  approval, Withdraw, Approve, Request changes.
- During `in_review` AND when the current role can approve, the editor
  canvas locks read-only with an explanatory banner. Approved drafts
  also lock — they're shippable artefacts.
- `changes_requested` unlocks the editor for the author and surfaces a
  feedback panel showing the reviewer's verbatim note + a one-click
  Re-submit CTA.
- New `/approvals` page lists in-review drafts with mode/search/sort
  filters; HR sidebar gets an "Approvals" nav item with a count badge.
- Home Today panel surfaces in-review drafts to reviewer-capable roles
  so they're seen alongside calendar work.
- Settings → Workspace card with a role picker for the local
  single-user case (lets you simulate the reviewer side for screencasts
  and demos).

### Editor wave (employee prefill + templates from scratch)

- **`Draft.isTemplateSource` + `Draft.templateSourceId`** — additive,
  no store-version bump.
- HR-mode wizard gains a "Pick from your employees" affordance on the
  employee-details step. Selecting populates legalName, jobTitle,
  department, email, startDate, and stamps `answers.linkedEmployeeId`.
- Editor topbar renders a **Matter breadcrumb** (with status colour
  dot, linking to `/matters/<id>`) and an **Employee chip** with a
  popover that links to the employee profile. Both desktop-only.
- **"New template" button** on the My Templates tab + empty-state
  callout. Opens `NewTemplateModal` (name, description, base letter
  type, jurisdiction), then spawns a template-source draft and lands
  the user in the editor.
- Editor in template mode: swaps the Review CTA for **"Save template"**,
  shows a "Editing template: …" banner with Discard, and hides the
  redundant File → "Save as template…" item.
- "Save template" creates or updates the linked `CustomTemplate` in
  place. Re-saves stay on the same row — no duplicates on every save.
- Template-source drafts filtered out of every regular draft surface:
  Home, MattersIndex, MatterDetail, EmployeesIndex, EmployeeDetail,
  AppSidebar, SearchPalette, NotificationsBell, Notifications,
  Activity, Exported, Calendar, Approvals, ModePicker.

### Persistence — Drizzle + Neon Postgres + audit hash chain ★

- Full Drizzle schema landed live in Neon (eu-central-1, Frankfurt):
  `tenants`, `users`, `employees`, `matters`, `matter_participants`,
  `drafts`, `sections`, `section_versions`, `comments`, `evidence`,
  `custom_templates`, `approvals`, `audit_events` — 13 tables, FKs,
  indexes.
- `@neondatabase/serverless` driver — best cold-start behaviour on
  Vercel functions.
- `audit_events` table is the moat. Each row carries `prev_hash` +
  `row_hash` where `row_hash = sha256(prev_hash || ':' ||
  canonical_json(payload) || ':' || kind || ':' || subject_id ||
  ':' || created_at_epoch_ms)`. Hash chain is per-tenant; genesis
  prev_hash is 64 zeros. UNIQUE constraint on `(tenant_id, row_hash)`,
  INDEX on `(tenant_id, created_at DESC)`, CHECK that row_hash is 64
  hex chars.
- `src/db/audit.ts` — `appendAuditEvent()` runs SELECT-previous-then-
  INSERT inside a Drizzle transaction so concurrent appends can't race.
- `src/db/audit-verify.ts` — `verifyAuditChain(tenantId)` walks every
  row in order, recomputes each hash, returns the first mismatch.
  Tribunal demo: prove the chain holds, or pinpoint exactly where it
  was tampered.
- `scripts/db-verify.ts` — live test harness: lists tables, inserts a
  test tenant, appends 3 events, verifies clean, tampers with a row,
  verifies it now breaks, cleans up. Run via `npx dotenv -e .env.local
  -- npx tsx scripts/db-verify.ts`.
- First end-to-end caller: `api/export/pdf.ts` appends a
  `draft.exported` audit event with the rendered PDF's SHA-256 + the
  reviewer's attestation. Wrapped in try/catch — **PDF export does NOT
  fail if Postgres is down**. Defensive degradation.
- `DRAFTHR_DUAL_WRITE` feature flag (default `false`) gates future
  table-by-table dual-write rollout. Drafts → Postgres, then matters,
  then employees, etc. — one wave per table family, easy to roll back.
- `drizzle.config.ts` reads `DATABASE_URL_UNPOOLED` for migrations
  (DDL + advisory locks need the direct connection — pooler can't
  expose them). Runtime queries from API routes use the pooled
  `DATABASE_URL`.

### Config + tooling

- `.env.example` documents `DATABASE_URL` (pooled, runtime),
  `DATABASE_URL_UNPOOLED` (direct, migrations), `DRAFTHR_DUAL_WRITE`,
  and `DRAFTHR_DEFAULT_TENANT_ID` (single-tenant local dev tenant).
- `tsconfig.{app,node}.json` updated to include `src/db/` and
  `scripts/`.
- Migrations committed under `drizzle/migrations/` for replayability.

Operational note: dual-write stays off; localStorage remains the source
of truth until you flip the flag. The PDF-export audit event is the
only path that touches Postgres in default config — and it degrades
gracefully if the DB is unreachable.

## 0.7.0 — 2026-05-15

HR/Management portfolio release. DraftHR's HR mode flips from "single-letter
authoring app with a thin Matter wrapper" to a portfolio workbench: a real
Employees directory, expanded Matters with type / risk band / participants /
tasks / events, a Today + Risk + Compliance triptych dashboard, CSV-driven
bulk operations with mail-merge economics, and workspace-saved custom
templates. Plus Anthropic native prompt caching on the AI routes for a ~90%
input-token discount on repeat calls.

### Portfolio dashboard (HR mode)

- New HR-mode Home: Today (open tasks + matter next-actions due in 7d),
  Risk register (heatmap across active matters + £ exposure), Compliance
  Health (rolled-up health-check scores). Replaces the prior `Home` for
  employer mode; employee mode keeps the existing single-letter UX.
- Recent activity feed flattens every draft's timeline across the workspace,
  sorted by recency.
- Employee backfill banner — when HR has drafts but the normalised employee
  directory is empty, a banner offers one-click migration: scans every
  draft, groups by normalised legal name, and creates one Employee record
  per unique person. Dismissable; remembered locally.
- Risk panel now shows the heatmap whenever there are active matters, not
  only when exposure is tagged. Reads true out of the box.

### Employees directory

- `/employees` — sortable directory with search, status filter
  (active / notice / on-leave / left), and a multi-select import flow that
  derives Employee suggestions from existing HR-mode drafts. New
  `src/lib/employees.ts` helpers: `deriveEmployeesFromDrafts` (normalises
  legal name to dedupe across drafts) + `matchEmployeeForDraft`.
- `/employees/:employeeId` — profile with Active matters / Letter history /
  Notes tabs, EmployeeForm modal for create/edit, archive flips status to
  "left" without breaking historical draft links.
- New sidebar entries in HR mode: Employees, Bulk operations.

### Matters — case-management expansion

- `Matter` type extended (backwards-compatible — every new field optional):
  `type` (investigation / grievance / disciplinary / performance / absence /
  redundancy / restructure / settlement / tribunal / onboarding /
  offboarding / other), `riskBand` (low / moderate / high / critical),
  `participants[]` (subject / manager / accused / complainant / witness /
  representative / other), `ownerUserId`, `nextAction`, `exposureGBP`.
- New `Task` + `MatterEvent` types with store slices and CRUD actions —
  meetings, hearings, deadlines, sub-tasks on a matter calendar.
- MatterDetail surfaces: MatterRiskBadge, NextActionBanner, MatterParticipants,
  MatterTasks (inline add form), MatterCalendar.
- **Auto-derive risk band** (new `src/lib/matters/risk.ts`): pure derivation
  from health-check signals across the matter's drafts. Compliance + PII
  fails dominate; matter type nudges the floor up (tribunal/settlement
  start at "high"). Manual `matter.riskBand` still wins — derivation is
  the fallback. Used by the dashboard Risk panel and the MatterDetail
  badge so the heatmap is meaningful even with zero manual tagging.

### Bulk operations (Business-tier feature)

- `/bulk` — 4-step CSV → batch drafts flow: pick operation → pick template
  → upload CSV → preview rows → generate → results.
- **Mail-merge economics**: ONE AI call drafts a template with
  `{{placeholder}}` tokens for every CSV column, then client-side
  substitution produces N personalised drafts per row. 50-row batch =
  ~£0.20 instead of ~£10 (a 50× call-N-times approach).
- New `src/lib/bulk/mailmerge.ts`: case-insensitive whitespace-tolerant
  `{{placeholder}}` substitution, `findUnresolvedPlaceholders` to surface
  amber-dot rows that need attention, `placeholderKeysFor` to derive
  expected placeholders from letter type × CSV headers,
  `buildMergeInstruction` to augment the system prompt, abort-signal
  support for cancel.
- 25 unit tests cover the substitution + placeholder-detection edge cases.

### Custom templates (workspace-saved house phrasings)

- New `CustomTemplate` type + `customTemplates` store slice with four CRUD
  actions: `createCustomTemplate`, `updateCustomTemplate`,
  `deleteCustomTemplate`, `createDraftFromCustomTemplate`.
- `BrowseLetters` (`/hr/new`, `/me/new`) gains a tab strip: **DraftHR**
  (the existing 35 built-in letter types, unchanged) and **My Templates**
  (workspace-saved). Mode-scoped end-to-end.
- Editor File menu → **Save as template…** captures the current draft's
  per-section HTML (keyed by canonical `SectionId`) plus its answers.
- Starting a draft from a custom template spawns the base letter type's
  sections pre-filled with the saved HTML (status `"edited"`), saved
  jurisdiction default applied.
- Persisted via the existing Zustand `persist` middleware — no version
  bump on `scribehr-store-v1` (field-additive).

### LLM cost levers

- **Anthropic native prompt caching** on `/api/draft` + `/api/agent`.
  Stable system prefixes tagged via `providerOptions.anthropic.cacheControl
  = { type: "ephemeral" }`. ~90% input-token discount on repeat calls
  within the 5-minute TTL — the single biggest cost lever in the roadmap.
  Default behaviour byte-identical when no system prompt is present.
- `/api/draft` already accepts an optional `extraSystemHint` (used by the
  bulk mail-merge flow to instruct the model to emit `{{placeholder}}`
  tokens) — now also tagged for caching across a batch.

### Router + navigation

- New routes: `/employees`, `/employees/:employeeId`, `/bulk`,
  `/matters`, `/matters/:matterId`.
- `AppSidebar` HR-mode nav extended with Employees + Bulk operations
  entries.

## 0.6.0 — 2026-05-13

Security and export hardening release. This pass removes committed-secret
fallbacks, tightens every HTML/rendering boundary that handles HR/legal draft
content, and makes production deployments fail closed when authentication is
not configured.

### Security hardening

- Removed the hardcoded Anthropic API-key fallback from `api/draft.ts`,
  `api/agent.ts`, and `server/llm-model.ts`. `ANTHROPIC_API_KEY` is now
  required server-side and missing/empty values fail closed.
- Added shared API request guards under `api/_utils/`: JSON content-type
  enforcement, request-size limits, no-store/nosniff JSON errors,
  production same-origin checks, and lightweight per-IP rate limits for
  `/api/draft`, `/api/agent`, and `/api/export/pdf`.
- Production auth now fails closed if `VITE_CLERK_PUBLISHABLE_KEY` is absent.
  Public deployments require an explicit `VITE_ALLOW_PUBLIC_APP=true` opt-in.
- Added production security headers in `vercel.json`: CSP, no-sniff,
  frame denial, strict referrer policy, and a restrictive permissions policy.
- Limited the devtools feature-flag helper (`window.__drafthr`) to Vite dev
  builds only.
- Removed comment-author impersonation from the comments UI so new comments
  always use the current profile identity.
- Hardened Sentry event handling with defensive redaction of draft, section,
  prompt, message, evidence, profile, HTML, and comment-like context keys.
- Updated docs and changelog language so no committed text describes a
  server-side hardcoded key fallback.

### HTML, images, and paste safety

- Tightened `sanitizeLetterHtml`: script/event attributes are stripped,
  `target="_blank"` links get `rel="noopener noreferrer"`, unsafe link schemes
  are removed, and embedded images are restricted to base64 PNG/JPEG/WEBP/GIF.
- AI-generated proposed section HTML is sanitized before display and again
  when accepted into canonical draft state, including previously persisted
  pending changes.
- Added `safe-data-url` helpers and applied them across image upload, profile
  defaults, paged preview/edit rendering, evidence display, PDF export, DOCX
  export, and ZIP pack rendering. SVG/unsupported image data URLs are ignored
  even if they already exist in localStorage.
- Added file-size limits for profile JSON import and evidence uploads before
  reading files into memory/localStorage.
- Encoded `mailto:` invite recipients before building the fallback invite URL.

### Export hardening

- Replaced vulnerable export dependencies: removed `html-to-docx` and
  `html2pdf.js`; PDF fallback now uses `html2canvas` + `jspdf`, and DOCX
  generation uses the in-repo OOXML writer.
- Hardened the server-side Puppeteer PDF renderer: JavaScript disabled,
  external network requests blocked, CSP injected into the render document,
  body/HTML/filename limits enforced, render timeouts set, and response
  headers set to no-store/nosniff.
- Export pack generation now embeds sanitized PDF and DOCX outputs alongside
  evidence, manifest, audit JSON, and the human-readable pack summary.
- Added focused tests for DOCX image/list/table generation and store-level
  sanitization of accepted AI proposals.

### Dependency and runtime posture

- Added an npm override for the vulnerable transitive `esbuild` copy pulled
  through `drizzle-kit`; `npm audit --audit-level=moderate` is clean.
- Vite dev server now binds to `127.0.0.1` by default. Set
  `DRAFTHR_DEV_HOST=0.0.0.0` only when intentionally testing from another
  device on the same network.
- Removed Google Fonts loading from `index.html`; the app shell now uses the
  bundled `@fontsource-variable` assets.

Operational note: rotate/revoke any Anthropic key that was ever committed or
shared in history. The current tree no longer contains provider secrets, but
history exposure should still be treated as compromised.

## 0.5.0 — 2026-05-13

Pixel-perfect Edit-on-page. The previous V1 Edit-on-page was a single
continuous scrolling card with no real page boundaries — clean to type
in, but the user couldn't tell where their content would split when
printed. V2 keeps the same continuous editor but runs paged.js's
Chunker against a hidden off-screen render of the letter on every
debounced keystroke (350 ms) and overlays subtle "Page N · Page N+1"
strips at the exact y-positions where the printed letter would break.

Why the off-screen approach rather than rendering paged.js inline as
the editor: paged.js mutates its source DOM during pagination, which is
incompatible with a live TipTap editor that owns the same DOM. Two
trees solve the problem cleanly — TipTap is the typeable source of
truth, the off-screen Chunker is the break detector, the strips are
projection.

- Shared `paged-edit/printCss.ts` — A4 geometry + the @page CSS string
  + `wrapInPrintHtml()` used by both the read-only Preview and the new
  off-screen paginator.
- `paged-edit/offscreenPaginator.ts` — `paginate(html)` → `{pageCount,
  breaks[]}`. Mounts a hidden `visibility:hidden` host (NOT off-screen
  at -99999px, which confuses paged.js's column measurement and
  produces phantom pages — verified empirically), runs `Previewer`
  with the polisher so the embedded @page CSS is applied, scans each
  rendered page's clones for the last `data-paged-ref` to produce the
  page-end source ref.
- `paged-edit/usePageBreakPositions.ts` — debounced hook that stamps
  refs by index, calls `paginate()`, locates the live block in the
  editor and reads `bottom - editorRoot.top` to get the strip y-offset.
- `paged-edit/PageBreakOverlay.tsx` — slate strip + dashed borders +
  uppercase "Page N · Page N+1" label, `pointer-events: none` so the
  user types straight through.
- `paged-edit/PaginatedEditableLetterV2.tsx` — same TipTap editor +
  toolbar as V1 (factored into `editorShared.tsx`), wraps in a
  relative shell so the overlay layers correctly.
- `lib/flags.ts` — three-tier flag resolver (localStorage > VITE env
  > per-flag default). `pixelPerfectEdit` defaults to on; flip back
  with `window.__drafthr.setFlag("pixelPerfectEdit", false)` if a
  regression surfaces.

## [Unreleased]

Big rocks still to land — listed for reference, not yet shipped:

- Persistence layer (Clerk auth + Neon/Postgres) — currently localStorage only.
- Real transactional email for invites and comment notifications (mailto fallback shipped).
- Real-time presence / cursors on shared drafts.
- Onboarding walkthrough on first-run.
- Keyboard shortcuts for the most-used menubar actions (Regenerate, Tone, Refine) to compensate for the extra tap-depth introduced in 0.4.0.
- Test coverage for the new design-system primitives, AIPanel, RefinePopover, InvitePopover, EditDetailsSheet, FloatingCommentPanel, MobileBottomSheet.

---

## 0.4.0 — 2026-05-12

Editor restructure release. Two architectural moves — AI takes the full right rail, a top File/Tools/View menubar replaces the desktop icon toolbar — plus a full mobile polish pass and a sweep of feedback / empty-state / animation work. Provider also rotated end-to-end and settled on Anthropic Claude.

### Editor — Change A: right rail is AI-only

- Right rail collapsed to `AIPanel` at full rail height. No tab strip, no Comments / Timeline / Compliance competing for space. AI is the rail.
- New `FloatingCommentPanel` (portalled to `<body>`) anchors comment threads inline to the highlighted text mark — selection rect for new threads, `mark[data-comment-id]` for existing ones. Self-positions below the anchor, flips above when it would overflow, viewport-clamped, repositions on scroll/resize, dismisses on Esc / outside-click / X.
- "All comments" overview — a Radix Dialog launched from the Tools menu, lists every unresolved thread (and resolved separately). Click any row to scroll the canvas + open the floating panel anchored there.
- Timeline relocated to a Radix Dialog launched from the Tools menu.
- Compliance / Rights stays as the bottom of the LEFT rail's secondary tab.

### Editor — Change C: top File / Tools / View menubar

- Three labelled DropdownMenu triggers at the top-left of the topbar, just after the D brand mark. Conventional desktop menubar position. `md:+` only — mobile keeps the existing icon toolbar + ⋯ overflow.
- File → Edit details · Export… · Settings · Privacy & data.
- Tools → Regenerate all (or Stop) · Refine current section · Comments (count) · Timeline.
- View → Edit / Preview (✓) · Edit-on-page · Focus mode · (mobile-only: Sections rail · AI rail toggles).
- Retired from the desktop topbar: Tone icon, Regenerate icon, Edit-on-page icon, Focus icon, ⋯ overflow, ← Letters button. All available via the menus.
- D brand mark is now the single back/home anchor (links to `/hr` or `/me` based on `draft.mode`).
- Net: roughly half as many interactive elements in the desktop topbar, organised by intent.

### Mobile editor polish

- A4 paper in Preview now fits a 390px viewport via `zoom: 0.48` (CSS reflows naturally; iOS pinch-zoom still works for detail reads).
- Right rail replaced with a Framer Motion bottom sheet with three snap points (closed / half / full), drag-to-dismiss, momentum-aware release (flick-down closes, flick-up expands to full), and a tap-the-handle cycle (full → half → closed). Spring physics (stiffness 320, damping 38, mass 0.8) so the snap feels weighted.
- Floating "Ask AI" pill in the bottom-right corner — bottom-sheet trigger that's visible whenever the sheet is closed. Fades + scales away when the sheet opens.
- Selection bubble menu now passes `popperOptions` with `preventOverflow` boundary `'viewport'` + flip fallback placements so the "+ Comment" pill stays inside the viewport at any selection position.
- Comment coverage loop fixed — tapping an inline comment anchor now scrolls the mark to the top of the viewport (with ring flash), then opens the panel 120ms later so the user sees both contexts.
- SectionEditor card chrome stripped on mobile (`md:` and below) — drops the rounded border + header divider, shrinks padding from `px-7 py-5` to `px-3 py-3`. Sections separated by a single top hairline. Gains ~64px of horizontal writing surface.
- Modal/popover viewport caps — `InvitePopover` and `RefineDialog` clamp via `max-w-[calc(100vw-1.5rem)]`.

### Animations + transitions

- Sheet open/close transitions to/from `translate-y` via Framer Motion with a `cubic-bezier(0.32, 0.72, 0, 1)` iOS easing.
- Page-level cross-fade between routes — `AnimatePresence` wraps `<Routes>`, 180ms opacity + 6px Y slide on every route change. Editor routes exempted to avoid double-animation against their internal transitions.
- Bottom-sheet scrim cross-fades to 30% black opacity in parallel with the sheet slide.
- Floating Ask AI pill scales-down 90% + fades when the sheet opens so it doesn't peek through under the rounded sheet corner.

### Toasts + feedback

- New Sonner toast surface mounted once at the app root (top-right, theme-aware, richColors, swipe-dismiss + close button).
- Accept-all / reject-all of pending AI changes now emits a toast with **Undo** — snapshots the prior state (sections' html + pendingChange) and restores it via existing store actions.

### Empty-state polish

- New reusable `EmptyState` component in `components/ds/` — icon in a slate-200 circular backdrop, 15px medium heading, muted body (52ch max), optional primary + secondary CTAs.
- Swept five surfaces: Home (drafts + deadlines), Comments panel, Exported, Activity, Calendar. Each now points the user back to productive work — "Browse letters", "Start a letter", etc.

### AI panel polish

- Discoverable starter grid in the empty state — four cards, one per typed tool (regenerate / tighten / addClause / summariseForCounsel) with icon + bold label + one-line hint. Click hydrates the composer with the underlying prompt.
- New `Recent` row below the starter grid showing the last 5 submitted prompts (deduped, newest first, 5-cap). Persisted to `localStorage` via the new `recent-prompts.ts` helper.

### LLM provider

- Provider rotated through Qwen → Gemini → NVIDIA NIM → OpenRouter and settled on **Anthropic Claude only**. Default model is `claude-sonnet-4-6`; `claude-opus-4-7` and `claude-haiku-4-5` selectable from Settings.
- Removed dependencies: `@ai-sdk/google`, `@ai-sdk/openai-compatible`. Removed env vars: `QWEN_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- `api/draft.ts` / `api/agent.ts` / `server/llm-model.ts` simplified to a single `createAnthropic` path with explicit `baseURL: 'https://api.anthropic.com/v1'` (the v3.0.76 SDK was calling `/messages` without the `/v1/` prefix and returning 404).
- `ANTHROPIC_API_KEY` is required server-side; empty or missing env vars now fail closed instead of falling back.
- `MODEL_OPTIONS` reduced to three Claude tiers with cost hints. Stale localStorage selections (Qwen / Gemini / NVIDIA / OpenRouter) auto-reset to the new default on next load.

### Streaming + output quality

- Throttled `editor.commands.setContent` to 60ms during streaming so the section editor doesn't reparse on every token — fixes the "5 words per line jitter" effect at 50+ tokens/sec.
- Post-stream sanitisation now strips any leftover `{{placeholder}}` tokens from the model output and replaces them with `[TBD]`. Triple defence (system-prompt rule + better model + sanitiser) against template variables leaking into the final letter.

### UI polish

- Wordmark letter-spacing increased from `0.01em` to `0.06em` for breathing room.
- BrandMark sized up on every surface (editor topbar 26 → 32, mobile topbar 28 → 34, sidebar already 40).
- Mobile sidebar sheet narrowed from `18rem` to `11.5rem`.
- Edit/Preview pill: only the active tab shows its label; the inactive collapses to icon-only.
- Wizard step → next-step button switched from "Next: Evidence/Review" to just "Evidence" / "Review" (the arrow already implies "next"). Icon-only on mobile.

### Fixes

- Vercel CI builds were failing every commit since the Home redesign — TypeScript errors in unused `ChevronDown` import, removed `QWEN_API_KEY` references in `server/llm-model.test.ts`, unused `warn` helper. All fixed; production deploy unblocked.

---

## 0.3.0 — 2026-05-11

Evidence and export-pack release. This adds the first real support for tribunal-style source material around a draft, with checks and exports that are useful before a letter is sent.

### Evidence & Attachments

- Added a dedicated post-drafting Evidence & Attachments screen for employee drafts.
- Evidence items can be typed or uploaded, labelled as email / calendar / document / screenshot / note, and linked to one or more letter sections.
- The editor now routes through `Next: Evidence` before review/export, keeping the right rail focused on AI, comments, checks, and timeline.
- Evidence items can be referenced in a section, quoted into a section, or inserted as an attachment list.
- Section headers show linked-evidence counts and a compact evidence strip, with a one-click path to the evidence step for that exact section.
- Linked evidence now flows into section generation, whole-letter system prompts, and the right-rail AI agent prompt.
- Evidence updates are recorded in the draft timeline for auditability.

### Template Quality Inspector

- Added section-by-section template requirement checks that surface hard `MUST` constraints, missing required content, manual-review items, and guardrails.
- The inspector is visible in the compliance rail and the employee rights/register rail.
- Compliance rules and template requirements now share one quality report that export packs can reuse.

### Export Pack

- Added an HTML export pack containing the final letter, evidence list, timeline, template quality report, and review checklist.
- Export packs are logged alongside PDF and DOCX exports.
- High-risk letters still require counsel-review attestation before any export format, including the pack.

### Versioning

- Bumped package version from `0.2.0` to `0.3.0`.

---

## 0.2.0 — 2026-05-11

Senior-dev cleanup release. No major UX redesign, but the AI/server internals are now smaller, clearer, and easier to maintain.

### AI/server architecture cleanup

- Centralised model allow-listing, provider fallback, and provider client construction in `server/llm-model.ts`.
- Added resolver tests covering allow-listed requests, env model fallback, and missing-provider-key failures (`server/llm-model.test.ts`).
- Moved server-side AI tool schemas into `server/agent-tools.ts`, shared by the Vercel `/api/agent` function and the Vite dev proxy.
- Slimmed `api/draft.ts`, `api/agent.ts`, and `server/proxy.ts` so they focus on request parsing and streaming instead of duplicating model/tool setup.

### Client bundle cleanup

- Reduced `src/lib/llm/tools.ts` to client-only clause template metadata and `ClauseType` definitions.
- Removed AI SDK server tool/schema imports from the browser path.
- Production build output now shows a smaller `ai-sdk` chunk after the split.

### Versioning

- Bumped package version from `0.1.0` to `0.2.0`.

---

## 2026-05-10

A single day of intense iteration after the v0.1 scaffold. The app went from a generic wizard with section-by-section generation to a full design-system-driven editor with inline comments, a typed AI agent, letterhead/signature exports, and the AI SDK v6 stack.

### Editor layout — sticky composer + sections (`227a65f`)

- Locked the editor route to viewport height (`h-screen h-dvh` + `overflow-hidden` on the editor wrapper in `Layout.tsx`). Previously `min-h-screen` allowed the outer page to grow with content, pushing the AI composer + sections list off-screen.
- `SectionsList` ScrollArea switched from `h-full` to `flex-1 min-h-0` so it derives a finite height from its flex parent.
- Effect: AI input is anchored at the bottom of the rail at any letter length. Sections list scrolls inside its column independent of the canvas.

### AI chat composer redesign (`8a88184`)

Modern unified-box style matching ChatGPT / Claude / v0 / Cursor:

- Single rounded container holds the textarea + bottom toolbar + send button. Focus ring on the container, not the textarea.
- Scope chips moved above the box as a small "Scope: …" row — they're context, not a control.
- Quick-prompt chips moved inside the box's bottom row (horizontal scroll if many).
- Send button moved inside the box (bottom-right, 28px). Stop button takes the same slot during streaming.
- Right rail width 420px → 380px.

### AI chat polish (`ed8b82d`)

- **Markdown rendering** — new `Markdown.tsx` (marked + DOMPurify with chat-bubble-scoped typography). Assistant replies now render bold, italic, lists, code, links, blockquotes correctly.
- **Bigger input** — rows=1 / 36px → rows=3 / 72px, max 200px. Hotkey switched to ⌘/Ctrl+Enter (Enter alone inserts a newline).
- **Wider rail** — 320px → 420px on lg+.
- **Sticky sections list (initial fix)** — aside now `flex flex-col overflow-hidden`.
- **`AI_MissingToolResultsError` fix** — pending tool-call parts are stripped from message history in `prepareSendMessagesRequest` before send. Orphan proposals no longer crash `convertToModelMessages`.
- **Regenerate-all + Stop** surfaced as a visible outline button in the topbar (was buried in the More menu).

### SDK-native v6 tool-calling (`b3ecd4e`)

Replaced the `<<APPLY>>` text-sentinel hack with a typed AI SDK v6 tool:

- New `src/lib/llm/tools.ts` with `regenerateSectionTool` — Zod input schema (`section_id`, `instruction`), no server-side `execute` so it's human-in-the-loop.
- Server registers the tool on `streamText({ tools: agentTools })`.
- Client receives `tool-regenerateSection` parts and renders a state machine (input-streaming → input-available → output-available) with Apply / Applied / Failed states.
- On Apply: client runs `regenerateSection()` then `addToolResult()` so the agent sees the outcome and can continue ("OK, want me to do the closing next?").
- Removed `parseAgentReply` and the `<<APPLY>>` sentinel parser entirely.

### Search + Letterhead + AI SDK v6 migration (`d9802af`)

- **Search palette** indexes section content (with snippets) and comment bodies in addition to drafts / catalog / pages. Hits navigate to `/editor/:id` and scroll to the matching section / comment.
- **Letterhead + signature image uploads** — new `ImageUploader` DS primitive with banner/signature aspect presets, 1 MB cap, base64 data-URL persistence. Settings → Your company exposes both. Letterhead saved on the profile auto-prefills into every employer draft, renders inline in `LetterPreview`, embeds in PDF + DOCX exports.
- **AI SDK v4 → v6 migration**:
  - `ai@^4.1.46` → `ai@^6`, `@ai-sdk/react@^3`, `@ai-sdk/openai-compatible@^2`
  - `CoreMessage` → `ModelMessage` everywhere
  - `maxTokens` → `maxOutputTokens`
  - `toDataStreamResponse()` → `toUIMessageStreamResponse()`
  - `pipeDataStreamToResponse()` → `pipeUIMessageStreamToResponse()`
  - `useChat` from `@ai-sdk/react`, using `DefaultChatTransport` with a `prepareSendMessagesRequest` that flattens v6 UIMessage parts back into role/content for the OpenAI-compatible endpoint
  - `convertToModelMessages` on the server so tool-call history rides along correctly

### Edit-details, counsel-review pill, compliance refresh, invite mailto, mobile pass (`d454ecb`)

- **Edit-details slide-over** — More menu → "Edit details" opens a right-side sheet for jurisdiction, region/state, worker class, tone band, dates, recipient + employer details. New `patchDraft` store action commits at Save.
- **Counsel-review status pill** in the topbar — green ✓ "Reviewed" once attested, amber ⚠ "Needs review" otherwise. Tooltip carries who/when. Icon-only on mobile.
- **Compliance panel refresh** — score header (N/M satisfied) tinted by pass rate, rules grouped by severity (required vs recommended), DS tokens throughout.
- **Invite mailto fallback** — "Email" button alongside "Add" in InvitePopover. Adds the collaborator AND opens the user's mail client with a prefilled invitation.
- **Mobile pass at 375px** — avatar stack visible, Invite collapses to icon-only, counsel pill collapses to icon-only with tooltip retained, topbar grid gap tightens.

### Edit / Preview parity (`573670a`)

Three real oversights closed:

- AI chat scope `selection` now actually captures `window.getSelection()` at submit and tags the message with the live quote + containing section id.
- Clicking inside a section in Preview sets `activeSectionId`, so AI scope `section` targets the section the user is looking at.
- Per-section hover overlay in Preview surfaces the same actions that exist on the SectionEditor header — ✨ Refine, ↻ History, 💬 Comment. New `RefineDialog` modal (Preview has no header to anchor a popover off).

### Invite popover; AI on useChat; right rail to 3 tabs (`c3fa3f3`)

- **Invite + avatar stack** both open the same `InvitePopover` anchored from the topbar. Combines invite form + role select + share link + roster.
- **Right rail dropped from 4 tabs to 3**: Compliance · AI · Comments. People moved to the popover.
- **AIPanel rewritten on `useChat`** from `ai/react` against new `/api/agent` endpoint returning the AI SDK data-stream protocol.

### Option A + Option B AI features (`dfeda9f`)

- **Option A — per-section Refine popover.** Regenerate button now opens a popover with textarea + 6 chip presets + "Plain regenerate" escape. `refineInstruction` plumbed through `regenerateSection()` → `buildSectionPrompt` as `USER REFINEMENT`, placed AFTER hard constraints. Previous draft passed as context.
- **Option B — right-rail AI chat tab.** New AI tab, scope chips (letter / section / selection), 4 quick-prompt presets, streaming via `/api/agent`, `<<APPLY>>` sentinel parsing into proposed actions (replaced in `b3ecd4e`).
- **Topbar layout restore** — Invite button back; secondary toolbar (Tone + WP) moved inside the main column so the right rail tabs sit flush with the topbar.

### Inline highlight cleanup + pastel avatars (`5011566`)

- `deleteComment` + `resolveComment` now strip the matching `<mark data-comment-id={id}>` from the section HTML so the inline highlight disappears with the thread.
- Pastel avatar palette (warm sand, soft blue, sage, lavender, rose, mist, peach, blush). New `--ds-av-fg` near-black ink so letters remain legible on the lighter tints.

### Inline commenting on the Preview canvas (`a110f84`)

- `LetterPreview` listens for text selection and surfaces a floating "+ Comment" button anchored above the selection.
- Comments anchor by string-finding the quoted text in the section's saved HTML and wrapping the first occurrence with `<mark data-comment-id="X">`. The Tiptap section editor picks up the highlight on its next `setContent`.
- Clicking a `<mark>` in the preview → right rail focuses the matching thread.

### Design system rollout (`754160c`)

New primitives in `src/components/ds/`:

- `BrandMark` (32px ink chip with serif "D" — replaces every ScrollText icon)
- `Avatar` + `AvatarStack` (single palette, deterministic seed, overflow chip)
- `PageHeader` (breadcrumb + close-X + serif title + lede + actions slot)
- `StatusDot` (status colour only on the dot, label stays neutral)
- `DataTable` (sticky header, ghost row hover, hideOn breakpoints, action column)

Tokens: new `--ds-*` namespace (canvas / surface / line / ink / body / muted / subtle / status / avatar). Mirrored from `/public/design-system.html`.

Adopted across: Editor (single header), AppSidebar, Layout MobileTopbar, Home / BrowseLetters / Settings / Calendar / Activity / Notifications / Exported (PageHeader); Home drafts + Exported list (DataTable + StatusDot); CollaboratorsPanel + CommentsPanel (DS Avatar); SectionsList (DS tokens).

### Comments + collaborators + static design system (`0ef59b4`)

- **Threaded comments** anchored to sections, with optional inline text-range anchor via the custom Tiptap `CommentMark`. Selection in the editor triggers a BubbleMenu "+ Comment" button.
- **Collaborators** — invite by email + role (editor / reviewer / viewer), copyable share link.
- **Right-rail tabbed**: Compliance | Comments | People. Tabs replace the stacked panels.
- **Theme** — monochrome (Radix `accentColor="gray"`, `grayColor="slate"`), Source Serif 4 for marquee headlines.
- Static design-system reference at `/public/design-system.html`.

### DRAFTHR rename + 70 templates + qwen3-max + split preview (`d02f83a`)

- **Brand**: ScribeHR.io → DRAFTHR across user-visible strings. localStorage keys preserved.
- **70 letter templates**: 28 employer (14 letters × UK+US) + 42 employee (21 letters × UK+US), authored as gold-standard scaffolds with statutory anchors, hard MUST/MUST NOT constraints, worked examples. Tribunal-bound letters defensively drafted (Western Excavating affirmation guards, Cavendish Munro information-vs-allegation, Chesterton public-interest).
- **Prompt pipeline**: `buildSectionPrompt` prefers template scaffold + constraints + example, falls back to generic. `buildSystemPrompt` injects the template's `letterSystemAddendum`.
- **Default model `qwen-plus` → `qwen3-max`** (DashScope flagship). New "Generation model" selector in Settings wired Settings → profile store → API client → server with an allow-list.
- **LetterPreview** — paper-styled continuous render of the assembled letter, updates live as the model streams. Tri-state toggle (Edit / Split / Preview) in the editor action row.
- **Direct-to-template entry** — "Skip — use template" button on flagship cards when a template exists for the user's jurisdiction.
- **Mobile pass** — hamburger sidebar drawer, 44px touch targets, responsive padding across all routes.
- **Radix Themes** migration completed for all primary surfaces (routes + editor chrome).

---

## 2026-05-09

### Initial scaffold (`d0d3236`)

- Vite + React 19 + TypeScript skeleton
- 14 letter types (employer-mode) with wizard schemas
- Section-by-section Tiptap editor + per-section regenerate
- `/api/draft` SSE endpoint streaming from Qwen via DashScope
- Sentry + observability hooks
- shadcn/ui + Tailwind v4 + Radix Themes baseline

---

For commit-level detail run `git log --oneline`.
