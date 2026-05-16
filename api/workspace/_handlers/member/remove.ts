/**
 * POST /api/workspace/member/remove — admin removes another member. We use
 * POST + JSON body (not DELETE) so the SPA fetch + same-origin check stay
 * identical to the rest of /api/workspace/*.
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../../_utils/request.js";
import { rateLimit } from "../../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../../_utils/session-with-tenant.js";
import { getDb } from "../../../../src/db/index.js";
import { tenantMembers } from "../../../../src/db/schema.js";
import { appendAuditEvent } from "../../../../src/db/audit.js";
import { canManageOwners } from "../../../../src/lib/permissions.js";

export const config = { runtime: "nodejs" };

type Body = { userId?: string };

const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "workspace-member-remove", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const userId = typeof parsed.body.userId === "string" ? parsed.body.userId.trim() : "";
  if (!userId) return jsonError("userId required", 400);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const requesterRole = auth.activeMember?.role ?? "";
  if (!ADMIN_ROLES.has(requesterRole)) return jsonError("Admin role required", 403);
  if (userId === auth.userRow.id) return jsonError("Cannot remove yourself", 400);

  try {
    const db = getDb();
    const [member] = await db
      .select({ role: tenantMembers.role })
      .from(tenantMembers)
      .where(
        and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, auth.activeTenant.id)),
      )
      .limit(1);
    if (!member) return jsonError("Member not found", 404);
    if (!canManageOwners(requesterRole, member.role)) {
      return jsonError("only owners can manage owners.", 403);
    }
    if (member.role === "owner") {
      const owners = await db
        .select({ userId: tenantMembers.userId })
        .from(tenantMembers)
        .where(and(eq(tenantMembers.tenantId, auth.activeTenant.id), eq(tenantMembers.role, "owner")));
      if (owners.length <= 1) {
        return jsonError("workspace must have at least one owner", 409);
      }
    }

    const [removed] = await db
      .delete(tenantMembers)
      .where(
        and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, auth.activeTenant.id)),
      )
      .returning();
    if (!removed) return jsonError("Member not found", 404);

    await safelyAppendAudit({
      tenantId: auth.activeTenant.id,
      kind: "tenant.member-removed",
      subjectType: "user",
      subjectId: userId,
      actorUserId: auth.userRow.id,
      payload: { role: removed.role },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[workspace/member/remove] failed", err);
    return jsonError("Failed to remove member", 500);
  }
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
