/**
 * Production serverless function for /api/draft.
 *
 * On Vercel: auto-detected and deployed as a Node.js Function.
 * In Vite dev: mounted by `dev/qwen-proxy-plugin.ts` at the same URL path.
 *
 * Provider: OpenRouter (https://openrouter.ai). Free-tier models cover the
 * default path; Anthropic models route directly through Anthropic when
 * selected. Streaming SSE via the raw Response API.
 */

import { streamText, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// MUST keep in sync with server/llm-model.ts.
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free" as const;
const OPENROUTER_FALLBACK_MODEL = "nvidia/nemotron-3-super-120b-a12b:free" as const;
const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-6" as const;

const ALLOWED_MODELS = new Set([
  // OpenRouter free tier
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder:free",
  "z-ai/glm-4.5-air:free",
  "minimax/minimax-m2.5:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  // Anthropic (paid)
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);

function resolveModelName(requested?: string): string {
  const fromRequest = requested && ALLOWED_MODELS.has(requested) ? requested : undefined;
  const envProvider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const envModel = process.env.LLM_MODEL ?? process.env.OPENROUTER_MODEL;
  const providerDefault =
    envProvider === "claude" || envProvider === "anthropic"
      ? ANTHROPIC_FALLBACK_MODEL
      : OPENROUTER_FALLBACK_MODEL;
  return fromRequest ?? envModel ?? providerDefault ?? DEFAULT_MODEL;
}

function buildModel(requested?: string) {
  const modelName = resolveModelName(requested);

  if (modelName.startsWith("claude-")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in environment.");
    return createAnthropic({ apiKey })(modelName);
  }

  // OpenRouter (default). Hardcoded fallback so production works even when env
  // vars aren't set on Vercel. Env var still wins if present.
  const apiKey =
    process.env.OPENROUTER_API_KEY ??
    "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";
  return createOpenAICompatible({
    name: "openrouter",
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://drafthr.vercel.app",
      "X-Title": "DraftHR",
    },
  })(modelName);
}

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

type DraftRequest = {
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

export async function POST(req: Request): Promise<Response> {
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
