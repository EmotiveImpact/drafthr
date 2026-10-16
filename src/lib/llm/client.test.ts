import { describe, it, expect, vi, afterEach } from "vitest";
import { PlanRequiredError, serverErrorMessage, streamDraft, type Message } from "./client";

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

describe("streamDraft — refusals", () => {
  it("shows the server's message for a 402, without retrying", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ error: "Choose a plan, or switch to the standard model.", needPlan: true }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const run = streamDraft({ messages, onToken: () => {} });
    await expect(run).rejects.toThrow("Choose a plan, or switch to the standard model.");
    // Typed, so the editor offers See plans instead of a Retry that would fail again.
    await expect(run).rejects.toBeInstanceOf(PlanRequiredError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still marks a 402 with no message as needing a plan", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 402 }));
    const run = streamDraft({ messages, onToken: () => {} });
    await expect(run).rejects.toBeInstanceOf(PlanRequiredError);
    await expect(run).rejects.toThrow("This needs a paid plan.");
  });

  it("does not treat a 403 refusal as a plan problem", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ error: "Viewers can read letters but not draft them." }), { status: 403 }),
    );
    const run = streamDraft({ messages, onToken: () => {} });
    await expect(run).rejects.toThrow("Viewers can read letters but not draft them.");
    await expect(run).rejects.not.toBeInstanceOf(PlanRequiredError);
  });
});

describe("serverErrorMessage", () => {
  it("reads the message from our JSON error envelope", () => {
    // What the agent chat transport puts in its error for a 402.
    expect(serverErrorMessage('{"error":"Choose a plan to continue.","needPlan":true}')).toBe(
      "Choose a plan to continue.",
    );
  });
  it("is null for anything else", () => {
    expect(serverErrorMessage("Failed to fetch the chat response.")).toBeNull();
    expect(serverErrorMessage("<html><title>502</title></html>")).toBeNull();
    expect(serverErrorMessage('{"error":""}')).toBeNull();
    expect(serverErrorMessage("null")).toBeNull();
  });
});
