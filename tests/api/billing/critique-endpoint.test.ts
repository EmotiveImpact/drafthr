import { describe, it, expect, beforeEach, vi } from "vitest";

// --- mocks for the critique handler's dependencies -------------------------
// vi.mock factories are hoisted above normal consts, so the shared spies must
// be created with vi.hoisted to be referenceable inside them.
const { spendCredits, refundCredits, generateText } = vi.hoisted(() => ({
  spendCredits: vi.fn(),
  refundCredits: vi.fn(async () => {}),
  generateText: vi.fn(),
}));
let nextBody: Record<string, unknown> = {};

vi.mock("../../../api/_utils/entitlements.js", () => ({ spendCredits, refundCredits }));

const DEBITS = [{ subjectType: "tenant", subjectId: "t1", amount: 1 }];
vi.mock("ai", () => ({ generateText }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => ({ mockModel: true }) }));
vi.mock("../../../api/_utils/rate-limit.js", () => ({ rateLimit: () => null }));
vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    activeTenant: { id: "t1" },
    userRow: { id: "u1", email: "a@b.com" },
  }),
}));
vi.mock("../../../api/_utils/request.js", () => ({
  enforceSameOrigin: () => null,
  readJsonRequest: async () => ({ ok: true, body: nextBody }),
  jsonError: (error: string, status: number) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

import { POST } from "../../../api/store/_handlers/critique.js";

const req = {} as unknown as Request;

beforeEach(() => {
  spendCredits.mockReset();
  refundCredits.mockClear();
  generateText.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
  nextBody = { lens: "tribunal", letterText: "Dear Sir, I resign." };
});

describe("POST /api/store/critique", () => {
  it("returns 402 + needCredits and never calls the model when out of credits", async () => {
    spendCredits.mockResolvedValue({ ok: false, balance: 0, debits: [] });
    const res = await POST(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.needCredits).toBe(true);
    expect(generateText).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("spends one credit and returns the critique on success", async () => {
    spendCredits.mockResolvedValue({ ok: true, balance: 4, debits: DEBITS });
    generateText.mockResolvedValue({ text: "**Verdict** — solid.\n**Risks** — none." });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.critique).toContain("Verdict");
    expect(body.creditsRemaining).toBe(4);
    // Tenant is present in the session, so the debit is scoped to the tenant pool.
    expect(spendCredits).toHaveBeenCalledWith("t1", "u1", 1, "ai_critique");
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("refunds the credit when the model call throws", async () => {
    spendCredits.mockResolvedValue({ ok: true, balance: 4, debits: DEBITS });
    generateText.mockRejectedValue(new Error("upstream 529"));
    const res = await POST(req);
    expect(res.status).toBe(502);
    expect(refundCredits).toHaveBeenCalledWith(DEBITS, "ai_critique_refund");
  });

  it("refunds the credit when the completion is empty", async () => {
    spendCredits.mockResolvedValue({ ok: true, balance: 4, debits: DEBITS });
    generateText.mockResolvedValue({ text: "   " });
    const res = await POST(req);
    expect(res.status).toBe(502);
    expect(refundCredits).toHaveBeenCalledWith(DEBITS, "ai_critique_refund");
  });

  it("rejects an unknown lens with 400 before spending", async () => {
    nextBody = { lens: "astrologer", letterText: "hi" };
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("rejects an empty letter with 400 before spending", async () => {
    nextBody = { lens: "tribunal", letterText: "   " };
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("returns 503 when the model API key is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req);
    expect(res.status).toBe(503);
    expect(spendCredits).not.toHaveBeenCalled();
  });
});
