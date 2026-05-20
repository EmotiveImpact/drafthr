/**
 * POST /api/workspace/create — admin-only-by-virtue-of-being-the-creator.
 * Mints a new tenant, makes the current user its owner, marks the new tenant
 * active (and inactivates any other active membership). Appends a
 * `tenant.created` audit event under the new tenant.
 */
import { and, eq, sql } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { tenants, tenantMembers, auditEvents } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";

export const config = { runtime: "nodejs" };

type Body = {
  name?: string;
  industry?: string;
  teamSize?: string;
};

const MAX_NAME = 120;

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = rateLimit(req, { name: "workspace-create", max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const name = typeof parsed.body.name === "string" ? parsed.body.name.trim() : "";
  if (!name) return jsonError("Workspace name required", 400);
  if (name.length > MAX_NAME) return jsonError("Workspace name too long", 400);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.canCreateTenant) return jsonError("Cannot create more workspaces", 403);

  try {
    const db = getDb();
    const tenant = await db.transaction(async (tx) => {
      // Repurpose-not-recreate: requireSessionAndTenant (which ran a few
      // lines above when we called it) mints a bootstrap tenant on first
      // sign-in so audit events have a tenant_id. If the user's ONLY
      // existing tenant is that bootstrap (we detect this by checking it
      // has zero audit events — every "real" tenant has at least the
      // tenant.created event we'd write below), we rename it in-place
      // instead of orphaning it and creating a second one. Without this
      // every brand-new user ended up with TWO workspaces after their
      // first /workspace/create call (#double-workspace-bug).
      const memberships = await tx
        .select({
          tenantId: tenantMembers.tenantId,
          isActive: tenantMembers.isActiveTenant,
        })
        .from(tenantMembers)
        .where(eq(tenantMembers.userId, auth.userRow.id));

      if (memberships.length === 1) {
        const [only] = memberships;
        const [auditCount] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(auditEvents)
          .where(eq(auditEvents.tenantId, only.tenantId));
        const isBootstrap = !auditCount || Number(auditCount.n) === 0;
        if (isBootstrap) {
          const [renamed] = await tx
            .update(tenants)
            .set({ name, updatedAt: new Date() })
            .where(eq(tenants.id, only.tenantId))
            .returning();
          // tenant_members has a composite unique on (user_id, tenant_id);
          // ensure the bootstrap row is flagged active in case
          // requireSessionAndTenant minted it inactive for any reason.
          if (!only.isActive) {
            await tx
              .update(tenantMembers)
              .set({ isActiveTenant: true })
              .where(
                and(
                  eq(tenantMembers.userId, auth.userRow.id),
                  eq(tenantMembers.tenantId, only.tenantId),
                ),
              );
          }
          return renamed;
        }
      }

      // Otherwise: user is creating an additional workspace alongside
      // existing real ones. Create a new tenant + new active membership,
      // inactivate any prior active membership.
      const [newTenant] = await tx.insert(tenants).values({ name }).returning();
      await tx
        .update(tenantMembers)
        .set({ isActiveTenant: false })
        .where(
          and(eq(tenantMembers.userId, auth.userRow.id), eq(tenantMembers.isActiveTenant, true)),
        );
      await tx.insert(tenantMembers).values({
        userId: auth.userRow.id,
        tenantId: newTenant.id,
        role: "owner",
        isActiveTenant: true,
      });
      return newTenant;
    });

    await safelyAppendAudit({
      tenantId: tenant.id,
      kind: "tenant.created",
      subjectType: "tenant",
      subjectId: tenant.id,
      actorUserId: auth.userRow.id,
      payload: {
        name: tenant.name,
        industry: typeof parsed.body.industry === "string" ? parsed.body.industry : null,
        teamSize: typeof parsed.body.teamSize === "string" ? parsed.body.teamSize : null,
      },
    });

    return new Response(
      JSON.stringify({ tenant: { id: tenant.id, name: tenant.name, role: "owner" } }),
      {
        status: 201,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    console.error("[workspace/create] failed", err);
    return jsonError("Failed to create workspace", 500);
  }
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    // Defensive degradation — log and move on. The mutation already landed.
    console.error("[audit] append failed", input.kind, err);
  }
}
