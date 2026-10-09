/**
 * Self-serve account creation for the in-app /sign-in/signup page.
 *
 * Flow:
 *   1. Client POSTs { email, password, firstName, lastName }.
 *   2. We call WorkOS userManagement.createUser({ ..., emailVerified: false }).
 *   3. We call WorkOS userManagement.sendVerificationEmail({ userId }) so
 *      WorkOS dispatches the verification email via THEIR own SMTP — the
 *      developer (us) does not need to wire Resend for this. WorkOS already
 *      has branded email templates configurable from the dashboard.
 *   4. We respond with { ok: true, requiresVerification: true }. We do NOT
 *      mint an iron-session cookie here: the user must verify their email
 *      before they can sign in. authenticateWithPassword against an
 *      unverified user returns an `email_verification_required` error, which
 *      keeps the gate enforced at the credential boundary too.
 *
 * Anti-user-enumeration: when WorkOS returns 409 ConflictException for a
 * duplicate email, we still respond 200 with the same `requiresVerification`
 * shape — so an attacker probing for known emails can't distinguish a hit
 * from a miss by response code, body, or timing class. Behind the scenes
 * we silently re-trigger sendVerificationEmail for the existing user so
 * the rightful owner still gets an email if they meant to sign up again.
 *
 * Why headless (rather than calling WorkOS Hosted UI)? — the /sign-in page
 * is already branded; making sign-up bounce to a third-party page would
 * break the visual register and shed the user's trust mid-flow. The
 * WorkOS SDK's createUser + sendVerificationEmail pair is exactly the
 * "build your own UI" path the headless docs document.
 */

import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimitDurable, rateLimitKeyDurable } from "../../_utils/rate-limit.js";
import { getWorkos } from "../../_utils/workos.js";

export const config = { runtime: "nodejs" };

type SignUpBody = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
};

