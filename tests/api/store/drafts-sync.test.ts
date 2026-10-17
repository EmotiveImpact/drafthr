import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideDraftWrite, RESTORE_WINDOW_MS } from "../../../api/store/_handlers/_draft-sync";

// --- a minimal chainable stand-in for the drizzle query builder -------------
// Each select() resolves to the next queued result; update/insert/delete record
// what they were asked to do so the tests can assert on the writes.
type Recorded = { op: "update" | "insert" | "delete"; table: unknown; set?: Record<string, unknown>; inTx?: boolean };
const { state, assertCanCreateLetter } = vi.hoisted(() => ({
  state: {
    selects: [] as unknown[][],
    updateReturns: [] as unknown[][],
    writes: [] as Recorded[],
    inTx: false,
    body: {} as Record<string, unknown>,
    role: "drafter",
  },
  assertCanCreateLetter: vi.fn(async () => ({ ok: true as const })),
}));

function chain(result: () => unknown, onSet?: (v: Record<string, unknown>) => void) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy", "values", "onConflictDoUpdate", "returning"]) {
    c[m] = () => c;
  }
  c.set = (v: Record<string, unknown>) => {
    onSet?.(v);
    return c;
  };
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(res, rej);
  return c;
}

const fakeDb = {
  select: () => chain(() => state.selects.shift() ?? []),
  update: (table: unknown) => {
    const rec: Recorded = { op: "update", table };
    state.writes.push(rec);
    return chain(
      () => state.updateReturns.shift() ?? [{ id: "x" }],
      (v) => {
        rec.set = v;
      },
    );
  },
  insert: (table: unknown) => {
    const rec: Recorded = { op: "insert", table };
    state.writes.push(rec);
    return chain(() => [], undefined);
  },
  delete: (table: unknown) => {
    state.writes.push({ op: "delete", table, inTx: state.inTx });
    return chain(() => []);
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
vi.mock("../../../src/db/audit.js", () => ({ appendAuditEvent: async () => {} }));
vi.mock("../../../api/_utils/entitlements.js", () => ({ assertCanCreateLetter }));
vi.mock("../../../api/_utils/rate-limit.js", () => ({ rateLimit: () => null }));
vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    activeTenant: { id: "t1" },
    activeMember: { role: state.role },
    userRow: { id: "u1", email: "a@b.com" },
  }),
}));
vi.mock("../../../api/_utils/request.js", () => ({
  enforceSameOrigin: () => null,
  readJsonRequest: async () => ({ ok: true, body: state.body }),
  jsonError: (error: string, status: number) =>
    new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } }),
}));

import { DELETE, GET, POST } from "../../../api/store/_handlers/drafts";
import { draftExtras, drafts, sections } from "../../../src/db/schema";

const ID = "11111111-1111-4111-8111-111111111111";
const req = {} as Request;

function draftBody(extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    letterType: "termination",
    mode: "employer",
    context: { jurisdiction: "UK" },
    reviewStatus: "draft",
    sections: [{ sectionId: "intro", title: "Intro", html: "<p>Mine</p>", status: "ready", position: 0 }],
    ...extra,
  };
}

function fullRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    tenantId: "t1",
    letterType: "termination",
    mode: "employer",
    title: null,
    jurisdiction: "UK",
    matterId: null,
    reviewStatus: "approved",
    isTemplateSource: false,
    templateSourceId: null,
    contextJson: {},
    employerJson: null,
    employeeJson: null,
    answersJson: null,
    createdAt: new Date(1_000),
    updatedAt: new Date(2_000),
    deletedAt: null,
    revision: 4,
    ...over,
  };
}

beforeEach(() => {
  process.env.DRAFTHR_DUAL_WRITE = "true";
  state.selects = [];
  state.updateReturns = [];
  state.writes = [];
  state.role = "drafter";
  assertCanCreateLetter.mockClear();
});

