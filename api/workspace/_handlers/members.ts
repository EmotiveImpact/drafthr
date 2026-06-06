/**
 * GET /api/workspace/members — list members of the active tenant.
 * Drives the Settings members card. Anyone in the tenant can list members
 * (not gated to admin) — they need to know who's on their team.
 */
import { and, eq } from "drizzle-orm";
import { rateLimit } from "../../_utils/rate-limit.js";
import { jsonError } from "../../_utils/request.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { users, tenantMembers } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const limited = rateLimit(req, { name: "workspace-members", max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);

  try {
    const db = getDb();
    const rows = await db
      .select({
        userId: users.id,
        email: users.email,
        legalName: users.legalName,
        role: tenantMembers.role,
        joinedAt: tenantMembers.joinedAt,
        isActive: tenantMembers.isActiveTenant,
      })
      .from(tenantMembers)
      .innerJoin(users, eq(users.id, tenantMembers.userId))
      // Only ACTIVE members — a deprovisioned (IdP-removed) seat must not show
      // in the team list with its old role. Mirrors session.ts/list.ts.
      // (Senior sweep B13.)
      .where(
        and(
          eq(tenantMembers.tenantId, auth.activeTenant.id),
          eq(tenantMembers.status, "active"),
        ),
      );

    return new Response(JSON.stringify({ members: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[workspace/members] failed", err);
    return jsonError("Failed to list members", 500);
  }
}
