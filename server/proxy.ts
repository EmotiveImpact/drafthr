import type { ServerResponse } from "node:http";
import {
  streamText,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { agentTools } from "./agent-tools";
import { buildModel, resolveModelName, temperatureFor } from "./llm-model";

export type DraftRequest = {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Optional client-supplied model override. Validated by the server model resolver. */
  model?: string;
};

/**
 * Request shape used by the AI agent (right-rail chat). Mirrors useChat()
 * from @ai-sdk/react: messages are user/assistant turns; the system prompt
 * is sent separately so the client can rebuild it on every turn from the
 * live draft state.
 */
export type AgentRequest = {
  /** v6 UIMessages from useChat — converted to ModelMessage on the server. */
  messages: UIMessage[];
  /** System prompt — built client-side from the live draft. */
  system?: string;
  /** Optional client-supplied model override. */
  model?: string;
};

export async function handleDraftRequest(
  body: DraftRequest,
  res: ServerResponse
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const encoder = new TextEncoder();
  // A client disconnecting mid-stream destroys the response. Without an 'error'
  // listener Node escalates the socket error into an unhandled exception that
  // crashes the dev server; and writing to a destroyed response throws. Track
  // the closed state and stop writing once the client is gone.
  let cancelled = false;
  res.on("close", () => {
    cancelled = true;
  });
  res.on("error", () => {
    cancelled = true;
  });
  const canWrite = () => !cancelled && !res.writableEnded && !res.destroyed;
  const writeEvent = (payload: object) => {
    if (!canWrite()) return;
    try {
      res.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    } catch {
      cancelled = true;
    }
  };
  const writeRaw = (line: string) => {
    if (!canWrite()) return;
    try {
      res.write(encoder.encode(`data: ${line}\n\n`));
    } catch {
      cancelled = true;
    }
  };

  let totalTokens = 0;
  // Surface the real error (from build-time exceptions OR streamText's
  // onError callback) instead of the generic "no tokens" fallback.
  let realError: string | null = null;
  try {
    const result = streamText({
      model: buildModel(body.model),
      messages: body.messages,
      temperature: temperatureFor(resolveModelName(body.model), body.temperature ?? 0.4),
      maxOutputTokens: body.maxTokens ?? 1200,
      onError: (err) => {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err && "error" in err
            ? String((err as { error: unknown }).error)
            : String(err);
        realError = msg;
        // eslint-disable-next-line no-console
        console.error("[qwen-proxy] streamText onError:", err);
      },
    });

    for await (const chunk of result.textStream) {
      if (!chunk) continue;
      totalTokens += 1;
      writeEvent({ delta: chunk });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    realError = msg;
    // eslint-disable-next-line no-console
    console.error("[qwen-proxy] error:", err);
    writeEvent({ error: msg });
  }

  if (totalTokens === 0 && !realError) {
    writeEvent({
      error:
        "Model returned no tokens. Check the API key, the model name (Settings → AI model), and that the prompt is valid.",
    });
  } else if (totalTokens === 0 && realError) {
    // Already emitted a real error from onError. Echo it once more in a
    // form the client's SSE consumer will definitely show.
    writeEvent({ error: realError });
  }

  writeRaw("[DONE]");
  if (!res.writableEnded && !res.destroyed) {
    try {
      res.end();
    } catch {
      /* client already disconnected */
    }
  }
}

/**
 * Handle a useChat() POST. Reads `messages` + optional `system` + optional
 * `model` from the request body, hands them to streamText, and pipes the
 * AI SDK v6 UIMessage stream protocol back to the Node response so the
 * @ai-sdk/react useChat hook on the client receives proper deltas + tool
 * call events.
 */
export async function handleAgentRequest(
  body: AgentRequest,
  res: ServerResponse
): Promise<void> {
  // Convert v6 UIMessages from the client into ModelMessages (proper
  // tool-call encoding) before passing to streamText.
  const modelMessages: ModelMessage[] = await convertToModelMessages(body.messages);

  const result = streamText({
    model: buildModel(body.model),
    system: body.system,
    messages: modelMessages,
    tools: agentTools,
    temperature: temperatureFor(resolveModelName(body.model), 0.4),
    maxOutputTokens: 1100,
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error("[agent-proxy] streamText onError:", err);
    },
  });

  result.pipeUIMessageStreamToResponse(res, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
