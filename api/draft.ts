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

import { streamText, type ModelMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { DEFAULT_MODEL } from "../src/lib/llm/default-model";

export const config = {
  runtime: "nodejs",
  // Letters can be long — give the function up to 60s to finish streaming.
  // Vercel raised the default to 300s but keeping this conservative.
  maxDuration: 60,
};

type DraftRequest = {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Optional model override from the client (e.g. "qwen3-max"). Allow-listed below. */
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

/**
 * Resolve a streamText-compatible model. Provider is inferred from the
 * model name prefix — Claude for "claude-*", Qwen for "qwen-*". Default
 * is claude-sonnet-4-6 (best for legal writing per cost).
 */
function buildModel(requestedModel?: string) {
  const fromRequest =
    requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : undefined;
  const envProvider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const envModel = process.env.LLM_MODEL ?? process.env.QWEN_MODEL;
  let modelName =
    fromRequest ?? envModel ?? (envProvider === "qwen" ? "qwen3-max" : DEFAULT_MODEL);

  // If the requested model's provider key is missing, fall back transparently
  // rather than failing the stream silently. Matches server/proxy.ts.
  if (modelName.startsWith("claude-") && !process.env.ANTHROPIC_API_KEY) {
    const fallback = envModel ?? "qwen3-max";
    // eslint-disable-next-line no-console
    console.warn(
      `[api/draft] Requested ${modelName} but ANTHROPIC_API_KEY is missing. ` +
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
      `[api/draft] Requested ${modelName} but QWEN_API_KEY is missing. ` +
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
        realError = msg;
        // eslint-disable-next-line no-console
        console.error("[api/draft] error:", err);
        writeEvent({ error: msg });
      }

      if (totalTokens === 0 && !realError) {
        writeEvent({
          error:
            "Model returned no tokens. Check the API key, the model name (Settings → AI model), and that the prompt is valid.",
        });
      } else if (totalTokens === 0 && realError) {
        writeEvent({ error: realError });
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
