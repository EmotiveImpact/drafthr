/**
 * Returns the current session's user, or { user: null } when unauthenticated.
 *
 * Deliberately returns 200 + null on no-session (not 401): the SPA polls this
 * on every load to decide whether to render the app or redirect to sign-in,
 * and a 401 here would spam the console / Sentry with expected noise.
 */

import { eq } from "drizzle-orm";
import { getSessionFromRequest } from "../_utils/workos";
import { dbEnabled, getDb } from "../../src/db";
import { tenantMembers, tenants, users } from "../../src/db/schema";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  let activeTenant: { id: string; name: string; role: string } | null = null;
  let hasAnyTenant = false;

  // Look up the active tenant when the DB is configured. Failures here must
  // not block the session response — the SPA polls this on every load and
  // we don't want auth UX to depend on Postgres availability.
  if (session && dbEnabled()) {
    try {
      const db = getDb();
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.externalId, session.user.id))
        .limit(1);
      if (userRow) {
        const memberships = await db
          .select({
            tenantId: tenantMembers.tenantId,
            role: tenantMembers.role,
            isActive: tenantMembers.isActiveTenant,
            tenantName: tenants.name,
          })
          .from(tenantMembers)
          .leftJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
          .where(eq(tenantMembers.userId, userRow.id));
        hasAnyTenant = memberships.length > 0;
        const active = memberships.find((m) => m.isActive);
        if (active && active.tenantName) {
          activeTenant = { id: active.tenantId, name: active.tenantName, role: active.role };
        }
      }
    } catch (err) {
      // Defensive — log once, never block the response.
      console.warn("[auth/session] tenant lookup failed", err);
    }
  }

  return new Response(
    JSON.stringify({ user: session?.user ?? null, activeTenant, hasAnyTenant }),
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
