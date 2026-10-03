/**
 * GET /api/workspace/list — returns the current user's tenant memberships.
 * Client uses this for the sidebar workspace switcher + Settings members tab.
 */
import { and, eq } from "drizzle-orm";
import { rateLimit } from "../../_utils/rate-limit.js";
import { jsonError } from "../../_utils/request.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { tenants, tenantMembers } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const limited = rateLimit(req, { name: "workspace-list", max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req, { allowUnscoped: true });
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        role: tenantMembers.role,
        isActive: tenantMembers.isActiveTenant,
      })
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
      // Only ACTIVE seats — a deprovisioned membership must not show in the
      // switcher (clicking it 403s at /switch). Mirrors session.ts's filter.
      .where(
        and(
          eq(tenantMembers.userId, auth.userRow.id),
          eq(tenantMembers.status, "active"),
        ),
      );

    return new Response(JSON.stringify({ workspaces: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[workspace/list] failed", err);
    return jsonError("Failed to list workspaces", 500);
  }
}
