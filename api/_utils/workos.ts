/**
 * WorkOS auth helpers — shared by api/auth/* and any route that needs to
 * read the current session. We use iron-session's low-level sealData /
 * unsealData because Vercel functions hand us bare Request/Response (no
 * Express); the standard iron-session Express helper doesn't fit.
 *
 * Session shape is deliberately minimal — we re-fetch user details from
 * WorkOS on demand if a route ever needs more than id/email/name. Storing
 * the WorkOS sealed session inside our own seal lets us refresh tokens
 * against WorkOS later without re-prompting the user.
 */

import { WorkOS } from "@workos-inc/node";
import { sealData, unsealData } from "iron-session";
import { jsonError } from "./request.js";
import { getUserSessionEpoch, isCookieEpochStale } from "./session-epoch.js";
import { logAuthFailure } from "./auth-diagnostics.js";

export const SESSION_COOKIE = "drafthr_session";
export const STATE_COOKIE = "drafthr_oauth_state";
// 7 days. Long enough that HR users don't have to re-login mid-week, short
// enough that a stolen cookie expires before it becomes a long-running risk.
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
// Short — only spans the OAuth round-trip. 10 min covers slow MFA + email magic links.
const STATE_TTL_SECONDS = 10 * 60;

export type SessionUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  emailVerified?: boolean;
};

export type SessionPayload = {
  user: SessionUser;
  /** WorkOS sealedSession — opaque to us, used for refresh against WorkOS. */
  workosSession: string;
  /** Issued-at, so we can detect very old seals even if TTL skew bites us. */
  iat: number;
  /**
   * Session epoch at mint time — the server-side revocation counter
   * (api/_utils/session-epoch.ts). Optional for back-compat: cookies minted
   * before this feature have no epoch and are treated as epoch 0. A request is
   * rejected when this is behind the user's stored epoch (bumped on sign-out /
   * password reset). (Security board SE-03.)
   */
  epoch?: number;
  organizationId?: string;
  sessionId?: string;
};

import { withRequestObservability } from "./observability.js";

type RequestSession = { promise?: Promise<SessionPayload | null>; cookie?: string };
const requestSessions = new WeakMap<Request, RequestSession>();

export class AuthUnavailableError extends Error {
  constructor() { super("Sign-in is temporarily unavailable. Please try again."); }
}

function requestSession(req: Request): RequestSession {
  let state = requestSessions.get(req);
  if (!state) { state = {}; requestSessions.set(req, state); }
  return state;
}

/** Every HTTP entry point must deliver rotated cookies, including streaming responses. */
export async function withSessionResponse(req: Request, handler: (req: Request) => Promise<Response>): Promise<Response> {
  return withRequestObservability(req, () => sessionResponse(req, handler));
}

async function sessionResponse(req: Request, handler: (req: Request) => Promise<Response>): Promise<Response> {
  let response: Response;
  try { response = await handler(req); }
  catch (error) {
    if (!(error instanceof AuthUnavailableError)) throw error;
    response = jsonError(error.message, 503);
  }
  const cookie = requestSessions.get(req)?.cookie;
  // A login/logout handler's explicit cookie takes precedence over a background refresh.
  if (cookie && !response.headers.getSetCookie().some((value) => value.startsWith(`${SESSION_COOKIE}=`))) {
    const headers = new Headers(response.headers);
    headers.append("Set-Cookie", cookie);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}

let cachedClient: WorkOS | null = null;

/** Singleton WorkOS client. Lazy because Vercel functions may not boot env in time on import. */
export function getWorkos(): WorkOS {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.WORKOS_API_KEY;
  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!apiKey || !clientId) {
    throw new Error("WorkOS env vars missing: WORKOS_API_KEY and WORKOS_CLIENT_ID required");
  }
  cachedClient = new WorkOS(apiKey, workosClientOptions(apiKey, clientId));
  return cachedClient;
}

