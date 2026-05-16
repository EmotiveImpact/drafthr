/**
 * POST /api/workspace/member/role — change a member's role in the active
 * tenant. Admin-only. Owners can demote other owners but not themselves
 * (you'd nuke admin access by accident).
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../../_utils/request.js";
import { rateLimit } from "../../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../../_utils/session-with-tenant.js";
import { getDb } from "../../../../src/db/index.js";
import { tenantMembers } from "../../../../src/db/schema.js";
import { appendAuditEvent } from "../../../../src/db/audit.js";

export const config = { runtime: "nodejs" };

type Body = { userId?: string; role?: string };

const ALLOWED_ROLES = new Set(["owner", "admin", "drafter", "reviewer", "viewer"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "workspace-member-role", max: 30, windowMs: 60_000 });
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
  if (!ADMIN_ROLES.has(auth.activeMember?.role ?? "")) return jsonError("Admin role required", 403);
  if (userId === auth.userRow.id) return jsonError("Cannot change your own role", 400);

  try {
    const db = getDb();
    const [updated] = await db
      .update(tenantMembers)
      .set({ role })
      .where(
        and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, auth.activeTenant.id)),
      )
      .returning();
    if (!updated) return jsonError("Member not found", 404);

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
