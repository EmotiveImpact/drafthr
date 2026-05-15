/**
 * Builds the WorkOS authorization URL the SPA redirects to for sign-in.
 *
 * We mint the URL server-side so we can also set a short-lived encrypted
 * state cookie — the callback route then verifies the returned state
 * matches, which closes the CSRF hole on the OAuth dance. (Without this,
 * an attacker could feed a victim a crafted `code` and complete a sign-in
 * as the attacker's account.)
 */

import { randomBytes } from "node:crypto";
import { getWorkos, buildStateCookie } from "../_utils/workos";
import { jsonError } from "../_utils/request";
import { rateLimit } from "../_utils/rate-limit";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const limited = rateLimit(req, { name: "auth-url", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const redirectUri = process.env.WORKOS_REDIRECT_URI;
  if (!redirectUri) return jsonError("WORKOS_REDIRECT_URI not configured", 500);

  try {
    const state = randomBytes(24).toString("base64url");
    const url = getWorkos().userManagement.getAuthorizationUrl({
      provider: "authkit",
      clientId: process.env.WORKOS_CLIENT_ID!,
      redirectUri,
      state,
    });
    const cookie = await buildStateCookie(state);
    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Set-Cookie": cookie,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build authorization URL";
    return jsonError(message, 500);
  }
}
