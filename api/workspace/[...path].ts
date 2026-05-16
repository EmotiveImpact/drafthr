/**
 * Single Vercel function for every /api/workspace/* route. Consolidated
 * because Hobby tier caps deployments at 12 functions and workspace alone
 * had 11 handlers before this — leaving zero budget for the rest of the
 * app. The catch-all `[...path].ts` matches everything under the prefix
 * and we dispatch by URL pathname.
 *
 * Each underlying handler under _handlers/ exports verb-specific functions
 * (GET / POST) the same way it did when each was its own Vercel function —
 * the dispatch is a pure pass-through.
 */
import { jsonError } from "../_utils/request.js";

type Handler = (req: Request) => Promise<Response>;

type HandlerModule = {
  GET?: Handler;
  POST?: Handler;
  DELETE?: Handler;
};

async function loadHandler(path: string): Promise<HandlerModule | null> {
  // .js extensions required at runtime — see auth dispatcher for why.
  switch (path) {
    case "create":
      return import("./_handlers/create.js");
    case "list":
      return import("./_handlers/list.js");
    case "switch":
      return import("./_handlers/switch.js");
    case "invite":
      return import("./_handlers/invite.js");
    case "invites":
      return import("./_handlers/invites.js");
    case "accept-invite":
      return import("./_handlers/accept-invite.js");
    case "members":
      return import("./_handlers/members.js");
    case "invite/revoke":
      return import("./_handlers/invite/revoke.js");
    case "member/role":
      return import("./_handlers/member/role.js");
    case "member/remove":
      return import("./_handlers/member/remove.js");
    default:
      return null;
  }
}

async function dispatch(
  req: Request,
  method: "GET" | "POST" | "DELETE",
): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // ['api', 'workspace', ...rest] — drop the first two
  const path = segments.slice(2).join("/");
  const mod = await loadHandler(path);
  if (!mod) return jsonError(`Unknown workspace route: ${path}`, 404);
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
export async function DELETE(req: Request): Promise<Response> {
  return dispatch(req, "DELETE");
}
