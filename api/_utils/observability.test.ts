// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { markRequestStreaming, reportStreamFailure, withRequestObservability } from "./observability.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("privacy-safe request observability", () => {
  it("does not send anything externally unless configured, or consume streams/cookies", async () => {
    vi.stubEnv("DRAFTHR_ERROR_REPORT_URL", "");
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    const response = new Response("private bytes", { headers: { "Set-Cookie": "session=private" } });
    expect(await withRequestObservability(new Request("https://example.test/api/store/files?token=secret"), async () => response)).toBe(response);
    expect(response.bodyUsed).toBe(false); expect(network).not.toHaveBeenCalled();
  });
  it("reports handled server failures without any HR or authentication data", async () => {
    vi.stubEnv("DRAFTHR_ERROR_REPORT_URL", "https://logs.example.test/ingest");
    const network = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", network);
    const req = new Request("https://example.test/api/store/employee-name?token=secret", { method: "POST", headers: { Cookie: "private-cookie" }, body: "employee salary" });
    await withRequestObservability(req, async () => new Response("confidential error", { status: 503 }));
    const sent = JSON.parse(network.mock.calls[0][1].body);
    expect(sent).toMatchObject({ event: "request_failed", status: 503, route: "/api/store", method: "POST" });
    expect(JSON.stringify(sent)).not.toMatch(/employee|salary|secret|cookie|confidential/);
  });
  it("preserves the original thrown error even if the monitoring receiver fails", async () => {
    vi.stubEnv("DRAFTHR_ERROR_REPORT_URL", "https://logs.example.test/ingest");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("receiver down")));
    const failure = new Error("private SQL parameters");
    await expect(withRequestObservability(new Request("https://example.test/api/draft"), async () => { throw failure; })).rejects.toBe(failure);
  });
  it("rejects insecure or credential-bearing receiver URLs", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    for (const url of ["http://logs.example.test", "https://user:secret@logs.example.test", "https://logs.example.test?secret=1"]) {
      vi.stubEnv("DRAFTHR_ERROR_REPORT_URL", url);
      expect((await withRequestObservability(new Request("https://example.test/api/store/files"), async () => new Response(null, { status: 500 }))).status).toBe(500);
    }
    expect(network).not.toHaveBeenCalled();
  });
  it("does not declare a returned stream complete and correlates later failures without reading the body", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRAFTHR_ERROR_REPORT_URL", "https://logs.example.test/ingest");
    const network = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", network);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new Request("https://example.test/api/agent?private=content");
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("partial output")); } }),
      { headers: { "Content-Type": "text/event-stream", "Set-Cookie": "rotated=private" } });
    expect(await withRequestObservability(req, async () => { markRequestStreaming(req); return response; })).toBe(response);
    expect(response.bodyUsed).toBe(false);
    expect(info.mock.calls.map(call => JSON.parse(call[0]).event)).toEqual(["request_started", "stream_response_ready"]);
    await Promise.all([reportStreamFailure(req), reportStreamFailure(req)]);
    expect(network).toHaveBeenCalledOnce();
    const event = JSON.parse(network.mock.calls[0][1].body);
    expect(event).toMatchObject({ event: "stream_failed", level: "error", status: 200, route: "/api/agent",
      requestId: JSON.parse(info.mock.calls[0][0]).requestId });
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/partial output|private=|rotated/);
    expect(response.bodyUsed).toBe(false);
    await response.body!.cancel();
  });
});
