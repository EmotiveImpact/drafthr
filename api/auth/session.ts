/**
 * Returns the current session's user, or { user: null } when unauthenticated.
 *
 * Deliberately returns 200 + null on no-session (not 401): the SPA polls this
 * on every load to decide whether to render the app or redirect to sign-in,
 * and a 401 here would spam the console / Sentry with expected noise.
 */

import { getSessionFromRequest } from "../_utils/workos";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const session = await getSessionFromRequest(req);
  return new Response(JSON.stringify({ user: session?.user ?? null }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