/** Local-only WorkOS emulator; never point a deployed build at a test identity service. */
export function workosClientOptions(apiKey: string, clientId: string): ConstructorParameters<typeof WorkOS>[1] {
  if (process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR !== "1") return { clientId };
  if (
    process.env.NODE_ENV === "production" ||
    (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development") ||
    apiKey !== "sk_test_default" ||
    clientId !== "client_local_drafthr"
  ) {
    throw new Error("Local WorkOS emulator is not permitted in a deployed environment");
  }
  return { clientId, apiHostname: "127.0.0.1", port: 4100, https: false };
}

export function getCookiePassword(): string {
  const pw = process.env.WORKOS_COOKIE_PASSWORD;
  // iron-session refuses anything <32 chars; we mirror that check up-front
  // so a misconfigured deploy fails loudly instead of silently corrupting.
  if (!pw || pw.length < 32) {
    throw new Error("WORKOS_COOKIE_PASSWORD must be >= 32 characters");
  }
  return pw;
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        // Malformed percent-encoding (e.g. a lone '%') makes decodeURIComponent
        // throw a URIError. This runs outside the auth path's try/catch, so an
        // uncaught throw here becomes a 500 (incl. on GET /api/auth/session,
        // which the SPA polls). Treat an unparseable cookie as absent.
        return null;
      }
    }
  }
  return null;
}

/**
 * Reads + unseals the session cookie. Returns null on missing, expired, or
 * tampered cookies — callers should treat "no session" and "invalid session"
 * identically (don't leak whether a cookie was present).
 */
export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const state = requestSession(req);
  state.promise ??= authenticateRequest(req);
  return state.promise;
}

async function authenticateRequest(req: Request): Promise<SessionPayload | null> {
  const sealed = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (!sealed) return null;
  let payload: SessionPayload;
  try {
    payload = await unsealData<SessionPayload>(sealed, {
      password: getCookiePassword(),
      ttl: SESSION_TTL_SECONDS,
    });
  } catch {
    requestSession(req).cookie = buildClearCookie();
    return null;
  }
  // Old verification/reset cookies were never authenticated by WorkOS. Require a new login.
  if (!payload?.workosSession || !payload.user?.id || !Number.isFinite(payload.iat) ||
      Date.now() - payload.iat > SESSION_TTL_SECONDS * 1000) {
    requestSession(req).cookie = buildClearCookie();
    return null;
  }
  try {
    const workosSession = getWorkos().userManagement.loadSealedSession({
      sessionData: payload.workosSession, cookiePassword: getCookiePassword(),
    });
    // A removed/rotated signing key is an invalid access token, not an
    // unavailable provider. The SDK throws this JOSE error instead of returning
    // invalid_jwt. Let the provider validate the refresh token; never trust the
    // old JWT or skip signature verification. Network/JWKS fetch errors still
    // propagate as outages and preserve the cookie for retry.
    const authenticate = async () => {
      try { return await workosSession.authenticate(); }
      catch (error) {
        if (error && typeof error === "object" && "code" in error &&
            error.code === "ERR_JWKS_NO_MATCHING_KEY") return { authenticated: false as const };
        throw error;
      }
    };
    let authenticated = await authenticate();
    if (!authenticated.authenticated) {
      const refreshed = await workosSession.refresh();
      if (!refreshed.authenticated || !refreshed.sealedSession) {
        requestSession(req).cookie = buildClearCookie();
        return null;
      }
      payload.workosSession = refreshed.sealedSession;
      authenticated = await authenticate();
      if (!authenticated.authenticated) {
        requestSession(req).cookie = buildClearCookie();
        return null;
      }
      requestSession(req).cookie = await buildSessionCookie(payload);
    }
    if (authenticated.user.id !== payload.user.id || !authenticated.user.emailVerified ||
        isCookieEpochStale(payload.epoch, await getUserSessionEpoch(payload.user.id, { strict: true }))) {
      requestSession(req).cookie = buildClearCookie();
      return null;
    }
    return {
      ...payload,
      user: authenticated.user,
      organizationId: authenticated.organizationId,
      sessionId: authenticated.sessionId,
    };
  } catch (error) {
    // A provider/DB outage denies this request but preserves the cookie for a retry.
    logAuthFailure("session-verification", error);
    throw new AuthUnavailableError();
  }
}

