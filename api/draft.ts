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
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// MUST keep in sync with server/llm-model.ts (and api/agent.ts).
const DEFAULT_MODEL = "gemini-3.1-flash-lite" as const;
const GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite" as const;
const ANTHROPIC_FALLBACK_MODEL = "claude-sonnet-4-6" as const;
const QWEN_FALLBACK_MODEL = "qwen3-max" as const;
const NVIDIA_FALLBACK_MODEL = "meta/llama-3.3-70b-instruct" as const;

const ALLOWED_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gemini-3.1-flash-lite",
  "gemini-3.1-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  // NVIDIA NIM models
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-405b-instruct",
  "mistralai/mistral-large-2-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "qwen3-max",
  "qwen-flash",
  "qwen-max",
  "qwen-plus",
  "qwen-turbo",
]);

function resolveModelName(requested?: string): string {
  const fromRequest = requested && ALLOWED_MODELS.has(requested) ? requested : undefined;
  const envProvider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const envModel = process.env.LLM_MODEL ?? process.env.GEMINI_MODEL ?? process.env.NVIDIA_MODEL ?? process.env.QWEN_MODEL;
  const providerDefault =
    envProvider === "gemini" || envProvider === "google"
      ? GEMINI_FALLBACK_MODEL
      : envProvider === "claude" || envProvider === "anthropic"
      ? ANTHROPIC_FALLBACK_MODEL
      : envProvider === "nvidia" || envProvider === "nim"
      ? NVIDIA_FALLBACK_MODEL
      : envProvider === "qwen"
      ? QWEN_FALLBACK_MODEL
      : DEFAULT_MODEL;
  return fromRequest ?? envModel ?? providerDefault;
}

function isNvidiaModel(name: string): boolean {
  return name.startsWith("meta/") || name.startsWith("mistralai/") || name.startsWith("nvidia/") || name.startsWith("google/") || name.startsWith("microsoft/");
}

function buildModel(requested?: string) {
  const modelName = resolveModelName(requested);

  if (modelName.startsWith("claude-")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing in environment.");
    return createAnthropic({ apiKey })(modelName);
  }

  if (modelName.startsWith("gemini-")) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing in environment.");
    return createGoogleGenerativeAI({ apiKey })(modelName);
  }

  if (isNvidiaModel(modelName)) {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) throw new Error("NVIDIA_API_KEY missing in environment.");
    return createOpenAICompatible({
      name: "nvidia-nim",
      apiKey,
      baseURL: "https://integrate.api.nvidia.com/v1",
    })(modelName);
  }

  // Qwen / OpenAI-compatible fallback
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new Error("QWEN_API_KEY missing in environment.");
  const baseURL = process.env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  return createOpenAICompatible({ name: "qwen", apiKey, baseURL })(modelName);
}

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
  /** Optional model override from the client. Validated by the server model resolver. */
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
