import { sql, type SQL } from "drizzle-orm";

/** Minimal structural type for a drizzle transaction/db that can run raw SQL. */
type SqlExecutor = { execute: (query: SQL) => Promise<unknown> };

/**
 * Serialize every write to a user's active-tenant flag.
 *
 * The "exactly one active tenant_members row per user" invariant is enforced
 * only by application-level statement pairs (UPDATE-all-false, then set/INSERT
 * one true). Under READ COMMITTED (Neon's default) a row INSERTed by a
 * concurrent transaction is invisible to another transaction's UPDATE-all-false
 * scan, so `switch` racing `accept-invite`/`create` can leave TWO rows with
 * `is_active_tenant = true` — after which `requireSessionAndTenant` resolves the
 * active workspace nondeterministically and tenant-scoped writes land in an
 * unpredictable tenant.
 *
 * Taking a per-user Postgres advisory lock as the FIRST statement of each such
 * transaction serializes them without a schema/migration change. The lock is
 * transaction-scoped, so it releases automatically on commit or rollback, and
 * it is keyed on the user id so it never blocks a different user.
 */
export async function lockUserActiveTenant(tx: SqlExecutor, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
}

/**
 * Serialize every owner-affecting mutation for a tenant (member demote,
 * member remove, directory deprovision). The "at least one active owner"
 * invariant is enforced by an app-level count-then-act; without a common lock
 * two concurrent mutations can each count 2 live owners and both proceed,
 * leaving the workspace ownerless (R12). Transaction-scoped like the lock
 * above; keyed per tenant so unrelated tenants never contend.
 */
export async function lockTenantOwnerGuard(tx: SqlExecutor, tenantId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"owner-guard:" + tenantId}, 0))`);
}
