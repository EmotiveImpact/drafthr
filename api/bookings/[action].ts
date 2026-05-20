/**
 * Single Vercel function dispatching every /api/bookings/* request.
 * Follows the same dispatcher pattern as /api/auth/[action].ts so we
 * stay under the Hobby-tier 12-function cap.
 *
 * Routes:
 *   GET  /api/bookings/list      list bookings I placed (HR side)
 *   POST /api/bookings/create    create a new booking
 *   GET  /api/bookings/inbox     bookings addressed to me (consultant side)
 *   POST /api/bookings/respond   accept / decline / deliver / complete
 */
import { jsonError } from "../_utils/request.js";

export const config = { runtime: "nodejs" };

type Handler = (req: Request) => Promise<Response>;

type HandlerModule = {
  GET?: Handler;
  POST?: Handler;
};

async function loadHandler(action: string, method: "GET" | "POST"): Promise<HandlerModule | null> {
  // 'list-and-create' lives in one module and exports both GET (list)
  // and POST (create). The dispatcher maps the two friendly action names
  // ('list' / 'create') to that one module so URLs read naturally.
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

async function dispatch(req: Request, method: "GET" | "POST"): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // ['api', 'bookings', '<action>'] — action is segments[2]
  const action = segments[2] ?? "";
  const mod = await loadHandler(action, method);
  if (!mod) return jsonError(`Unknown bookings action: ${action}`, 404);
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
