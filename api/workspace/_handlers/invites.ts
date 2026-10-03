/**
 * GET /api/workspace/invites — list pending invites for the active tenant.
 * Admin-only (members shouldn't see who's been invited but not yet joined).
 */
import { and, eq, isNull } from "drizzle-orm";
import { rateLimit } from "../../_utils/rate-limit.js";
import { jsonError } from "../../_utils/request.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { invites } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function GET(req: Request): Promise<Response> {
  const limited = await rateLimit(req, { name: "workspace-invites", max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  if (!ADMIN_ROLES.has(auth.activeMember?.role ?? "")) return jsonError("Admin role required", 403);

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: invites.id,
        email: invites.email,
        role: invites.role,
        inviteCode: invites.inviteCode,
        expiresAt: invites.expiresAt,
        revokedAt: invites.revokedAt,
        acceptedAt: invites.acceptedAt,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .where(
        and(
          eq(invites.tenantId, auth.activeTenant.id),
          isNull(invites.acceptedAt),
          isNull(invites.revokedAt),
        ),
      );

    return new Response(JSON.stringify({ invites: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[workspace/invites] failed", err);
    return jsonError("Failed to list invites", 500);
  }
}
