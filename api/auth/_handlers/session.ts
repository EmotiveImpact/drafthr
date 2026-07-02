/**
 * Returns the current session's user, or { user: null } when unauthenticated.
 *
 * Deliberately returns 200 + null on no-session (not 401): the SPA polls this
 * on every load to decide whether to render the app or redirect to sign-in,
 * and a 401 here would spam the console / Sentry with expected noise.
 *
 * Auto-heal "no active tenant" state — bug #onboarding-bounce
 * ----------------------------------------------------------
 * Returning users were getting bounced to /signup/workspace despite having
 * tenant memberships. Root cause: this handler only returns `activeTenant`
 * when at least one row has `tenant_members.is_active_tenant=true`. That
 * flag can land in `false` for ALL of a user's rows through several
 * legitimate paths:
 *
 *   - Directory Sync `dsync.user.deactivated` flips the flag false; the
 *     matching reprovision path does not flip it back (it only restores
 *     `status='active'`, `deprovisioned_at=null`).
 *   - A partially-committed `workspace/switch` (rare, but rows survive).
 *   - Operational SQL that toggled the flag off and never restored.
 *
 * Fix: if the user has memberships but no row is flagged active, auto-elect
 * one (deterministically — most-recent joinedAt, ties broken by tenant_id)
 * AND persist the flip so subsequent requests are fast. Safe because the
 * user already belongs to all candidate tenants — we're not granting any
 * new access, just resolving an inconsistent default. Rows with
 * `status='deprovisioned'` are excluded so soft-deleted seats never
 * resurrect.
 */

import { and, eq } from "drizzle-orm";
import { getSessionFromRequest } from "../../_utils/workos.js";
import { getUserSessionEpoch, isCookieEpochStale } from "../../_utils/session-epoch.js";
import { lockUserActiveTenant } from "../../_utils/tenant-active-lock.js";
import { dbEnabled, getDb } from "../../../src/db/index.js";
import { consultantProfiles, tenantMembers, tenants, users } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

type MembershipRow = {
  tenantId: string;
  role: string;
  isActive: boolean;
  status: string;
  joinedAt: Date;
  tenantName: string | null;
};

export async function GET(req: Request): Promise<Response> {
  let session = await getSessionFromRequest(req);
  // SE-03 parity: a cookie whose epoch is behind the user's stored epoch was
  // revoked (sign-out / password reset). requireSessionAndTenant enforces this
  // on every data route; enforce it HERE too — otherwise a stale/exfiltrated
  // cookie keeps resolving the victim's identity, PII, workspace name + role
  // from this endpoint (which the SPA polls) for the full 7-day TTL. Fails open
  // on lookup error so a DB blip never spuriously logs a valid user out.
  if (session && dbEnabled()) {
    try {
      const dbEpoch = await getUserSessionEpoch(session.user.id);
      if (isCookieEpochStale(session.epoch, dbEpoch)) session = null;
    } catch (err) {
      console.warn("[auth/session] epoch check failed", err);
    }
  }
  let activeTenant: { id: string; name: string; role: string } | null = null;
  let hasAnyTenant = false;
  // Server-authoritative consultant signal. The client previously inferred
  // "is a consultant" purely from a localStorage `enrolled` flag, so a
  // consultant signing in on a NEW device (empty storage) was misrouted into
  // HR workspace creation by RootRedirect. The durable signal is a row in
  // consultant_profiles — report it so routing no longer depends on local
  // state. (Security board PM-03, 2026-06-10.)
  let isConsultant = false;

  // Look up the active tenant when the DB is configured. Failures here must
  // not block the session response — the SPA polls this on every load and
  // we don't want auth UX to depend on Postgres availability.
  if (session && dbEnabled()) {
    try {
      const db = getDb();
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.externalId, session.user.id))
        .limit(1);
      if (userRow) {
        // A single indexed lookup on the unique user_id — cheap, and it makes
        // consultant routing work cross-device without trusting localStorage.
        const [consultantRow] = await db
          .select({ id: consultantProfiles.id })
          .from(consultantProfiles)
          .where(eq(consultantProfiles.userId, userRow.id))
          .limit(1);
        isConsultant = Boolean(consultantRow);

        const memberships: MembershipRow[] = await db
          .select({
            tenantId: tenantMembers.tenantId,
            role: tenantMembers.role,
            isActive: tenantMembers.isActiveTenant,
            status: tenantMembers.status,
            joinedAt: tenantMembers.joinedAt,
            tenantName: tenants.name,
          })
          .from(tenantMembers)
          .leftJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
          .where(eq(tenantMembers.userId, userRow.id));

        // hasAnyTenant counts only live (not deprovisioned) memberships —
        // SignupWorkspace shows "create or join" for these users, so if
        // every row is deprovisioned we want the same path. (The Directory
        // Sync admin restores access by reprovisioning, which RESETS status
        // to 'active' on the dsync side, then the user signs in again.)
        const live = memberships.filter((m) => m.status !== "deprovisioned" && m.tenantName);
        hasAnyTenant = live.length > 0;

        const flaggedActive = live.find((m) => m.isActive);
        const elected = flaggedActive ?? electDefaultMembership(live);

        if (elected && elected.tenantName) {
          activeTenant = {
            id: elected.tenantId,
            name: elected.tenantName,
            role: elected.role,
          };

          // Persist the auto-election when we had to fall back. We do this
          // fire-and-forget so a write hiccup doesn't block the session
          // read; the next poll will retry. Note we use a transaction so
          // we never leave the user with TWO active rows.
          if (!flaggedActive) {
            void persistActiveMembership(userRow.id, elected.tenantId).catch((err) => {
              console.warn("[auth/session] failed to persist auto-elected tenant", err);
            });
          }
        }
      }
    } catch (err) {
      // Defensive — log once, never block the response.
      console.warn("[auth/session] tenant lookup failed", err);
    }
  }

  return new Response(
    JSON.stringify({ user: session?.user ?? null, activeTenant, hasAnyTenant, isConsultant }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/**
 * Picks a default membership when none are flagged active. Deterministic so
 * the same user always lands in the same tenant across refreshes (no
 * "different workspace every time I sign in" feel).
 *
 * Ordering: most-recently joined first (the workspace they most recently
 * accepted is the most likely intent). Ties broken by tenant_id so the
 * result is fully stable.
 *
 * Returns null when `live` is empty. Callers MUST check.
 */
function electDefaultMembership(live: MembershipRow[]): MembershipRow | null {
  if (live.length === 0) return null;
  const sorted = [...live].sort((a, b) => {
    const ta = a.joinedAt instanceof Date ? a.joinedAt.getTime() : 0;
    const tb = b.joinedAt instanceof Date ? b.joinedAt.getTime() : 0;
    if (tb !== ta) return tb - ta; // newest first
    return a.tenantId < b.tenantId ? -1 : a.tenantId > b.tenantId ? 1 : 0;
  });
  return sorted[0];
}

/**
 * Persists the auto-elected active tenant. Uses a transaction so the
 * "exactly one active row" invariant is preserved even under concurrent
 * writes. NEVER touches another user's rows — both updates are scoped to
 * `userId`.
 */
async function persistActiveMembership(userId: string, tenantId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Serialize against concurrent switch/accept-invite/create so the
    // auto-election can't race them into two active rows. (Released at commit.)
    await lockUserActiveTenant(tx, userId);
    await tx
      .update(tenantMembers)
      .set({ isActiveTenant: false })
      .where(eq(tenantMembers.userId, userId));
    await tx
      .update(tenantMembers)
      .set({ isActiveTenant: true })
      .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId)));
  });
}
