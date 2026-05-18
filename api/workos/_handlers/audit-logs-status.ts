/**
 * GET /api/workos/audit-logs-status — admin-only. Returns the current state
 * of the WorkOS Audit Logs mirror for the active tenant: whether the
 * deployment has the feature flag on, whether the tenant is paired with a
 * WorkOS organization, and the timestamp of the last successful mirror call.
 *
 * Used by the Settings → Audit Logs card to render the status pill and
 * surface "Send test event" / "Open Admin Portal" controls.
 */
import { eq } from "drizzle-orm";
import { jsonError } from "../../_utils/request.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { tenants } from "../../../src/db/schema.js";
import { isWorkOSAuditLogsEnabled } from "../../../src/lib/audit/workos-sink.js";

export const config = { runtime: "nodejs" };

const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function GET(req: Request): Promise<Response> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const memberRole = auth.activeMember?.role ?? "drafter";
  if (!ADMIN_ROLES.has(memberRole)) return jsonError("Admin role required", 403);

  // Re-read the tenant row to get the latest `workos_audit_logs_last_sent_at`
  // — the session-cached activeTenant doesn't include it.
  let lastSentAt: string | null = null;
  let workosOrgId: string | null = null;
  try {
    if (process.env.DATABASE_URL) {
      const db = getDb();
      const [row] = await db
        .select({
          workosOrgId: tenants.workosOrgId,
          workosAuditLogsLastSentAt: tenants.workosAuditLogsLastSentAt,
        })
        .from(tenants)
        .where(eq(tenants.id, auth.activeTenant.id))
        .limit(1);
      if (row) {
        workosOrgId = row.workosOrgId ?? null;
        lastSentAt = row.workosAuditLogsLastSentAt
          ? row.workosAuditLogsLastSentAt.toISOString()
          : null;
      }
    }
  } catch (err) {
    console.warn("[workos/audit-logs-status] tenant lookup failed", err);
  }

  return new Response(
    JSON.stringify({
      enabled: isWorkOSAuditLogsEnabled(),
      configured: Boolean(workosOrgId),
      workosOrgId,
      lastSentAt,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}
