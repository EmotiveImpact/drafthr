import type { ServerResponse } from "node:http";
import {
  streamText,
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { agentTools } from "../src/lib/llm/tools";
import { DEFAULT_MODEL } from "../src/lib/llm/default-model";

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
  /** v6 UIMessages from useChat — converted to ModelMessage on the server. */
  messages: UIMessage[];
  /** System prompt — built client-side from the live draft. */
  system?: string;
  /** Optional client-supplied model override. */
  model?: string;
};

const ALLOWED_MODELS = new Set([
  // Anthropic
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  // Qwen
  "qwen3-max",
  "qwen3-flash",
  "qwen-max",
  "qwen-plus",
  "qwen-turbo",
]);

/**
 * Build a streamText-compatible model from the user's requested id.
 *
 * Provider is inferred from the model name prefix:
 *   - "claude-*"  → Anthropic via @ai-sdk/anthropic (requires ANTHROPIC_API_KEY)
 *   - "qwen-*"    → DashScope International OpenAI-compatible (requires QWEN_API_KEY)
 *
 * `LLM_PROVIDER` env can force a default provider; otherwise the
 * resolution is: client-supplied id (allow-listed) > env model > flagship.
 * Flagship default is `claude-sonnet-4-6` because it's the strongest
 * legal-writing model that's still cost-reasonable.
 */
function buildModel(requested?: string) {
  const fromRequest = requested && ALLOWED_MODELS.has(requested) ? requested : undefined;
  const envProvider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const envModel = process.env.QWEN_MODEL ?? process.env.LLM_MODEL;
  // Resolution: explicit request -> env -> flagship default
  let modelName = fromRequest ?? envModel ?? (envProvider === "qwen" ? "qwen3-max" : DEFAULT_MODEL);

  // Provider availability check. If the requested model needs a provider
  // whose API key isn't set on this server, fall back to the other provider
  // rather than failing the request silently. This prevents the common
  // "client default is Claude, server only has Qwen keys" misalignment.
  if (modelName.startsWith("claude-") && !process.env.ANTHROPIC_API_KEY) {
    const fallback = envModel ?? "qwen3-max";
    // eslint-disable-next-line no-console
    console.warn(
      `[proxy] Requested ${modelName} but ANTHROPIC_API_KEY is missing. ` +
        `Falling back to ${fallback}.`
    );
    modelName = fallback;
  } else if (
    !modelName.startsWith("claude-") &&
    !process.env.QWEN_API_KEY &&
    process.env.ANTHROPIC_API_KEY
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[proxy] Requested ${modelName} but QWEN_API_KEY is missing. ` +
        `Falling back to ${DEFAULT_MODEL}.`
    );
    modelName = DEFAULT_MODEL;
  }

  if (modelName.startsWith("claude-")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in environment.");
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelName);
  }

  // Default to the Qwen path.
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY missing in environment.");
  const baseURL =
    process.env.QWEN_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const qwen = createOpenAICompatible({ name: "qwen", apiKey, baseURL });
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
  // Surface the real error (from build-time exceptions OR streamText's
  // onError callback) instead of the generic "no tokens" fallback.
  let realError: string | null = null;
  try {
    const result = streamText({
      model: buildModel(body.model),
      messages: body.messages,
      temperature: body.temperature ?? 0.4,
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
  // Convert v6 UIMessages from the client into ModelMessages (proper
  // tool-call encoding) before passing to streamText.
  const modelMessages: ModelMessage[] = await convertToModelMessages(body.messages);

  const result = streamText({
    model: buildModel(body.model),
    system: body.system,
    messages: modelMessages,
    tools: agentTools,
    temperature: 0.4,
    maxOutputTokens: 1100,
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error("[agent-proxy] streamText onError:", err);
    },
  });

  result.pipeUIMessageStreamToResponse(res);
}
