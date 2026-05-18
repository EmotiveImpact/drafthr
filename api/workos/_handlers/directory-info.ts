/**
 * GET /api/workos/directory-info — admin-only. Returns the WorkOS directories
 * connected to the active tenant's WorkOS organization, plus a sample of the
 * users provisioned via Directory Sync (the Settings page renders the rest
 * as a paginated table later).
 *
 * Why not call /api/workspace/members for this: members lists EVERY tenant
 * seat (manual invites included). This endpoint surfaces only the directory-
 * provisioned subset, with the directory metadata stapled on top, so HR can
 * see "Okta says Jane is a People Ops admin → DraftHR has Jane as admin"
 * at a glance.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { enforceSameOrigin, jsonError } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getWorkos } from "../../_utils/workos.js";
import { getDb } from "../../../src/db/index.js";
import { tenantMembers, users } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function GET(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "workos-directory-info", max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const memberRole = auth.activeMember?.role ?? "drafter";
  if (!ADMIN_ROLES.has(memberRole)) return jsonError("Admin role required", 403);

  const workosOrgId = (auth.activeTenant as { workosOrgId?: string | null }).workosOrgId ?? null;

  // List directories from WorkOS, scoped to the tenant's org. If the tenant
  // isn't paired with a WorkOS org we return an empty list + a flag so the
  // Settings page can render the "set up" CTA.
  let directories: Array<{
    id: string;
    name: string;
    type: string;
    state: string;
    domain: string;
    updatedAt: string;
  }> = [];
  if (workosOrgId) {
    try {
      const list = await getWorkos().directorySync.listDirectories({
        organizationId: workosOrgId,
        limit: 25,
      });
      directories = list.data.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        state: d.state,
        domain: d.domain,
        updatedAt: d.updatedAt,
      }));
    } catch (err) {
      console.warn("[directory-info] listDirectories failed", err);
      // Still 200 — surfacing the error in the UI is the WorkOS dashboard's job.
    }
  }

  // List directory-provisioned users for the tenant. We pull from our DB
  // (not WorkOS) because we want status (active vs deprovisioned), DraftHR
  // role mapping, and the joined-at timestamp — all DraftHR-side state.
  const dirUsers = await getDb()
    .select({
      userId: users.id,
      email: users.email,
      legalName: users.legalName,
      workosDirectoryId: users.workosDirectoryId,
      workosDirectoryUserId: users.workosDirectoryUserId,
      role: tenantMembers.role,
      status: tenantMembers.status,
      deprovisionedAt: tenantMembers.deprovisionedAt,
      joinedAt: tenantMembers.joinedAt,
    })
    .from(users)
    .innerJoin(tenantMembers, eq(tenantMembers.userId, users.id))
    .where(and(eq(tenantMembers.tenantId, auth.activeTenant.id), isNotNull(users.workosDirectoryUserId)))
    .orderBy(desc(tenantMembers.joinedAt))
    .limit(200);

  return new Response(
    JSON.stringify({
      configured: Boolean(workosOrgId),
      workosOrgId,
      directories,
      users: dirUsers,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
