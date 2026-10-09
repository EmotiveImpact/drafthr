/**
 * Directory Sync provisioning policy: who a directory user maps to, what the
 * directory may write, and how offboarding reaches the person who actually
 * signs in. Persistence is behind DirectoryStore (directory-store.ts).
 *
 * Rules:
 *   1. Tenant scope. A directory belongs to one WorkOS organisation, which maps
 *      to one tenant. Every match and every write is scoped to that tenant: a
 *      user is matched by email only if they already belong to the tenant, so
 *      a customer's directory can never adopt or edit a user in some other
 *      workspace just by listing their address. If nobody in the tenant
 *      matches, a placeholder row is minted for this tenant.
 *   2. Profile writes. The directory may update a user's name only when every
 *      membership that user holds is in this tenant. Email is only written on
 *      placeholders (a signed-in user's email belongs to their WorkOS login).
 *   3. Linking. When a person signs in with a verified email that matches a
 *      placeholder, the placeholder is claimed (first sign-in) or merged into
 *      their existing user row, so their real account carries the directory
 *      membership from then on.
 *   4. Offboarding. Deprovision removes the seat of every user in the tenant
 *      matched by directory user id or by email, not only the placeholder, and
 *      bumps the session epoch of each real (signed-in) user whose seat was
 *      removed so their existing sessions end immediately.
 */
import type { DirectoryStore, DirectoryUserPatch, DirectoryUserRecord } from "./directory-store.js";
import { MERGED_PLACEHOLDER_PREFIX, PLACEHOLDER_PREFIX } from "./directory-store.js";
import {
  extractDirectoryEmail,
  extractDirectoryName,
  mapDirectoryRoleToTenantRole,
} from "./directory-sync.js";

export type DirectoryUserLike = {
  id: string;
  directoryId: string;
  organizationId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  state: "active" | "inactive";
  customAttributes?: Record<string, unknown>;
  role?: { slug: string };
};

export type DeprovisionKind =
  | "directory.user.deprovisioned"
  | "directory.user.deactivated"
  | "directory.user.group_removed";

export function isPlaceholder(user: Pick<DirectoryUserRecord, "externalId">): boolean {
  return (
    user.externalId.startsWith(PLACEHOLDER_PREFIX) ||
    user.externalId.startsWith(MERGED_PLACEHOLDER_PREFIX)
  );
}

/** Drop placeholders already merged into a real user: they hold no seats. */
function liveUsers(rows: DirectoryUserRecord[]): DirectoryUserRecord[] {
  return rows.filter((u) => !u.externalId.startsWith(MERGED_PLACEHOLDER_PREFIX));
}

/** True when the user's only workspace is `tenantId`. */
async function belongsOnlyTo(
  store: DirectoryStore,
  user: DirectoryUserRecord,
  tenantId: string,
): Promise<boolean> {
  const tenantIds = await store.listMembershipTenantIds(user.id);
  if (tenantIds.some((t) => t !== tenantId)) return false;
  return user.tenantId === null || user.tenantId === tenantId;
}

/** Resolve the directory user to a row in this tenant (never outside it). */
async function resolveTenantUser(
  store: DirectoryStore,
  tenantId: string,
  user: DirectoryUserLike,
  email: string | null,
): Promise<{ match: DirectoryUserRecord | null; directoryIdTakenElsewhere: boolean }> {
  const byDirectoryId = await store.findUserByDirectoryUserId(user.id);
  if (byDirectoryId) {
    // WorkOS directory user ids are unique to a directory, and the directory
    // belongs to the org that maps to this tenant. Still, only trust the row
    // if it came from the same directory or already belongs to this tenant.
    const sameDirectory = byDirectoryId.workosDirectoryId === user.directoryId;
    const inTenant =
      sameDirectory || (await store.listMembershipTenantIds(byDirectoryId.id)).includes(tenantId);
    if (inTenant) return { match: byDirectoryId, directoryIdTakenElsewhere: false };
  }
  if (email) {
    const candidates = liveUsers(await store.findTenantUsersByEmail(tenantId, email));
    // Prefer a signed-in user over a placeholder, then one not yet linked to
    // another directory user.
    const ranked = [...candidates].sort(
      (a, b) =>
        Number(isPlaceholder(a)) - Number(isPlaceholder(b)) ||
        Number(Boolean(a.workosDirectoryUserId)) - Number(Boolean(b.workosDirectoryUserId)),
    );
    if (ranked[0]) return { match: ranked[0], directoryIdTakenElsewhere: Boolean(byDirectoryId) };
  }
  return { match: null, directoryIdTakenElsewhere: Boolean(byDirectoryId) };
}

