/**
 * POST /api/workspace/invite/revoke — admin marks an invite revoked. We don't
 * delete it: an audit reviewer should be able to see what was revoked + by who.
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../../_utils/request";
import { rateLimit } from "../../../_utils/rate-limit";
import { requireSessionAndTenant } from "../../../_utils/session-with-tenant";
import { getDb } from "../../../../src/db";
import { invites } from "../../../../src/db/schema";
import { appendAuditEvent } from "../../../../src/db/audit";

export const config = { runtime: "nodejs" };

type Body = { inviteId?: string };

const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "workspace-invite-revoke", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const inviteId = typeof parsed.body.inviteId === "string" ? parsed.body.inviteId.trim() : "";
  if (!inviteId) return jsonError("inviteId required", 400);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  if (!ADMIN_ROLES.has(auth.activeMember?.role ?? "")) return jsonError("Admin role required", 403);

  try {
    const db = getDb();
    const [row] = await db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.id, inviteId), eq(invites.tenantId, auth.activeTenant.id)))
      .returning();
    if (!row) return jsonError("Invite not found", 404);

    await safelyAppendAudit({
      tenantId: auth.activeTenant.id,
      kind: "tenant.invite-revoked",
      subjectType: "invite",
      subjectId: inviteId,
      actorUserId: auth.userRow.id,
      payload: { email: row.email, role: row.role },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[workspace/invite/revoke] failed", err);
    return jsonError("Failed to revoke invite", 500);
  }
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
