import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

let auth: Record<string, unknown>;
let active = false;
let purchases: unknown[] = [];
// The WHERE of the last purchase lookup, so a test can check what it filters on.
let lastWhere: SQL | undefined;

vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => auth,
}));
vi.mock("../../../api/_utils/entitlements.js", () => ({
  resolveEntitlements: async () => ({ active }),
}));
vi.mock("../../../src/db/index.js", () => {
  const chain = {
    from: () => chain,
    where: (w: SQL) => {
      lastWhere = w;
      return chain;
    },
    limit: async () => purchases,
  };
  return { getDb: () => ({ select: () => chain }) };
});

const { rejectAiGeneration, isPremiumModel } = await import("../../../api/_utils/ai-access.js");

const req = () => new Request("https://x/api/draft", { method: "POST" });

beforeEach(() => {
  auth = { ok: true, userRow: { id: "u1" }, activeTenant: { id: "t1" }, activeMember: { role: "member" } };
  active = false;
  purchases = [];
  delete process.env.DRAFTHR_ENFORCE_PAYWALL;
  delete process.env.DRAFTHR_DEV_NO_AUTH;
});

describe("rejectAiGeneration", () => {
  it("lets a member without a plan use the standard model while the paywall is off", async () => {
    expect(await rejectAiGeneration(req(), "claude-sonnet-4-6")).toBeNull();
  });

  it("refuses Opus without a usable plan", async () => {
    const res = await rejectAiGeneration(req(), "claude-opus-4-7");
    expect(res?.status).toBe(402);
    expect(await res!.json()).toMatchObject({ premiumModel: true });
  });

  it("allows Opus on a usable plan", async () => {
    active = true;
    expect(await rejectAiGeneration(req(), "claude-opus-4-7")).toBeNull();
  });

  it("refuses viewers outright", async () => {
    auth = { ...auth, activeMember: { role: "viewer" } };
    expect((await rejectAiGeneration(req(), "claude-sonnet-4-6"))?.status).toBe(403);
  });

  it("with the paywall on, needs a plan or a recent letter purchase", async () => {
    process.env.DRAFTHR_ENFORCE_PAYWALL = "1";
    expect((await rejectAiGeneration(req(), "claude-sonnet-4-6"))?.status).toBe(402);
    purchases = [{ id: "p1" }];
    expect(await rejectAiGeneration(req(), "claude-sonnet-4-6")).toBeNull();
  });

  it("with the paywall on, does not count a refunded letter purchase", async () => {
    process.env.DRAFTHR_ENFORCE_PAYWALL = "1";
    await rejectAiGeneration(req(), "claude-sonnet-4-6");
    const where = new PgDialect().sqlToQuery(lastWhere!).sql;
    expect(where).toContain('"entitlement_purchases"."refunded_at" is null');
  });

  it("passes through an unauthenticated response", async () => {
    auth = { ok: false, response: new Response(null, { status: 401 }) };
    expect((await rejectAiGeneration(req(), "claude-sonnet-4-6"))?.status).toBe(401);
  });
});

describe("isPremiumModel", () => {
  it("treats every Opus model as premium", () => {
    expect(isPremiumModel("claude-opus-4-7")).toBe(true);
    // Other id shapes an operator could put in LLM_MODEL.
    expect(isPremiumModel("claude-3-opus-20240229")).toBe(true);
    expect(isPremiumModel("Claude-Opus-4-7")).toBe(true);
    expect(isPremiumModel("claude-opus")).toBe(true);
    expect(isPremiumModel("claude-sonnet-4-6")).toBe(false);
    expect(isPremiumModel("claude-haiku-4-5")).toBe(false);
    expect(isPremiumModel(undefined)).toBe(false);
  });
});
