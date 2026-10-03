/**
 * "Forgot password?" — kicks the password-reset email.
 *
 * Anti-user-enumeration: this endpoint ALWAYS returns 200 with a generic
 * success body, regardless of whether the email maps to a real account.
 * Even if WorkOS throws (NotFound, RateLimited, network), we swallow and
 * still return the same shape — an attacker probing for known emails
 * should not be able to distinguish a hit from a miss by response status,
 * body, or rough timing class.
 *
 * Why WorkOS, not Resend? — userManagement.createPasswordReset triggers
 * WorkOS's own SMTP delivery using the email templates configured in the
 * dashboard. We don't have to wire Resend for this; the WorkOS email
 * already lands in the user's inbox with a link to:
 *     <YOUR_APP_URL>/password-reset?token=<one-time-token>
 * The exact URL is configurable in the WorkOS dashboard under
 * Authentication → Emails → Password reset URL. Configure it to
 * https://app.drafthr.io/sign-in/reset-password so our ResetPassword
 * route picks up the token.
 */

import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { getWorkos } from "../../_utils/workos.js";

export const config = { runtime: "nodejs" };

type RequestBody = { email?: string };

const MAX_EMAIL = 320;

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  // 5/min/IP — same class of mailbomb risk as resend-verification, slightly
  // looser because real users sometimes legitimately retry across devices.
  const limited = await rateLimit(req, {
    name: "auth-password-reset-request",
    max: 5,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const parsed = await readJsonRequest<RequestBody>(req);
  if (!parsed.ok) return parsed.response;

  const email = typeof parsed.body.email === "string" ? parsed.body.email.trim() : "";
  if (!email || email.length > MAX_EMAIL || !email.includes("@")) {
    return jsonError("Enter a valid email address.", 400);
  }

  try {
    // createPasswordReset returns a password_reset object with a URL we
    // could in principle email ourselves — but WorkOS already sends the
    // email, so we just call it for the side effect.
    await getWorkos().userManagement.createPasswordReset({ email });
  } catch (err) {
    // Swallow — we're committed to a generic 200 for anti-enumeration.
    // Log so operators can spot SMTP outages, but never tell the client.
    console.warn("[auth/password-reset-request] failed", err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
