// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), create: vi.fn(), expire: vi.fn() }));
vi.mock("../../_utils/session-with-tenant.js", () => ({ requireSessionAndTenant: mocks.auth }));
vi.mock("../../_utils/rate-limit.js", () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("../../../src/db/index.js", () => ({ getDb: mocks.db }));
vi.mock("../../_utils/stripe.js", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.create, expire: mocks.expire } } }),
  appBaseUrl: () => "http://localhost:5273", platformFeeBps: () => 0,
}));
import { POST } from "./stripe-checkout";
function auth(role: string) {
  return { ok: true, session: { user: { id: "workos-requester" } }, userRow: { id: "requester" },
    activeTenant: { id: "workspace" }, activeMember: { role } };
}
const request = () => new Request("http://localhost:5273/api/marketplace/stripe-checkout", {
  method: "POST", headers: { Origin: "http://localhost:5273", "Content-Type": "application/json",
    "X-Account-ID": "workos-requester", "X-Workspace-ID": "workspace" },
  body: JSON.stringify({ bookingId: "00000000-0000-4000-8000-000000000001" }),
});
beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  query.select.mockReturnValue(query); query.from.mockReturnValue(query); query.where.mockReturnValue(query); query.limit.mockResolvedValue([]);
  mocks.db.mockReturnValue(query);
});
it.each(["viewer", "member", "unknown"])("blocks %s roles before booking access or any payment provider call", async (role) => {
  mocks.auth.mockResolvedValue(auth(role));
  const response = await POST(request());
  expect(response.status).toBe(403);
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.expire).not.toHaveBeenCalled();
});
it.each(["owner", "admin", "drafter", "reviewer"])("still applies booking ownership after the %s role check", async (role) => {
  mocks.auth.mockResolvedValue(auth(role));
  expect((await POST(request())).status).toBe(404);
  expect(mocks.db).toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
