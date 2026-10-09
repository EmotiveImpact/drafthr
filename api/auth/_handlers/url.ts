/**
 * Builds the WorkOS authorization URL the SPA redirects to for sign-in.
 *
 * Default provider is "authkit" — the hosted login page. The in-app
 * /sign-in form also calls this endpoint with ?provider=GoogleOAuth,
 * ?provider=MicrosoftOAuth, or ?provider=LinkedInOAuth so the
 * "Continue with Google / Microsoft / LinkedIn" buttons jump straight
 * to the IdP, skipping the WorkOS-hosted picker.
 *
 * We mint the URL server-side so we can also set a short-lived encrypted
 * state cookie — the callback route then verifies the returned state
 * matches, which closes the CSRF hole on the OAuth dance. (Without this,
 * an attacker could feed a victim a crafted `code` and complete a sign-in
 * as the attacker's account.)
 */

import { randomBytes } from "node:crypto";
import { getWorkos, buildStateCookie } from "../../_utils/workos.js";
import { jsonError } from "../../_utils/request.js";
import { rateLimitDurable } from "../../_utils/rate-limit.js";

export const config = { runtime: "nodejs" };

// Allowlist of provider strings accepted from the client. Keeps the URL
// builder from being weaponised into a redirect to an attacker-chosen IdP.
// Mirrors the WorkOS provider enum we actually wire from the in-app form.
const ALLOWED_PROVIDERS = new Set([
  "authkit",
  "GoogleOAuth",
  "MicrosoftOAuth",
  "LinkedInOAuth",
]);

export async function GET(req: Request): Promise<Response> {
  const limited = await rateLimitDurable(req, { name: "auth-url", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const redirectUri = process.env.WORKOS_REDIRECT_URI;
  if (!redirectUri) {
    console.error("[auth/url] WORKOS_REDIRECT_URI not configured");
    return jsonError("Sign-in is unavailable right now. Please try again.", 500);
  }

  const requestedProvider = new URL(req.url).searchParams.get("provider")?.trim() ?? "authkit";
  if (!ALLOWED_PROVIDERS.has(requestedProvider)) {
    return jsonError("Unsupported provider", 400);
  }
  // Cast is safe — narrowed by the allowlist above.
  const provider = requestedProvider as
    | "authkit"
    | "GoogleOAuth"
    | "MicrosoftOAuth"
    | "LinkedInOAuth";

  try {
    const state = randomBytes(24).toString("base64url");
    const url = getWorkos().userManagement.getAuthorizationUrl({
      provider,
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
    // Usually a configuration problem (missing WorkOS env); log the detail,
    // don't hand it to the browser.
    console.error("[auth/url] failed to build authorization URL", err);
    return jsonError("Sign-in is unavailable right now. Please try again.", 500);
  }
}
