/**
 * POST /api/workspace/switch — flips the active tenant for the current user.
 * Target tenant must be one the user already belongs to.
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { tenants, tenantMembers } from "../../../src/db/schema.js";
import { lockUserActiveTenant } from "../../_utils/tenant-active-lock.js";
import { ensureOrganizationSession } from "../../_utils/workos.js";

export const config = { runtime: "nodejs" };

type Body = { tenantId?: string };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "workspace-switch", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const tenantId = typeof parsed.body.tenantId === "string" ? parsed.body.tenantId.trim() : "";
  if (!tenantId) return jsonError("tenantId required", 400);

  const auth = await requireSessionAndTenant(req, { allowUnscoped: true });
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    // Must already be a member.
    const [member] = await db
      .select({ role: tenantMembers.role })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.userId, auth.userRow.id),
          eq(tenantMembers.tenantId, tenantId),
          // Don't let a deprovisioned (IdP-removed) seat be switched back into
          // — that would re-activate access an offboard explicitly revoked.
          eq(tenantMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!member) return jsonError("Not a member of that workspace", 403);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return jsonError("Workspace not found", 404);
    const denied = await ensureOrganizationSession(req, auth.session, tenant.workosOrgId, tenantId);
    if (denied) return denied;

    await db.transaction(async (tx) => {
      // Serialize against concurrent accept-invite/create so we can't end up
      // with two active rows (the UPDATE below can't see a row another txn is
      // inserting under READ COMMITTED). Released on commit/rollback.
      await lockUserActiveTenant(tx, auth.userRow.id);
      await tx
        .update(tenantMembers)
        .set({ isActiveTenant: false })
        .where(eq(tenantMembers.userId, auth.userRow.id));
      await tx
        .update(tenantMembers)
        .set({ isActiveTenant: true })
        .where(
          and(eq(tenantMembers.userId, auth.userRow.id), eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.status, "active")),
        );
    });

    return new Response(
      JSON.stringify({
        tenant: tenant ? { id: tenant.id, name: tenant.name, role: member.role } : null,
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[workspace/switch] failed", err);
    return jsonError("Failed to switch workspace", 500);
  }
}
