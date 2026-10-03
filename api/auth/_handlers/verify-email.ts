/** Legacy verification links: address verification alone never grants a session. */
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit, clientIp } from "../../_utils/rate-limit.js";
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

/** Spoof-resistant client IP for WorkOS risk signals. The shared resolver
 *  (senior sweep B14) uses the proxy-appended last hop and returns the
 *  "unknown" sentinel when no IP is present; WorkOS wants a real IP or
 *  nothing, so collapse the sentinel to undefined. */
function resolveIp(req: Request): string | undefined {
  const ip = clientIp(req);
  return ip === "unknown" ? undefined : ip;
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
          ipAddress: resolveIp(req),
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

    // Verifying an address is not authentication and must not bypass MFA/SSO.
    await workos.userManagement.verifyEmail({ code, userId });
    return new Response(JSON.stringify({ ok: true, requiresSignIn: true }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
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
    epoch: (await getUserSessionEpoch(input.id, { strict: true })) ?? 0,
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
