/**
 * Production serverless function for /api/draft.
 *
 * Anthropic Claude only. Streaming SSE via the raw Response API.
 * Hardcoded API key fallback so production works without env vars
 * (private repo, server-only code — never reaches browser bundle).
 */

import { streamText, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const DEFAULT_MODEL = "claude-sonnet-4-6" as const;

const ALLOWED_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);

function resolveModelName(requested?: string): string {
  if (requested && ALLOWED_MODELS.has(requested)) return requested;
  return process.env.LLM_MODEL ?? DEFAULT_MODEL;
}

function buildModel(requested?: string) {
  const modelName = resolveModelName(requested);
  // Use || (not ??) so empty-string env vars fall back to the hardcoded key.
  const apiKey =
    process.env.ANTHROPIC_API_KEY ||
    "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";
  return createAnthropic({ apiKey, baseURL: "https://api.anthropic.com/v1" })(modelName);
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
            "Model returned no tokens. Check the API key and that the prompt is valid.",
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
