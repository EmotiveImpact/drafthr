import { and, eq } from "drizzle-orm";
import { getSessionFromRequest, ensureOrganizationSession } from "../../_utils/workos.js";
import { ensureLocalUser } from "../../_utils/local-identity.js";
import { jsonError } from "../../_utils/request.js";
import { lockUserActiveTenant } from "../../_utils/tenant-active-lock.js";
import { logAuthFailure } from "../../_utils/auth-diagnostics.js";
import { getDb } from "../../../src/db/index.js";
import { consultantProfiles, tenantMembers, tenants } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

type MembershipRow = {
  tenantId: string; role: string; isActive: boolean; status: string;
  joinedAt: Date; tenantName: string | null; organizationId: string | null;
};

export async function GET(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  let activeTenant: { id: string; name: string; role: string } | null = null;
  let hasAnyTenant = false;
  let isConsultant = false;
  let organizationSignInUrl: string | null = null;
  if (session) {
    try {
      const db = getDb();
      const userRow = await ensureLocalUser(session, { reconcileDirectory: false });
      const [consultant] = await db.select({ id: consultantProfiles.id }).from(consultantProfiles)
        .where(eq(consultantProfiles.userId, userRow.id)).limit(1);
      isConsultant = Boolean(consultant);
      const memberships: MembershipRow[] = await db.select({
        tenantId: tenantMembers.tenantId, role: tenantMembers.role,
        isActive: tenantMembers.isActiveTenant, status: tenantMembers.status,
        joinedAt: tenantMembers.joinedAt, tenantName: tenants.name, organizationId: tenants.workosOrgId,
      }).from(tenantMembers).innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
        .where(eq(tenantMembers.userId, userRow.id));
      const live = memberships.filter((m) => m.status === "active" && m.tenantName);
      hasAnyTenant = live.length > 0;
      const flagged = live.find((m) => m.isActive);
      const elected = flagged ?? electDefaultMembership(live);
      if (elected?.tenantName) {
        const denied = await ensureOrganizationSession(req, session, elected.organizationId, elected.tenantId);
        if (denied) {
          organizationSignInUrl = ((await denied.json()) as { signInUrl: string }).signInUrl;
        } else {
          if (!flagged) await persistActiveMembership(userRow.id, elected.tenantId);
          activeTenant = { id: elected.tenantId, name: elected.tenantName, role: elected.role };
        }
      }
    } catch (error) {
      // An unavailable database/provider is not an empty account. Don't misroute
      // returning users into onboarding or silently grant a weaker session.
      logAuthFailure("workspace-load", error);
      return jsonError("Unable to load your workspace. Please try again.", 503);
    }
  }
  return new Response(JSON.stringify({
    user: session?.user ?? null, activeTenant, hasAnyTenant, isConsultant, organizationSignInUrl,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

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
      .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.status, "active")));
  });
}