export async function buildSessionCookie(payload: SessionPayload): Promise<string> {
  if (!payload.workosSession) throw new Error("An authenticated WorkOS session is required");
  // WorkOS already stores the full user inside its sealed session. Do not
  // duplicate names, photos and metadata in the outer cookie (browser size limit).
  const sealed = await sealData({
    user: { id: payload.user.id }, workosSession: payload.workosSession,
    iat: payload.iat, epoch: payload.epoch,
  }, {
    password: getCookiePassword(),
    ttl: SESSION_TTL_SECONDS,
  });
  return formatCookie(SESSION_COOKIE, sealed, SESSION_TTL_SECONDS);
}

export function buildClearCookie(name: string = SESSION_COOKIE): string {
  // Max-Age=0 + same path as the set so browsers actually evict it.
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag()}`;
}

export type AuthState = { state: string; codeVerifier: string; returnTo: string; organizationId?: string; tenantId?: string };

export async function buildStateCookie(state: AuthState): Promise<string> {
  const sealed = await sealData(state, {
    password: getCookiePassword(),
    ttl: STATE_TTL_SECONDS,
  });
  return formatCookie(STATE_COOKIE, sealed, STATE_TTL_SECONDS);
}

/** Returns the original state token if the cookie is present, valid, and unexpired. */
export async function readStateCookie(req: Request): Promise<AuthState | null> {
  const sealed = parseCookie(req.headers.get("cookie"), STATE_COOKIE);
  if (!sealed) return null;
  try {
    const data = await unsealData<AuthState>(sealed, {
      password: getCookiePassword(),
      ttl: STATE_TTL_SECONDS,
    });
    return data.state && data.codeVerifier ? data : null;
  } catch {
    return null;
  }
}

/** Throws-via-Response helper for routes that strictly require a session. */
export async function requireSession(req: Request): Promise<
  | { ok: true; session: SessionPayload }
  | { ok: false; response: Response }
> {
  let session: SessionPayload | null;
  try { session = await getSessionFromRequest(req); }
  catch { return { ok: false, response: jsonError("Unable to verify your session. Please retry.", 503) }; }
  if (!session) return { ok: false, response: jsonError("Unauthorized", 401) };
  return { ok: true, session };
}

/** Ask WorkOS to authorize the target organization before any local activation or data access. */
export async function ensureOrganizationSession(
  req: Request, session: SessionPayload, organizationId: string | null, tenantId: string,
): Promise<Response | null> {
  if (!organizationId || session.organizationId === organizationId) return null;
  try {
    const workosSession = getWorkos().userManagement.loadSealedSession({
      sessionData: session.workosSession, cookiePassword: getCookiePassword(),
    });
    const refreshed = await workosSession.refresh({ organizationId });
    const authenticated = refreshed.authenticated && refreshed.sealedSession
      ? await workosSession.authenticate() : null;
    if (refreshed.authenticated && refreshed.sealedSession && authenticated?.authenticated &&
        authenticated.organizationId === organizationId && authenticated.user.emailVerified &&
        authenticated.user.id === session.user.id) {
      session.workosSession = refreshed.sealedSession;
      session.user = authenticated.user;
      session.organizationId = organizationId;
      session.sessionId = authenticated.sessionId;
      requestSession(req).cookie = await buildSessionCookie(session);
      return null;
    }
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (!status || status >= 500 || status === 429) throw new AuthUnavailableError();
  }
  return new Response(JSON.stringify({
    error: "Sign in with your company's required method to open this workspace.",
    code: "organization_authentication_required",
    signInUrl: `/sign-in?workspace=${encodeURIComponent(tenantId)}`,
  }), { status: 409, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function formatCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secureFlag()}`;
}

function secureFlag(): string {
  // Skip Secure in dev so localhost (http) works; Vercel deploys are always https.
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}