const MAX_EMAIL = 320;
const MAX_PASSWORD = 256;
const MAX_NAME = 120;

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;

  // 3/min/IP — sign-up is the highest-leverage abuse target (creates an
  // identity, ships an email). Keep it tight; real humans never hit this.
  const limited = await rateLimitDurable(req, { name: "auth-sign-up", max: 3, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<SignUpBody>(req);
  if (!parsed.ok) return parsed.response;

  const email = typeof parsed.body.email === "string" ? parsed.body.email.trim() : "";
  const password = typeof parsed.body.password === "string" ? parsed.body.password : "";
  const firstName =
    typeof parsed.body.firstName === "string" ? parsed.body.firstName.trim() : "";
  const lastName =
    typeof parsed.body.lastName === "string" ? parsed.body.lastName.trim() : "";

  if (!email || email.length > MAX_EMAIL || !email.includes("@")) {
    return jsonError("Enter a valid email address.", 400);
  }
  // WorkOS enforces real password complexity server-side; we keep an
  // absolute floor here so a typo-empty submission fails fast.
  if (!password || password.length < 8 || password.length > MAX_PASSWORD) {
    return jsonError("Password must be at least 8 characters.", 400);
  }
  if (!firstName || firstName.length > MAX_NAME) {
    return jsonError("Enter your first name.", 400);
  }
  if (!lastName || lastName.length > MAX_NAME) {
    return jsonError("Enter your last name.", 400);
  }

  // Per-address cap on top of the per-IP one: each sign-up (or duplicate
  // sign-up) sends a verification email, so a distributed sender must not be
  // able to mailbomb one inbox from many IPs.
  const perEmail = await rateLimitKeyDurable(`email:${email.toLowerCase()}`, {
    name: "auth-sign-up-email",
    max: 5,
    windowMs: 60 * 60_000,
  });
  if (perEmail) return perEmail;

  const workos = getWorkos();

  let createdUserId: string | null = null;
  try {
    const user = await workos.userManagement.createUser({
      email,
      password,
      firstName,
      lastName,
      emailVerified: false,
    });
    createdUserId = user.id;
  } catch (err) {
    // WorkOS surfaces a ConflictException (409) for "user with that email
    // already exists". We MUST NOT echo that to the client — doing so
    // would turn this endpoint into an account-existence oracle.
    //
    // Instead: silently re-trigger sendVerificationEmail for the existing
    // user so a rightful owner who genuinely forgot they had an account
    // still gets a usable email (it'll be a fresh verification link),
    // then return the generic success shape.
    if (isWorkosConflict(err)) {
      // Anti-enumeration: the response body must be IDENTICAL across the
      // fresh-create, duplicate-unverified, and duplicate-VERIFIED branches.
      // Previously the verified-already branch returned userId:null, which was
      // a precise "this email is a verified account" oracle (bug #12). We now
      // always return the existing user's id (resending only when unverified);
      // for a verified account the subsequent verify-email attempt simply
      // fails generically like any wrong code — no information is leaked.
      const existingUserId = await silentlyResendVerificationByEmail(email, {
        password,
        firstName,
        lastName,
      });
      return ok(existingUserId);
    }

    // Surface password / validation errors verbatim — these are user-fixable
    // and not a side-channel for enumeration (they fire BEFORE the duplicate
    // check on the WorkOS side).
    if (isWorkosValidation(err)) {
      const message =
        err instanceof Error && err.message ? err.message : "Could not create account.";
      return jsonError(message, 400);
    }

    console.warn("[auth/sign-up] createUser failed", err);
    return jsonError("Could not create account. Please try again.", 502);
  }

  // Fire the verification email. We do NOT 4xx if this fails — the user
  // CAN still recover via "Resend verification email" on the next screen,
  // and we'd rather not block account creation on a transient SMTP hiccup.
  try {
    await workos.userManagement.sendVerificationEmail({ userId: createdUserId });
  } catch (err) {
    console.warn("[auth/sign-up] sendVerificationEmail failed", err);
  }

  return ok(createdUserId);
}

function ok(userId: string | null): Response {
  return new Response(
    JSON.stringify({ ok: true, requiresVerification: true, userId }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/**
 * Best-effort: look up the user by email and, if it is still unverified,
 * reset it to the details just submitted and trigger a fresh verification
 * email. Used only on the duplicate-email branch of sign-up so the rightful
 * owner still gets a usable link. Failures are swallowed (we already
 * committed to the generic-success contract for anti-enumeration).
 */
async function silentlyResendVerificationByEmail(
  email: string,
  details: { password: string; firstName: string; lastName: string },
): Promise<string | null> {
  try {
    const workos = getWorkos();
    const list = await workos.userManagement.listUsers({ email, limit: 1 });
    const user = list.data?.[0];
    if (!user) return null;
    // Only RESEND if the email is still unverified — confirmed accounts
    // shouldn't receive unsolicited verification emails (would look like
    // phishing to a security-aware user). But we still RETURN the user id in
    // both cases so the sign-up response body is identical for verified and
    // unverified duplicates (anti-enumeration — bug #12).
    if (!user.emailVerified) {
      // Take over the unverified account with the details just submitted.
      // Otherwise someone who registered this email first keeps their
      // password: when the real owner later signs up and verifies, they are
      // signed into an account the squatter can still log into. Whoever
      // proves the inbox now ends up with the only working password.
      await workos.userManagement.updateUser({
        userId: user.id,
        password: details.password,
        firstName: details.firstName,
        lastName: details.lastName,
      });
      await workos.userManagement.sendVerificationEmail({ userId: user.id });
    }
    return user.id;
  } catch (err) {
    console.warn("[auth/sign-up] silent resend failed", err);
    return null;
  }
}

function isWorkosConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  // The Node SDK throws ConflictException with status 409 + name. Be tolerant
  // about which surface we read so SDK churn doesn't break the gate.
  const e = err as { status?: number; name?: string; code?: string };
  return e.status === 409 || e.name === "ConflictException";
}

function isWorkosValidation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; name?: string };
  return (
    e.status === 400 ||
    e.status === 422 ||
    e.name === "BadRequestException" ||
    e.name === "UnprocessableEntityException"
  );
}
