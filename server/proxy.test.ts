import { describe, it, expect, vi } from "vitest";
// We don't import server/proxy directly because it touches process.env at import-time.
// Instead, we exercise the SSE wire format that the browser client expects.

describe("SSE wire format", () => {
  it("client recognises [DONE] sentinel and stops", async () => {
    const { streamDraft } = await import("../src/lib/llm/client");

    const sse = [
      'data: {"delta":"Hello "}\n\n',
      'data: {"delta":"world"}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const tokens: string[] = [];
    let done = false;
    await streamDraft({
      messages: [{ role: "user", content: "x" }],
      onToken: (t) => tokens.push(t),
      onDone: () => {
        done = true;
      },
    });

    expect(tokens.join("")).toBe("Hello world");
    expect(done).toBe(true);
  });

  it("retries on rate-limit error in SSE payload", async () => {
    const { streamDraft } = await import("../src/lib/llm/client");

    let call = 0;
    const fetchSpy = vi.fn().mockImplementation(() => {
      call += 1;
      const sse =
        call === 1
          ? 'data: {"error":"rate limit hit"}\n\ndata: [DONE]\n\n'
          : 'data: {"delta":"OK"}\n\ndata: [DONE]\n\n';
      return Promise.resolve({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          },
        }),
      });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const tokens: string[] = [];
    const retries: number[] = [];
    await streamDraft({
      messages: [{ role: "user", content: "x" }],
      onToken: (t) => tokens.push(t),
      onRetry: (n) => retries.push(n),
    });

    expect(retries.length).toBeGreaterThanOrEqual(1);
    expect(tokens.join("")).toBe("OK");
    expect(call).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
