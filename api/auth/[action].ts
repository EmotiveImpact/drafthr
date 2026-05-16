/**
 * Single Vercel function that dispatches every /api/auth/* request to the
 * appropriate handler under _handlers/. We consolidate here because Hobby
 * tier caps deployments at 12 functions — splitting auth into 4 separate
 * functions burns half that budget for a feature surface that's logically
 * one thing.
 *
 * Routing: Vercel's catch-all `[action].ts` matches /api/auth/<anything>
 * and passes the path segment via the URL. Each underlying handler exports
 * a verb-specific function (GET / POST) the same way it did before — we
 * just call into it.
 */
import { jsonError } from "../_utils/request";

type Handler = (req: Request) => Promise<Response>;

type HandlerModule = {
  GET?: Handler;
  POST?: Handler;
};

async function loadHandler(action: string): Promise<HandlerModule | null> {
  switch (action) {
    case "url":
      return import("./_handlers/url");
    case "callback":
      return import("./_handlers/callback");
    case "session":
      return import("./_handlers/session");
    case "sign-out":
      return import("./_handlers/sign-out");
    default:
      return null;
  }
}

async function dispatch(req: Request, method: "GET" | "POST"): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // ['api', 'auth', '<action>'] — action is segments[2]
  const action = segments[2] ?? "";
  const mod = await loadHandler(action);
  if (!mod) return jsonError(`Unknown auth action: ${action}`, 404);
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