export async function provisionDirectoryUser(
  store: DirectoryStore,
  tenantId: string,
  user: DirectoryUserLike,
): Promise<void> {
  // Per the WorkOS docs, state="inactive" means the IdP deactivated the user
  // without deleting them. Treat that as deprovisioning.
  if (user.state === "inactive") {
    await deprovisionDirectoryUser(store, tenantId, user, "directory.user.deactivated");
    return;
  }

  const email = extractDirectoryEmail(user);
  const legalName = extractDirectoryName(user);
  const role = mapDirectoryRoleToTenantRole(user.role?.slug);

  const { match, directoryIdTakenElsewhere } = await resolveTenantUser(store, tenantId, user, email);

  let target: DirectoryUserRecord;
  let isNew = false;
  if (match) {
    const patch: DirectoryUserPatch = {};
    if (await belongsOnlyTo(store, match, tenantId)) {
      if (legalName && legalName !== match.legalName) patch.legalName = legalName;
      if (isPlaceholder(match) && email && email !== match.email) patch.email = email;
    }
    // Carry the directory id when the row has none, already has it, or has a
    // stale id from this same directory (the IdP recreated the user). Never
    // overwrite a link to a different directory.
    const canCarryDirectoryId =
      !directoryIdTakenElsewhere &&
      (match.workosDirectoryUserId === null ||
        match.workosDirectoryUserId === user.id ||
        match.workosDirectoryId === user.directoryId);
    if (canCarryDirectoryId) {
      if (match.workosDirectoryUserId !== user.id) patch.workosDirectoryUserId = user.id;
      if (match.workosDirectoryId !== user.directoryId) patch.workosDirectoryId = user.directoryId;
    }
    await store.updateUser(match.id, patch);
    target = match;
  } else if (directoryIdTakenElsewhere) {
    // The directory id is already on a row we refuse to touch (another
    // tenant). Do not mint a duplicate that would collide on the unique index.
    console.error("[directory-sync] directory user id already bound outside tenant", tenantId, user.id);
    return;
  } else {
    target = await store.insertPlaceholderUser({
      tenantId,
      directoryUserId: user.id,
      directoryId: user.directoryId,
      email,
      legalName,
      role,
    });
    isNew = true;
  }

  await store.upsertActiveMembership(target.id, tenantId, role);

  await safelyAppendAudit(store, {
    tenantId,
    kind: isNew ? "directory.user.provisioned" : "directory.user.role_changed",
    subjectType: "user",
    subjectId: target.id,
    actorUserId: null,
    payload: {
      workosDirectoryUserId: user.id,
      workosDirectoryId: user.directoryId,
      email,
      role,
    },
  });
}

