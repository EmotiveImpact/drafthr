import { requireSessionAndTenant } from "./session-with-tenant.js";
import { jsonError } from "./request.js";

export async function enforceProductionSession(req: Request): Promise<Response | null> {
  // SECURITY: fail CLOSED. The bypass is only for local dev and must be
  // opted into explicitly via DRAFTHR_DEV_NO_AUTH=1 (set only in .env.local).
  // It must NOT key off `NODE_ENV !== "production"` — Vercel *preview*
  // deployments are publicly reachable and do NOT set NODE_ENV=production,
  // which previously left /api/draft, /api/agent and /api/upload/image
  // unauthenticated (anon LLM spend + open uploader) on every preview URL.
  if (process.env.DRAFTHR_DEV_NO_AUTH === "1") return null;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  return null;
}
