import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rateLimitedRequest, StorageRateLimitError } from "./rate-limited-request";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-27T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
const limited = (retry?: string) => new Response(null, { status: 429, headers: retry ? { "Retry-After": retry } : {} });
it.each(["2", "Sun, 27 Sep 2026 12:00:02 GMT"])("waits for Retry-After %s before replaying", async retry => {
  const request = vi.fn().mockResolvedValueOnce(limited(retry)).mockResolvedValueOnce(new Response("saved"));
  const pending = rateLimitedRequest(request, () => {});
  await vi.advanceTimersByTimeAsync(1999); expect(request).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1); expect((await pending).status).toBe(200);
  expect(request).toHaveBeenCalledTimes(2);
});
it("stops after two retries and preserves an actionable failure", async () => {
  const request = vi.fn().mockImplementation(() => limited("1"));
  const result = expect(rateLimitedRequest(request, () => {})).rejects.toBeInstanceOf(StorageRateLimitError);
  await vi.advanceTimersByTimeAsync(2000); await result; expect(request).toHaveBeenCalledTimes(3);
});
it("uses bounded backoff without a valid header", async () => {
  const request = vi.fn().mockImplementation(() => limited("bad-date"));
  const result = expect(rateLimitedRequest(request, () => {})).rejects.toThrow("original data is preserved");
  await vi.advanceTimersByTimeAsync(2999); expect(request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1); await result; expect(request).toHaveBeenCalledTimes(3);
});
it.each(["61", "9".repeat(400)])("does not retry earlier than an excessive provider delay", async retry => {
  const request = vi.fn().mockResolvedValue(limited(retry));
  await expect(rateLimitedRequest(request, () => {})).rejects.toBeInstanceOf(StorageRateLimitError);
  expect(request).toHaveBeenCalledOnce();
});
it("cancels during backoff after a workspace change without another request", async () => {
  let current = true;
  const request = vi.fn().mockResolvedValue(limited("60"));
  const result = expect(rateLimitedRequest(request, () => { if (!current) throw new Error("Workspace changed"); })).rejects.toThrow("Workspace changed");
  await vi.advanceTimersByTimeAsync(250); current = false;
  await vi.advanceTimersByTimeAsync(250); await result; expect(request).toHaveBeenCalledOnce();
});
it.each([400, 401, 403, 409, 500, 503])("does not replay status %s", async status => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status }));
  expect((await rateLimitedRequest(request, () => {})).status).toBe(status); expect(request).toHaveBeenCalledOnce();
});
it("does not replay an ambiguous network failure", async () => {
  const request = vi.fn().mockRejectedValue(new Error("Offline"));
  await expect(rateLimitedRequest(request, () => {})).rejects.toThrow("Offline"); expect(request).toHaveBeenCalledOnce();
});
