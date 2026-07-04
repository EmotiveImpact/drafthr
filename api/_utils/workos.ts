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
};

let cachedClient: WorkOS | null = null;

/** Singleton WorkOS client. Lazy because Vercel functions may not boot env in time on import. */
export function getWorkos(): WorkOS {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.WORKOS_API_KEY;
  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!apiKey || !clientId) {
    throw new Error("WorkOS env vars missing: WORKOS_API_KEY and WORKOS_CLIENT_ID required");
  }
  cachedClient = new WorkOS(apiKey, { clientId });
  return cachedClient;
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
  const sealed = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (!sealed) return null;
  try {
    return await unsealData<SessionPayload>(sealed, {
      password: getCookiePassword(),
      ttl: SESSION_TTL_SECONDS,
    });
  } catch {
    return null;
  }
}

export async function buildSessionCookie(payload: SessionPayload): Promise<string> {
  const sealed = await sealData(payload, {
    password: getCookiePassword(),
    ttl: SESSION_TTL_SECONDS,
  });
  return formatCookie(SESSION_COOKIE, sealed, SESSION_TTL_SECONDS);
}

export function buildClearCookie(name: string = SESSION_COOKIE): string {
  // Max-Age=0 + same path as the set so browsers actually evict it.
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag()}`;
}

export async function buildStateCookie(state: string): Promise<string> {
  const sealed = await sealData({ state }, {
    password: getCookiePassword(),
    ttl: STATE_TTL_SECONDS,
  });
  return formatCookie(STATE_COOKIE, sealed, STATE_TTL_SECONDS);
}

/** Returns the original state token if the cookie is present, valid, and unexpired. */
export async function readStateCookie(req: Request): Promise<string | null> {
  const sealed = parseCookie(req.headers.get("cookie"), STATE_COOKIE);
  if (!sealed) return null;
  try {
    const data = await unsealData<{ state: string }>(sealed, {
      password: getCookiePassword(),
      ttl: STATE_TTL_SECONDS,
    });
    return data.state ?? null;
  } catch {
    return null;
  }
}

/** Throws-via-Response helper for routes that strictly require a session. */
export async function requireSession(req: Request): Promise<
  | { ok: true; session: SessionPayload }
  | { ok: false; response: Response }
> {
  const session = await getSessionFromRequest(req);
  if (!session) return { ok: false, response: jsonError("Unauthorized", 401) };
  return { ok: true, session };
}

function formatCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secureFlag()}`;
}

function secureFlag(): string {
  // Skip Secure in dev so localhost (http) works; Vercel deploys are always https.
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}
