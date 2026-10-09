/**
 * Directory Sync security policy, against the in-memory store:
 *   - offboarding reaches the real signed-in user, not only the placeholder,
 *     and ends their sessions;
 *   - a placeholder is linked to the real user on verified sign-in;
 *   - a directory can never adopt or edit users in other workspaces.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deprovisionDirectoryUser,
  linkDirectoryPlaceholders,
  provisionDirectoryUser,
  type DirectoryUserLike,
} from "./directory-provisioning.js";
import {
  createMemoryDirectoryStore,
  createMemoryState,
  type MemoryState,
} from "./directory-store.memory.js";
import type { DirectoryStore } from "./directory-store.js";

let state: MemoryState;
let store: DirectoryStore;

function dirUser(over: Partial<DirectoryUserLike> = {}): DirectoryUserLike {
  return {
    id: "dir_jane",
    directoryId: "directory_acme",
    organizationId: "org_acme",
    email: "jane@acme.com",
    firstName: "Jane",
    lastName: "Patel",
    state: "active",
    role: { slug: "drafter" },
    ...over,
  };
}

function addUser(id: string, externalId: string, email: string, tenantId: string | null, legalName = "Someone") {
  state.users.push({
    id,
    externalId,
    email,
    legalName,
    workosDirectoryUserId: null,
    workosDirectoryId: null,
    tenantId,
  });
}

function addMember(userId: string, tenantId: string, opts: Partial<MemoryState["members"][number]> = {}) {
  state.members.push({
    userId,
    tenantId,
    role: "drafter",
    status: "active",
    deprovisionedAt: null,
    isActiveTenant: false,
    ...opts,
  });
}

const member = (userId: string, tenantId: string) =>
  state.members.find((m) => m.userId === userId && m.tenantId === tenantId);

beforeEach(() => {
  state = createMemoryState();
  store = createMemoryDirectoryStore(state);
  state.tenants.push({ id: "t_acme", workosOrgId: "org_acme" }, { id: "t_other", workosOrgId: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("offboarding reaches the real user", () => {
  it("removes the real user's seat (joined by invite) and bumps their session epoch", async () => {
    // Directory provisioned a placeholder; the real person signed in separately
    // and was invited into the same tenant, so they hold their own seat.
    await provisionDirectoryUser(store, "t_acme", dirUser());
    addUser("u_real", "user_01REAL", "Jane@Acme.com", "t_personal");
    addMember("u_real", "t_personal", { role: "owner", isActiveTenant: true });
    addMember("u_real", "t_acme", { role: "drafter" });

    await deprovisionDirectoryUser(store, "t_acme", dirUser(), "directory.user.deprovisioned");

    expect(member("u_real", "t_acme")?.status).toBe("deprovisioned");
    const placeholder = state.users.find((u) => u.externalId === "dsync:dir_jane")!;
    expect(member(placeholder.id, "t_acme")?.status).toBe("deprovisioned");
    // Their sessions end immediately; the placeholder has none to end.
    expect(state.epochs.get("user_01REAL")).toBe(1);
    expect(state.epochs.has("dsync:dir_jane")).toBe(false);
    // Seats in other workspaces are untouched.
    expect(member("u_real", "t_personal")?.status).toBe("active");
  });

  it("matches the real user by directory user id once linked", async () => {
    addUser("u_real", "user_01REAL", "jane@acme.com", "t_acme");
    state.users[0].workosDirectoryUserId = "dir_jane";
    state.users[0].workosDirectoryId = "directory_acme";
    addMember("u_real", "t_acme", { isActiveTenant: true });

    // The directory reports a different email now; the id still matches.
    await deprovisionDirectoryUser(
      store,
      "t_acme",
      dirUser({ email: "jane.patel@acme.com" }),
      "directory.user.group_removed",
    );
    expect(member("u_real", "t_acme")).toMatchObject({ status: "deprovisioned", isActiveTenant: false });
    expect(state.epochs.get("user_01REAL")).toBe(1);
  });

  it("does not bump sessions again on a redelivered deprovision", async () => {
    addUser("u_real", "user_01REAL", "jane@acme.com", "t_acme");
    addMember("u_real", "t_acme");
    await deprovisionDirectoryUser(store, "t_acme", dirUser(), "directory.user.deprovisioned");
    await deprovisionDirectoryUser(store, "t_acme", dirUser(), "directory.user.deprovisioned");
    expect(state.epochs.get("user_01REAL")).toBe(1);
  });

  it("never touches a same-email user who is not in the tenant", async () => {
    addUser("u_outsider", "user_01OUT", "jane@acme.com", "t_other");
    addMember("u_outsider", "t_other", { isActiveTenant: true });
    await deprovisionDirectoryUser(store, "t_acme", dirUser(), "directory.user.deprovisioned");
    expect(member("u_outsider", "t_other")?.status).toBe("active");
    expect(state.epochs.size).toBe(0);
    expect(state.audit).toHaveLength(0);
  });

  it("treats state=inactive on an update as deprovisioning", async () => {
    addUser("u_real", "user_01REAL", "jane@acme.com", "t_acme");
    addMember("u_real", "t_acme");
    await provisionDirectoryUser(store, "t_acme", dirUser({ state: "inactive" }));
    expect(member("u_real", "t_acme")?.status).toBe("deprovisioned");
    expect(state.audit[0].kind).toBe("directory.user.deactivated");
  });
});

describe("linking a placeholder on sign-in", () => {
  it("claims the placeholder on first sign-in so no personal workspace is needed", async () => {
    await provisionDirectoryUser(store, "t_acme", dirUser({ role: { slug: "admin" } }));
    const placeholderId = state.users[0].id;

    const linked = await linkDirectoryPlaceholders(store, {
      workosUserId: "user_01REAL",
      email: "JANE@acme.com",
      emailVerified: true,
    });

    expect(linked).toBe(1);
    expect(state.users).toHaveLength(1);
    expect(state.users[0]).toMatchObject({ id: placeholderId, externalId: "user_01REAL" });
    expect(member(placeholderId, "t_acme")).toMatchObject({ role: "admin", status: "active" });

    // Offboarding now reaches the signed-in account and ends its sessions.
    await deprovisionDirectoryUser(store, "t_acme", dirUser(), "directory.user.deprovisioned");
    expect(member(placeholderId, "t_acme")?.status).toBe("deprovisioned");
    expect(state.epochs.get("user_01REAL")).toBe(1);
  });

  it("merges the placeholder's seat into an existing user row", async () => {
    await provisionDirectoryUser(store, "t_acme", dirUser());
    const placeholder = state.users[0];
    addUser("u_real", "user_01REAL", "jane@acme.com", "t_personal");
    addMember("u_real", "t_personal", { role: "owner", isActiveTenant: true });

    await linkDirectoryPlaceholders(store, {
      workosUserId: "user_01REAL",
      email: "jane@acme.com",
      emailVerified: true,
    });

    // Seat moved to the real user, without stealing their active workspace.
    expect(member("u_real", "t_acme")).toMatchObject({ status: "active", isActiveTenant: false });
    expect(member("u_real", "t_personal")?.isActiveTenant).toBe(true);
    expect(state.members.some((m) => m.userId === placeholder.id)).toBe(false);
    // Directory id moved too, so later events match the real user directly.
    expect(state.users.find((u) => u.id === "u_real")?.workosDirectoryUserId).toBe("dir_jane");
    expect(placeholder.externalId).toBe(`dsync-merged:${placeholder.id}`);
    expect(state.audit).toContainEqual(
      expect.objectContaining({ kind: "directory.user.linked", tenantId: "t_acme", subjectId: "u_real" }),
    );

    await deprovisionDirectoryUser(store, "t_acme", dirUser(), "directory.user.deprovisioned");
    expect(member("u_real", "t_acme")?.status).toBe("deprovisioned");
    expect(member("u_real", "t_personal")?.status).toBe("active");
    expect(state.epochs.get("user_01REAL")).toBe(1);
  });

  it("carries a directory deprovision onto the real user's existing seat", async () => {
    await provisionDirectoryUser(store, "t_acme", dirUser());
    await deprovisionDirectoryUser(store, "t_acme", dirUser(), "directory.user.deprovisioned");
    addUser("u_real", "user_01REAL", "jane@acme.com", "t_personal");
    addMember("u_real", "t_acme", { isActiveTenant: true });
    // (This seat would already have been caught by the email match above; the
    // merge must not resurrect access either way.)
    state.members.find((m) => m.userId === "u_real")!.status = "active";

    await linkDirectoryPlaceholders(store, {
      workosUserId: "user_01REAL",
      email: "jane@acme.com",
      emailVerified: true,
    });
    expect(member("u_real", "t_acme")).toMatchObject({ status: "deprovisioned", isActiveTenant: false });
  });

  it("does nothing for an unverified email", async () => {
    await provisionDirectoryUser(store, "t_acme", dirUser());
    const linked = await linkDirectoryPlaceholders(store, {
      workosUserId: "user_01ATTACKER",
      email: "jane@acme.com",
      emailVerified: false,
    });
    expect(linked).toBe(0);
    expect(state.users[0].externalId).toBe("dsync:dir_jane");
  });

  it("falls back to merging when a concurrent first request already minted the row", async () => {
    await provisionDirectoryUser(store, "t_acme", dirUser());
    const racing: DirectoryStore = {
      ...store,
      async claimPlaceholder() {
        addUser("u_raced", "user_01REAL", "jane@acme.com", "t_personal");
        return false;
      },
    };
    await linkDirectoryPlaceholders(racing, {
      workosUserId: "user_01REAL",
      email: "jane@acme.com",
      emailVerified: true,
    });
    expect(member("u_raced", "t_acme")?.status).toBe("active");
  });
});

describe("tenant scoping of directory writes", () => {
  it("does not adopt or rename a user from another workspace who shares the email", async () => {
    addUser("u_victim", "user_01VICTIM", "ceo@globex.com", "t_other", "Real CEO");
    addMember("u_victim", "t_other", { role: "owner", isActiveTenant: true });

    await provisionDirectoryUser(
      store,
      "t_acme",
      dirUser({ id: "dir_fake", email: "ceo@globex.com", firstName: "Pwned", lastName: "Name" }),
    );

    const victim = state.users.find((u) => u.id === "u_victim")!;
    expect(victim.legalName).toBe("Real CEO");
    expect(victim.workosDirectoryUserId).toBeNull();
    expect(member("u_victim", "t_acme")).toBeUndefined();
    expect(state.userUpdates.filter((u) => u.userId === "u_victim")).toHaveLength(0);
    // A separate placeholder exists for Acme instead.
    expect(state.users.find((u) => u.externalId === "dsync:dir_fake")?.tenantId).toBe("t_acme");
  });

  it("does not update the profile of a matched user who also belongs to another workspace", async () => {
    addUser("u_shared", "user_01SHARED", "jane@acme.com", "t_other", "Jane Original");
    addMember("u_shared", "t_other", { isActiveTenant: true });
    addMember("u_shared", "t_acme");

    await provisionDirectoryUser(store, "t_acme", dirUser({ firstName: "Changed", lastName: "ByIdP" }));

    const u = state.users.find((x) => x.id === "u_shared")!;
    expect(u.legalName).toBe("Jane Original");
    expect(u.email).toBe("jane@acme.com");
    // Linking the directory id is still allowed: it is tenant-scoped data.
    expect(u.workosDirectoryUserId).toBe("dir_jane");
    expect(member("u_shared", "t_acme")?.status).toBe("active");
  });

  it("updates the name of a user who belongs only to this tenant, but never a signed-in user's email", async () => {
    addUser("u_local", "user_01LOCAL", "jane@acme.com", "t_acme", "Jane Old");
    addMember("u_local", "t_acme", { isActiveTenant: true });

    await provisionDirectoryUser(store, "t_acme", dirUser({ firstName: "Jane", lastName: "New" }));
    let u = state.users.find((x) => x.id === "u_local")!;
    expect(u.legalName).toBe("Jane New");

    await provisionDirectoryUser(store, "t_acme", dirUser({ email: "jane.new@acme.com" }));
    u = state.users.find((x) => x.id === "u_local")!;
    expect(u.email).toBe("jane@acme.com");
  });

  it("ignores a directory-id match that belongs to another tenant's directory", async () => {
    addUser("u_elsewhere", "user_01ELSE", "x@other.com", "t_other", "Elsewhere");
    state.users[0].workosDirectoryUserId = "dir_jane";
    state.users[0].workosDirectoryId = "directory_other";
    addMember("u_elsewhere", "t_other", { isActiveTenant: true });

    await provisionDirectoryUser(store, "t_acme", dirUser());
    expect(member("u_elsewhere", "t_acme")).toBeUndefined();
    expect(state.users.find((u) => u.id === "u_elsewhere")?.legalName).toBe("Elsewhere");
  });
});
