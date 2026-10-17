/**
 * Completes a password reset: consumes the one-time token, sets the new
 * password, and mints a session so the user doesn't have to go through
 * sign-in immediately after (they already proved control of the inbox).
 *
 * Why mint a session here? — UX. Having to re-enter the password they
 * literally just typed twice is fatiguing and signals "we don't trust you"
 * right after a recovery flow. The token + WorkOS-side ratchet (single use,
 * short TTL) is what we depend on for trust, not the password re-entry.
 *
 * The user record we get back from resetPassword has the verified email
 * already (you can't get a reset token without WorkOS having verified the
 * email at some point), so we don't need to recheck.
 */

import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimitDurable } from "../../_utils/rate-limit.js";
import {
  buildSessionCookie,
  getWorkos,
  type SessionPayload,
} from "../../_utils/workos.js";
import { bumpUserSessionEpoch } from "../../_utils/session-epoch.js";

export const config = { runtime: "nodejs" };

type ConfirmBody = { token?: string; password?: string };

const MAX_TOKEN = 512;
const MAX_PASSWORD = 256;

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  // 10/min/IP — strict, because a wide-open confirm endpoint is exactly
  // the kind of thing brute-forcers love. WorkOS adds its own per-token
  // ratchet (single use, short TTL) on top, so 10 attempts is plenty for
  // a real user fat-fingering the new password rules.
  const limited = await rateLimitDurable(req, {
    name: "auth-password-reset-confirm",
    max: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const parsed = await readJsonRequest<ConfirmBody>(req);
  if (!parsed.ok) return parsed.response;

  const token = typeof parsed.body.token === "string" ? parsed.body.token.trim() : "";
  const password = typeof parsed.body.password === "string" ? parsed.body.password : "";

  if (!token || token.length > MAX_TOKEN) {
    return jsonError("Reset token is missing or invalid.", 400);
  }
  if (!password || password.length < 8 || password.length > MAX_PASSWORD) {
    return jsonError("Password must be at least 8 characters.", 400);
  }

  let resetUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profilePictureUrl: string | null;
  };

  try {
    const { user } = await getWorkos().userManagement.resetPassword({
      token,
      newPassword: password,
    });
    resetUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profilePictureUrl: user.profilePictureUrl ?? null,
    };
  } catch (err) {
    console.warn("[auth/password-reset-confirm] failed", err);
    // Common cases: token expired, token already used, password fails
    // policy. The first two we can't fix, the third the user can fix.
    // We surface WorkOS's message when it looks user-fixable, otherwise
    // a generic expired-link error.
    if (isPasswordPolicyError(err)) {
      const message =
        err instanceof Error && err.message ? err.message : "Password does not meet requirements.";
      return jsonError(message, 400);
    }
    return jsonError(
      "This reset link is invalid or has expired. Request a new one.",
      400,
    );
  }

  // Reset invalidates every existing session for this user: bump their epoch so
  // any cookie minted before the reset is rejected, then mint a fresh cookie
  // carrying the NEW epoch so the just-reset user stays signed in here. (SE-03.)
  const newEpoch = await bumpUserSessionEpoch(resetUser.id);
  const payload: SessionPayload = {
    user: resetUser,
    workosSession: "",
    iat: Date.now(),
    epoch: newEpoch ?? 0,
  };
  const sessionCookie = await buildSessionCookie(payload);
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  headers.append("Set-Cookie", sessionCookie);

  return new Response(JSON.stringify({ ok: true, user: payload.user }), {
    status: 200,
    headers,
  });
}

function isPasswordPolicyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; name?: string };
  return (
    e.status === 422 ||
    e.status === 400 ||
    e.name === "UnprocessableEntityException" ||
    e.name === "BadRequestException"
  );
}
