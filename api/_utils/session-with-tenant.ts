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
import { getDb } from "../../src/db/index.js";
import { users, tenants, tenantMembers } from "../../src/db/schema.js";
import type { Tenant, User } from "../../src/db/schema.js";
import {
  requireSession,
  type SessionPayload,
} from "./workos.js";
import { jsonError } from "./request.js";
import { getUserSessionEpoch, isCookieEpochStale } from "./session-epoch.js";

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
      userRow = await bootstrapUser(db, session);
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

    // Server-side session revocation (SE-03): reject a cookie whose epoch is
    // behind the user's stored epoch. Bumped on sign-out / password reset, so a
    // stolen cookie dies immediately instead of surviving its 7-day TTL.
    // Fails OPEN (no enforcement) if the epoch can't be read — pre-migration or
    // a transient DB blip must never log a valid user out.
    const dbEpoch = await getUserSessionEpoch(session.user.id);
    if (isCookieEpochStale(session.epoch, dbEpoch)) {
      return { ok: false, response: jsonError("Session expired — please sign in again.", 401) };
    }

    const [member] = await db
      .select({
        role: tenantMembers.role,
        tenantId: tenantMembers.tenantId,
      })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.userId, userRow.id),
          eq(tenantMembers.isActiveTenant, true),
          // A seat soft-deleted by Directory Sync (status='deprovisioned',
          // the IdP removed the user) must NOT grant API access — otherwise a
          // still-signed-in offboarded user keeps their old role until the
          // 7-day cookie expires. session.ts already hides these from the
          // client; this is the enforcement counterpart.
          eq(tenantMembers.status, "active"),
        ),
      )
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

type Db = ReturnType<typeof getDb>;

/**
 * First sign-in: mint the user row plus a personal ("bootstrap") workspace, so
 * audit chains for first-run actions have a home. They can switch to a shared
 * workspace later (or stay on this one if they're a solo HR user).
 *
 * Idempotent under concurrent first requests (the SPA fires several at once).
 * The user row is inserted first with ON CONFLICT (external_id) DO NOTHING,
 * inside one transaction with the tenant and membership inserts. Only the
 * request whose insert wins goes on to create the workspace; a racing request
 * blocks on the unique index until the winner commits, inserts nothing, and
 * reads the winner's row. Previously each racer created its own tenant before
 * the user insert failed on the unique constraint, leaving orphan workspaces
 * (and a 500 for the loser).
 */
export async function bootstrapUser(db: Db, session: SessionPayload): Promise<User> {
  const externalId = session.user.id;
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(users)
      .values({
        externalId,
        email: session.user.email,
        legalName: deriveLegalName(session.user.firstName, session.user.lastName),
        workspaceRole: "owner",
        userType: "customer",
      })
      .onConflictDoNothing({ target: users.externalId })
      .returning();
    if (!inserted) {
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.externalId, externalId))
        .limit(1);
      if (!existing) throw new Error("user row vanished during bootstrap");
      return existing;
    }

    const [bootTenant] = await tx
      .insert(tenants)
      .values({ name: deriveBootstrapTenantName(session.user.email, session.user.firstName) })
      .returning();
    await tx
      .insert(tenantMembers)
      .values({ userId: inserted.id, tenantId: bootTenant.id, role: "owner", isActiveTenant: true })
      .onConflictDoNothing({ target: [tenantMembers.userId, tenantMembers.tenantId] });
    const [withHome] = await tx
      .update(users)
      .set({ tenantId: bootTenant.id })
      .where(eq(users.id, inserted.id))
      .returning();
    return withHome;
  });
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
