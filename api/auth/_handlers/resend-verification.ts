/**
 * Resend the WorkOS email-verification message for an unverified account.
 *
 * Called from:
 *   - The /sign-in/signup "check your email" confirmation screen.
 *   - The /sign-in error state ("Check your inbox to verify your email")
 *     when authenticateWithPassword returns email_verification_required.
 *
 * Anti-enumeration: we accept { email } and always return 200, regardless
 * of whether the email maps to a real account. The honest user gets a
 * fresh email; a probe just gets a generic OK.
 */

import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimitDurable, rateLimitKeyDurable } from "../../_utils/rate-limit.js";
import { getWorkos } from "../../_utils/workos.js";

export const config = { runtime: "nodejs" };

type ResendBody = { email?: string };

const MAX_EMAIL = 320;

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  // 3/min/IP — verification emails are the kind of thing abusers love to
  // weaponise into mailbomb attacks. Tight cap, generic 429 response.
  const limited = await rateLimitDurable(req, { name: "auth-resend-verification", max: 3, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<ResendBody>(req);
  if (!parsed.ok) return parsed.response;

  const email = typeof parsed.body.email === "string" ? parsed.body.email.trim() : "";
  if (!email || email.length > MAX_EMAIL || !email.includes("@")) {
    return jsonError("Enter a valid email address.", 400);
  }
  const perEmail = await rateLimitKeyDurable(`email:${email.toLowerCase()}`, {
    name: "auth-resend-verification-email",
    max: 5,
    windowMs: 60 * 60_000,
  });
  if (perEmail) return perEmail;

  try {
    const workos = getWorkos();
    const list = await workos.userManagement.listUsers({ email, limit: 1 });
    const user = list.data?.[0];
    // Skip cleanly when the user is already verified — sending another
    // verification email at that point would (a) confuse a real user and
    // (b) look phishy to a security-aware one.
    if (user && !user.emailVerified) {
      await workos.userManagement.sendVerificationEmail({ userId: user.id });
    }
  } catch (err) {
    // Swallow — we're committed to a generic 200 to avoid leaking
    // whether the email exists. Log for triage.
    console.warn("[auth/resend-verification] failed", err);
  }

  return ok();
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
