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
 * On success: insert/update tenant_members row, mark invite accepted, append a
 * tenant.member-joined audit event, and switch the accepted tenant active so
 * invite links always land users in the workspace they just joined.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { invites, tenantMembers, tenants } from "../../../src/db/schema.js";
import { ensureOrganizationSession, getWorkos } from "../../_utils/workos.js";
import { lockUserActiveTenant } from "../../_utils/tenant-active-lock.js";
import { appendAuditEvent } from "../../../src/db/audit.js";

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

  const auth = await requireSessionAndTenant(req, { allowUnscoped: true });
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

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, invite.tenantId)).limit(1);
    if (!tenant) return jsonError("Workspace not found", 404);
    if (tenant.workosOrgId) {
      const companyMemberships = await getWorkos().userManagement.listOrganizationMemberships({
        userId: auth.session.user.id, organizationId: tenant.workosOrgId, statuses: ["active"],
      });
      if (!companyMemberships.data.some((m) =>
        m.userId === auth.session.user.id && m.organizationId === tenant.workosOrgId && m.status === "active")) {
        // A local invitation cannot create/bypass access in a managed identity
        // directory. Keep it unconsumed so it works after the admin provisions access.
        return jsonError("Your company needs to enable your account before you can join. Contact your workspace administrator.", 403);
      }
    }
    const denied = await ensureOrganizationSession(req, auth.session, tenant.workosOrgId, tenant.id);
    if (denied) return denied;

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

    let lostRace = false;
    await db.transaction(async (tx) => {
      // Serialize this user's active-tenant writes against a concurrent
      // switch/create — without it the UPDATE-all-false below can't see a row
      // another txn is inserting, leaving two active rows. (Released at commit.)
      await lockUserActiveTenant(tx, auth.userRow.id);
      // Consume the invite ATOMICALLY first: the conditional UPDATE only
      // succeeds if it's still unaccepted/unrevoked/unexpired. The pre-txn
      // checks above are a fast path; this closes the TOCTOU where two
      // concurrent redeems both pass those checks. Zero rows → we lost the
      // race; abort the txn and 410. (Senior sweep B10.)
      const consumed = await tx
        .update(invites)
        .set({ acceptedAt: new Date(), acceptedByUserId: auth.userRow.id })
        .where(
          and(
            eq(invites.id, invite.id),
            isNull(invites.acceptedAt),
            isNull(invites.revokedAt),
            gt(invites.expiresAt, new Date()),
          ),
        )
        .returning({ id: invites.id });
      if (consumed.length === 0) {
        lostRace = true;
        return; // commit the no-op txn; membership writes skipped
      }
      await tx
        .update(tenantMembers)
        .set({ isActiveTenant: false })
        .where(eq(tenantMembers.userId, auth.userRow.id));
      if (!existing) {
        await tx.insert(tenantMembers).values({
          userId: auth.userRow.id,
          tenantId: invite.tenantId,
          role: invite.role,
          isActiveTenant: true,
        });
      } else {
        // Re-activate an existing (possibly deprovisioned) seat. Reset status
        // to active and clear the deprovision marker — otherwise the active-
        // status gate (session-with-tenant / switch) would lock out a user
        // who just accepted a valid admin re-invite. Apply the invite's role
        // too: a re-invite grants the role the inviter chose now, not a stale
        // prior one — EXCEPT we never DEMOTE an existing owner. An admin can
        // mint a low-role invite for an owner's email (invite.ts only blocks
        // minting OWNER invites), and this path bypasses the dedicated role
        // endpoint's owner + last-owner guards, so demoting here could strip
        // the workspace's sole owner. Owners keep owner.
        const reactivatedRole = existing.role === "owner" ? "owner" : invite.role;
        await tx
          .update(tenantMembers)
          .set({
            isActiveTenant: true,
            status: "active",
            deprovisionedAt: null,
            role: reactivatedRole,
          })
          .where(
            and(
              eq(tenantMembers.userId, auth.userRow.id),
              eq(tenantMembers.tenantId, invite.tenantId),
            ),
          );
      }
    });

    if (lostRace) return jsonError("Invite already accepted", 410);

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
