/**
 * Server-side admin gate. This is the REAL boundary for platform-admin
 * actions (consultant vetting, etc.) — distinct from the cosmetic
 * client-side `VITE_ADMIN_EMAILS` check, which only hides UI.
 *
 * An admin is a signed-in user whose email is on the server-only
 * `DRAFTHR_ADMIN_EMAILS` allowlist (comma-separated). The list is read
 * from a non-`VITE_` env var so it never ships to the browser bundle.
 *
 * This is an allowlist MVP, not a DB role. When a platform-admin role
 * lands on `users`/`tenant_members`, swap the email check for that — the
 * call sites (requireAdmin) won't change.
 */
import { requireSessionAndTenant } from "./session-with-tenant.js";
import type { RequireSessionAndTenantResult } from "./session-with-tenant.js";
import { jsonError } from "./request.js";

function adminEmails(): string[] {
  return (process.env.DRAFTHR_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

type AdminResult =
  | { ok: true; auth: Extract<RequireSessionAndTenantResult, { ok: true }> }
  | { ok: false; response: Response };

/**
 * Require a signed-in platform admin. Returns the full session/tenant
 * auth result on success, or a 401/403 Response. Fails closed: if the
 * allowlist is unconfigured, NO ONE is an admin.
 */
export async function requireAdmin(req: Request): Promise<AdminResult> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!isAdminEmail(auth.session.user.email)) {
    return { ok: false, response: jsonError("Admin access required", 403) };
  }
  return { ok: true, auth };
}
