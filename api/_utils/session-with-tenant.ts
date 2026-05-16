/**
 * requireSessionAndTenant — single chokepoint for any API that mutates or reads
 * tenant-scoped data. Upserts the user row on first sign-in (so WorkOS identity
 * always has a matching local `users` row), then locates the active
 * `tenant_members` entry. When the user has no active workspace, callers route
 * them to `/signup/workspace`.
 *
 * Why upsert here: WorkOS owns identity but our row owns the FK targets used by
 * every tenant_id-scoped table. Minting on first session keeps the foreign keys
 * intact without forcing a separate "first-time provisioning" round-trip.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../../src/db";
import { users, tenants, tenantMembers } from "../../src/db/schema";
import type { Tenant, User } from "../../src/db/schema";
import {
  requireSession,
  type SessionPayload,
} from "./workos";
import { jsonError } from "./request";

export type RequireSessionAndTenantResult =
  | {
      ok: true;
      session: SessionPayload;
      userRow: User;
      activeTenant: Tenant | null;
      activeMember: { role: string } | null;
      userType: "customer" | "consultant";
      canCreateTenant: boolean;
    }
  | { ok: false; response: Response };

export async function requireSessionAndTenant(
  req: Request,
): Promise<RequireSessionAndTenantResult> {
  const sessionResult = await requireSession(req);
  if (!sessionResult.ok) return sessionResult;
  const session = sessionResult.session;

  try {
    const db = getDb();
    const externalId = session.user.id;

    // Upsert: try to find by externalId, else mint a tenant + user row.
    // Even users without an active workspace need a `users` row so that
    // tenant_members joins can target them when invites resolve.
    let [userRow] = await db.select().from(users).where(eq(users.externalId, externalId)).limit(1);
    if (!userRow) {
      // Bootstrap tenant — every user gets a personal tenant on mint, so audit
      // chains for first-run actions have a home. They can switch to a shared
      // workspace later (or stay on this one if they're a solo HR user).
      const [bootTenant] = await db
        .insert(tenants)
        .values({
          name: deriveBootstrapTenantName(session.user.email, session.user.firstName),
        })
        .returning();
      [userRow] = await db
        .insert(users)
        .values({
          tenantId: bootTenant.id,
          externalId,
          email: session.user.email,
          legalName: deriveLegalName(session.user.firstName, session.user.lastName),
          workspaceRole: "owner",
          userType: "customer",
        })
        .returning();
      await db.insert(tenantMembers).values({
        userId: userRow.id,
        tenantId: bootTenant.id,
        role: "owner",
        isActiveTenant: true,
      });
    } else if (
      session.user.email &&
      session.user.email.toLowerCase() !== (userRow.email ?? "").toLowerCase()
    ) {
      // Keep stored email aligned with WorkOS — they may have changed it.
      const [updated] = await db
        .update(users)
        .set({ email: session.user.email, updatedAt: new Date() })
        .where(eq(users.id, userRow.id))
        .returning();
      userRow = updated;
    }

    const [member] = await db
      .select({
        role: tenantMembers.role,
        tenantId: tenantMembers.tenantId,
      })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.userId, userRow.id), eq(tenantMembers.isActiveTenant, true)))
      .limit(1);

    let activeTenant: Tenant | null = null;
    if (member) {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, member.tenantId)).limit(1);
      activeTenant = t ?? null;
    }

    return {
      ok: true,
      session,
      userRow,
      activeTenant,
      activeMember: member ? { role: member.role } : null,
      userType: (userRow.userType as "customer" | "consultant") ?? "customer",
      canCreateTenant: true,
    };
  } catch (err) {
    console.error("[requireSessionAndTenant] db error", err);
    return { ok: false, response: jsonError("Workspace lookup failed", 500) };
  }
}

function deriveBootstrapTenantName(email: string, firstName: string | null): string {
  if (firstName && firstName.trim()) return `${firstName.trim()}'s workspace`;
  const local = email.split("@")[0] ?? "Personal";
  return `${local}'s workspace`;
}

function deriveLegalName(firstName: string | null, lastName: string | null): string | null {
  const parts = [firstName, lastName].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(" ") : null;
}
