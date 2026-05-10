/**
 * Production serverless function for /api/draft.
 *
 * On Vercel: this file is auto-detected and deployed as a Node.js Function.
 * In Vite dev: the same logic is mounted by `dev/qwen-proxy-plugin.ts` so the
 * URL path stays identical between dev and prod.
 *
 * Vercel runtime configuration: Node.js. We need streaming SSE so we use the
 * raw Response API (not edge — Edge Functions have intermittent compat issues
 * with the OpenAI-compatible providers per the meridian playbook).
 */

import { streamText, type CoreMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const config = {
  runtime: "nodejs",
  // Letters can be long — give the function up to 60s to finish streaming.
  // Vercel raised the default to 300s but keeping this conservative.
  maxDuration: 60,
};

type DraftRequest = {
  messages: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Optional model override from the client (e.g. "qwen3-max"). Allow-listed below. */
  model?: string;
};

const ALLOWED_MODELS = new Set([
  "qwen3-max",
  "qwen-max",
  "qwen-plus",
  "qwen-turbo",
]);

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
  // Resolution order: client-supplied (allow-listed) > env override > flagship default.
  // qwen3-max is the DashScope flagship as of 2026 (paid plan); qwen-plus is the
  // free-tier-capable fallback.
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

  let body: DraftRequest;
  try {
    body = (await req.json()) as DraftRequest;
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const writeEvent = (payload: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      let totalTokens = 0;
      try {
        const result = streamText({
          model: buildModel(),
          messages: body.messages,
          temperature: body.temperature ?? 0.4,
          maxTokens: body.maxTokens ?? 1200,
          onError: (err) => {
            // eslint-disable-next-line no-console
            console.error("[api/draft] streamText error:", err);
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
        console.error("[api/draft] error:", err);
        writeEvent({ error: msg });
      }

      if (totalTokens === 0) {
        writeEvent({
          error:
            "Model returned no tokens. Check the API key, model name (QWEN_MODEL), and that the prompt is valid.",
        });
      }

      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
