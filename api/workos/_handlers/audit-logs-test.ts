/**
 * POST /api/workos/audit-logs-test — admin-only. Emits a synthetic event
 * through the WorkOS Audit Logs sink so the admin can verify the pipeline
 * end-to-end (DraftHR → WorkOS → tenant's SIEM) without having to perform
 * a real draft action.
 *
 * This goes through `appendAuditEvent` so the synthetic event is also
 * appended to the local hash chain — keeps "what was actually emitted to
 * WorkOS" perfectly aligned with "what's in the chain". The kind is
 * `audit.test_event` so SIEM filters can ignore it.
 *
 * Tenant scoping: uses the active tenant's workos_org_id; never accepts an
 * arbitrary org from the client. 409 with a helpful message when the
 * tenant isn't paired with a WorkOS organization.
 */
import { randomUUID } from "node:crypto";
import { enforceSameOrigin, jsonError } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { isWorkOSAuditLogsEnabled } from "../../../src/lib/audit/workos-sink.js";
import { dispatchWorkOSAuditOutbox, getAuditDeliveryState } from "../../../src/lib/audit/workos-outbox.js";
import { enforceWorkspacePin } from "../../_utils/workspace-pin.js";

export const config = { runtime: "nodejs" };

const ADMIN_ROLES = new Set(["owner", "admin"]);

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = await rateLimit(req, { name: "workos-audit-test", max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const changed = enforceWorkspacePin(req, auth.activeTenant.id, auth.session.user.id);
  if (changed) return changed;
  const memberRole = auth.activeMember?.role ?? "drafter";
  if (!ADMIN_ROLES.has(memberRole)) return jsonError("Admin role required", 403);

  const workosOrgId = (auth.activeTenant as { workosOrgId?: string | null }).workosOrgId;
  if (!workosOrgId) {
    return jsonError(
      "This workspace isn't paired with a WorkOS organization yet. Contact support to enable Audit Logs.",
      409,
    );
  }
  if (!isWorkOSAuditLogsEnabled()) {
    return jsonError(
      "WorkOS Audit Logs mirror is disabled on this deployment. Set WORKOS_AUDIT_LOGS_ENABLED=true to turn it on.",
      503,
    );
  }

  // Synthetic subject id keeps every test event independent — no collisions
  // across repeated clicks in the SIEM dashboard. Subject_type is `audit`
  // (the test is a meta-event about the audit pipeline itself).
  const subjectId = randomUUID();

  try {
    const row = await appendAuditEvent({
      tenantId: auth.activeTenant.id,
      kind: "audit.test_event",
      subjectType: "audit",
      subjectId,
      actorUserId: auth.userRow.id,
      payload: {
        source: "settings_ui",
        note: "Synthetic event sent from /api/workos/audit-logs-test to verify the WorkOS Audit Logs pipeline.",
        actorEmail: auth.session.user.email,
        emittedAtIso: new Date().toISOString(),
      },
    });

    // Report actual acceptance, not a fire-and-forget promise.
    await dispatchWorkOSAuditOutbox({ tenantId: auth.activeTenant.id, auditEventId: row.id, maxJobs: 1 });
    const delivery = await getAuditDeliveryState(auth.activeTenant.id, row.id);
    const delivered = delivery?.status === "delivered";
    return new Response(
      JSON.stringify({
        ok: true,
        auditEventId: row.id,
        deliveryStatus: delivery?.status ?? "not_queued",
        message: delivered
          ? "Test event accepted by WorkOS. Check your configured log stream for action 'app.audit.test_event'."
          : "Test event saved locally. WorkOS delivery has not been confirmed; inspect Audit Logs status for pending or failed delivery.",
      }),
      {
        status: delivered ? 200 : 202,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  } catch {
    console.error("[workos/audit-logs-test] failed");
    return jsonError("Failed to emit test event", 500);
  }
}
