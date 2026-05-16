/**
 * Exchanges the WorkOS authorization code for a session and sets the
 * encrypted session cookie. The SPA's /auth/callback route POSTs here
 * after WorkOS redirects back with ?code=...&state=...
 *
 * CSRF defence: the state value must match the one we set in
 * /api/auth/url, otherwise an attacker could complete sign-in for a
 * victim using a code they obtained themselves.
 */

import { readJsonRequest, enforceSameOrigin, jsonError } from "../_utils/request";
import { rateLimit } from "../_utils/rate-limit";
import {
  getWorkos,
  buildSessionCookie,
  buildClearCookie,
  readStateCookie,
  STATE_COOKIE,
  type SessionPayload,
} from "../_utils/workos";

export const config = { runtime: "nodejs" };

type CallbackBody = { code?: string; state?: string };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  const limited = rateLimit(req, { name: "auth-callback", max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<CallbackBody>(req);
  if (!parsed.ok) return parsed.response;

  const code = typeof parsed.body.code === "string" ? parsed.body.code.trim() : "";
  const submittedState = typeof parsed.body.state === "string" ? parsed.body.state : "";
  if (!code) return jsonError("Missing authorization code", 400);

  // CSRF check — opaque-compare against the cookie we set in /api/auth/url.
  const expectedState = await readStateCookie(req);
  if (!expectedState || !submittedState || expectedState !== submittedState) {
    return jsonError("Invalid OAuth state", 400);
  }

  try {
    const { user, sealedSession } = await getWorkos().userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID!,
      session: {
        sealSession: true,
        cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
      },
    });

    const payload: SessionPayload = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        profilePictureUrl: user.profilePictureUrl ?? null,
      },
      workosSession: sealedSession ?? "",
      iat: Date.now(),
    };

    const sessionCookie = await buildSessionCookie(payload);
    const clearedState = buildClearCookie(STATE_COOKIE);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    headers.append("Set-Cookie", sessionCookie);
    headers.append("Set-Cookie", clearedState);

    return new Response(JSON.stringify({ ok: true, user: payload.user }), {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return jsonError(message, 401);
  }
}
