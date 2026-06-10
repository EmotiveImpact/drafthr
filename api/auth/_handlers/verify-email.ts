/**
 * Email verification confirmation.
 *
 * Two entry points, both POST here:
 *
 *  A) Post-sign-up flow — the user lands at /sign-in/verify-email from
 *     their inbox link. The link carries { code, userId } (we configure
 *     the WorkOS email template to include both placeholders). After we
 *     call verifyEmail, we DO mint an iron-session cookie — they just
 *     proved control of the inbox, no reason to make them re-enter their
 *     password to be admitted.
 *
 *  B) Sign-in-while-unverified flow — the user attempted to sign in with
 *     a valid password but unverified email; authenticateWithPassword
 *     returned email_verification_required + a pending_authentication_token.
 *     The /sign-in page can paste that token here along with the code from
 *     the email; we call authenticateWithEmailVerification which atomically
 *     verifies + mints a session.
 *
 * In flow A we lack the access/refresh tokens, so we manually mint the
 * iron-session payload using the verified user record (workosSession="" —
 * the sealed WorkOS session is only used for future refresh-against-WorkOS
 * paths, which we don't exercise in this codebase yet).
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

type VerifyEmailBody = {
  code?: string;
  userId?: string;
  /** Returned by authenticateWithPassword as email_verification_required.pendingAuthenticationToken. */
  pendingAuthenticationToken?: string;
};

const MAX_CODE = 64;
const MAX_USER_ID = 128;
const MAX_TOKEN = 4096;

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || undefined;
  return req.headers.get("x-real-ip")?.trim() || undefined;
}

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  // 10/min/IP — generous enough that a user fat-fingering the code a few
  // times isn't locked out, harsh enough that brute-forcing a 6-digit
  // code from a single IP is impractical.
  const limited = rateLimit(req, { name: "auth-verify-email", max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<VerifyEmailBody>(req);
  if (!parsed.ok) return parsed.response;

  const code = typeof parsed.body.code === "string" ? parsed.body.code.trim() : "";
  const userId = typeof parsed.body.userId === "string" ? parsed.body.userId.trim() : "";
  const pendingToken =
    typeof parsed.body.pendingAuthenticationToken === "string"
      ? parsed.body.pendingAuthenticationToken.trim()
      : "";

  if (!code || code.length > MAX_CODE) {
    return jsonError("Verification code is required.", 400);
  }
  if (!userId && !pendingToken) {
    return jsonError("Verification context is missing.", 400);
  }
  if (userId && userId.length > MAX_USER_ID) {
    return jsonError("Verification context is invalid.", 400);
  }
  if (pendingToken && pendingToken.length > MAX_TOKEN) {
    return jsonError("Verification context is invalid.", 400);
  }

  const workos = getWorkos();

  try {
    if (pendingToken) {
      // Flow B: sign-in-while-unverified. authenticateWithEmailVerification
      // does the verify + session mint atomically.
      const { user, sealedSession } =
        await workos.userManagement.authenticateWithEmailVerification({
          clientId: process.env.WORKOS_CLIENT_ID!,
          code,
          pendingAuthenticationToken: pendingToken,
          ipAddress: clientIp(req),
          userAgent: req.headers.get("user-agent") ?? undefined,
          session: {
            sealSession: true,
            cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
          },
        });

      return await respondWithSession({
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        profilePictureUrl: user.profilePictureUrl ?? null,
        sealedSession: sealedSession ?? "",
      });
    }

    // Flow A: post-sign-up. verifyEmail confirms the address; we then
    // mint a session manually because no auth-with-credentials happened.
    const { user } = await workos.userManagement.verifyEmail({ code, userId });

    return await respondWithSession({
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profilePictureUrl: user.profilePictureUrl ?? null,
      sealedSession: "",
    });
  } catch (err) {
    console.warn("[auth/verify-email] failed", err);
    // Collapse to a single user-fixable message. The most common cause
    // is an expired or already-consumed code — both look identical to
    // the user, so don't try to disambiguate.
    return jsonError(
      "This verification link is invalid or has expired. Request a new one.",
      400,
    );
  }
}

async function respondWithSession(input: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  sealedSession: string;
}): Promise<Response> {
  const payload: SessionPayload = {
    user: {
      id: input.id,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      profilePictureUrl: input.profilePictureUrl,
    },
    workosSession: input.sealedSession,
    iat: Date.now(),
    // Current revocation epoch — see session-epoch.ts (SE-03).
    epoch: (await getUserSessionEpoch(input.id)) ?? 0,
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
