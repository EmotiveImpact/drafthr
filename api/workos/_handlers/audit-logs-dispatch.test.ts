import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("../../../src/lib/audit/workos-outbox", () => ({ dispatchWorkOSAuditOutbox: dispatch }));
import { GET } from "./audit-logs-dispatch";

describe("audit cron authentication", () => {
  beforeEach(() => { vi.stubEnv("CRON_SECRET", "x".repeat(32)); dispatch.mockResolvedValue({ ready: true, processed: 1, failed: 0 }); });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it.each([undefined, "Bearer wrong", `Bearer ${"y".repeat(32)}`])("rejects invalid service credentials %s", async (authorization) => {
    const response = await GET(new Request("https://example.test/api/workos/audit-logs-dispatch", { headers: authorization ? { authorization } : {} }));
    expect(response.status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("refuses an unconfigured secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("https://example.test"))).status).toBe(503);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("awaits an authenticated bounded dispatch", async () => {
    const response = await GET(new Request("https://example.test", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true, processed: 1, failed: 0 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("returns an alertable failure status for newly failed deliveries", async () => {
    dispatch.mockResolvedValue({ ready: true, processed: 2, delivered: 1, failed: 1 });
    const response = await GET(new Request("https://example.test", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ delivered: 1, failed: 1 });
  });
  it("does not expose private provider failure bodies", async () => {
    dispatch.mockRejectedValue(new Error("private employee details"));
    const response = await GET(new Request("https://example.test", { headers: { authorization: `Bearer ${"x".repeat(32)}` } }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private employee details");
  });
});
