/**
 * Clears the session cookie AND bumps the user's server-side session epoch, so
 * any OTHER outstanding copy of the sealed cookie (exfiltrated, or live on
 * another device) is rejected on its next request instead of surviving the full
 * 7-day TTL. Clearing the cookie evicts it from this browser; the epoch bump is
 * what makes sign-out a true revocation. (Security board SE-03, 2026-06-10.)
 *
 * The bump is best-effort: a DB blip — or a deploy that landed before the
 * `0010_session_epoch` migration — must not stop the user signing out, so we
 * never block the cookie-clear on it.
 */

import { enforceSameOrigin } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import {
  buildClearCookie,
  getSessionFromRequest,
  SESSION_COOKIE,
  STATE_COOKIE,
} from "../../_utils/workos.js";
import { bumpUserSessionEpoch } from "../../_utils/session-epoch.js";

export const config = { runtime: "nodejs" };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  const limited = rateLimit(req, { name: "auth-signout", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  // Revoke this user's other sessions. Read the session for the user id, bump,
  // and swallow any failure so sign-out always succeeds.
  try {
    const session = await getSessionFromRequest(req);
    if (session) await bumpUserSessionEpoch(session.user.id);
  } catch {
    /* never block sign-out on the revocation bump */
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  headers.append("Set-Cookie", buildClearCookie(SESSION_COOKIE));
  headers.append("Set-Cookie", buildClearCookie(STATE_COOKIE));

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
