# Directory Sync (SCIM / Google Workspace)

DraftHR uses **WorkOS Directory Sync** so enterprise customers can auto-
provision DraftHR seats from their IdP (Okta, Microsoft Entra ID / Azure AD,
Google Workspace, JumpCloud, OneLogin, Rippling, etc.). New hires get a
DraftHR seat the moment IT adds them to the right directory group; offboarded
users are deprovisioned automatically — without losing their audit trail.

This document is for the engineer wiring up a tenant's directory connection
for the first time. End-user instructions live in the in-app Settings →
Directory Sync surface.

## How it works

1. The customer's IT admin configures a directory connection in the WorkOS
   Admin Portal. The portal is opened from DraftHR Settings → Directory Sync
   → "Open Admin Portal" — DraftHR generates a one-shot link scoped to the
   tenant's WorkOS organization (`workos.adminPortal.generateLink({ intent:
   "dsync", organization })`).
2. The customer wires up SCIM (or Google Workspace) in their IdP, pointing it
   at the WorkOS-provided endpoint + bearer token. WorkOS handles all of the
   IdP-side protocol details.
3. As users are added / updated / removed in the IdP, WorkOS fires webhook
   events at `POST /api/workos/directory-webhook`. DraftHR verifies the
   signature, resolves the WorkOS organization → DraftHR tenant, and upserts
   the local `users` + `tenant_members` rows.

## What gets provisioned

| WorkOS event | DraftHR action |
| --- | --- |
| `dsync.user.created` | Upsert `users` row (by `workos_directory_user_id`, then email). Upsert `tenant_members` row with role mapped from the directory role slug. |
| `dsync.user.updated` | Same as `created` — the handler is idempotent. If `state="inactive"`, treat as deprovision. |
| `dsync.user.deleted` | Soft-delete the membership (`status="deprovisioned"`, `deprovisioned_at` stamped). The `users` row stays so the audit chain remains valid. |
| `dsync.group.user_added` | Same as `user.created` — the group membership confirms the user belongs in this tenant. |
| `dsync.group.user_removed` | Soft-delete the membership (same shape as `user.deleted`). |
| `dsync.group.created` / `dsync.group.updated` | Acknowledged but not yet persisted. Future work: surface groups for in-app role mapping. |

Every webhook handler writes a hash-chained `audit_events` row with one of:

- `directory.user.provisioned`
- `directory.user.role_changed` (when an existing user's row is touched)
- `directory.user.deprovisioned`
- `directory.user.deactivated` (when the IdP marks the user inactive without deletion)
- `directory.user.group_removed`
- `directory.admin_portal.opened` (when an admin generates a portal link)

The hash chain is per-tenant, so directory events don't corrupt the audit
trail of any other tenant.

## Role mapping

`api/_utils/directory-sync.ts` exports `mapDirectoryRoleToTenantRole(role)`,
which collapses directory role slugs to DraftHR tenant roles:

| Directory slug | DraftHR role |
| --- | --- |
| `owner` (exact) | `owner` |
| anything containing `admin` | `admin` |
| `viewer`, `readonly`, `read_only` | `viewer` |
| `reviewer`, `approver` | `reviewer` |
| everything else (including missing) | `drafter` |

Per the WorkOS docs, **IdP-assigned roles always take precedence** over
roles set via DraftHR UI or WorkOS Dashboard. That means a tenant admin who
edits a directory-provisioned member's role will see it revert on the next
sync — the in-app UI gates against editing those rows. To change roles for
directory users, edit the mapping in the WorkOS Admin Portal.

## Soft delete, not hard delete

Deprovisioning sets `tenant_members.status = 'deprovisioned'` and stamps
`deprovisioned_at`. The `users` row stays — it's referenced by audit events,
comments, drafts, and approval history. Hard-deleting would corrupt the
hash chain (it has a `users` FK with `ON DELETE CASCADE`) and lose audit
trail.

If a customer ever needs a true hard-delete (GDPR right-to-erasure), we
expose that via a separate workflow that snapshots and detaches the audit
chain — outside the scope of Directory Sync.

## Setting it up

### One-time per environment

1. Add a webhook endpoint in the WorkOS dashboard pointing at
   `https://<your-host>/api/workos/directory-webhook`. The dashboard reveals
   a signing secret on creation — **copy it immediately, it's shown once**.
2. Set `WORKOS_WEBHOOK_SECRET` in the deployment env (Vercel → Project →
   Settings → Environment Variables, or `vercel env add`).
3. Subscribe the endpoint to at least these events:
   `dsync.user.created`, `dsync.user.updated`, `dsync.user.deleted`,
   `dsync.group.user_added`, `dsync.group.user_removed`. Optionally
   `dsync.group.created` and `dsync.group.updated` for forward compatibility.

### Per-tenant

1. Create a WorkOS Organization for the customer (via the WorkOS Dashboard
   or API).
2. Populate `tenants.workos_org_id` with the new organization's id.
3. The customer's tenant admin opens DraftHR → Settings → Directory Sync →
   "Open Admin Portal" and walks through the IdP setup.

## Tenant scoping

Every webhook handler resolves the event's `organization_id` to a DraftHR
tenant via `tenants.workos_org_id`. If no tenant maps to the organization,
the handler acks with 200 and logs a warning — events for unconfigured
tenants never mutate state. This is the single chokepoint preventing
cross-tenant writes.

## Disconnecting

There's no "Disconnect" button in the current Settings UI — disconnects
happen in the WorkOS Admin Portal. When a directory is removed, WorkOS fires
`dsync.deleted` for the directory; we currently treat that as a no-op
(future: cascade-deprovision all users for that directory). For now, an admin
who wants to fully reset can remove the directory in the WorkOS portal and
then manually deprovision residual members in DraftHR.

## Local testing

`npm run dev` doesn't receive WorkOS webhooks; run a tunnel
(`ngrok http 5273`) and point a test webhook subscription at the public
URL. Set `WORKOS_WEBHOOK_SECRET` to the secret WorkOS reveals.

The handler's unit test (`api/workos/_handlers/directory-webhook.test.ts`)
uses a fully mocked WorkOS SDK + Drizzle client — those run in CI without
any network or DB.

## Open questions

- Role-mapping defaults (`mapDirectoryRoleToTenantRole`) intentionally treat
  unknown slugs as `drafter`. If a customer wants `viewer` as the default,
  we'd add a per-tenant override; not yet implemented.
- Group-based role mapping (e.g. "Engineering group → reviewer role")
  requires us to persist groups (`dsync.group.created`/`updated`). The
  handler already acknowledges those events; persistence + UI is the next
  iteration.
