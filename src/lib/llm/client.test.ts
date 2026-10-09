import { describe, it, expect, vi, afterEach } from "vitest";
import { streamDraft, type Message } from "./client";

function sseResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const messages: Message[] = [{ role: "user", content: "hi" }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("streamDraft — mid-stream error after tokens", () => {
  it("rejects and does NOT call onDone when an error event follows deltas before [DONE]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        'data: {"delta":"Hello "}\n\n',
        'data: {"delta":"world"}\n\n',
        'data: {"error":"model exploded mid-stream"}\n\n',
        "data: [DONE]\n\n",
      ]),
    );

    const onToken = vi.fn();
    const onDone = vi.fn();

    await expect(
      streamDraft({ messages, onToken, onDone }),
    ).rejects.toThrow("model exploded mid-stream");

    // Tokens were surfaced (partial text stays visible)...
    expect(onToken).toHaveBeenCalledTimes(2);
    // ...but the section must NOT be marked complete.
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("streamDraft — stream cut off without [DONE]", () => {
  it("does not report a truncated section as done", async () => {
    // Every attempt drops mid-stream (e.g. the function timed out).
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      sseResponse(['data: {"delta":"The employee was"}\n\n']),
    );
    const onDone = vi.fn();
    const ctl = new AbortController();
    const run = streamDraft({
      messages,
      onToken: () => {},
      onDone,
      // Abort during the first retry back-off so the test doesn't wait.
      onRetry: () => ctl.abort(),
      signal: ctl.signal,
    });
    await expect(run).rejects.toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
