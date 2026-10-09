/**
 * In-memory DirectoryStore for tests. Mirrors the semantics of the Drizzle
 * implementation in directory-store.ts closely enough to exercise the policy
 * in directory-provisioning.ts: tenant-scoped email matching, the unique
 * directory-user-id and external-id constraints, active-tenant rules, and
 * placeholder claim / merge.
 */
import type {
  AuditInput,
  DirectoryStore,
  DirectoryUserPatch,
  DirectoryUserRecord,
} from "./directory-store.js";
import { MERGED_PLACEHOLDER_PREFIX, PLACEHOLDER_PREFIX } from "./directory-store.js";

export type MemoryMember = {
  userId: string;
  tenantId: string;
  role: string;
  status: string;
  deprovisionedAt: Date | null;
  isActiveTenant: boolean;
};

export type MemoryState = {
  tenants: { id: string; workosOrgId: string | null }[];
  users: DirectoryUserRecord[];
  members: MemoryMember[];
  epochs: Map<string, number>;
  audit: AuditInput[];
  userUpdates: { userId: string; patch: DirectoryUserPatch }[];
};

export function createMemoryState(): MemoryState {
  return { tenants: [], users: [], members: [], epochs: new Map(), audit: [], userUpdates: [] };
}

export function createMemoryDirectoryStore(state: MemoryState): DirectoryStore {
  const lower = (s: string | null) => (s ?? "").toLowerCase();
  const byId = (id: string) => state.users.find((u) => u.id === id) ?? null;
  const assertUnique = (u: DirectoryUserRecord) => {
    if (state.users.some((o) => o !== u && o.externalId === u.externalId)) {
      throw Object.assign(new Error("duplicate external_id"), { code: "23505" });
    }
    if (
      u.workosDirectoryUserId &&
      state.users.some((o) => o !== u && o.workosDirectoryUserId === u.workosDirectoryUserId)
    ) {
      throw Object.assign(new Error("duplicate workos_directory_user_id"), { code: "23505" });
    }
  };

  return {
    async findTenantIdByOrgId(orgId) {
      return state.tenants.find((t) => t.workosOrgId === orgId)?.id ?? null;
    },
    async findUserByDirectoryUserId(directoryUserId) {
      return state.users.find((u) => u.workosDirectoryUserId === directoryUserId) ?? null;
    },
    async findUserByExternalId(externalId) {
      return state.users.find((u) => u.externalId === externalId) ?? null;
    },
    async findTenantUsersByEmail(tenantId, email) {
      return state.users.filter(
        (u) =>
          lower(u.email) === email.toLowerCase() &&
          (u.tenantId === tenantId ||
            state.members.some((m) => m.userId === u.id && m.tenantId === tenantId)),
      );
    },
    async findPlaceholdersByEmail(email) {
      return state.users.filter(
        (u) => lower(u.email) === email.toLowerCase() && u.externalId.startsWith(PLACEHOLDER_PREFIX),
      );
    },
    async listMembershipTenantIds(userId) {
      return state.members.filter((m) => m.userId === userId).map((m) => m.tenantId);
    },
    async updateUser(userId, patch) {
      if (Object.keys(patch).length === 0) return;
      state.userUpdates.push({ userId, patch });
      const u = byId(userId);
      if (!u) return;
      const before = { ...u };
      Object.assign(u, patch);
      try {
        assertUnique(u);
      } catch (err) {
        Object.assign(u, before);
        throw err;
      }
    },
    async insertPlaceholderUser(input) {
      const row: DirectoryUserRecord = {
        id: `user_${state.users.length + 1}`,
        externalId: `${PLACEHOLDER_PREFIX}${input.directoryUserId}`,
        email: input.email,
        legalName: input.legalName,
        workosDirectoryUserId: input.directoryUserId,
        workosDirectoryId: input.directoryId,
        tenantId: input.tenantId,
      };
      assertUnique(row);
      state.users.push(row);
      return row;
    },
    async upsertActiveMembership(userId, tenantId, role) {
      const existing = state.members.find((m) => m.userId === userId && m.tenantId === tenantId);
      if (existing) {
        Object.assign(existing, { role, status: "active", deprovisionedAt: null });
        return;
      }
      const activeElsewhere = state.members.some((m) => m.userId === userId && m.isActiveTenant);
      state.members.push({
        userId,
        tenantId,
        role,
        status: "active",
        deprovisionedAt: null,
        isActiveTenant: !activeElsewhere,
      });
    },
    async deprovisionMemberships(tenantId, userIds) {
      const changed: string[] = [];
      for (const m of state.members) {
        if (m.tenantId === tenantId && userIds.includes(m.userId) && m.status === "active") {
          Object.assign(m, { status: "deprovisioned", deprovisionedAt: new Date(), isActiveTenant: false });
          changed.push(m.userId);
        }
      }
      const owners = state.members.filter(
        (m) => m.tenantId === tenantId && m.role === "owner" && m.status === "active",
      );
      return { deprovisionedUserIds: changed, leftOwnerless: owners.length === 0 };
    },
    async claimPlaceholder(placeholderId, externalId) {
      const u = byId(placeholderId);
      if (!u || !u.externalId.startsWith(PLACEHOLDER_PREFIX)) return false;
      if (state.users.some((o) => o.externalId === externalId)) return false;
      u.externalId = externalId;
      return true;
    },
    async mergePlaceholderInto(placeholderId, realUserId) {
      const placeholder = byId(placeholderId);
      const real = byId(realUserId);
      if (!placeholder || !real || !placeholder.externalId.startsWith(PLACEHOLDER_PREFIX)) return [];
      const moved = state.members.filter((m) => m.userId === placeholderId);
      let canTakeActive = !state.members.some((m) => m.userId === realUserId && m.isActiveTenant);
      for (const m of moved) {
        const makeActive = canTakeActive && m.status === "active";
        if (makeActive) canTakeActive = false;
        const existing = state.members.find((x) => x.userId === realUserId && x.tenantId === m.tenantId);
        if (existing) {
          existing.role = m.role;
          existing.status = m.status;
          existing.deprovisionedAt = m.status === "active" ? null : m.deprovisionedAt;
          if (m.status !== "active") existing.isActiveTenant = false;
        } else {
          state.members.push({ ...m, userId: realUserId, isActiveTenant: makeActive });
        }
      }
      state.members = state.members.filter((m) => m.userId !== placeholderId);
      const dirUserId = placeholder.workosDirectoryUserId;
      const dirId = placeholder.workosDirectoryId;
      placeholder.externalId = `${MERGED_PLACEHOLDER_PREFIX}${placeholderId}`;
      placeholder.workosDirectoryUserId = null;
      placeholder.workosDirectoryId = null;
      if (!real.workosDirectoryUserId && dirUserId) {
        real.workosDirectoryUserId = dirUserId;
        real.workosDirectoryId = dirId;
      }
      return moved.map((m) => m.tenantId);
    },
    async bumpSessionEpoch(externalId) {
      state.epochs.set(externalId, (state.epochs.get(externalId) ?? 0) + 1);
    },
    async appendAudit(input) {
      state.audit.push(input);
    },
  };
}