describe("decideDraftWrite", () => {
  const live = { tenantId: "t1", revision: 3, deletedAt: null };
  it("creates when no row exists", () => {
    expect(decideDraftWrite(null, "t1", {}, 0)).toEqual({ kind: "create" });
  });
  it("refuses another tenant's row", () => {
    expect(decideDraftWrite({ ...live, tenantId: "t2" }, "t1", { baseRevision: 3 }, 0).kind).toBe("forbidden");
  });
  it("accepts an update built on the current revision", () => {
    expect(decideDraftWrite(live, "t1", { baseRevision: 3 }, 0)).toEqual({
      kind: "update",
      expectedRevision: 3,
      restore: false,
    });
  });
  it.each([2, null, "3", -1])("treats base revision %s as stale", (base) => {
    expect(decideDraftWrite(live, "t1", { baseRevision: base }, 0).kind).toBe("stale");
  });
  describe("clients from before revisions (no baseRevision sent)", () => {
    const stored = { ...live, updatedAt: new Date(5_000), reviewStatus: "in_review" };
    it("accepts an edit at least as new as the stored one, on the current revision", () => {
      expect(decideDraftWrite(stored, "t1", { clientRevision: 5_000, reviewStatus: "in_review" }, 0)).toEqual({
        kind: "update",
        expectedRevision: 3,
        restore: false,
      });
    });
    it("rejects an older edit, or one with no edit time", () => {
      expect(decideDraftWrite(stored, "t1", { clientRevision: 4_999 }, 0).kind).toBe("stale");
      expect(decideDraftWrite(stored, "t1", {}, 0).kind).toBe("stale");
    });
    it("never lets one take a letter out of approved", () => {
      const approved = { ...stored, reviewStatus: "approved" };
      expect(decideDraftWrite(approved, "t1", { clientRevision: 9_000, reviewStatus: "in_review" }, 0).kind).toBe(
        "stale",
      );
      expect(decideDraftWrite(approved, "t1", { clientRevision: 9_000, reviewStatus: "approved" }, 0).kind).toBe(
        "update",
      );
    });
  });
  it("refuses an upsert of a tombstoned draft", () => {
    const deletedAt = new Date(10_000);
    expect(decideDraftWrite({ ...live, deletedAt }, "t1", { baseRevision: 3 }, 20_000)).toEqual({
      kind: "gone",
      deletedAt,
    });
  });
  it("lets the Undo restore a tombstone only within the window", () => {
    const deletedAt = new Date(10_000);
    expect(decideDraftWrite({ ...live, deletedAt }, "t1", { restore: true }, 10_000 + RESTORE_WINDOW_MS).kind).toBe(
      "update",
    );
    expect(
      decideDraftWrite({ ...live, deletedAt }, "t1", { restore: true }, 10_001 + RESTORE_WINDOW_MS).kind,
    ).toBe("gone");
  });
});

describe("POST /api/store/drafts (tombstones + revisions)", () => {
  it("returns 410 for a tombstoned id and never touches the paywall or the row", async () => {
    state.body = draftBody({ baseRevision: 4 });
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 4, deletedAt: new Date() }]];
    const res = await POST(req);
    expect(res.status).toBe(410);
    expect((await res.json()).deleted).toBe(true);
    expect(assertCanCreateLetter).not.toHaveBeenCalled();
    expect(state.writes).toHaveLength(0);
  });

  it("restores a just-deleted draft for the Undo without spending a credit", async () => {
    state.body = draftBody({ restore: true });
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 5, deletedAt: new Date() }]];
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).revision).toBe(6);
    expect(assertCanCreateLetter).not.toHaveBeenCalled();
    const update = state.writes.find((w) => w.op === "update" && w.table === drafts);
    expect(update?.set).toMatchObject({ deletedAt: null, revision: 6 });
  });

  it("brings a restored approved letter back re-opened, since its text can't be checked", async () => {
    state.body = draftBody({ restore: true, reviewStatus: "approved" });
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "approved", revision: 5, deletedAt: new Date() }]];
    const res = await POST(req);
    expect(res.status).toBe(200);
    const update = state.writes.find((w) => w.op === "update" && w.table === drafts);
    expect(update?.set).toMatchObject({ deletedAt: null, reviewStatus: "draft" });
  });

  it("rejects a stale write with 409 and the current row, leaving the approval alone", async () => {
    state.body = draftBody({ baseRevision: 3, reviewStatus: "in_review" });
    state.selects = [
      [{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "approved", revision: 4, deletedAt: null }],
      [fullRow()],
      [{ sectionId: "intro", title: "Intro", html: "<p>Theirs</p>", status: "ready", position: 0 }],
    ];
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.revision).toBe(4);
    expect(body.current.reviewStatus).toBe("approved");
    expect(body.current.sections[0].html).toBe("<p>Theirs</p>");
    expect(state.writes).toHaveLength(0);
  });

  it("accepts a write on the current revision and bumps it", async () => {
    state.body = draftBody({ baseRevision: 4 });
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 4, deletedAt: null }]];
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).revision).toBe(5);
    const update = state.writes.find((w) => w.op === "update" && w.table === drafts);
    expect(update?.set).toMatchObject({ revision: 5 });
  });

  it("returns 409 with the current row when a concurrent write wins the compare-and-swap", async () => {
    state.body = draftBody({ baseRevision: 4 });
    state.selects = [
      [{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 4, deletedAt: null }],
      [fullRow({ revision: 5, reviewStatus: "draft" })],
      [],
    ];
    state.updateReturns = [[]];
    const res = await POST(req);
    expect(res.status).toBe(409);
    expect((await res.json()).revision).toBe(5);
  });

  it("refuses an update that changes the letter type, so the tier gate can't be skipped", async () => {
    state.body = draftBody({ baseRevision: 4, letterType: "acas_ec_notification" });
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "holiday_request", reviewStatus: "draft", revision: 4, deletedAt: null }]];
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(state.writes).toHaveLength(0);
    expect(assertCanCreateLetter).not.toHaveBeenCalled();
  });

  it("keeps accepting writes from a tab opened before revisions existed", async () => {
    // The old client sends clientRevision (its edit time) and no baseRevision.
    state.body = draftBody({ clientRevision: 3_000 });
    state.selects = [
      [{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 4, deletedAt: null, updatedAt: new Date(2_000) }],
    ];
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).revision).toBe(5);
    const update = state.writes.find((w) => w.op === "update" && w.table === drafts);
    expect(update?.set).toMatchObject({ revision: 5 });
  });

  it("still refuses an old tab's write that is older than the stored edit", async () => {
    state.body = draftBody({ clientRevision: 1_000 });
    state.selects = [
      [{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 4, deletedAt: null, updatedAt: new Date(2_000) }],
      [fullRow({ reviewStatus: "draft" })],
      [],
    ];
    const res = await POST(req);
    expect(res.status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });

  it("answers 410, not an empty 409, when a delete lands between the read and the write", async () => {
    state.body = draftBody({ baseRevision: 4 });
    state.selects = [
      [{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 4, deletedAt: null }],
      // loadCurrentDraft finds the row tombstoned by the concurrent delete.
      [fullRow({ revision: 5, deletedAt: new Date() })],
    ];
    state.updateReturns = [[]];
    const res = await POST(req);
    expect(res.status).toBe(410);
  });

  it("creates at revision 1 through the paywall gate", async () => {
    state.body = draftBody();
    state.selects = [[]];
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect((await res.json()).revision).toBe(1);
    expect(assertCanCreateLetter).toHaveBeenCalledTimes(1);
  });

  it("saves a template source without the letter gate, so it never spends a letter purchase", async () => {
    state.body = draftBody({ isTemplateSource: true });
    state.selects = [[]];
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(assertCanCreateLetter).not.toHaveBeenCalled();
    expect(state.writes.filter((w) => w.op === "update")).toHaveLength(0);
  });

  it("never turns a stored template source into a letter, or back, on update", async () => {
    // Otherwise a free template save could become an ungated letter.
    state.body = draftBody({ baseRevision: 4, isTemplateSource: false });
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 4, deletedAt: null, isTemplateSource: true }]];
    expect((await POST(req)).status).toBe(200);
    const update = state.writes.find((w) => w.op === "update" && w.table === drafts);
    expect(update?.set).toMatchObject({ isTemplateSource: true });

    state.writes = [];
    state.body = draftBody({ baseRevision: 4, isTemplateSource: true });
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", reviewStatus: "draft", revision: 4, deletedAt: null, isTemplateSource: false }]];
    expect((await POST(req)).status).toBe(200);
    const second = state.writes.find((w) => w.op === "update" && w.table === drafts);
    expect(second?.set).toMatchObject({ isTemplateSource: false });
  });
});

