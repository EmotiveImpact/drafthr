/**
 * POST /api/workspace/member/role — change a member's role in the active
 * tenant. Admin-only, with owner-role changes reserved to owners.
 */
import { and, eq } from "drizzle-orm";
import { lockTenantOwnerGuard } from "../../../_utils/tenant-active-lock.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../../_utils/request.js";
import { rateLimit } from "../../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../../_utils/session-with-tenant.js";
import { getDb } from "../../../../src/db/index.js";
import { tenantMembers } from "../../../../src/db/schema.js";
import { appendAuditEvent } from "../../../../src/db/audit.js";
import { canManageOwners } from "../../../../src/lib/permissions.js";

export const config = { runtime: "nodejs" };

type Body = { userId?: string; role?: string };

const ALLOWED_ROLES = new Set(["owner", "admin", "drafter", "reviewer", "viewer"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = await rateLimit(req, { name: "workspace-member-role", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const userId = typeof parsed.body.userId === "string" ? parsed.body.userId.trim() : "";
  const role = typeof parsed.body.role === "string" ? parsed.body.role : "";
  if (!userId) return jsonError("userId required", 400);
  if (!ALLOWED_ROLES.has(role)) return jsonError("Invalid role", 400);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const requesterRole = auth.activeMember?.role ?? "";
  if (!ADMIN_ROLES.has(requesterRole)) return jsonError("Admin role required", 403);
  if (userId === auth.userRow.id) return jsonError("Cannot change your own role", 400);

  try {
    const db = getDb();
    const tenantId = auth.activeTenant.id;
    // The whole check-then-act runs in one transaction under a per-tenant
    // advisory lock shared with member/remove: two concurrent demotes of the
    // last two owners otherwise each count 2 owners and both proceed, leaving
    // the workspace ownerless (TOCTOU, R12 FLAGGED). The lock serializes all
    // owner-affecting mutations for the tenant; the count is then authoritative.
    const outcome = await db.transaction(async (tx) => {
      await lockTenantOwnerGuard(tx, tenantId);
      const [member] = await tx
        .select({ role: tenantMembers.role })
        .from(tenantMembers)
        .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId)))
        .limit(1);
      if (!member) return { error: "Member not found", status: 404 } as const;
      if (!canManageOwners(requesterRole, member.role) || !canManageOwners(requesterRole, role)) {
        return { error: "only owners can manage owners.", status: 403 } as const;
      }
      if (member.role === "owner" && role !== "owner") {
        const owners = await tx
          .select({ userId: tenantMembers.userId })
          .from(tenantMembers)
          // Count only LIVE owners — a deprovisioned owner row would inflate the
          // count and could let the last active owner be demoted. (Senior sweep B13.)
          .where(
            and(
              eq(tenantMembers.tenantId, tenantId),
              eq(tenantMembers.role, "owner"),
              eq(tenantMembers.status, "active"),
            ),
          );
        if (owners.length <= 1) {
          return { error: "workspace must have at least one owner", status: 409 } as const;
        }
      }

      const [updated] = await tx
        .update(tenantMembers)
        .set({ role })
        .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId)))
        .returning();
      if (!updated) return { error: "Member not found", status: 404 } as const;
      return { error: null } as const;
    });
    if (outcome.error) return jsonError(outcome.error, outcome.status);

    await safelyAppendAudit({
      tenantId: auth.activeTenant.id,
      kind: "tenant.member-role-changed",
      subjectType: "user",
      subjectId: userId,
      actorUserId: auth.userRow.id,
      payload: { role },
    });

    return new Response(JSON.stringify({ ok: true, role }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[workspace/member/role] failed", err);
    return jsonError("Failed to update role", 500);
  }
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
