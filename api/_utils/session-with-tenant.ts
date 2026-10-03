/**
 * requireSessionAndTenant — single chokepoint for any API that mutates or reads
 * tenant-scoped data. Upserts the user row on first sign-in (so WorkOS identity
 * always has a matching local `users` row), then locates the active
 * `tenant_members` entry. When the user has no active workspace, callers route
 * them to `/signup/workspace`.
 *
 * Why upsert here: WorkOS owns identity but our row owns the FK targets used by
 * every tenant_id-scoped table. Minting on first session keeps the foreign keys
 * intact without forcing a separate "first-time provisioning" round-trip.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { users, tenants, tenantMembers } from "../../src/db/schema.js";
import type { Tenant, User } from "../../src/db/schema.js";
import {
  requireSession,
  type SessionPayload,
} from "./workos.js";
import { jsonError } from "./request.js";
import { getUserSessionEpoch, isCookieEpochStale } from "./session-epoch.js";
import { ensureLocalUser } from "./local-identity.js";
import { ensureOrganizationSession, AuthUnavailableError } from "./workos.js";

export type RequireSessionAndTenantResult =
  | {
      ok: true;
      session: SessionPayload;
      userRow: User;
      activeTenant: Tenant | null;
      activeMember: { role: string } | null;
      userType: "customer" | "consultant";
      canCreateTenant: boolean;
    }
  | { ok: false; response: Response };

export async function requireSessionAndTenant(
  req: Request,
  options: { allowUnscoped?: boolean } = {},
): Promise<RequireSessionAndTenantResult> {
  const sessionResult = await requireSession(req);
  if (!sessionResult.ok) return sessionResult;
  const session = sessionResult.session;

  try {
    const db = getDb();
    // Preserve the local primary key when linking a provisioned company identity.
    // Even users without an active workspace need a `users` row so that
    // tenant_members joins can target them when invites resolve.
    let userRow = await ensureLocalUser(session, { reconcileDirectory: false });
    if (
      session.user.email &&
      session.user.email.toLowerCase() !== (userRow.email ?? "").toLowerCase()
    ) {
      // Keep stored email aligned with WorkOS — they may have changed it.
      const [updated] = await db
        .update(users)
        .set({ email: session.user.email, updatedAt: new Date() })
        .where(eq(users.id, userRow.id))
        .returning();
      userRow = updated;
    }

    // Server-side session revocation (SE-03): reject a cookie whose epoch is
    // behind the user's stored epoch. Bumped on sign-out / password reset, so a
    // stolen cookie dies immediately instead of surviving its 7-day TTL.
    // Fail closed on a DB error; never turn an outage into authorization.
    const dbEpoch = await getUserSessionEpoch(session.user.id, { strict: true });
    if (isCookieEpochStale(session.epoch, dbEpoch)) {
      return { ok: false, response: jsonError("Session expired — please sign in again.", 401) };
    }

    const [member] = await db
      .select({
        role: tenantMembers.role,
        tenantId: tenantMembers.tenantId,
      })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.userId, userRow.id),
          eq(tenantMembers.isActiveTenant, true),
          // A seat soft-deleted by Directory Sync (status='deprovisioned',
          // the IdP removed the user) must NOT grant API access — otherwise a
          // still-signed-in offboarded user keeps their old role until the
          // 7-day cookie expires. session.ts already hides these from the
          // client; this is the enforcement counterpart.
          eq(tenantMembers.status, "active"),
        ),
      )
      .limit(1);

    let activeTenant: Tenant | null = null;
    if (member) {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, member.tenantId)).limit(1);
      activeTenant = t ?? null;
    }

    if (activeTenant && !options.allowUnscoped) {
      const denied = await ensureOrganizationSession(req, session, activeTenant.workosOrgId, activeTenant.id);
      if (denied) return { ok: false, response: denied };
    }

    return {
      ok: true,
      session,
      userRow,
      activeTenant,
      activeMember: member ? { role: member.role } : null,
      userType: (userRow.userType as "customer" | "consultant") ?? "customer",
      canCreateTenant: true,
    };
  } catch (err) {
    if (err instanceof AuthUnavailableError) return { ok: false, response: jsonError(err.message, 503) };
    console.error("[requireSessionAndTenant] db error", err);
    return { ok: false, response: jsonError("Workspace lookup failed", 500) };
  }
}
