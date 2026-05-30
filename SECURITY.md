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

¹ Client-side `VITE_ADMIN_EMAILS` allowlist only — cosmetic until a
server-side admin role exists. No admin server endpoint ships today.

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
  `id AND tenantId`.
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
2. **`/admin/consultants` gate is client-side** (`VITE_ADMIN_EMAILS`). Fine
   while there's no server admin API. → Add a server-side admin-role check
   before any admin endpoint ships.
3. **Vercel single-segment catch-all matcher.** `[...path].ts` →
   `^/api/x/([^/]+)$`. Keep ALL API paths single-segment; a multi-segment
   path silently 404s (unreachable ≠ secured). Documented in the dispatchers.
   This quirk has now bitten twice (marketplace, workspace) — grep for any
   `/` inside an API path string before shipping.
4. **Function cap (Hobby = 12).** At 11. Adding 2 raw functions drops one
   silently. Use dispatchers.
5. **`photoUrl` stored verbatim** on consultant profiles and rendered on the
   public listing → arbitrary-URL beacon. → Validate `https://` on the
   Blob/CDN host before persisting. (Medium; tracked.)
6. **In-memory rate limiter is per-instance** (`api/_utils/rate-limit.ts`) —
   effective limit is `max × warm instances`. → Move to a shared store
   (Upstash/Vercel KV) for credential/LLM/upload routes. WorkOS throttles
   auth server-side as a backstop.
7. **No server-side session revocation.** Sign-out clears the cookie only; a
   captured cookie is valid for its 7-day TTL. → Wire WorkOS `revokeSession`
   before enterprise GA.
8. **`VETTING_AUTO_PUBLISH=1`** self-publishes consultant cards with no review
   → confirm it's unset in prod; publishing should be admin-only.
