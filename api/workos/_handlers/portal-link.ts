/**
 * POST /api/workos/portal-link — admin-only. Generates a one-shot WorkOS
 * Admin Portal link scoped to the tenant's WorkOS organization, intent set
 * by the caller (defaults to "dsync" for Directory Sync). The Settings UI
 * opens the link in a new tab so the admin can configure the IdP without
 * us proxying any WorkOS UI.
 *
 * Tenant scoping: this never accepts an arbitrary organization id from the
 * client — it always uses the active tenant's workos_org_id. If the tenant
 * has no mapped org we return 409 with a clear message so the UI can hide
 * the button (rather than 500-ing).
 */
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getWorkos } from "../../_utils/workos.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { enforceWorkspacePin } from "../../_utils/workspace-pin.js";

export const config = { runtime: "nodejs" };

const ADMIN_ROLES = new Set(["owner", "admin"]);
const VALID_INTENTS = new Set([
  "sso",
  "dsync",
  "audit_logs",
  "log_streams",
  "domain_verification",
  "certificate_renewal",
] as const);

type Intent = typeof VALID_INTENTS extends Set<infer T> ? T : never;

type Body = { intent?: string; returnUrl?: string };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = await rateLimit(req, { name: "workos-portal-link", max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const requestedIntent = typeof parsed.body.intent === "string" ? parsed.body.intent : "dsync";
  if (!VALID_INTENTS.has(requestedIntent as Intent)) {
    return jsonError("Invalid intent", 400);
  }
  const intent = requestedIntent as Intent;

  const returnUrl =
    typeof parsed.body.returnUrl === "string" && parsed.body.returnUrl.startsWith("/")
      ? `${req.headers.get("origin") ?? ""}${parsed.body.returnUrl}`
      : undefined;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const changed = enforceWorkspacePin(req, auth.activeTenant.id, auth.session.user.id);
  if (changed) return changed;
  const memberRole = auth.activeMember?.role ?? "drafter";
  if (!ADMIN_ROLES.has(memberRole)) return jsonError("Admin role required", 403);

  // We type-assert through `unknown` because the tenants schema added the
  // workos_org_id column in 0003 but Drizzle's inferred type follows the
  // latest schema.ts already.
  const workosOrgId = (auth.activeTenant as { workosOrgId?: string | null }).workosOrgId;
  if (!workosOrgId) {
    return jsonError(
      "This workspace isn't paired with a WorkOS organization yet. Contact support to enable Directory Sync.",
      409,
    );
  }

  try {
    const { link } = await getWorkos().adminPortal.generateLink({
      intent,
      organization: workosOrgId,
      ...(returnUrl ? { returnUrl } : {}),
    });

    // Audit who pulled the link — admin portal grants WorkOS-side edit
    // power over the org, so it's a sensitive action.
    try {
      await appendAuditEvent({
        tenantId: auth.activeTenant.id,
        kind: "directory.admin_portal.opened",
        subjectType: "tenant",
        subjectId: auth.activeTenant.id,
        actorUserId: auth.userRow.id,
        payload: { intent, workosOrgId },
      });
    } catch (err) {
      console.error("[portal-link] audit failed", err);
    }

    return new Response(JSON.stringify({ link }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[portal-link] generateLink failed", err);
    const message = err instanceof Error ? err.message : "Failed to generate portal link";
    return jsonError(message, 500);
  }
}
