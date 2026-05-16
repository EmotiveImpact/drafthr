/**
 * Clears the session cookie.
 *
 * We deliberately don't round-trip to WorkOS to revoke the sealed session
 * here — the sealed token's encryption key is ours (WORKOS_COOKIE_PASSWORD),
 * and once we clear the cookie the user has no way to present it again.
 * Server-side revocation can be wired later if we ever expose a "sign out
 * of all sessions" feature in the UI.
 */

import { enforceSameOrigin } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { buildClearCookie, SESSION_COOKIE, STATE_COOKIE } from "../../_utils/workos.js";

export const config = { runtime: "nodejs" };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  const limited = rateLimit(req, { name: "auth-signout", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  headers.append("Set-Cookie", buildClearCookie(SESSION_COOKIE));
  headers.append("Set-Cookie", buildClearCookie(STATE_COOKIE));

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
