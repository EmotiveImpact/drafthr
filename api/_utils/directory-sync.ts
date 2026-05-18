/**
 * Directory Sync helpers shared by the webhook handler, the Settings UI, and
 * tests. The role mapper is the only piece of "policy" here — everything else
 * is plumbing.
 *
 * Per docs (https://workos.com/docs/directory-sync/identity-provider-role-assignment),
 * IdP-assigned roles ALWAYS take precedence over roles set via the WorkOS
 * Dashboard or API. That means our DraftHR-side role on `tenant_members` must
 * always reflect what the IdP last told us, and any future "change role"
 * Settings UI for directory-provisioned members must be disabled (or silently
 * reverted) — we should fix the role mapping in WorkOS, not here.
 */

export type DraftHRTenantRole = "owner" | "admin" | "drafter" | "reviewer" | "viewer";

/**
 * Map a WorkOS directory role slug to a DraftHR tenant role. WorkOS exposes
 * role.slug as the canonical identifier (per `RoleResponse` in the SDK types).
 *
 * Mapping rules — conservative on purpose:
 *   - "admin", "tenant_admin", anything containing "admin" → admin
 *   - "owner" exactly → owner (rare; most IdPs cap at admin)
 *   - "viewer" / "readonly" / "read_only" → viewer
 *   - "reviewer" / "approver" → reviewer
 *   - everything else (including null / missing) → drafter (safe default)
 *
 * Why no "drafter" branch: that IS the default and we want any unrecognised
 * role to fall there rather than crash or assume admin. The IdP admin can
 * always map specific groups to specific WorkOS roles in the Admin Portal.
 */
export function mapDirectoryRoleToTenantRole(role: string | null | undefined): DraftHRTenantRole {
  if (!role) return "drafter";
  const slug = role.trim().toLowerCase();
  if (!slug) return "drafter";
  if (slug === "owner") return "owner";
  if (slug.includes("admin")) return "admin";
  if (slug === "viewer" || slug === "readonly" || slug === "read_only") return "viewer";
  if (slug === "reviewer" || slug === "approver") return "reviewer";
  return "drafter";
}

/**
 * Extract a stable email from a DirectoryUser. WorkOS may put the primary
 * email in `email` directly OR in `custom_attributes.emails[]` with a `primary`
 * flag (Okta/Entra emit the latter). We try the direct field first, then
 * fall back to the first primary in the custom_attributes array.
 *
 * Returns null when no usable email is present — callers should treat that
 * as a webhook delivery worth logging but not necessarily processing.
 */
export function extractDirectoryEmail(user: {
  email?: string | null;
  customAttributes?: Record<string, unknown>;
}): string | null {
  if (user.email && typeof user.email === "string" && user.email.includes("@")) {
    return user.email.toLowerCase();
  }
  const custom = user.customAttributes as { emails?: Array<{ primary?: boolean; value?: string }> } | undefined;
  if (Array.isArray(custom?.emails)) {
    const primary = custom!.emails.find((e) => e?.primary && typeof e.value === "string");
    if (primary?.value && primary.value.includes("@")) return primary.value.toLowerCase();
    const first = custom!.emails.find((e) => typeof e?.value === "string" && e.value.includes("@"));
    if (first?.value) return first.value.toLowerCase();
  }
  return null;
}

/**
 * Resolve a directory user's display name. Prefers `firstName + lastName`,
 * then falls back to email-local. Returns null when neither is present.
 */
export function extractDirectoryName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string | null {
  const first = (user.firstName ?? "").trim();
  const last = (user.lastName ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (user.email && user.email.includes("@")) {
    return user.email.split("@")[0] ?? null;
  }
  return null;
}
