/**
 * Drizzle DirectoryStore: the one piece of error handling it does itself.
 * Drizzle wraps driver errors in DrizzleQueryError and keeps the Postgres error
 * (with its SQLSTATE code) on `cause`, so a lost claim race must be recognised
 * there, not only on the top-level error.
 */
import { describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";

const h = vi.hoisted(() => ({ fail: null as unknown }));

vi.mock("../../src/db/index.js", () => ({
  getDb: () => ({
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            if (h.fail) throw h.fail;
            return [{ id: "u_ph" }];
          },
        }),
      }),
    }),
  }),
}));

import { createDrizzleDirectoryStore } from "./directory-store.js";

function uniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint "users_external_id_unique"'), {
    code: "23505",
  });
}

describe("createDrizzleDirectoryStore().claimPlaceholder", () => {
  it("claims an unclaimed placeholder", async () => {
    h.fail = null;
    expect(await createDrizzleDirectoryStore().claimPlaceholder("u_ph", "user_01")).toBe(true);
  });

  it("reports a lost race when Drizzle wraps the unique violation", async () => {
    h.fail = new DrizzleQueryError("update users ...", [], uniqueViolation());
    expect(await createDrizzleDirectoryStore().claimPlaceholder("u_ph", "user_01")).toBe(false);
  });

  it("reports a lost race for an unwrapped unique violation", async () => {
    h.fail = uniqueViolation();
    expect(await createDrizzleDirectoryStore().claimPlaceholder("u_ph", "user_01")).toBe(false);
  });

  it("rethrows anything else", async () => {
    h.fail = new DrizzleQueryError("update users ...", [], new Error("connection reset"));
    await expect(createDrizzleDirectoryStore().claimPlaceholder("u_ph", "user_01")).rejects.toThrow();
  });
});
