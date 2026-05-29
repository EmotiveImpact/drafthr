/**
 * Single Vercel function dispatching /api/store/* to the right handler.
 * Consolidated from two separate functions (drafts.ts + sections.ts)
 * into one dispatcher so the deployment stays under the Hobby-tier
 * 12-function cap — being at exactly 12 was causing the newest function
 * (the consultant marketplace catch-all) to be dropped at deploy.
 *
 * URLs are unchanged: /api/store/drafts and /api/store/sections.
 */
import { jsonError } from "../_utils/request.js";

export const config = { runtime: "nodejs" };

type Handler = (req: Request) => Promise<Response>;
type HandlerModule = { POST?: Handler; PATCH?: Handler; DELETE?: Handler };

async function loadHandler(action: string): Promise<HandlerModule | null> {
  switch (action) {
    case "drafts":
      return import("./_handlers/drafts.js");
    case "sections":
      return import("./_handlers/sections.js");
    default:
      return null;
  }
}

async function dispatch(req: Request, method: "POST" | "PATCH" | "DELETE"): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // ['api', 'store', '<action>']
  const action = segments[2] ?? "";
  const mod = await loadHandler(action);
  if (!mod) return jsonError(`Unknown store path: ${action}`, 404);
  const handler = mod[method];
  if (!handler) return jsonError("Method Not Allowed", 405);
  return handler(req);
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
