import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { tenantMembers } from "../../src/db/schema.js";
import { requireSessionAndTenant, type RequireSessionAndTenantResult } from "./session-with-tenant.js";
import { lockUserActiveTenant } from "./tenant-active-lock.js";

type MarketplaceSession = Extract<RequireSessionAndTenantResult, { ok: true }>;
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const changed = () => Response.json({ error: "Your account or workspace changed. Reload before continuing.", code: "workspace_changed" }, { status: 409 });

/** Pins are consistency checks, not authorization. WorkOS/session and current
 * database membership still establish identity and access first. */
export async function requireMarketplaceSession(req: Request): Promise<RequireSessionAndTenantResult> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth;
  if (req.headers.get("X-Account-ID") !== auth.session.user.id ||
      req.headers.get("X-Workspace-ID") !== (auth.activeTenant?.id ?? "none")) {
    return { ok: false, response: changed() };
  }
  return auth;
}

/** Share the workspace-switch lock and re-read membership inside the write
 * transaction. A request authorized before a concurrent switch cannot write
 * afterward under the newly selected workspace. Unscoped consultant accounts
 * remain supported; booking participant authorization is separate. */
export async function withMarketplaceWriteScope(auth: MarketplaceSession, write: (tx: Transaction, currentAuth: MarketplaceSession) => Promise<Response>): Promise<Response> {
  return getDb().transaction(async (tx) => {
    await lockUserActiveTenant(tx, auth.userRow.id);
    const [active] = await tx.select({ tenantId: tenantMembers.tenantId, role: tenantMembers.role }).from(tenantMembers)
      .where(and(eq(tenantMembers.userId, auth.userRow.id), eq(tenantMembers.isActiveTenant, true), eq(tenantMembers.status, "active"))).limit(1).for("share");
    if ((active?.tenantId ?? null) !== (auth.activeTenant?.id ?? null)) return changed();
    // Authorization must use this locked role, not the earlier session lookup:
    // an administrator may have demoted the requester in between the two.
    return write(tx, { ...auth, activeMember: active ? { role: active.role } : null });
  });
}

/** Consultants are explicitly assigned cross-workspace reviewers. Requesters
 * must still act in the booking's workspace with a current active membership. */
export function canAccessMarketplaceBooking(auth: MarketplaceSession, booking: { consultantUserId: string; requesterUserId: string; tenantId: string }): boolean {
  return booking.consultantUserId === auth.userRow.id || (booking.requesterUserId === auth.userRow.id &&
    Boolean(auth.activeMember) && booking.tenantId === auth.activeTenant?.id);
}

/** Match workspace draft write roles; viewers cannot share work by booking a
 * consultant, write messages as a requester, or acknowledge/rate delivery. */
export function canWriteMarketplaceBookings(auth: MarketplaceSession): boolean {
  return Boolean(auth.activeTenant && auth.activeMember &&
    ["owner", "admin", "drafter", "reviewer"].includes(auth.activeMember.role));
}
