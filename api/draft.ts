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

/**
 * Whether a model still accepts sampling parameters. Opus 4.7 and every later
 * model reject `temperature`/`top_p`/`top_k` with a 400, so sending one made
 * every generation fail when a user picked Opus. Only the older models listed
 * here take a temperature; for everything else it is left out.
 */
const SAMPLING_MODELS = /^claude-(sonnet-4-6|haiku-4-5|opus-4-6|sonnet-4-5|opus-4-5)\b/;
function temperatureFor(modelName: string, temperature: number | undefined): number | undefined {
  return SAMPLING_MODELS.test(modelName) ? temperature : undefined;
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

// Input-side spend cap, the other half of the output clamp below. The real
// section prompt (master system prompt, evidence, prior sections) is well
// under this; without it an authenticated caller could send ~1M tokens per
// request. Reject rather than truncate: a silently cut letter context would
// produce confidently wrong output.
const MAX_INPUT_CHARS = 300_000;
const MAX_MESSAGES = 60;

/**
 * Why a client-supplied messages[] is unacceptable, or null when it's fine.
 * Only the first message may carry the system role (the letter's master
 * prompt); a system message anywhere else would let user-controlled text
 * speak with system authority.
 */
export function rejectDraftMessages(messages: unknown[]): string | null {
  if (messages.length > MAX_MESSAGES) return "Too many messages";
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as { role?: unknown; content?: unknown } | null;
    if (!m || typeof m !== "object") return "Invalid message";
    if (m.role !== "user" && m.role !== "assistant" && m.role !== "system") return "Invalid message role";
    if (m.role === "system" && i !== 0) return "Only the first message may be a system message";
    total += typeof m.content === "string" ? m.content.length : JSON.stringify(m.content ?? "").length;
    if (total > MAX_INPUT_CHARS) return "This request is too long to generate in one pass";
  }
  return null;
}

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
  const messagesError = rejectDraftMessages(body.messages);
  if (messagesError) return jsonError(messagesError, messagesError.includes("too long") ? 413 : 400);

  // Bulk mail-merge: optionally add a system message with the hint, as a
  // separate message so the letter system prompt's structure stays intact.
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
  // The hint goes AFTER the master system prompt: that prompt says never to
  // leave {{placeholders}}, and a hint placed before it was overridden by it.
  // Keeping the master first also keeps the cached prefix identical.
  const hintMessage = { role: "system", content: hint } as ModelMessage;
  const messages: ModelMessage[] = !hint
    ? supplied
    : supplied[0]?.role === "system"
      ? [supplied[0], hintMessage, ...supplied.slice(1)]
      : [hintMessage, ...supplied];

  let cancelled = false;
  // Abort the upstream Anthropic generation when the client disconnects, so an
  // aborted request stops consuming (and billing) tokens instead of running to
  // completion in the background.
  const controllerAbort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      // Guard every controller write: if the client disconnects mid-stream the
      // consumer cancels the stream and the controller closes, so a later
      // enqueue would throw "Invalid state: Controller is already closed" (and
      // the catch block below would then double-throw). Stop writing instead.
      const writeEvent = (payload: object) => {
        if (cancelled) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          cancelled = true;
        }
      };

      let totalTokens = 0;
      let realError: string | null = null;
      try {
        const result = streamText({
          model: buildModel(body.model),
          messages,
          temperature: temperatureFor(resolveModelName(body.model), clampTemperature(body.temperature)),
          maxOutputTokens: clampMaxTokens(body.maxTokens),
          abortSignal: controllerAbort.signal,
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
          if (cancelled) break;
          if (!chunk) continue;
          totalTokens += 1;
          writeEvent({ delta: chunk });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        realError = msg;
        // eslint-disable-next-line no-console
        console.error("[api/draft] error:", err);
        // No writeEvent here — the post-loop branch below is the single
        // emitter (emitting in both places doubled the error event).
      }

      if (totalTokens === 0 && !realError) {
        writeEvent({
          error:
            "Model returned no tokens. Check the API key and that the prompt is valid.",
        });
      } else if (realError) {
        // Emit the error even when tokens already flowed: the AI SDK's
        // non-throwing onError can fire mid-stream (upstream drop, overload)
        // and without this event the client would see a clean [DONE] and
        // store the truncated section as complete.
        writeEvent({ error: realError });
      }

      if (!cancelled) {
        try {
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          /* client already disconnected — nothing to flush */
        }
      }
    },
    cancel() {
      // Client disconnected — stop the (still-running) streamText writes above
      // and abort the upstream generation so we stop consuming/paying tokens.
      cancelled = true;
      controllerAbort.abort();
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
