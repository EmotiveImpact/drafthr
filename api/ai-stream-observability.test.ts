// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRequestObservability } from "./_utils/observability.js";

const ai = vi.hoisted(() => ({ stream: vi.fn(), messages: vi.fn() }));
vi.mock("ai", () => ({ streamText: ai.stream, convertToModelMessages: ai.messages, tool: (value: unknown) => value }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => ({ provider: "mock" }) }));
vi.mock("./_utils/rate-limit.js", () => ({ rateLimit: async () => null }));
vi.mock("./_utils/production-auth.js", () => ({ enforceProductionSession: async () => null }));
vi.mock("./_utils/workos.js", () => ({ withSessionResponse: (req: Request, handler: (req: Request) => Promise<Response>) =>
  withRequestObservability(req, () => handler(req)) }));
import { POST as agentPost } from "./agent.js";
import { POST as draftPost } from "./draft.js";

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("ANTHROPIC_API_KEY", "mock-key-not-real");
  vi.stubEnv("DRAFTHR_ERROR_REPORT_URL", "https://logs.example.test/ingest");
  ai.messages.mockResolvedValue([{ role: "user", content: "Fictional prompt" }]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function request(path: string) {
  return new Request(`http://localhost:5273/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5273" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Fictional prompt" }] }) });
}
const providerError = new Error("private provider body, employee salary and authorization secret");
describe("AI stream failure reporting", () => {
  it("awaits a redacted alert for a late agent stream failure", async () => {
    const receiver = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", receiver);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let onError!: (value: { error: unknown }) => Promise<void>;
    ai.stream.mockImplementation(options => {
      onError = options.onError;
      return { toUIMessageStreamResponse: () => new Response("partial stream", { headers: { "Content-Type": "text/event-stream" } }) };
    });
    const response = await agentPost(request("agent"));
    expect(receiver).not.toHaveBeenCalled(); expect(response.bodyUsed).toBe(false);
    await onError({ error: providerError });
    expect(JSON.parse(receiver.mock.calls[0][1].body)).toMatchObject({ event: "stream_failed", status: 200, route: "/api/agent" });
    expect(JSON.stringify(receiver.mock.calls)).not.toMatch(/salary|authorization|provider body/);
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/salary|authorization|provider body/);
    expect(await response.text()).toBe("partial stream");
  });
  it("reports a partial draft failure once, retains deltas and sends only a safe client error", async () => {
    const receiver = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", receiver);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    ai.stream.mockImplementation(options => ({ textStream: (async function* () {
      yield "visible partial letter";
      await options.onError({ error: providerError });
      throw providerError;
    })() }));
    const response = await draftPost(request("draft"));
    const body = await response.text();
    expect(body).toContain("visible partial letter");
    expect(body).toContain("Letter generation was interrupted");
    expect(body).not.toMatch(/salary|authorization|provider body/);
    expect(receiver).toHaveBeenCalledOnce();
    expect(JSON.parse(receiver.mock.calls[0][1].body)).toMatchObject({ event: "stream_failed", route: "/api/draft" });
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/salary|authorization|provider body/);
  });
  it("reports empty output as a stream failure instead of a success", async () => {
    const receiver = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", receiver);
    ai.stream.mockReturnValue({ textStream: (async function* () {})() });
    const response = await draftPost(request("draft"));
    expect(await response.text()).toContain("Model returned no tokens");
    expect(receiver).toHaveBeenCalledOnce();
    expect(JSON.parse(receiver.mock.calls[0][1].body).event).toBe("stream_failed");
  });
});