describe("DELETE /api/store/drafts", () => {
  it("soft-deletes and scrubs the row instead of removing it", async () => {
    state.body = { id: ID };
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", title: "T", deletedAt: null }]];
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const update = state.writes.find((w) => w.op === "update" && w.table === drafts);
    expect(update?.set?.deletedAt).toBeInstanceOf(Date);
    expect(update?.set).toMatchObject({ title: null, employeeJson: null, answersJson: null });
    expect(state.writes.some((w) => w.op === "delete" && w.table === drafts)).toBe(false);
    expect(state.writes.some((w) => w.op === "delete" && w.table === sections && w.inTx)).toBe(true);
  });

  it("keeps the extras through the restore window so an Undo keeps comment authors and approvals", async () => {
    state.body = { id: ID };
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", title: "T", deletedAt: null }]];
    await DELETE(req);
    const extrasDeletes = state.writes.filter((w) => w.op === "delete" && w.table === draftExtras);
    // Only the purge of drafts deleted before the window, outside the
    // delete's own transaction; this draft's extras are not removed with it.
    expect(extrasDeletes).toHaveLength(1);
    expect(extrasDeletes[0].inTx).toBe(false);
  });

  it("is idempotent for an already-deleted draft", async () => {
    state.body = { id: ID };
    state.selects = [[{ id: ID, tenantId: "t1", letterType: "termination", title: null, deletedAt: new Date() }]];
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(state.writes).toHaveLength(0);
  });
});

describe("GET /api/store/drafts", () => {
  it("returns live drafts with their revision plus tombstones", async () => {
    state.selects = [[fullRow({ reviewStatus: "draft" })], [{ id: "dead", deletedAt: new Date(5_000) }], []];
    const res = await GET(req);
    const body = await res.json();
    expect(body.drafts[0].revision).toBe(4);
    expect(body.deleted).toEqual([{ id: "dead", deletedAt: 5_000 }]);
  });
});
