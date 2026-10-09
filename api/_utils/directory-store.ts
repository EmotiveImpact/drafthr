/**
 * Persistence for Directory Sync provisioning and identity linking.
 *
 * The policy (who matches whom, what may be written, when sessions end) lives
 * in directory-provisioning.ts and talks to this narrow interface, so it can be
 * tested against an in-memory store (directory-store.memory.ts). This file is
 * the Drizzle implementation: every query here is either keyed on a globally
 * unique id or explicitly scoped to one tenant.
 */
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";
import { tenantMembers, tenants, users } from "../../src/db/schema.js";
import { appendAuditEvent } from "../../src/db/audit.js";
import { bumpUserSessionEpoch } from "./session-epoch.js";
import { lockTenantOwnerGuard, lockUserActiveTenant } from "./tenant-active-lock.js";

/** external_id prefix for a user row minted by Directory Sync before the
 *  person has ever signed in. Replaced by the WorkOS user id on first sign-in. */
export const PLACEHOLDER_PREFIX = "dsync:";
/** external_id prefix for a placeholder whose memberships were merged into a
 *  real user. Kept (not deleted) so audit rows that name it still resolve. */
export const MERGED_PLACEHOLDER_PREFIX = "dsync-merged:";

export type DirectoryUserRecord = {
  id: string;
  externalId: string;
  email: string | null;
  legalName: string | null;
  workosDirectoryUserId: string | null;
  workosDirectoryId: string | null;
  tenantId: string | null;
};

export type DirectoryUserPatch = Partial<
  Pick<DirectoryUserRecord, "email" | "legalName" | "workosDirectoryUserId" | "workosDirectoryId">
>;

export type AuditInput = Parameters<typeof appendAuditEvent>[0];

export interface DirectoryStore {
  findTenantIdByOrgId(orgId: string): Promise<string | null>;
  findUserByDirectoryUserId(directoryUserId: string): Promise<DirectoryUserRecord | null>;
  findUserByExternalId(externalId: string): Promise<DirectoryUserRecord | null>;
  /** Users with this email (case-insensitive) who already belong to the tenant:
   *  a membership row in it (any status) or it is their home tenant. */
  findTenantUsersByEmail(tenantId: string, email: string): Promise<DirectoryUserRecord[]>;
  /** Unclaimed directory placeholders with this email, across tenants. */
  findPlaceholdersByEmail(email: string): Promise<DirectoryUserRecord[]>;
  /** Every tenant the user holds a membership row in (any status). */
  listMembershipTenantIds(userId: string): Promise<string[]>;
  updateUser(userId: string, patch: DirectoryUserPatch): Promise<void>;
  insertPlaceholderUser(input: {
    tenantId: string;
    directoryUserId: string;
    directoryId: string;
    email: string | null;
    legalName: string | null;
    role: string;
  }): Promise<DirectoryUserRecord>;
  /** Upsert an active membership; joins as the active tenant only when the
   *  user has no other active membership. Never flips an existing active flag. */
  upsertActiveMembership(userId: string, tenantId: string, role: string): Promise<void>;
  /** Soft-delete the given users' memberships in this tenant. Returns the
   *  users whose membership was active and is now deprovisioned. */
  deprovisionMemberships(
    tenantId: string,
    userIds: string[],
  ): Promise<{ deprovisionedUserIds: string[]; leftOwnerless: boolean }>;
  /** Point a placeholder at a WorkOS user id. False if it was already claimed
   *  or the external id is taken (a concurrent sign-in won). */
  claimPlaceholder(placeholderId: string, externalId: string): Promise<boolean>;
  /** Move a placeholder's memberships and directory ids onto a real user and
   *  retire the placeholder. Returns the tenants affected. */
  mergePlaceholderInto(placeholderId: string, realUserId: string): Promise<string[]>;
  bumpSessionEpoch(externalId: string): Promise<void>;
  appendAudit(input: AuditInput): Promise<void>;
}

const userColumns = {
  id: users.id,
  externalId: users.externalId,
  email: users.email,
  legalName: users.legalName,
  workosDirectoryUserId: users.workosDirectoryUserId,
  workosDirectoryId: users.workosDirectoryId,
  tenantId: users.tenantId,
};

