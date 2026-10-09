import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    selects: [] as unknown[][],
    updateReturns: [] as unknown[][],
    writes: [] as string[],
    body: {} as Record<string, unknown>,
  },
}));

function chain(result: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "values", "set", "returning"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(res, rej);
  return c;
}

const fakeDb = {
  select: () => chain(() => state.selects.shift() ?? []),
  update: () => {
    state.writes.push("update");
    return chain(() => state.updateReturns.shift() ?? [{ id: "x" }]);
  },
  insert: () => {
    state.writes.push("insert");
    return chain(() => []);
  },
  delete: () => {
    state.writes.push("delete");
    return chain(() => []);
  },
  transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb),
};

vi.mock("../../../src/db/index.js", () => ({ getDb: () => fakeDb }));
vi.mock("../../../src/db/audit.js", () => ({ appendAuditEvent: async () => {} }));
vi.mock("../../../api/_utils/rate-limit.js", () => ({ rateLimit: () => null }));
vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    activeTenant: { id: "t1" },
    activeMember: { role: "drafter" },
    userRow: { id: "u1" },
  }),
}));
vi.mock("../../../api/_utils/request.js", () => ({
  enforceSameOrigin: () => null,
  readJsonRequest: async () => ({ ok: true, body: state.body }),
  jsonError: (error: string, status: number) =>
    new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } }),
}));

import { POST } from "../../../api/store/_handlers/sections";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  process.env.DRAFTHR_DUAL_WRITE = "true";
  state.selects = [];
  state.updateReturns = [];
  state.writes = [];
  state.body = {
    draftId: ID,
    sections: [{ sectionId: "intro", title: "Intro", html: "<p>New</p>", status: "edited", position: 0 }],
  };
});

describe("POST /api/store/sections", () => {
  it("writes the sections and moves the revision on", async () => {
    state.selects = [[{ id: ID, tenantId: "t1", reviewStatus: "in_review", deletedAt: null, revision: 3 }]];
    const res = await POST({} as Request);
    expect(res.status).toBe(200);
    expect(state.writes).toEqual(["update", "delete", "insert"]);
  });

  it("refuses with 409, writing nothing, when the draft changed after it was checked", async () => {
    // Read as in review (so not locked), but an approval lands before the write.
    state.selects = [[{ id: ID, tenantId: "t1", reviewStatus: "in_review", deletedAt: null, revision: 3 }]];
    state.updateReturns = [[]];
    const res = await POST({} as Request);
    expect(res.status).toBe(409);
    expect(state.writes).toEqual(["update"]);
  });
});
