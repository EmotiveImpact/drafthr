# DraftHR — Security model & threat notes

Maintained from the `security-board` review. Update when routes, endpoints,
roles, or the auth model change.

## Auth model
- Identity: WorkOS (SSO + password). Session = iron-session cookie
  (HttpOnly, Secure, SameSite). Verified in `api/_utils/workos.ts`.
- Chokepoint: `requireSessionAndTenant` (`api/_utils/session-with-tenant.ts`)
  validates the session, upserts the local `users` row, resolves the active
  tenant, and **fails closed** (returns 500, never data) on error.
- Panel/LLM endpoints use `withPanelSession` (`api/_utils/production-auth.ts`).

## Enforcement verified at runtime (unauthenticated curl, prod)
Every protected endpoint returns 401/403 to an anonymous caller. The only
`200` without a session is `GET /api/marketplace/listing` — the intentionally
public marketplace listing, which returns **published consultant cards only,
no PII**. Re-run the sweep in `references/runtime-verification-cookbook.md`
(security-board skill) after any routing change.

## Access-control matrix (intended)
| Surface | signed-out | no-role | employer | employee | consultant | admin |
|---|---|---|---|---|---|---|
| `/hr*` | ❌ | ❌ | ✅ | ❌ | ❌ | — |
| `/me*` | ❌ | ❌ | ❌ | ✅ | ❌ | — |
| `/c`, `/c/*` | ❌ | enroll | ❌ | ❌ | ✅ | — |
| `/matters`,`/employees`,`/bulk`,`/approvals`,`/reports*` | ❌ | ❌ | ✅ | ❌ | ❌ | — |
| `/bookings` | ❌ | ❌ | ✅ | ❌ | ❌ | — |
| `/consultants` | ❌ | ❌ | ✅ | ❌ | ✅ | — |
| `/editor/*`,`/settings`,`/calendar`,`/exported`,`/activity`,`/notifications` | ❌ | ❌ | ✅ own | ✅ own | — | — |
| `/admin/consultants` | ❌ | ❌ | ❌ | ❌ | ❌ | allowlist¹ |
| `/sign-in/*`,`/privacy`,`/terms`,`/join/:code`,`/auth/callback` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Routes are now role-gated in `Protected` (`roles` prop), not just hidden in
the nav — direct URL navigation to another role's surface redirects to `/`.

## Confirmed-sound (security-board pass, 2026-05)
- Booking lifecycle (`respond`/`message`/`shared`): caller must be the
  consultant or requester on the booking (403 otherwise); `from`/role derived
  server-side, never from the body; forward-only state transitions.
- Workspace `member/role` + `member/remove`: gated to owner/admin of the
  active tenant; target scoped to the same tenant; last-owner guard.
- `store/drafts` writes/deletes scoped by `id AND userId`.
- `agent`, `draft`, `export/pdf`, `upload/image`, `sign/manifest`:
  session-gated; export/pdf takes content from the body (no draft-by-id IDOR).
- `directory-webhook`: svix signature verified before the payload is trusted.
- Marketplace tag filter uses bound params (`sql.join`), not `sql.raw`.

## Fixed in the security-board pass (2026-05)
- **Per-route role guards.** `<Protected roles={[…]}>` — HR/employee/consultant
  surfaces no longer render for the wrong role on direct navigation.
- **Fail-CLOSED auth on `/api/draft`, `/api/agent`, `/api/upload/image`.**
  `enforceProductionSession` used to bypass auth whenever
  `NODE_ENV !== "production"` — i.e. on every public Vercel **preview** URL
  (anon LLM spend + open uploader). Now bypasses only with an explicit
  `DRAFTHR_DEV_NO_AUTH=1` (local `.env.local` only).
- **Workspace admin routes reachable again.** `member-role`, `member-remove`,
  `invite-revoke` were two-segment paths that 404'd under the single-segment
  catch-all matcher → admins couldn't change roles, remove members, or revoke
  invites (offboarding failure). Flattened to single-segment actions.
- **`/consultants` re-gated** behind `<Protected>` (was briefly public).

Runtime-verified against production: every protected endpoint returns
401/403 to anon; only `/api/marketplace/listing` returns 200 (public cards,
no PII).

## Residual risks / TODO (defence-in-depth)
1. **Tenant isolation is per-handler, not a DB invariant.** No Postgres RLS;
   each handler must remember its `tenant_id` filter. One omission = a
   cross-tenant leak. → Add a tenant-scoped query wrapper or enable Neon RLS
   with a per-request `app.current_tenant`. (No missing filter found today.)
2. **`/admin/consultants` gate is client-side** (`VITE_ADMIN_EMAILS`). Fine
   while there's no server admin API. → Add a server-side admin-role check
   before any admin endpoint ships.
3. **Vercel single-segment catch-all matcher.** `[...path].ts` →
   `^/api/x/([^/]+)$`. Keep all API paths single-segment; a multi-segment
   path silently 404s (unreachable ≠ secured). Documented in the dispatchers.
4. **Function cap (Hobby = 12).** At 11. Adding 2 raw functions drops one
   silently. Use dispatchers.
