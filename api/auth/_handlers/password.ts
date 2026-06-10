/**
 * Password sign-in for the in-app /sign-in page.
 *
 * Headless equivalent of /api/auth/url + /api/auth/callback for the
 * password grant — the SPA POSTs { email, password } here, we call
 * WorkOS userManagement.authenticateWithPassword, and on success we
 * mint the same iron-session cookie the OAuth callback uses. That keeps
 * the session shape identical no matter which sign-in path the user
 * took (hosted, embedded password, embedded social).
 *
 * Errors come back as JSON with a short, user-safe message. We never
 * leak whether the email existed — WorkOS's own error mapping already
 * collapses "wrong password" and "no such user" into the same status,
 * but we further trim the surface to a generic "Incorrect email or
 * password" so user-enumeration probes get the same shape across both
 * branches.
 */

import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import {
  buildSessionCookie,
  getWorkos,
  type SessionPayload,
} from "../../_utils/workos.js";
import { getUserSessionEpoch } from "../../_utils/session-epoch.js";

export const config = { runtime: "nodejs" };

type PasswordBody = { email?: string; password?: string };

// Cap how long we trust client-provided strings. Email caps come from
// RFC 5321 (320 chars). Passwords we cap well above any sane policy so
// the server doesn't become an oracle for "this is the max" — WorkOS
// enforces real complexity policy.
const MAX_EMAIL = 320;
const MAX_PASSWORD = 256;

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || undefined;
  return req.headers.get("x-real-ip")?.trim() || undefined;
}

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  // Tight limit — password endpoints are the classic credential-stuffing
  // target. 10/min per IP is generous for a real user fat-fingering, harsh
  // for a script. WorkOS adds its own server-side throttling on top.
  const limited = rateLimit(req, { name: "auth-password", max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<PasswordBody>(req);
  if (!parsed.ok) return parsed.response;

  const email = typeof parsed.body.email === "string" ? parsed.body.email.trim() : "";
  const password = typeof parsed.body.password === "string" ? parsed.body.password : "";
  if (!email || email.length > MAX_EMAIL || !email.includes("@")) {
    return jsonError("Enter a valid email address.", 400);
  }
  if (!password || password.length > MAX_PASSWORD) {
    return jsonError("Enter your password.", 400);
  }

  try {
    const { user, sealedSession } = await getWorkos().userManagement.authenticateWithPassword({
      clientId: process.env.WORKOS_CLIENT_ID!,
      email,
      password,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
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
      // Embed the user's current revocation epoch so the cookie stays valid
      // until their epoch is next bumped (sign-out / password reset). (SE-03.)
      epoch: (await getUserSessionEpoch(user.id)) ?? 0,
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
  } catch (err) {
    // Don't echo WorkOS's raw error — it can leak whether an email exists
    // (e.g. "user not found" vs "invalid password"). Collapse the failure
    // case to one message; log the original server-side for triage.
    console.warn("[auth/password] authenticate failed", err);
    return jsonError("Incorrect email or password.", 401);
  }
}
