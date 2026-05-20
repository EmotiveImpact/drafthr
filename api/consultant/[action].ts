/**
 * Single Vercel function dispatching every /api/consultant/* request.
 * Follows the same dispatcher pattern as /api/auth/[action].ts so we
 * stay under the Hobby-tier 12-function cap.
 *
 * Routes:
 *   GET    /api/consultant/profile
 *   POST   /api/consultant/profile
 *   PATCH  /api/consultant/profile
 *   DELETE /api/consultant/profile
 *   GET    /api/consultant/marketplace
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

async function loadHandler(action: string): Promise<HandlerModule | null> {
  switch (action) {
    case "profile":
      return import("./_handlers/profile.js");
    case "marketplace":
      return import("./_handlers/marketplace.js");
    default:
      return null;
  }
}

async function dispatch(req: Request, method: "GET" | "POST" | "PATCH" | "DELETE"): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // ['api', 'consultant', '<action>'] — action is segments[2]
  const action = segments[2] ?? "";
  const mod = await loadHandler(action);
  if (!mod) return jsonError(`Unknown consultant action: ${action}`, 404);
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
