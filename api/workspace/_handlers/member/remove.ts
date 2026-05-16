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
  if (!ADMIN_ROLES.has(auth.activeMember?.role ?? "")) return jsonError("Admin role required", 403);
  if (userId === auth.userRow.id) return jsonError("Cannot remove yourself", 400);

  try {
    const db = getDb();
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
