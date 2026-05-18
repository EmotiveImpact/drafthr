/**
 * Single Vercel function that dispatches every /api/workos/* request to the
 * appropriate handler under _handlers/. Same consolidation logic as
 * /api/auth/[action].ts and /api/workspace/[...path].ts — Hobby tier caps
 * deployments at 12 functions and Directory Sync alone needs three
 * endpoints (webhook, portal link, directory info).
 *
 * The directory-webhook handler is intentionally in this dispatcher even
 * though it doesn't need a session: it shares the same prefix and a single
 * function keeps the cold-start surface tiny.
 */
import { jsonError } from "../_utils/request.js";

type Handler = (req: Request) => Promise<Response>;

type HandlerModule = {
  GET?: Handler;
  POST?: Handler;
};

async function loadHandler(action: string): Promise<HandlerModule | null> {
  // .js extensions mandatory at runtime — nodenext resolution. See the auth
  // dispatcher for the longer explainer.
  switch (action) {
    case "directory-webhook":
      return import("./_handlers/directory-webhook.js");
    case "portal-link":
      return import("./_handlers/portal-link.js");
    case "directory-info":
      return import("./_handlers/directory-info.js");
    case "audit-logs-test":
      return import("./_handlers/audit-logs-test.js");
    case "audit-logs-status":
      return import("./_handlers/audit-logs-status.js");
    default:
      return null;
  }
}

async function dispatch(req: Request, method: "GET" | "POST"): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // ['api', 'workos', '<action>']
  const action = segments[2] ?? "";
  const mod = await loadHandler(action);
  if (!mod) return jsonError(`Unknown workos action: ${action}`, 404);
  const handler = mod[method];
  if (!handler) return jsonError("Method Not Allowed", 405);
  return handler(req);
}

export async function GET(req: Request): Promise<Response> {
  return dispatch(req, "GET");
}
export async function POST(req: Request): Promise<Response> {
  return dispatch(req, "POST");
}