export async function deprovisionDirectoryUser(
  store: DirectoryStore,
  tenantId: string,
  user: DirectoryUserLike,
  kind: DeprovisionKind,
): Promise<void> {
  const email = extractDirectoryEmail(user);

  // Everyone in THIS tenant who is this directory user: the row carrying the
  // directory id, plus any user in the tenant with the same email (the real
  // person may have joined by invite, or signed in before linking existed).
  const matched = new Map<string, DirectoryUserRecord>();
  const byDirectoryId = await store.findUserByDirectoryUserId(user.id);
  if (byDirectoryId) matched.set(byDirectoryId.id, byDirectoryId);
  if (email) {
    for (const u of liveUsers(await store.findTenantUsersByEmail(tenantId, email))) {
      matched.set(u.id, u);
    }
  }
  if (matched.size === 0) return; // never provisioned, nothing to audit

  // deprovisionMemberships only touches rows in this tenant, so a directory
  // id row that lives elsewhere is unaffected.
  const { deprovisionedUserIds, leftOwnerless } = await store.deprovisionMemberships(
    tenantId,
    [...matched.keys()],
  );
  if (leftOwnerless) {
    console.error(
      "[directory-sync] tenant left with NO active owner after deprovision",
      tenantId,
      deprovisionedUserIds,
    );
  }

  // End live sessions for real users who just lost this seat. A placeholder
  // has never signed in, so there is nothing to revoke.
  for (const userId of deprovisionedUserIds) {
    const u = matched.get(userId);
    if (u && !isPlaceholder(u)) {
      try {
        await store.bumpSessionEpoch(u.externalId);
      } catch (err) {
        console.error("[directory-sync] session epoch bump failed", userId, err);
      }
    }
  }

  for (const u of matched.values()) {
    await safelyAppendAudit(store, {
      tenantId,
      kind,
      subjectType: "user",
      subjectId: u.id,
      actorUserId: null,
      payload: {
        workosDirectoryUserId: user.id,
        workosDirectoryId: user.directoryId,
        email,
        sessionsRevoked: deprovisionedUserIds.includes(u.id) && !isPlaceholder(u),
      },
    });
  }
}

export type SignInIdentity = {
  workosUserId: string;
  email: string | null | undefined;
  emailVerified: boolean | null | undefined;
};

/**
 * Link directory placeholders to the person signing in. Only a VERIFIED email
 * is trusted. The first placeholder is claimed outright when the person has no
 * user row yet (so their first request lands in the directory tenant rather
 * than minting a personal workspace); otherwise each placeholder is merged into
 * their existing row. Returns the number of placeholders linked.
 */
export async function linkDirectoryPlaceholders(
  store: DirectoryStore,
  identity: SignInIdentity,
): Promise<number> {
  const email = identity.email?.trim().toLowerCase();
  if (!identity.emailVerified || !email) return 0;

  const placeholders = await store.findPlaceholdersByEmail(email);
  if (placeholders.length === 0) return 0;

  let real = await store.findUserByExternalId(identity.workosUserId);
  let linked = 0;
  for (const placeholder of placeholders) {
    if (!real) {
      if (await store.claimPlaceholder(placeholder.id, identity.workosUserId)) {
        real = { ...placeholder, externalId: identity.workosUserId };
        linked += 1;
        await auditLink(store, placeholder.tenantId, placeholder.id, placeholder.id, "claimed");
        continue;
      }
      // Lost a race with a concurrent first request: merge into its row.
      real = await store.findUserByExternalId(identity.workosUserId);
      if (!real) continue;
    }
    const tenantIds = await store.mergePlaceholderInto(placeholder.id, real.id);
    linked += 1;
    for (const tenantId of tenantIds) {
      await auditLink(store, tenantId, real.id, placeholder.id, "merged");
    }
  }
  return linked;
}

async function auditLink(
  store: DirectoryStore,
  tenantId: string | null,
  userId: string,
  placeholderUserId: string,
  how: "claimed" | "merged",
): Promise<void> {
  if (!tenantId) return;
  await safelyAppendAudit(store, {
    tenantId,
    kind: "directory.user.linked",
    subjectType: "user",
    subjectId: userId,
    actorUserId: userId,
    payload: { placeholderUserId, how },
  });
}

async function safelyAppendAudit(
  store: DirectoryStore,
  input: Parameters<DirectoryStore["appendAudit"]>[0],
): Promise<void> {
  try {
    await store.appendAudit(input);
  } catch (err) {
    // Audit failure must not bubble: the state change has committed and a
    // WorkOS retry would only repeat it.
    console.error("[directory-sync] audit append failed", input.kind, err);
  }
}
