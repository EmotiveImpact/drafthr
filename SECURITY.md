# DraftHR — Security model & threat notes

Maintained from the `security-board` review. Update when routes, endpoints,
roles, or the auth model change.

## Auth model
- Identity: WorkOS (SSO + password). Session = iron-session cookie
  (HttpOnly, Secure, SameSite=Lax). Verified in `api/_utils/workos.ts`.
- Chokepoint: `requireSessionAndTenant` (`api/_utils/session-with-tenant.ts`)
  validates the session, upserts the local `users` row, resolves the active
  tenant, and **fails closed** (returns 500, never data) on error.
- AI / upload endpoints use `enforceProductionSession`
  (`api/_utils/production-auth.ts`) — now also fail-closed (see below).

## Enforcement verified at runtime (unauthenticated curl, prod)
Every protected endpoint returns 401/403 to an anonymous caller. The only
`200` without a session is `GET /api/marketplace/listing` — the intentionally
public marketplace listing, which returns **published consultant cards only,
no PII**. Re-run the sweep in the security-board skill's
`references/runtime-verification-cookbook.md` after any routing change.

## Access-control matrix (intended)
| Surface | signed-out | no-role | employer | employee | consultant | admin |
|---|---|---|---|---|---|---|
| `/hr*` | deny | deny | allow | deny | deny | — |
| `/me*` | deny | deny | deny | allow | deny | — |
| `/c`, `/c/*` | deny | enroll | deny | deny | allow | — |
| `/matters`,`/employees`,`/bulk`,`/approvals`,`/reports*` | deny | deny | allow | deny | deny | — |
| `/bookings` | deny | deny | allow | deny | deny | — |
| `/consultants` | deny | deny | allow | deny | allow | — |
| `/editor/*`,`/settings`,`/calendar`,`/exported`,`/activity`,`/notifications` | deny | deny | own | own | — | — |
| `/admin/consultants` | deny | deny | deny | deny | deny | allowlist¹ |
| `/sign-in/*`,`/privacy`,`/terms`,`/join/:code`,`/auth/callback` | allow | allow | allow | allow | allow | allow |

¹ **Server-side** allowlist: `requireAdmin` (`api/_utils/admin.ts`) authorises
only a signed-in user whose email is on the server-only `DRAFTHR_ADMIN_EMAILS`
env list, and **fails closed** (empty list ⇒ nobody is admin). It gates
`admin-queue` + `admin-review`. The client `VITE_ADMIN_EMAILS` check only hides
nav; the real boundary is the server gate (verified 2026-06-10).

Routes are role-gated in `Protected` (`roles` prop), not just hidden in the
nav — direct URL navigation to another role's surface redirects to `/`.

## Confirmed-sound (security-board pass, 2026-05)
- Booking lifecycle (`respond`/`message`/`shared`): caller must be the
  consultant or requester on the booking (403 otherwise); `from`/role derived
  server-side, never from the body; forward-only state transitions.
- Workspace `member-role` + `member-remove` + `invite-revoke`: gated to
  owner/admin of the active tenant; target scoped to the same tenant;
  `canManageOwners` + last-owner guard.
- `store/drafts` writes/deletes scoped by `id AND tenantId`.
- `agent`, `draft`, `export/pdf`, `upload/image`, `sign/manifest`:
  session-gated; export/pdf + sign/manifest tenant-scope the draft by
  `id AND tenantId`. `sign/manifest` is disabled unless
  `DRAFTHR_MANIFEST_SIGNING=enabled`: it signs caller-supplied bytes, so it
  must not run in production until the manifest is built on the server.
- `directory-webhook`: WorkOS signature verified over the raw body before the
  payload is trusted; resolves org→tenant (no cross-tenant write).
- `accept-invite`: session email must match the invite email.
- OAuth callback: `state` cookie CSRF check; provider allowlist.
- Marketplace tag filter uses bound params (`sql.join`), not `sql.raw`. Only
  `sql.execute` in the codebase is the parameterised advisory-lock in audit.

## Fixed in the security-board pass (2026-05)
- **Per-route role guards.** `<Protected roles={[…]}>` — HR/employee/consultant
  surfaces no longer render for the wrong role on direct navigation (was
  hidden-in-nav only).
- **Fail-CLOSED auth on `/api/draft`, `/api/agent`, `/api/upload/image`.**
  `enforceProductionSession` previously bypassed auth whenever
  `NODE_ENV !== "production"` — i.e. on every public Vercel **preview** URL
  (anon LLM spend + open uploader). Now bypasses only with an explicit
  `DRAFTHR_DEV_NO_AUTH=1` (local `.env.local` only).
- **Workspace admin routes reachable again.** `member-role`, `member-remove`,
  `invite-revoke` were two-segment paths that 404'd under the single-segment
  catch-all matcher → admins couldn't change roles, remove members, or revoke
  invites (offboarding failure). Flattened to single-segment actions.
- **`/consultants` re-gated** behind `<Protected>` (was briefly public).
- **Marketplace API 404** (single- vs multi-segment matcher) — all paths
  flattened so the function is actually reached.

