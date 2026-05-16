/**
 * POST /api/workspace/accept-invite — redeems an invite code.
 *
 * Validation gauntlet:
 *   1. Invite exists.
 *   2. Not revoked, not already accepted, not expired.
 *   3. Email on the invite matches the current user's session email
 *      (case-insensitive). This is the security boundary — without it any
 *      authenticated user could claim any invite by URL.
 *
 * On success: insert tenant_members row, mark invite accepted, append a
 * tenant.member-joined audit event. If the user has no other active
 * tenant, mark this one active so they land somewhere usable.
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request";
import { rateLimit } from "../../_utils/rate-limit";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant";
import { getDb } from "../../../src/db";
import { invites, tenantMembers } from "../../../src/db/schema";
import { appendAuditEvent } from "../../../src/db/audit";

export const config = { runtime: "nodejs" };

type Body = { inviteCode?: string };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "workspace-accept", max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const inviteCode =
    typeof parsed.body.inviteCode === "string" ? parsed.body.inviteCode.trim() : "";
  if (!inviteCode) return jsonError("inviteCode required", 400);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const [invite] = await db
      .select()
      .from(invites)
      .where(eq(invites.inviteCode, inviteCode))
      .limit(1);
    if (!invite) return jsonError("Invite not found", 404);
    if (invite.revokedAt) return jsonError("Invite revoked", 410);
    if (invite.acceptedAt) return jsonError("Invite already accepted", 410);
    if (invite.expiresAt < new Date()) return jsonError("Invite expired", 410);

    const sessionEmail = (auth.session.user.email ?? "").toLowerCase();
    if (sessionEmail !== invite.email.toLowerCase()) {
      return jsonError("Invite email does not match your account", 403);
    }

    // Already a member? Idempotent return.
    const [existing] = await db
      .select()
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.userId, auth.userRow.id),
          eq(tenantMembers.tenantId, invite.tenantId),
        ),
      )
      .limit(1);

    await db.transaction(async (tx) => {
      if (!existing) {
        // Will this become the active tenant? Yes when the user currently has none.
        const shouldActivate = !auth.activeTenant;
        if (shouldActivate) {
          await tx
            .update(tenantMembers)
            .set({ isActiveTenant: false })
            .where(eq(tenantMembers.userId, auth.userRow.id));
        }
        await tx.insert(tenantMembers).values({
          userId: auth.userRow.id,
          tenantId: invite.tenantId,
          role: invite.role,
          isActiveTenant: shouldActivate,
        });
      }
      await tx
        .update(invites)
        .set({ acceptedAt: new Date(), acceptedByUserId: auth.userRow.id })
        .where(eq(invites.id, invite.id));
    });

    await safelyAppendAudit({
      tenantId: invite.tenantId,
      kind: "tenant.member-joined",
      subjectType: "tenant",
      subjectId: invite.tenantId,
      actorUserId: auth.userRow.id,
      payload: { email: invite.email, role: invite.role, inviteId: invite.id },
    });

    return new Response(
      JSON.stringify({ tenantId: invite.tenantId, role: invite.role }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[workspace/accept-invite] failed", err);
    return jsonError("Failed to accept invite", 500);
  }
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
