import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { users, tenants, tenantMembers } from "../../src/db/schema.js";
import type { SessionPayload } from "./workos.js";
import { getWorkos } from "./workos.js";
import { lockUserActiveTenant } from "./tenant-active-lock.js";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
function rows(result: unknown): Record<string, unknown>[] {
  return (result as { rows?: Record<string, unknown>[] }).rows ?? result as Record<string, unknown>[];
}

/** Preserve real account IDs; bind directory identities only within a verified organization. */
export async function ensureLocalUser(session: SessionPayload, options: { reconcileDirectory?: boolean } = {}) {
  const db = getDb();
  const [known] = await db.select().from(users).where(eq(users.externalId, session.user.id)).limit(1);
  if (known && (!session.organizationId || options.reconcileDirectory === false)) return known;

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"identity:" + session.user.id}, 0))`);
    const [existing] = await tx.select().from(users).where(eq(users.externalId, session.user.id)).limit(1);

    if (session.organizationId && session.user.emailVerified) {
      const memberships = await getWorkos().userManagement.listOrganizationMemberships({
        userId: session.user.id, organizationId: session.organizationId, statuses: ["active"],
      });
      if (!memberships.data.some((m) => m.userId === session.user.id && m.organizationId === session.organizationId && m.status === "active")) {
        throw new Error("No active company membership for this identity");
      }
      const candidates = await tx.select({ user: users }).from(users)
        .innerJoin(tenantMembers, eq(tenantMembers.userId, users.id))
        .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
        .where(and(
          sql`lower(${users.email}) = lower(${session.user.email})`,
          ilike(users.externalId, "dsync:%"),
          eq(tenants.workosOrgId, session.organizationId),
          eq(tenantMembers.status, "active"),
        ));
      if (candidates.length > 1) throw new Error("Multiple directory identities require reconciliation");
      const candidate = candidates[0]?.user;
      if (candidate) {
        if (!candidate.workosDirectoryUserId) throw new Error("Directory identity is incomplete");
        const directoryUser = await getWorkos().directorySync.getUser(candidate.workosDirectoryUserId);
        if (directoryUser.organizationId !== session.organizationId || directoryUser.state !== "active" ||
            directoryUser.email?.toLowerCase() !== session.user.email.toLowerCase()) {
          throw new Error("Directory identity no longer matches this company account");
        }
        if (existing) {
          // A first unscoped login can precede the company login. Move only the
          // untouched directory seat, never merge authored records or rewrite audit history.
          return reconcileUnusedDirectorySeat(tx, existing, candidate);
        }
        const [claimed] = await tx.update(users).set({
          externalId: session.user.id, email: session.user.email, updatedAt: new Date(),
        }).where(and(eq(users.id, candidate.id), eq(users.externalId, candidate.externalId))).returning();
        if (!claimed) throw new Error("Directory identity was already claimed");
        return claimed;
      }
    }
    if (existing) return existing;
    // Registration creates an identity only. Workspaces are explicitly created or joined.
    const [created] = await tx.insert(users).values({
      externalId: session.user.id, email: session.user.email,
      legalName: [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") || null,
      workspaceRole: "drafter", userType: "customer",
    }).returning();
    return created;
  });
}

async function reconcileUnusedDirectorySeat(
  tx: Transaction, existing: typeof users.$inferSelect, candidate: typeof users.$inferSelect,
) {
  if (existing.workosDirectoryUserId && existing.workosDirectoryUserId !== candidate.workosDirectoryUserId) {
    throw new Error("Multiple directory accounts require administrator reconciliation");
  }
  await lockUserActiveTenant(tx, existing.id);
  await lockUserActiveTenant(tx, candidate.id);
  // Lock the placeholder, including against concurrent FK references and claims.
  const [current] = await tx.select().from(users).where(eq(users.id, candidate.id)).for("update");
  if (current.externalId !== candidate.externalId) throw new Error("Directory identity was already claimed");
  const seats = await tx.select().from(tenantMembers).where(eq(tenantMembers.userId, candidate.id));
  if (seats.length !== 1 || seats[0].status !== "active") throw new Error("Directory seats require administrator reconciliation");

  // Discover every actual FK to users rather than maintaining a brittle table
  // allowlist. If this placeholder has business history, refuse an automatic merge.
  const references = rows(await tx.execute(sql`
    SELECT ns.nspname AS schema_name, rel.relname AS table_name, attr.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_attribute attr ON attr.attrelid = c.conrelid AND attr.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
  `));
  for (const ref of references) {
    if (ref.table_name === "tenant_members") continue;
    const found = rows(await tx.execute(sql`SELECT 1 FROM ${sql.identifier(String(ref.schema_name))}.${sql.identifier(String(ref.table_name))}
      WHERE ${sql.identifier(String(ref.column_name))} = ${candidate.id} LIMIT 1`));
    if (found.length) throw new Error("Directory account has business history; administrator reconciliation required");
  }
  const [active] = await tx.select().from(tenantMembers).where(and(
    eq(tenantMembers.userId, existing.id), eq(tenantMembers.isActiveTenant, true), eq(tenantMembers.status, "active"),
  )).limit(1);
  await tx.insert(tenantMembers).values({
    ...seats[0], userId: existing.id, isActiveTenant: !active && seats[0].isActiveTenant,
  }).onConflictDoNothing({ target: [tenantMembers.userId, tenantMembers.tenantId] });
  // Retain the old row for historical directory audit subject IDs. It grants no
  // access and no longer receives directory events.
  await tx.update(tenantMembers).set({ status: "deprovisioned", isActiveTenant: false, deprovisionedAt: new Date() })
    .where(eq(tenantMembers.userId, candidate.id));
  await tx.update(users).set({
    externalId: "dsync-linked:" + candidate.id, workosDirectoryUserId: null, workosDirectoryId: null, updatedAt: new Date(),
  }).where(eq(users.id, candidate.id));
  const [linked] = await tx.update(users).set({
    workosDirectoryUserId: candidate.workosDirectoryUserId, workosDirectoryId: candidate.workosDirectoryId, updatedAt: new Date(),
  }).where(eq(users.id, existing.id)).returning();
  return linked;
}
