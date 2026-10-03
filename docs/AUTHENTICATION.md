# Authentication and company access

DraftHR uses WorkOS for identity and Neon/Postgres for application users,
workspace memberships and business data. This change does not migrate to Neon Auth.

## Sign-in journey

1. The quiet /sign-in entry opens hosted WorkOS AuthKit. Registration uses the
   same flow with the sign-up screen hint. No slideshow or entrance animation.
2. The API seals OAuth state, PKCE verifier and the same-origin return destination
   into an HttpOnly cookie. Invitation and consultant destinations survive the
   round trip without depending on sessionStorage.
3. The callback exchanges the code with PKCE, requires a verified WorkOS identity
   and links the local database identity. Organization-specific login must
   return the requested organization.
4. Every protected request validates the WorkOS session and database session
   epoch. Expired access tokens are refreshed; rotated cookies reach PDF, image
   and streaming responses too. Outages deny access with a retryable response,
   not an empty-account/onboarding fallback.
5. Opening a company workspace requires both an active database membership and
   WorkOS authorization for its organization. SSO/MFA challenges return through
   hosted sign-in before switching workspaces or consuming an invitation.
6. Sign-out clears local cookies and goes through WorkOS logout when a provider
   session is available. The signed-out page does not automatically log back in.

Legacy verification and password-reset links remain usable. Verifying an email
or completing a password reset does not itself authenticate the user. They must
complete the WorkOS sign-in policy. Old app-only sessions require a new login.

## Directory identity reconciliation

Never join users by a global email match. A directory claim requires a verified
WorkOS email, the authenticated organization, an active provider membership, an
unambiguous active local directory seat and a current matching directory record.

First company login preserves the provisioned local user ID. If an unscoped
login already created a separate account, an unused directory seat can be linked
to that real account transactionally. The retired placeholder is retained for
historical audit references. No audit-chain rows are rewritten.

Automatic reconciliation refuses ambiguous identities, conflicting directory
bindings, and placeholders already referenced by business records. These require
administrator-led data reconciliation; do not delete duplicate users or rewrite
audit history to work around the check. One local user currently supports one
directory-user binding; multiple directory identities require an explicit mapping
model before enabling that lifecycle.

New registrations create only a user. Workspaces are explicitly created or
joined; workspace creation never renames an invited/directory-managed workspace.

## Production activation checklist

- Set the production WorkOS API key, client ID, cookie password, callback URL and
  APP_BASE_URL on the production deployment. Never enable the local emulator.
- Register the callback URL and logout return URL /sign-in?signed_out=1 with
  WorkOS for the real application domain.
- Configure AuthKit branding and a custom login domain if desired. The local
  WorkOS emulator is a functional test surface, not the final branded page.
- Enable the authentication methods actually offered to customers and configure
  required MFA/SSO policies in WorkOS. Code alone does not activate those settings.
- Map each company tenant's workos_org_id to its correct WorkOS organization.
  Enable Directory Provisioning with WorkOS where applicable and configure the
  signed directory webhook. Test create, update, deactivate and reactivation.
- For managed-company invitations, provision the invitee's active WorkOS
  organization membership first (through the company directory or approved admin
  workflow). A local app invitation cannot override that policy. If not enabled,
  the app reports an administrator action and leaves the invitation unconsumed.
- Apply database migrations including 0010_session_epoch before deploying.
  Strict session verification intentionally refuses an unavailable/missing epoch.
- Configure an appropriate WorkOS access-token lifetime. Provider-side revocation
  takes effect at token refresh; the local epoch check and deprovisioned membership
  checks add immediate local enforcement once those database updates land.
- Test real-provider MFA, SSO, recovery, invitation and logout on a staging domain.
  Local emulator and mocked-policy tests do not certify live provider settings.

## Verification

The app is checked with npm run build and npx vitest run. API-only type checking:

    npx tsc -p api/tsconfig.json --noEmit --allowImportingTsExtensions

api/_utils/local-identity.database.test.ts is gated on DRAFTHR_LOCAL_DATABASE_URL
and uses the disposable localhost Postgres instance. It creates random-ID fixtures
and removes only those fixtures after the suite. Tests cover stable identity,
cross-company rejection, literal email matching, inactive memberships, deactivated
directories, ambiguity, concurrent registration, later company linking, and refusal
to merge business history.

No production deployment or live WorkOS configuration changes are performed by
this implementation.