export function createDrizzleDirectoryStore(): DirectoryStore {
  const db = getDb();
  return {
    async findTenantIdByOrgId(orgId) {
      const [row] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.workosOrgId, orgId))
        .limit(1);
      return row?.id ?? null;
    },

    async findUserByDirectoryUserId(directoryUserId) {
      const [row] = await db
        .select(userColumns)
        .from(users)
        .where(eq(users.workosDirectoryUserId, directoryUserId))
        .limit(1);
      return row ?? null;
    },

    async findUserByExternalId(externalId) {
      const [row] = await db
        .select(userColumns)
        .from(users)
        .where(eq(users.externalId, externalId))
        .limit(1);
      return row ?? null;
    },

    async findTenantUsersByEmail(tenantId, email) {
      return db
        .selectDistinct(userColumns)
        .from(users)
        .leftJoin(
          tenantMembers,
          and(eq(tenantMembers.userId, users.id), eq(tenantMembers.tenantId, tenantId)),
        )
        .where(
          and(
            sql`lower(${users.email}) = ${email.toLowerCase()}`,
            or(sql`${tenantMembers.userId} IS NOT NULL`, eq(users.tenantId, tenantId)),
          ),
        );
    },

    async findPlaceholdersByEmail(email) {
      return db
        .select(userColumns)
        .from(users)
        .where(
          and(
            sql`lower(${users.email}) = ${email.toLowerCase()}`,
            like(users.externalId, `${PLACEHOLDER_PREFIX}%`),
          ),
        );
    },

    async listMembershipTenantIds(userId) {
      const rows = await db
        .select({ tenantId: tenantMembers.tenantId })
        .from(tenantMembers)
        .where(eq(tenantMembers.userId, userId));
      return rows.map((r) => r.tenantId);
    },

    async updateUser(userId, patch) {
      if (Object.keys(patch).length === 0) return;
      await db
        .update(users)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(users.id, userId));
    },

    async insertPlaceholderUser(input) {
      const [created] = await db
        .insert(users)
        .values({
          tenantId: input.tenantId,
          externalId: `${PLACEHOLDER_PREFIX}${input.directoryUserId}`,
          email: input.email,
          legalName: input.legalName,
          workspaceRole: input.role,
          userType: "customer",
          workosDirectoryUserId: input.directoryUserId,
          workosDirectoryId: input.directoryId,
        })
        .returning(userColumns);
      return created;
    },

    async upsertActiveMembership(userId, tenantId, role) {
      // Serialize the "active elsewhere?" read + the membership insert under a
      // per-user advisory lock so they're atomic against a concurrent provision
      // into a DIFFERENT tenant (and against switch/accept-invite/create).
      await db.transaction(async (tx) => {
        await lockUserActiveTenant(tx, userId);
        const [activeElsewhere] = await tx
          .select({ tenantId: tenantMembers.tenantId })
          .from(tenantMembers)
          .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.isActiveTenant, true)))
          .limit(1);
        await tx
          .insert(tenantMembers)
          .values({
            userId,
            tenantId,
            role,
            isActiveTenant: !activeElsewhere,
            status: "active",
            deprovisionedAt: null,
          })
          .onConflictDoUpdate({
            target: [tenantMembers.userId, tenantMembers.tenantId],
            // Deliberately does NOT touch isActiveTenant.
            set: { role, status: "active", deprovisionedAt: null },
          });
      });
    },

    async deprovisionMemberships(tenantId, userIds) {
      if (userIds.length === 0) return { deprovisionedUserIds: [], leftOwnerless: false };
      // Same owner-guard lock as member role/remove (R12 TOCTOU class).
      return db.transaction(async (tx) => {
        await lockTenantOwnerGuard(tx, tenantId);
        const changed = await tx
          .update(tenantMembers)
          .set({ status: "deprovisioned", deprovisionedAt: new Date(), isActiveTenant: false })
          .where(
            and(
              eq(tenantMembers.tenantId, tenantId),
              inArray(tenantMembers.userId, userIds),
              eq(tenantMembers.status, "active"),
            ),
          )
          .returning({ userId: tenantMembers.userId });
        const owners = await tx
          .select({ userId: tenantMembers.userId })
          .from(tenantMembers)
          .where(
            and(
              eq(tenantMembers.tenantId, tenantId),
              eq(tenantMembers.role, "owner"),
              eq(tenantMembers.status, "active"),
            ),
          );
        return {
          deprovisionedUserIds: changed.map((c) => c.userId),
          leftOwnerless: owners.length === 0,
        };
      });
    },

    async claimPlaceholder(placeholderId, externalId) {
      try {
        const rows = await db
          .update(users)
          .set({ externalId, updatedAt: new Date() })
          .where(and(eq(users.id, placeholderId), like(users.externalId, `${PLACEHOLDER_PREFIX}%`)))
          .returning({ id: users.id });
        return rows.length > 0;
      } catch (err) {
        // 23505: external_id already taken by a row a concurrent request
        // minted. The caller falls back to merging into that row.
        if ((err as { code?: string })?.code === "23505") return false;
        throw err;
      }
    },

    async mergePlaceholderInto(placeholderId, realUserId) {
      return db.transaction(async (tx) => {
        await lockUserActiveTenant(tx, realUserId);
        const [placeholder] = await tx
          .select(userColumns)
          .from(users)
          .where(eq(users.id, placeholderId))
          .limit(1);
        const [real] = await tx.select(userColumns).from(users).where(eq(users.id, realUserId)).limit(1);
        if (!placeholder || !real || !placeholder.externalId.startsWith(PLACEHOLDER_PREFIX)) return [];

        const moved = await tx
          .select()
          .from(tenantMembers)
          .where(eq(tenantMembers.userId, placeholderId));
        const [activeAlready] = await tx
          .select({ tenantId: tenantMembers.tenantId })
          .from(tenantMembers)
          .where(and(eq(tenantMembers.userId, realUserId), eq(tenantMembers.isActiveTenant, true)))
          .limit(1);
        let canTakeActive = !activeAlready;

        for (const m of moved) {
          await lockTenantOwnerGuard(tx, m.tenantId);
          const makeActive = canTakeActive && m.status === "active";
          if (makeActive) canTakeActive = false;
          await tx
            .insert(tenantMembers)
            .values({
              userId: realUserId,
              tenantId: m.tenantId,
              role: m.role,
              status: m.status,
              deprovisionedAt: m.deprovisionedAt,
              isActiveTenant: makeActive,
            })
            .onConflictDoUpdate({
              target: [tenantMembers.userId, tenantMembers.tenantId],
              // The directory is authoritative for this tenant's seat.
              set:
                m.status === "active"
                  ? { role: m.role, status: "active", deprovisionedAt: null }
                  : { role: m.role, status: m.status, deprovisionedAt: m.deprovisionedAt, isActiveTenant: false },
            });
        }
        await tx.delete(tenantMembers).where(eq(tenantMembers.userId, placeholderId));

        // Retire the placeholder first so its directory id is free for the
        // real user (unique index), then carry the id across if the real user
        // has none yet. If they already carry another directory's id, matching
        // for this tenant falls back to email within the tenant.
        await tx
          .update(users)
          .set({
            externalId: `${MERGED_PLACEHOLDER_PREFIX}${placeholderId}`,
            workosDirectoryUserId: null,
            workosDirectoryId: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, placeholderId));
        if (!real.workosDirectoryUserId && placeholder.workosDirectoryUserId) {
          await tx
            .update(users)
            .set({
              workosDirectoryUserId: placeholder.workosDirectoryUserId,
              workosDirectoryId: placeholder.workosDirectoryId,
              updatedAt: new Date(),
            })
            .where(eq(users.id, realUserId));
        }
        return moved.map((m) => m.tenantId);
      });
    },

    async bumpSessionEpoch(externalId) {
      await bumpUserSessionEpoch(externalId);
    },

    async appendAudit(input) {
      await appendAuditEvent(input);
    },
  };
}
