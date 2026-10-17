import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDirectoryStore, createMemoryState, type MemoryState } from "./directory-store.memory.js";

const h = vi.hoisted(() => ({ enabled: true, state: null as unknown, broken: false }));

vi.mock("../../src/db/index.js", () => ({ dbEnabled: () => h.enabled }));
vi.mock("./directory-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./directory-store.js")>();
  return {
    ...actual,
    createDrizzleDirectoryStore: () => {
      if (h.broken) throw new Error("db down");
      return createMemoryDirectoryStore(h.state as MemoryState);
    },
  };
});

import { linkDirectoryIdentityOnSignIn } from "./directory-link.js";

let state: MemoryState;
beforeEach(() => {
  state = createMemoryState();
  h.state = state;
  h.enabled = true;
  h.broken = false;
  state.users.push({
    id: "u_ph",
    externalId: "dsync:dir_jane",
    email: "jane@acme.com",
    legalName: "Jane",
    workosDirectoryUserId: "dir_jane",
    workosDirectoryId: "directory_acme",
    tenantId: "t_acme",
  });
});

describe("linkDirectoryIdentityOnSignIn", () => {
  it("claims the placeholder for a verified sign-in", async () => {
    await linkDirectoryIdentityOnSignIn({ workosUserId: "user_01", email: "jane@acme.com", emailVerified: true });
    expect(state.users[0].externalId).toBe("user_01");
  });

  it("skips unverified emails and a missing database", async () => {
    await linkDirectoryIdentityOnSignIn({ workosUserId: "user_01", email: "jane@acme.com", emailVerified: false });
    h.enabled = false;
    await linkDirectoryIdentityOnSignIn({ workosUserId: "user_01", email: "jane@acme.com", emailVerified: true });
    expect(state.users[0].externalId).toBe("dsync:dir_jane");
  });

  it("never fails sign-in when linking errors", async () => {
    h.broken = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      linkDirectoryIdentityOnSignIn({ workosUserId: "user_01", email: "jane@acme.com", emailVerified: true }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
