/**
 * Production serverless function for /api/agent — the AI SDK v6 UIMessage
 * stream endpoint consumed by useChat() in the right-rail AIPanel.
 *
 * The client sends v6 UIMessages; we convert to ModelMessages so tool-call
 * history rides along correctly, then streamText with our typed tools.
 */

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

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

type AgentRequest = {
  messages: UIMessage[];
  system?: string;
  model?: string;
};

const ALLOWED_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "qwen3-max",
  "qwen-flash",
  "qwen-max",
  "qwen-plus",
  "qwen-turbo",
]);

function buildModel(requestedModel?: string) {
  const fromRequest =
    requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : undefined;
  const envProvider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const envModel = process.env.LLM_MODEL ?? process.env.QWEN_MODEL;
  let modelName =
    fromRequest ?? envModel ?? (envProvider === "qwen" ? "qwen3-max" : DEFAULT_MODEL);

  // Transparent fallback when the requested provider's key isn't on this
  // server. Matches server/proxy.ts + api/draft.ts.
  if (modelName.startsWith("claude-") && !process.env.ANTHROPIC_API_KEY) {
    const fallback = envModel ?? "qwen3-max";
    // eslint-disable-next-line no-console
    console.warn(
      `[api/agent] Requested ${modelName} but ANTHROPIC_API_KEY is missing. ` +
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
      `[api/agent] Requested ${modelName} but QWEN_API_KEY is missing. ` +
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

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY missing in environment.");
  const baseURL =
    process.env.QWEN_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const qwen = createOpenAICompatible({ name: "qwen", apiKey, baseURL });
  return qwen(modelName);
}

export async function POST(req: Request): Promise<Response> {
  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages[] required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
      console.error("[api/agent] streamText error:", err);
    },
  });

  return result.toUIMessageStreamResponse();
}