## Residual risks / TODO (defence-in-depth)
1. **Tenant isolation is per-handler, not a DB invariant** — BUT now
   build-enforced. There's no Postgres RLS (the Neon `-pooler` runs in
   transaction mode, where session-level RLS context doesn't hold, and the
   default Neon role bypasses RLS — so naïve RLS here is unsafe). Instead a
   static guard test (`api/_utils/tenant-isolation.guard.test.ts`) fails the
   build if any handler reads a tenant-scoped table without a tenant /
   user / parent-row scope signal. Verified: catches an injected unscoped
   `from(drafts)`. This converts "every handler must remember its filter"
   from convention into CI enforcement. Full DB-level RLS (via a non-pooled
   connection + `SET LOCAL app.current_tenant` per request, or Neon's RLS
   role) remains the gold-standard next step for true defence-in-depth, but
   is a larger, branch-tested migration. (No missing filter found today.)
2. ~~**`/admin/consultants` gate is client-side**~~ **DONE.** `requireAdmin`
   (server-side `DRAFTHR_ADMIN_EMAILS` allowlist, fails closed) now gates
   `admin-queue`/`admin-review`. The page also renders a neutral skeleton
   (not the admin header) until the server confirms admin, so the surface
   never paints for a non-admin (PM-04, 2026-06-10).
3. **Vercel single-segment catch-all matcher.** `[...path].ts` →
   `^/api/x/([^/]+)$`. Keep ALL API paths single-segment; a multi-segment
   path silently 404s (unreachable ≠ secured). Documented in the dispatchers.
   This quirk has now bitten twice (marketplace, workspace) — grep for any
   `/` inside an API path string before shipping.
4. **Function cap (Hobby = 12).** At 11. Adding 2 raw functions drops one
   silently. Use dispatchers.
5. ~~**`photoUrl` stored verbatim**~~ **DONE.** `profile.ts` persists the
   `validatePhotoUrl`-checked value, not the raw body (verified 2026-06-10).
6. **In-memory rate limiter is per-instance** (`api/_utils/rate-limit.ts`) —
   effective limit is `max × warm instances`. → Move to a shared store
   (Upstash/Vercel KV) for credential/LLM/upload routes. WorkOS throttles
   auth server-side as a backstop.
7. ~~**No server-side session revocation.**~~ **DONE (SE-03, 2026-06-10).**
   Per-user `session_epoch` (migration `0010_session_epoch`): the sealed cookie
   carries the epoch it was minted with, `requireSessionAndTenant` rejects any
   cookie behind the user's stored epoch, and the epoch is bumped on **sign-out**
   and **password-reset-confirm** — so a stolen/extra cookie dies immediately
   instead of surviving its 7-day TTL. Managed via defensive raw SQL
   (`api/_utils/session-epoch.ts`) so it's safe in either deploy order: until the
   migration is applied it fails open (no enforcement, no outage). **Apply
   migration `0010` to activate.**
8. ~~**`VETTING_AUTO_PUBLISH=1`** self-publishes consultant cards~~ **HARDENED.**
   Now hard-disabled whenever `VERCEL_ENV === "production"`, so a misconfigured
   prod env can never ship unvetted cards regardless of the flag (PM-05,
   2026-06-10). Still confirm the flag is unset in prod as belt-and-suspenders.

---

## 2026-06-10 — full security board (6 specialists + adversarial verification)

**Verdict: nothing remotely-exploitable.** 23 findings → 19 confirmed after
2-skeptic adversarial verification, **0 Critical, 0 network-reachable**. All
prior fix batches (auth render-gating, B1/B2 sanitiser, B3 SSRF, B10/B12 TOCTOU,
B13 deprovisioned filter, S1–S4) re-verified landed with no regressions;
`tenant-isolation.guard.test.ts` passes 16/16.

Fixed this pass:
- 🟠 **Shared-browser PII leak (SA-01/SE-02).** Persisted drafts/matters/
  employees (PII) survived sign-out **and** workspace-switch in localStorage.
  Added `clearTenantScopedLocalData()` (`src/lib/session/clearLocalData.ts`),
  called before both hard-navigations. Local-only confidentiality leak;
  cross-tenant writes were already 403-blocked.
- 🟡 **AI cost cap (SE-01).** `api/draft.ts` let the client pick
  `maxOutputTokens` with no ceiling → unbounded Anthropic spend. Now clamped
  ≤2000 + temperature ∈ [0,1].
- 🟡 **Consultant routing (PM-03).** Onboarding routed off a localStorage-only
  flag; made server-authoritative — `session.ts` reports `isConsultant` (a
  `consultant_profiles` row exists), threaded through the auth context.
- 🟢 **SSRF size cap (SA-04)** enforced from `Content-Length` before buffering ·
  **admin-review UUID guard (SE-04)** (malformed id → 404 not 500) ·
  **admin skeleton (PM-04)** · **auto-publish prod gate (PM-05)**.

Refuted (false positives the skeptics killed): "employee self-promotes to HR"
(view toggle, not a privilege boundary — the server has no such role); "server
can't distinguish a consultant" (true, but nothing access-controls on it); CSP
`unsafe-inline` (non-exploitable given the sanitiser). See residual risks above
for the items that need infra (distributed rate-limiting, RLS). **Follow-up,
same day:** server-side session revocation (SE-03) is now implemented — see
residual risk #7; apply migration `0010_session_epoch` to activate.
