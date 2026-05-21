/**
 * Single Vercel function dispatching all marketplace API requests.
 *
 * Routes:
 *   GET    /api/marketplace/consultant/profile
 *   POST   /api/marketplace/consultant/profile
 *   PATCH  /api/marketplace/consultant/profile
 *   DELETE /api/marketplace/consultant/profile
 *   GET    /api/marketplace/consultant/marketplace
 *   GET    /api/marketplace/bookings/list
 *   POST   /api/marketplace/bookings/create
 *   GET    /api/marketplace/bookings/inbox
 *   POST   /api/marketplace/bookings/respond
 *
 * Why one function: Vercel Hobby tier caps total deployments at 12
 * serverless functions. Splitting marketplace into 2 dispatchers
 * (consultant + bookings) pushed past the cap, so we collapse everything
 * marketplace-related into a single catch-all here.
 *
 * The client API in src/lib/consultantApi.ts uses these URLs; older
 * /api/consultant/* and /api/bookings/* paths are unreachable now.
 */
import { jsonError } from "../_utils/request.js";

export const config = { runtime: "nodejs" };

type Handler = (req: Request) => Promise<Response>;

type HandlerModule = {
  GET?: Handler;
  POST?: Handler;
  PATCH?: Handler;
  DELETE?: Handler;
};

async function loadHandler(
  group: string,
  action: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
): Promise<HandlerModule | null> {
  if (group === "consultant") {
    switch (action) {
      case "profile":
        return import("./_handlers/profile.js");
      case "marketplace":
        return import("./_handlers/marketplace.js");
      default:
        return null;
    }
  }
  if (group === "bookings") {
    switch (action) {
      case "list":
      case "create":
        return import("./_handlers/list-and-create.js");
      case "inbox":
        return method === "GET" ? import("./_handlers/inbox.js") : null;
      case "respond":
        return method === "POST" ? import("./_handlers/respond.js") : null;
      default:
        return null;
    }
  }
  // Share-token resolver — the URL is /api/marketplace/shared/<token>
  // so the dispatcher sees group='shared' and action=<token>.
  // Token validation happens inside the handler.
  if (group === "shared") {
    return method === "GET" ? import("./_handlers/shared.js") : null;
  }
  return null;
}

async function dispatch(
  req: Request,
  method: "GET" | "POST" | "PATCH" | "DELETE",
): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // ['api', 'marketplace', '<group>', '<action>']
  const group = segments[2] ?? "";
  const action = segments[3] ?? "";
  const mod = await loadHandler(group, action, method);
  if (!mod)
    return jsonError(`Unknown marketplace path: ${group}/${action}`, 404);
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
export async function PATCH(req: Request): Promise<Response> {
  return dispatch(req, "PATCH");
}
export async function DELETE(req: Request): Promise<Response> {
  return dispatch(req, "DELETE");
}
