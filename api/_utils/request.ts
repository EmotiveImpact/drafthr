const DEFAULT_MAX_JSON_CHARS = 4_000_000;

type JsonReadResult<T> =
  | { ok: true; body: T }
  | { ok: false; response: Response };

export async function readJsonRequest<T>(
  req: Request,
  maxChars = DEFAULT_MAX_JSON_CHARS
): Promise<JsonReadResult<T>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, response: jsonError("Content-Type must be application/json", 415) };
  }

  const contentLength = parseContentLength(req);
  if (contentLength !== null && contentLength > maxChars) {
    return { ok: false, response: jsonError("Request body too large", 413) };
  }

  try {
    const raw = await req.text();
    if (raw.length > maxChars) {
      return { ok: false, response: jsonError("Request body too large", 413) };
    }
    return { ok: true, body: JSON.parse(raw) as T };
  } catch {
    return { ok: false, response: jsonError("Invalid JSON", 400) };
  }
}

export function enforceSameOrigin(req: Request): Response | null {
  if (process.env.NODE_ENV !== "production") return null;

  const origin = req.headers.get("origin");
  if (!origin) return jsonError("Origin required", 403);

  const host = firstHeaderValue(req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  if (!host) return jsonError("Host required", 400);

  try {
    if (new URL(origin).host !== host) return jsonError("Forbidden origin", 403);
  } catch {
    return jsonError("Invalid origin", 403);
  }
  return null;
}

export function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseContentLength(req: Request): number | null {
  const raw = req.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}
