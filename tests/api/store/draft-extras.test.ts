import { beforeEach, describe, expect, it, vi } from "vitest";

// A chainable stand-in for the drizzle query builder that records, in order,
// which calls ran inside a transaction and whether the draft row was locked.
const { state } = vi.hoisted(() => ({
  state: {
    selects: [] as unknown[][],
    log: [] as string[],
    inTx: false,
    body: {} as Record<string, unknown>,
    stored: null as Record<string, unknown> | null,
  },
}));

function chain(label: string, result: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "values", "onConflictDoUpdate", "returning", "set"]) {
    c[m] = () => c;
  }
  c.for = (strength: string) => {
    state.log.push(`${label}:for-${strength}${state.inTx ? ":tx" : ""}`);
    return c;
  };
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(res, rej);
  return c;
}

const fakeDb = {
  select: () => {
    state.log.push(`select${state.inTx ? ":tx" : ""}`);
    return chain("select", () => state.selects.shift() ?? []);
  },
  insert: () => {
    state.log.push(`insert${state.inTx ? ":tx" : ""}`);
    return chain("insert", () => []);
  },
  transaction: async (fn: (tx: unknown) => unknown) => {
    state.inTx = true;
    try {
      return await fn(fakeDb);
    } finally {
      state.inTx = false;
    }
  },
};

vi.mock("../../../src/db/index.js", () => ({ getDb: () => fakeDb }));
vi.mock("../../../api/_utils/rate-limit.js", () => ({ rateLimit: () => null }));
vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    activeTenant: { id: "t1" },
    activeMember: { role: "drafter" },
    userRow: { id: "db-u1", externalId: "user_1", email: "a@b.com", legalName: "A B" },
  }),
}));
vi.mock("../../../api/_utils/request.js", () => ({
  enforceSameOrigin: () => null,
  readJsonRequest: async () => ({ ok: true, body: state.body }),
  jsonError: (error: string, status: number) =>
    new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } }),
}));

import { POST } from "../../../api/store/_handlers/draft-extras";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  process.env.DRAFTHR_DUAL_WRITE = "true";
  state.selects = [];
  state.log = [];
  state.inTx = false;
});

describe("POST /api/store/draft-extras", () => {
  it("merges under a lock on the draft row, so concurrent writers can't drop each other's comments", async () => {
    state.body = { id: ID, extras: { comments: [{ id: "c2", body: "new", createdAt: 2 }] } };
    state.selects = [
      [{ id: ID, tenantId: "t1", deletedAt: null }],
      [{ extras: { comments: [{ id: "c1", body: "theirs", authorUserId: "user_2", createdAt: 1 }] } }],
    ];
    const res = await POST({} as Request);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.extras.comments.map((c: { id: string }) => c.id)).toEqual(["c1", "c2"]);
    // The draft row is locked first, and the read-merge-write all happens in
    // the same transaction.
    expect(state.log).toEqual(["select:tx", "select:for-update:tx", "select:tx", "insert:tx"]);
  });

  it("refuses a write to a draft deleted before the lock was granted", async () => {
    state.body = { id: ID, extras: { comments: [] } };
    state.selects = [[{ id: ID, tenantId: "t1", deletedAt: new Date() }]];
    const res = await POST({} as Request);
    expect(res.status).toBe(410);
    expect(state.log.some((l) => l.startsWith("insert"))).toBe(false);
  });
});
