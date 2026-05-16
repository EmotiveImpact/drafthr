import { requireSessionAndTenant } from "./session-with-tenant.js";
import { jsonError } from "./request.js";

export async function enforceProductionSession(req: Request): Promise<Response | null> {
  if (process.env.NODE_ENV !== "production") return null;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  return null;
}
