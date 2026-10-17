/**
 * First-request race: concurrent first requests must not leave orphan
 * workspaces. bootstrapUser inserts the user with ON CONFLICT DO NOTHING
 * first and only creates the workspace when that insert won.
 */
import { describe, expect, it } from "vitest";
import { bootstrapUser } from "./session-with-tenant.js";
import { tenantMembers, tenants, users } from "../../src/db/schema.js";
import type { SessionPayload } from "./workos.js";

type Row = Record<string, unknown>;

function fakeDb(opts: { userAlreadyExists: boolean }) {
  const log: { op: string; table: unknown; conflict?: unknown }[] = [];
  const existing: Row = { id: "u_winner", externalId: "user_01", tenantId: "t_winner" };
  const tx = {
    insert: (table: unknown) => ({
      values: (v: Row) => {
        const entry: { op: string; table: unknown; conflict?: unknown } = { op: "insert", table };
        log.push(entry);
        const result = (rows: Row[]) => ({ returning: async () => rows });
        if (table === users) {
          return {
            onConflictDoNothing: (c: unknown) => {
              entry.conflict = c;
              return result(opts.userAlreadyExists ? [] : [{ id: "u_new", ...v }]);
            },
          };
        }
        if (table === tenantMembers) {
          return {
            onConflictDoNothing: async (c: unknown) => {
              entry.conflict = c;
            },
          };
        }
        return result([{ id: "t_new", ...v }]);
      },
    }),
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [existing] }) }),
    }),
    update: (table: unknown) => ({
      set: (patch: Row) => ({
        where: () => ({
          returning: async () => {
            log.push({ op: "update", table });
            return [{ id: "u_new", ...patch }];
          },
        }),
      }),
    }),
  };
  const db = { transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { db, log };
}

const session = {
  user: { id: "user_01", email: "jane@acme.com", firstName: "Jane", lastName: "Patel", profilePictureUrl: null },
  workosSession: "",
  iat: 0,
} as SessionPayload;

describe("bootstrapUser", () => {
  it("creates the user, a personal workspace and an owner membership on first sign-in", async () => {
    const { db, log } = fakeDb({ userAlreadyExists: false });
    const row = await bootstrapUser(db as never, session);
    expect(log.map((l) => l.table)).toEqual([users, tenants, tenantMembers, users]);
    expect(log[0].conflict).toEqual({ target: users.externalId });
    expect(row).toMatchObject({ id: "u_new", tenantId: "t_new" });
  });

  it("creates no workspace when a concurrent request already minted the user", async () => {
    const { db, log } = fakeDb({ userAlreadyExists: true });
    const row = await bootstrapUser(db as never, session);
    expect(log.some((l) => l.table === tenants)).toBe(false);
    expect(log.some((l) => l.table === tenantMembers)).toBe(false);
    expect(row).toMatchObject({ id: "u_winner" });
  });
});
