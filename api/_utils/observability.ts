import { randomUUID } from "node:crypto";

/** Deliberately excludes URLs, query strings, cookies, user IDs, exception
 * messages/stacks and request/response bodies: all can contain HR records. */
type RequestEvent = {
  event: "request_started" | "request_completed" | "request_failed" | "stream_response_ready" | "stream_failed";
  level: "info" | "error";
  requestId: string;
  route: string;
  method: string;
  status?: number;
  durationMs?: number;
  release?: string;
};

type RequestContext = {
  base: Pick<RequestEvent, "requestId" | "route" | "method" | "release">;
  started: number;
  streaming: boolean;
  responseStatus?: number;
  streamFailure?: Promise<void>;
};
const requests = new WeakMap<Request, RequestContext>();
function requestContext(req: Request): RequestContext {
  const existing = requests.get(req);
  if (existing) return existing;
  const context: RequestContext = { started: Date.now(), streaming: false,
    base: { requestId: randomUUID(), route: routeGroup(req),
      method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(req.method) ? req.method : "OTHER",
      release: process.env.VERCEL_GIT_COMMIT_SHA?.match(/^[a-f0-9]{7,64}$/i)?.[0] } };
  requests.set(req, context);
  return context;
}

/** Call before constructing a stream: a ready Response is not a completed
 * generation. No body inspection or buffering is needed to mark this state. */
export function markRequestStreaming(req: Request): void {
  requestContext(req).streaming = true;
}

/** SDK onError callbacks await this bounded, redacted delivery. Accept no error
 * argument so provider bodies/prompts/stacks cannot accidentally be serialized.
 * Multiple callbacks/catches for one failed stream produce only one alert. */
export function reportStreamFailure(req: Request): Promise<void> {
  const context = requestContext(req);
  if (context.streamFailure) return context.streamFailure;
  const event: RequestEvent = { ...context.base, event: "stream_failed", level: "error",
    status: context.responseStatus, durationMs: Date.now() - context.started };
  log(event);
  context.streamFailure = reportFailure(event);
  return context.streamFailure;
}

const ROUTES = new Set(["auth", "store", "workspace", "workos", "marketplace", "sign", "export", "upload", "draft", "agent"]);
function routeGroup(req: Request): string {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  return segments[0] === "api" && ROUTES.has(segments[1]) ? `/api/${segments[1]}` : "/api/other";
}
function log(event: RequestEvent): void {
  if (process.env.NODE_ENV === "test") return;
  const write = event.level === "error" ? console.error : console.info;
  write(JSON.stringify(event));
}

/** Configure an approved HTTPS log/alert receiver. No external transmission
 * unless explicitly configured. Await a bounded delivery so a serverless
 * response cannot terminate it; telemetry failure never changes app outcomes. */
async function reportFailure(event: RequestEvent): Promise<void> {
  const receiver = process.env.DRAFTHR_ERROR_REPORT_URL;
  if (!receiver) return;
  try {
    const url = new URL(receiver);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid receiver");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(url, { method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(process.env.DRAFTHR_ERROR_REPORT_TOKEN
          ? { Authorization: `Bearer ${process.env.DRAFTHR_ERROR_REPORT_TOKEN}` } : {}) },
        body: JSON.stringify(event) });
      await response.body?.cancel();
      if (!response.ok) throw new Error("Receiver rejected event");
    } finally { clearTimeout(timer); }
  } catch {
    if (process.env.NODE_ENV !== "test") console.error(JSON.stringify({ event: "error_reporting_unavailable", level: "error", requestId: event.requestId }));
  }
}

export async function withRequestObservability(req: Request, handler: () => Promise<Response>): Promise<Response> {
  const context = requestContext(req);
  const { started, base } = context;
  log({ ...base, event: "request_started", level: "info" });
  let response: Response;
  try { response = await handler(); }
  catch (error) {
    const event: RequestEvent = { ...base, event: "request_failed", level: "error", status: 500, durationMs: Date.now() - started };
    log(event); await reportFailure(event); throw error;
  }
  context.responseStatus = response.status;
  const event: RequestEvent = { ...base, event: response.status >= 500 ? "request_failed" : context.streaming ? "stream_response_ready" : "request_completed",
    level: response.status >= 500 ? "error" : "info", status: response.status, durationMs: Date.now() - started };
  log(event);
  if (response.status >= 500) await reportFailure(event);
  // Do not read/clone the body: preserves streaming, downloads and session cookies.
  return response;
}
