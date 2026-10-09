/**
 * Single Vercel function dispatching all marketplace API requests.
 *
 * IMPORTANT — single-segment paths only. Vercel's catch-all routing for
 * this (Vite / "Other") framework compiles `[...path].ts` to a
 * single-segment matcher (`^/api/marketplace/([^/]+)$`), NOT a true
 * multi-segment `(.+)`. Two-segment paths like
 * `/api/marketplace/consultant/profile` therefore 404 (the function is
 * never reached). So every action is ONE segment:
 *
 *   GET    /api/marketplace/profile
 *   POST   /api/marketplace/profile
 *   PATCH  /api/marketplace/profile
 *   DELETE /api/marketplace/profile
 *   GET    /api/marketplace/listing            (public consultant listing)
 *   GET    /api/marketplace/bookings-list      (HR: my bookings)
 *   POST   /api/marketplace/bookings-create
 *   GET    /api/marketplace/bookings-inbox     (consultant inbox)
 *   POST   /api/marketplace/bookings-respond
 *   POST   /api/marketplace/bookings-message
 *   GET    /api/marketplace/shared?token=…     (matter-scoped draft)
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
    case "listing":
      return import("./_handlers/marketplace.js");
    case "bookings-list":
    case "bookings-create":
      return import("./_handlers/list-and-create.js");
    case "bookings-inbox":
      return import("./_handlers/inbox.js");
    case "bookings-respond":
      return import("./_handlers/respond.js");
    case "bookings-message":
      return import("./_handlers/message.js");
    case "shared":
      return import("./_handlers/shared.js");
    case "admin-queue":
      return import("./_handlers/admin-queue.js");
    case "admin-review":
      return import("./_handlers/admin-review.js");
    case "stripe-connect":
      return import("./_handlers/stripe-connect.js");
    case "stripe-checkout":
      return import("./_handlers/stripe-checkout.js");
    case "stripe-webhook":
      return import("./_handlers/stripe-webhook.js");
    case "billing-checkout":
      return import("./_handlers/billing-checkout.js");
    case "billing-status":
      return import("./_handlers/billing-status.js");
    case "billing-portal":
      return import("./_handlers/billing-portal.js");
    case "billing-webhook":
      return import("./_handlers/billing-webhook.js");
    default:
      return null;
  }
}

async function dispatch(
  req: Request,
  method: "GET" | "POST" | "PATCH" | "DELETE",
): Promise<Response> {
  const url = new URL(req.url);
  // The rewrite sets `?...path=<segment>`; fall back to parsing the
  // pathname so the function works regardless of how Vercel presents
  // the URL to it.
  const fromQuery = url.searchParams.get("...path");
  const segs = url.pathname.split("/").filter(Boolean);
  const action = (fromQuery || segs[2] || "").trim();

  const mod = await loadHandler(action);
  if (!mod) return jsonError(`Unknown marketplace path: ${action}`, 404);
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
