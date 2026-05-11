/**
 * Browser-side helper for streaming completions through /api/draft.
 * The proxy keeps the API key server-side; the browser only sees plain text deltas.
 */

export type Message = { role: "system" | "user" | "assistant"; content: string };

export type StreamOptions = {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  /** DashScope model id, e.g. "qwen3-max". Server falls back to env / "qwen3-max" if absent. */
  model?: string;
  signal?: AbortSignal;
  onToken: (delta: string) => void;
  onDone?: () => void;
  /** Called when a retry is about to start. retryCount is 1-based. */
  onRetry?: (retryCount: number, delayMs: number, reason: string) => void;
};

class RetryableError extends Error {
  readonly retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Streams from /api/draft with automatic retry-with-backoff on transient failures
 * (network errors, HTTP 429, HTTP 5xx, or "no tokens" sentinel from the proxy).
 *
 * Retries up to 3 times with delays: 1s, 4s, 16s.
 * Honours Retry-After header if present on a 429.
 */
export async function streamDraft(opts: StreamOptions): Promise<void> {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 1000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await streamDraftOnce(opts);
      return;
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      const retryable = err instanceof RetryableError;
      const last = attempt === MAX_RETRIES;
      if (!retryable || last) throw err;

      const explicit = (err as RetryableError).retryAfterMs;
      const delay = explicit ?? BASE_DELAY * Math.pow(4, attempt);
      opts.onRetry?.(attempt + 1, delay, err.message);
      await sleep(delay, opts.signal);
    }
  }
}

async function streamDraftOnce(opts: StreamOptions): Promise<void> {
  const res = await fetchOrThrow(opts);

  if (res.status === 429) {
    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    throw new RetryableError("Rate limited (429)", retryAfter);
  }
  if (res.status >= 500 && res.status < 600) {
    // Try to surface the actual server error body (function logs missing
    // env vars, model errors, etc.) instead of a generic "Server error (500)".
    // Body may be HTML (Vercel error page) or JSON (our error envelope).
    const text = await res.text().catch(() => "");
    const snippet = extractErrorSnippet(text);
    const detail = snippet ? ` — ${snippet}` : "";
    throw new RetryableError(`Server error (${res.status})${detail}`);
  }
  if (res.status === 401 || res.status === 403) {
    // Vercel Deployment Protection or other auth gate is blocking the API.
    // Not retryable — the user has to disable protection or sign in.
    throw new Error(
      `/api/draft blocked by authentication (${res.status}). ` +
        `If you're on Vercel, check Project Settings → Deployment Protection.`
    );
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`/api/draft failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let sawAnyToken = false;
  let proxyError: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nlIndex: number;
    while ((nlIndex = buf.indexOf("\n\n")) !== -1) {
      const event = buf.slice(0, nlIndex);
      buf = buf.slice(nlIndex + 2);

      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") {
          if (!sawAnyToken && proxyError) {
            // Treat upstream rate-limit / quota errors as retryable.
            if (/rate limit|quota|429|allocation/i.test(proxyError)) {
              throw new RetryableError(proxyError);
            }
            throw new Error(proxyError);
          }
          opts.onDone?.();
          return;
        }
        try {
          const json = JSON.parse(payload) as { delta?: string; error?: string };
          if (json.error) {
            proxyError = json.error;
            continue;
          }
          if (json.delta) {
            sawAnyToken = true;
            opts.onToken(json.delta);
          }
        } catch {
          // ignore malformed
        }
      }
    }
  }
  opts.onDone?.();
}

async function fetchOrThrow(opts: StreamOptions): Promise<Response> {
  try {
    return await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        model: opts.model,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    // Network error — retryable.
    throw new RetryableError(
      err instanceof Error ? err.message : "Network error"
    );
  }
}

/**
 * Pull a human-readable snippet from a 5xx response body. Vercel's default
 * error pages are HTML, our SSE proxy errors are JSON-event-stream, and
 * the function could also crash with a bare text/plain stack. Try each
 * shape; if nothing intelligible, return empty.
 */
function extractErrorSnippet(text: string): string {
  if (!text) return "";
  // JSON envelope: {"error": "..."}
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.error === "string") return parsed.error.slice(0, 240);
  } catch {
    /* fall through */
  }
  // SSE error event: data: {"error":"..."}
  const sseMatch = text.match(/data:\s*\{[^}]*"error"\s*:\s*"([^"]+)"/);
  if (sseMatch) return sseMatch[1].slice(0, 240);
  // HTML <title>: Vercel's auth wall, function crash page, etc.
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim().slice(0, 240);
  // Plain text: trim and clip
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const seconds = Number(h);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(h);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
