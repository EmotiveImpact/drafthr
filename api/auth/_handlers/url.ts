import { eq } from "drizzle-orm";
import { getWorkos, buildStateCookie } from "../../_utils/workos.js";
import { jsonError } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { safeAuthReturnTo } from "../../_utils/auth-redirect.js";
import { getDb } from "../../../src/db/index.js";
import { tenants } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const limited = rateLimit(req, { name: "auth-url", max: 30, windowMs: 60_000 });
  if (limited) return limited;
  const redirectUri = process.env.WORKOS_REDIRECT_URI;
  if (!redirectUri) return jsonError("Sign-in is not configured", 503);
  const params = new URL(req.url).searchParams;
  const tenantId = params.get("workspace") ?? undefined;
  if (tenantId && !/^[0-9a-f-]{36}$/i.test(tenantId)) return jsonError("Invalid workspace", 400);
  try {
    // This selects a login policy, never grants membership. Callback and data routes
    // independently verify membership before activating or exposing a workspace.
    let organizationId: string | undefined;
    if (tenantId) {
      const [tenant] = await getDb().select({ org: tenants.workosOrgId })
        .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant?.org) return jsonError("Company sign-in is unavailable for this workspace", 400);
      organizationId = tenant.org;
    }
    const { url, state, codeVerifier } = await getWorkos().userManagement.getAuthorizationUrlWithPKCE({
      provider: "authkit",
      clientId: process.env.WORKOS_CLIENT_ID!,
      redirectUri,
      organizationId,
      screenHint: params.get("screen_hint") === "sign-up" ? "sign-up" : "sign-in",
    });
    return new Response(JSON.stringify({ url }), {
      headers: {
        "Content-Type": "application/json", "Cache-Control": "no-store",
        "Set-Cookie": await buildStateCookie({
          state, codeVerifier, returnTo: safeAuthReturnTo(params.get("redirect")), organizationId, tenantId,
        }),
      },
    });
  } catch {
    return jsonError("Unable to start sign-in. Please try again.", 503);
  }
}
