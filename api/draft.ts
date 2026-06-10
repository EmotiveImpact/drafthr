/**
 * Production serverless function for /api/draft.
 *
 * Anthropic Claude only. Streaming SSE via the raw Response API.
 * Requires ANTHROPIC_API_KEY in the server environment.
 */

import { streamText, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { rateLimit } from "./_utils/rate-limit.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "./_utils/request.js";
import { enforceProductionSession } from "./_utils/production-auth.js";

const DEFAULT_MODEL = "claude-sonnet-4-6" as const;

const ALLOWED_MODELS = new Set([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
]);

function resolveModelName(requested?: string): string {
  if (requested && ALLOWED_MODELS.has(requested)) return requested;
  return process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
}

function requireAnthropicApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  }
  return apiKey;
}

function buildModel(requested?: string) {
  const modelName = resolveModelName(requested);
  const apiKey = requireAnthropicApiKey();
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
  /**
   * Optional system-prompt augmentation. When set, we prepend a system
   * message with this text to the messages[] array before calling the
   * model. Used by the bulk mail-merge flow to instruct the model to
   * emit {{placeholder}} tokens for fields that vary per recipient.
   *
   * Kept additive and opt-in — default behaviour for single-letter
   * generation is unchanged when absent. Bounded length so it can't be
   * abused as a system-prompt-override vector.
   */
  extraSystemHint?: string;
};

const MAX_EXTRA_HINT_CHARS = 4_000;

// Server-side ceiling on model output. The client picks maxTokens for the
// editor's short-vs-long generations, but an authenticated user could
// otherwise POST {"maxTokens": 64000} and, under the 40/min ai rate limit,
// drive ~40 max-length generations a minute — unbounded Anthropic spend.
// agent.ts already hard-caps its own generations; mirror that here.
// (Security board SE-01, 2026-06-10.)
const DEFAULT_OUTPUT_TOKENS = 1_200;
const MAX_OUTPUT_TOKENS = 2_000;

/** Clamp a client-supplied output-token request into [1, MAX_OUTPUT_TOKENS]. */
export function clampMaxTokens(requested: number | undefined): number {
  const n = typeof requested === "number" && Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_OUTPUT_TOKENS;
  return Math.min(Math.max(n, 1), MAX_OUTPUT_TOKENS);
}

/** Clamp temperature into the valid [0, 1] sampling range. */
export function clampTemperature(requested: number | undefined): number {
  const n = typeof requested === "number" && Number.isFinite(requested) ? requested : 0.4;
  return Math.min(Math.max(n, 0), 1);
}

export async function POST(req: Request): Promise<Response> {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  const rateLimitError = rateLimit(req, { name: "ai", max: 40, windowMs: 60_000 });
  if (rateLimitError) return rateLimitError;
  const sessionError = await enforceProductionSession(req);
  if (sessionError) return sessionError;

  const parsed = await readJsonRequest<DraftRequest>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError("messages[] required", 400);
  }

  // Bulk mail-merge: optionally prepend a system message with the hint.
  // We *prepend* (rather than mutate an existing message) so the existing
  // letter system prompt's structure stays intact and the hint can't
  // contradict the master system prompt — Claude treats it as additional
  // top-level guidance.
  const hint =
    typeof body.extraSystemHint === "string"
      ? body.extraSystemHint.trim().slice(0, MAX_EXTRA_HINT_CHARS)
      : "";
  // Anthropic prompt caching: tag the leading system message(s) as
  // ephemeral so the ~5min cache absorbs repeated calls within a single
  // editing session / bulk batch. 90% input-token savings on hits.
  const cacheControl = { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } } };
  const supplied: ModelMessage[] =
    body.messages[0]?.role === "system"
      ? [{ ...body.messages[0], ...cacheControl }, ...body.messages.slice(1)]
      : body.messages;
  const messages: ModelMessage[] = hint
    ? [{ role: "system", content: hint, ...cacheControl } as ModelMessage, ...supplied]
    : supplied;

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
          messages,
          temperature: clampTemperature(body.temperature),
          maxOutputTokens: clampMaxTokens(body.maxTokens),
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
      "X-Content-Type-Options": "nosniff",
    },
  });
}
