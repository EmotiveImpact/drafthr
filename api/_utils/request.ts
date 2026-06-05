const DEFAULT_MAX_JSON_CHARS = 4_000_000;
const DEFAULT_PRODUCTION_ALLOWED_ORIGINS = ["https://app.drafthr.io"];
const DEFAULT_DEVELOPMENT_ALLOWED_ORIGINS = [
  ...DEFAULT_PRODUCTION_ALLOWED_ORIGINS,
  "http://localhost:5273",
  "http://127.0.0.1:5273",
  "http://[::1]:5273",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://[::1]:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://[::1]:4173",
];
const VERCEL_PREVIEW_HOST_RE =
  /^drafthr-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-emotiveimpact-gmailcoms-projects\.vercel\.app$/;
const ALLOWED_ORIGINS = loadAllowedOrigins();

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
  const origin = req.headers.get("origin");
  if (!origin) {
    // Local scripts and curl often omit Origin. Preserve that DX ONLY behind an
    // explicit local-dev flag — NOT via NODE_ENV, because Vercel *preview*
    // deployments are publicly reachable yet don't set NODE_ENV=production, so
    // keying on it would silently disable this CSRF layer on every preview URL.
    // (Same lesson as production-auth.ts's DRAFTHR_DEV_NO_AUTH switch.)
    if (process.env.DRAFTHR_DEV_NO_AUTH === "1") return null;
    return jsonError("Origin required", 403);
  }

  try {
    const parsed = new URL(origin);
    if (!isAllowedOrigin(parsed)) return jsonError("Forbidden origin", 403);
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

function loadAllowedOrigins(): Set<string> {
  const rawEnv = process.env.ALLOWED_ORIGINS;
  const envOrigins = parseAllowedOrigins(rawEnv);
  const configuredOrigins =
    rawEnv?.trim()
      ? envOrigins
      : process.env.NODE_ENV === "production"
        ? DEFAULT_PRODUCTION_ALLOWED_ORIGINS
        : DEFAULT_DEVELOPMENT_ALLOWED_ORIGINS;

  return new Set(configuredOrigins);
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .map(toOrigin)
    .filter((origin): origin is string => origin !== null);
}

function toOrigin(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: URL): boolean {
  if (ALLOWED_ORIGINS.has(origin.origin)) return true;

  // Vercel preview deployment URLs are generated per deploy; allow only this HTTPS hostname shape.
  return origin.protocol === "https:" && VERCEL_PREVIEW_HOST_RE.test(origin.hostname);
}
