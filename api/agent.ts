/**
 * Production serverless function for /api/agent — the AI SDK v6 UIMessage
 * stream endpoint consumed by useChat() in the right-rail AIPanel.
 */

import { streamText, type ModelMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

type AgentRequest = {
  messages: ModelMessage[];
  system?: string;
  model?: string;
};

const ALLOWED_MODELS = new Set(["qwen3-max", "qwen-max", "qwen-plus", "qwen-turbo"]);

function buildModel(requestedModel?: string) {
  const provider = (process.env.LLM_PROVIDER ?? "qwen").toLowerCase();
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
  const fromRequest =
    requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : undefined;
  const modelName = fromRequest ?? process.env.QWEN_MODEL ?? "qwen3-max";
  const qwen = createOpenAICompatible({ name: "qwen", apiKey, baseURL });
  return qwen(modelName);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

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

  const result = streamText({
    model: buildModel(body.model),
    system: body.system,
    messages: body.messages,
    temperature: 0.4,
    maxOutputTokens: 1100,
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error("[api/agent] streamText error:", err);
    },
  });

  return result.toUIMessageStreamResponse();
}
