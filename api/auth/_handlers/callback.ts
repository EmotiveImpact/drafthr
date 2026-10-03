import { and, eq } from "drizzle-orm";
import { readJsonRequest, enforceSameOrigin, jsonError } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import {
  getWorkos, buildSessionCookie, buildClearCookie, readStateCookie, STATE_COOKIE, type SessionPayload,
} from "../../_utils/workos.js";
import { getUserSessionEpoch } from "../../_utils/session-epoch.js";
import { ensureLocalUser } from "../../_utils/local-identity.js";
import { safeAuthReturnTo } from "../../_utils/auth-redirect.js";
import { getDb } from "../../../src/db/index.js";
import { tenantMembers } from "../../../src/db/schema.js";
import { lockUserActiveTenant } from "../../_utils/tenant-active-lock.js";

export const config = { runtime: "nodejs" };

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = await rateLimit(req, { name: "auth-callback", max: 20, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = await readJsonRequest<{ code?: string; state?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const code = typeof parsed.body.code === "string" ? parsed.body.code.trim() : "";
  const expected = await readStateCookie(req);
  if (!code || !expected || expected.state !== parsed.body.state) return jsonError("Invalid sign-in callback. Please start again.", 400);
  try {
    const { user, sealedSession, organizationId } = await getWorkos().userManagement.authenticateWithCode({
      code,
      codeVerifier: expected.codeVerifier,
      clientId: process.env.WORKOS_CLIENT_ID!,
      session: { sealSession: true, cookiePassword: process.env.WORKOS_COOKIE_PASSWORD! },
    });
    if (!sealedSession || !user.emailVerified || (expected.organizationId && organizationId !== expected.organizationId)) {
      return jsonError("Company authentication was not completed. Please sign in again.", 401);
    }
    const payload: SessionPayload = {
      user, workosSession: sealedSession, organizationId, iat: Date.now(),
    };
    const localUser = await ensureLocalUser(payload);
    // A directory identity may have been claimed above. Read its existing
    // revocation counter only after preserving that row's primary key.
    payload.epoch = (await getUserSessionEpoch(user.id, { strict: true })) ?? 0;
    if (expected.tenantId) {
      await getDb().transaction(async (tx) => {
        await lockUserActiveTenant(tx, localUser.id);
        const [member] = await tx.select().from(tenantMembers).where(and(
          eq(tenantMembers.userId, localUser.id), eq(tenantMembers.tenantId, expected.tenantId!),
          eq(tenantMembers.status, "active"),
        )).limit(1);
        // Invite acceptance may follow the callback. It checks its own token and
        // email; merely requesting an organization never creates membership here.
        if (member) {
          await tx.update(tenantMembers).set({ isActiveTenant: false }).where(eq(tenantMembers.userId, localUser.id));
          await tx.update(tenantMembers).set({ isActiveTenant: true }).where(and(
            eq(tenantMembers.userId, localUser.id), eq(tenantMembers.tenantId, expected.tenantId!),
            eq(tenantMembers.status, "active"),
          ));
        }
      });
    }
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    headers.append("Set-Cookie", await buildSessionCookie(payload));
    headers.append("Set-Cookie", buildClearCookie(STATE_COOKIE));
    return new Response(JSON.stringify({ ok: true, user, returnTo: safeAuthReturnTo(expected.returnTo) }), { headers });
  } catch {
    return jsonError("Unable to complete sign-in. Please try again or contact your workspace administrator.", 401);
  }
}
