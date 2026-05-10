import type { ServerResponse } from "node:http";
import { streamText, type ModelMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type DraftRequest = {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Optional client-supplied model override (allow-listed below). */
  model?: string;
};

/**
 * Request shape used by the AI agent (right-rail chat). Mirrors useChat()
 * from @ai-sdk/react: messages are user/assistant turns; the system prompt
 * is sent separately so the client can rebuild it on every turn from the
 * live draft state.
 */
export type AgentRequest = {
  messages: ModelMessage[];
  /** System prompt — built client-side from the live draft. */
  system?: string;
  /** Optional client-supplied model override. */
  model?: string;
};

const provider = (process.env.LLM_PROVIDER ?? "qwen").toLowerCase();
const ALLOWED_MODELS = new Set(["qwen3-max", "qwen-max", "qwen-plus", "qwen-turbo"]);

function buildModel(requested?: string) {
  if (provider === "claude") {
    throw new Error(
      "Claude provider not configured. Install @ai-sdk/anthropic and set ANTHROPIC_API_KEY."
    );
  }
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY missing in environment.");
  const baseURL =
    process.env.QWEN_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const fromRequest = requested && ALLOWED_MODELS.has(requested) ? requested : undefined;
  const modelName = fromRequest ?? process.env.QWEN_MODEL ?? "qwen3-max";
  const qwen = createOpenAICompatible({
    name: "qwen",
    apiKey,
    baseURL,
  });
  return qwen(modelName);
}

export async function handleDraftRequest(
  body: DraftRequest,
  res: ServerResponse
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const encoder = new TextEncoder();
  const writeEvent = (payload: object) => {
    res.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };
  const writeRaw = (line: string) => {
    res.write(encoder.encode(`data: ${line}\n\n`));
  };

  let totalTokens = 0;
  try {
    const result = streamText({
      model: buildModel(body.model),
      messages: body.messages,
      temperature: body.temperature ?? 0.4,
      maxOutputTokens: body.maxTokens ?? 1200,
      onError: (err) => {
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
    // eslint-disable-next-line no-console
    console.error("[qwen-proxy] error:", err);
    writeEvent({ error: msg });
  }

  if (totalTokens === 0) {
    writeEvent({
      error:
        "Model returned no tokens. Check the API key, model name (QWEN_MODEL), and that the prompt is valid.",
    });
  }

  writeRaw("[DONE]");
  res.end();
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
  const result = streamText({
    model: buildModel(body.model),
    system: body.system,
    messages: body.messages,
    temperature: 0.4,
    maxOutputTokens: 1100,
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error("[agent-proxy] streamText onError:", err);
    },
  });

  result.pipeUIMessageStreamToResponse(res);
}
