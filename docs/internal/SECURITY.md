# Security Model & Threat Notes — DraftHR

Living record of the app's access-control model and what enforces it. Written
after the 2026-07-03 security board (Security Engineer + System Architect +
PM/Journeys). Update when a new surface, role, or trust boundary is added.

**Golden rule:** prove enforcement at RUNTIME, not from the source. A green
build and a passing test are necessary, not sufficient — curl the deployed
endpoint unauth and wrong-role. A platform HTML 404 means "unreachable", not
"secured"; only a handler JSON 401/403 is real enforcement.

## Auth mechanism

- Identity: **WorkOS** + an **iron-session sealed cookie** (`HttpOnly`,
  `SameSite=Lax`, `Secure` in prod). Validated by `requireSession()`
  (`api/_utils/workos.ts`).
- Tenant + role: `requireSessionAndTenant()` (`api/_utils/session-with-tenant.ts`)
  resolves the active `tenant_members` row, enforces the **session-epoch
  revocation** check (SE-03, kills a stolen cookie on sign-out / password
  reset), and rejects **deprovisioned** members (`status != 'active'`).
- AI / upload endpoints gate through `enforceProductionSession()` — **fails
  closed**; only `DRAFTHR_DEV_NO_AUTH=1` (local `.env.local`, gitignored)
  bypasses. It deliberately does NOT key off `NODE_ENV`, so public Vercel
  *preview* deployments stay authenticated.
- CSRF: `enforceSameOrigin()` on every state-changing POST/PATCH/DELETE.
- Platform admin: `requireAdmin()` — server-only `DRAFTHR_ADMIN_EMAILS`
  allowlist (non-`VITE_`, never in the client bundle). Fails closed when unset.

## Roles / user types

- Workspace roles (`tenant_members.role`): `owner | admin | drafter | reviewer | viewer`.
- `userType`: `customer | consultant`.
- Platform admin: email allowlist (above).
- Employer/employee **mode** is a client-side UI preference (`/pick-role`) —
  **defense-in-depth only**. The authoritative workspace role is
  `tenant_members.role`, enforced server-side; the mode gate never stands
  between a user and another tenant's data.

## Intended access-control matrix (enforced server-side)

| Surface | signed-out | no-workspace | employer (role-scoped) | employee | consultant | platform-admin | cross-tenant |
|---|---|---|---|---|---|---|---|
| `/sign-in*`, `/privacy`, `/terms`, webhooks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `store/*` (drafts, matters, sections, extras) | 401 | 400 | 🔶 own-tenant | 🔶 own | ❌ | 🔶 | ❌ 403 |
| `draft` / `agent` / `upload` / `export` | 401 | 400 | ✅ | ✅ | ✅ | ✅ | n/a |
| `workspace/member-{role,remove}`, `invite-revoke` | 401 | ❌ | 🔶 admin/owner only | ❌ | ❌ | 🔶 | ❌ |
| `marketplace/listing` (published only) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `marketplace/bookings-*`, `profile`, `shared` | 401 | ❌ | 🔶 own party | ❌ | 🔶 own | 🔶 | ❌ 403 |
| `marketplace/admin-*`, `/admin/consultants` | ❌ | ❌ | 403 | ❌ | ❌ | ✅ | ❌ |
| `workos/directory-info`, `portal-link`, `audit-logs-*` | 401 | ❌ | 🔶 admin/owner | ❌ | ❌ | 🔶 | ❌ |
| `stripe-webhook`, `directory-webhook` | signature | signature | signature | signature | signature | signature | signature |

✅ allowed · ❌ denied · 🔶 own-records-only · number = expected deny status.

## Trust boundaries

- **Stripe webhook** — verifies `stripe-signature` against
  `STRIPE_WEBHOOK_SECRET` / `_CONNECT` over the raw body; re-fetches account
  state rather than trusting the event payload; fails closed.
- **WorkOS directory webhook** — `constructEvent` HMAC over the raw body;
  resolves the tenant by `workos_org_id` DB lookup, never from the payload id;
  deprovision runs under the owner-guard advisory lock.
- **Share token** (`marketplace/shared`) — 128-bit, session-gated to the
  assigned `consultantUserId`, server-side expiry, PII-stripped response, and
  (as of 2026-07-03) an independent `draftRow.tenantId === booking.tenantId`
  re-assertion so it no longer relies solely on the bind-time check.
- **Upload** — same-origin + session + size cap + MIME allowlist + magic-byte
  sniffing; SVG blocked; content-addressed path.
- **AI proxy** (`draft` / `agent`) — session-gated, same-origin, model
  allowlist, output-token clamp + 100k system-prompt cap (+40k/item verbatim
  evidence clamp). Streams only client-supplied context — no server-side
  cross-tenant data is injected, so spend is the only risk.

## Structural backstops

- **Tenant isolation is per-handler** (no Postgres RLS — the Neon pooler runs
  in transaction mode). `api/_utils/tenant-isolation.guard.test.ts` is a
  build-enforced static analysis: every read of a tenant-scoped table must
  carry a tenant-scope signal, and every read of a parent-scoped table
  (`sections`, `section_versions`, `comments`, `evidence`, `approvals`) must
  check the parent's tenant — or be a documented, board-verified exception.
- **"Exactly one active tenant per user"** — all `isActiveTenant=true` writers
  hold a per-user `pg_advisory_xact_lock` in-transaction.
- **"At least one active owner"** — role-change, member-remove, AND directory
  deprovision all take the shared `lockTenantOwnerGuard` (TOCTOU-closed).

## Known / scheduled hardening

- **`sections` has no `tenantId` column** (Medium, structural). Isolation is
  inherited via the `drafts` FK and enforced by discipline + the guard test.
  A `tenantId` column (or RLS) would make it correct *by construction*. Needs
  a DB migration — scheduled, not yet applied.
- **`auth/url` GET sets a state cookie without same-origin** (Info). Not a
  vuln — the state is opaque and validated in the callback; adding same-origin
  would break the top-level OAuth-initiation navigation (no Origin header).
- Rate limiter is per-warm-instance (in-memory `Map`) — a durable limiter
  (Upstash/KV) is tracked as I-HARD-1 for real multi-instance load.

## Runtime verification sweep (run against the deployment, two test accounts)

See the security-board memo for the exact curl commands. In brief, expect:
unauth AI/upload → 401; off-origin write → 403; cross-tenant draft id-swap →
403; wrong-role member-remove → 403; self-approve consultant → 403; forged
Stripe/WorkOS webhook → 400. Anything returning 200 (or a platform 404 masking
an unreachable-but-should-be-enforced route) is a regression — halt and
re-diagnose.
