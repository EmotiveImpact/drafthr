/**
 * POST /api/workos/directory-webhook — receives Directory Sync events from
 * WorkOS. Auth is HMAC via the WorkOS-Signature header (NOT cookies). We use
 * the SDK's webhooks.constructEvent() to verify the signature; never roll
 * our own HMAC.
 *
 * Why this lives outside the workspace dispatcher:
 *   - Different auth model (signature, not session)
 *   - Must read the RAW body (parsing before verification would change the
 *     bytes and break signature verification — per the WorkOS Events docs)
 *   - 200-as-fast-as-possible matters: WorkOS retries on >5s, so we ack
 *     quickly. We don't currently offload to a queue because the handler is
 *     small and Neon is local enough to finish well under that limit, but
 *     if this ever creeps past 2-3s we should move processing into a
 *     background fn.
 *
 * Idempotency: every event upserts on workos_directory_user_id and the audit
 * helper is safe to call repeatedly (the chain advances each time, which is
 * fine — re-deliveries are an accurate record that "we got this event N
 * times"). Tenant scoping is enforced by resolving every webhook to the
 * tenant whose workos_org_id matches the event's organization_id; cross-tenant
 * writes are rejected at the dispatch point.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../src/db/index.js";
import { tenantMembers, tenants, users } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { getWorkos } from "../../_utils/workos.js";
import { jsonError } from "../../_utils/request.js";
import {
  extractDirectoryEmail,
  extractDirectoryName,
  mapDirectoryRoleToTenantRole,
} from "../../_utils/directory-sync.js";

export const config = { runtime: "nodejs" };

// Type narrowing helpers — the SDK's Event union is wide; we only handle the
// dsync.* subset here and want compile-time exhaustiveness if we miss one.
type DsyncEvent =
  | { event: "dsync.user.created"; data: DirectoryUserLike }
  | { event: "dsync.user.updated"; data: DirectoryUserLike }
  | { event: "dsync.user.deleted"; data: DirectoryUserLike }
  | { event: "dsync.group.user_added"; data: { directoryId: string; user: DirectoryUserLike; group: DirectoryGroupLike } }
  | { event: "dsync.group.user_removed"; data: { directoryId: string; user: DirectoryUserLike; group: DirectoryGroupLike } }
  | { event: "dsync.group.created"; data: DirectoryGroupLike }
  | { event: "dsync.group.updated"; data: DirectoryGroupLike };

type DirectoryUserLike = {
  id: string;
  directoryId: string;
  organizationId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  state: "active" | "inactive";
  customAttributes?: Record<string, unknown>;
  role?: { slug: string };
};

type DirectoryGroupLike = {
  id: string;
  name: string;
  directoryId: string;
  organizationId: string | null;
};

const HANDLED_EVENTS = new Set([
  "dsync.user.created",
  "dsync.user.updated",
  "dsync.user.deleted",
  "dsync.group.user_added",
  "dsync.group.user_removed",
  "dsync.group.created",
  "dsync.group.updated",
]);

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.WORKOS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[directory-webhook] WORKOS_WEBHOOK_SECRET not configured");
    return jsonError("Webhook not configured", 503);
  }

  const sigHeader = req.headers.get("workos-signature");
  if (!sigHeader) return jsonError("Missing WorkOS-Signature header", 400);

  // Read the raw body. WorkOS computes the HMAC over the exact request bytes;
  // parsing JSON first would re-serialize and break the signature.
  const rawBody = await req.text();
  let parsedPayload: Record<string, unknown>;
  try {
    parsedPayload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  // The SDK's constructEvent() validates the signature AND returns a typed
  // Event. A bad signature throws SignatureVerificationException — we
  // collapse all verification failures to a single 400 so a probe can't
  // distinguish "wrong secret" from "bad timestamp".
  let event: DsyncEvent;
  try {
    const verified = await getWorkos().webhooks.constructEvent({
      payload: parsedPayload,
      sigHeader,
      secret,
    });
    event = verified as unknown as DsyncEvent;
  } catch (err) {
    console.warn("[directory-webhook] signature verification failed:", err);
    return jsonError("Invalid signature", 400);
  }

  if (!HANDLED_EVENTS.has(event.event)) {
    // Acknowledge so WorkOS doesn't retry — we'll add support for other
    // dsync.* events incrementally without provoking redelivery loops.
    return ackResponse();
  }

  try {
    await processDsyncEvent(event);
  } catch (err) {
    // Log + 500 so WorkOS retries — better than 200-and-drop because
    // missed events become silent provisioning gaps.
    console.error("[directory-webhook] processing failed for", event.event, err);
    return jsonError("Processing failed", 500);
  }

  return ackResponse();
}

function ackResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function processDsyncEvent(event: DsyncEvent): Promise<void> {
  // Resolve organization → tenant. dsync.group.user_* nest org id inside
  // user/group; dsync.user.* + dsync.group.* have it on the top-level data.
  const orgId = resolveOrganizationId(event);
  if (!orgId) {
    console.warn("[directory-webhook] event without organization_id, skipping", event.event);
    return;
  }

  const db = getDb();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.workosOrgId, orgId)).limit(1);
  if (!tenant) {
    // No mapped tenant — this happens during initial dashboard wiring before
    // an admin pairs the org. We don't error out; we just acknowledge.
    console.warn("[directory-webhook] no tenant for workos_org_id", orgId);
    return;
  }

  switch (event.event) {
    case "dsync.user.created":
    case "dsync.user.updated":
      await provisionUser(tenant.id, event.data);
      return;
    case "dsync.user.deleted":
      await deprovisionUser(tenant.id, event.data, "directory.user.deprovisioned");
      return;
    case "dsync.group.user_added":
      // Same upsert path as user.created — group membership simply confirms
      // the user should be active in the tenant.
      await provisionUser(tenant.id, event.data.user);
      return;
    case "dsync.group.user_removed":
      await deprovisionUser(tenant.id, event.data.user, "directory.user.group_removed");
      return;
    case "dsync.group.created":
    case "dsync.group.updated":
      // No-op for now — kept in the handled set so we don't trigger WorkOS
      // retries. Future: persist groups for role-mapping UI.
      return;
  }
}

function resolveOrganizationId(event: DsyncEvent): string | null {
  if (
    event.event === "dsync.user.created" ||
    event.event === "dsync.user.updated" ||
    event.event === "dsync.user.deleted"
  ) {
    return event.data.organizationId ?? null;
  }
  if (event.event === "dsync.group.user_added" || event.event === "dsync.group.user_removed") {
    return event.data.user.organizationId ?? event.data.group.organizationId ?? null;
  }
  if (event.event === "dsync.group.created" || event.event === "dsync.group.updated") {
    return event.data.organizationId ?? null;
  }
  return null;
}

async function provisionUser(tenantId: string, user: DirectoryUserLike): Promise<void> {
  const db = getDb();
  const email = extractDirectoryEmail(user);
  const legalName = extractDirectoryName(user);
  const role = mapDirectoryRoleToTenantRole(user.role?.slug);
  // Per the WorkOS docs, state="inactive" on an update event means the IdP
  // has deactivated the user without deleting them. Treat that as soft
  // deprovisioning — most IdPs prefer deactivate over delete.
  if (user.state === "inactive") {
    await deprovisionUser(tenantId, user, "directory.user.deactivated");
    return;
  }

  // Find by workos id first (rename-stable), then by email as a fallback
  // when the SCIM provider recreated the user with a new id. Upserting
  // either way keeps the chain idempotent.
  let [existing] = await db
    .select()
    .from(users)
    .where(eq(users.workosDirectoryUserId, user.id))
    .limit(1);
  if (!existing && email) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail) existing = byEmail;
  }

  let userId: string;
  let isNew = false;
  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        email: email ?? existing.email,
        legalName: legalName ?? existing.legalName,
        workosDirectoryUserId: user.id,
        workosDirectoryId: user.directoryId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    userId = updated.id;
  } else {
    // Mint a user. external_id is required + unique on the users table; for
    // directory-provisioned users that don't have a WorkOS AuthKit identity
    // yet we synthesize one from the directory id with a clear prefix so
    // a later AuthKit sign-in can be reconciled. (When the directory user
    // later signs in via AuthKit, requireSessionAndTenant will find the
    // row by email and we'll update external_id then — outside this PR.)
    const [created] = await db
      .insert(users)
      .values({
        tenantId,
        externalId: `dsync:${user.id}`,
        email,
        legalName,
        workspaceRole: role,
        userType: "customer",
        workosDirectoryUserId: user.id,
        workosDirectoryId: user.directoryId,
      })
      .returning();
    userId = created.id;
    isNew = true;
  }

  // Only make this the user's active tenant if they don't already have one.
  // A user matched by email can already belong (and be active) in another
  // tenant; inserting this membership with isActiveTenant:true would leave
  // them with TWO active memberships and silently switch their workspace.
  // The invariant is "exactly one active membership per user", so a new
  // directory-provisioned membership joins as inactive when an active one
  // exists elsewhere, and active only when it's the user's first.
  const [activeElsewhere] = await db
    .select({ tenantId: tenantMembers.tenantId })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.userId, userId),
        eq(tenantMembers.isActiveTenant, true),
      ),
    )
    .limit(1);
  const isActiveTenant = !activeElsewhere;

  // Upsert membership. Drizzle's onConflictDoUpdate keeps the write
  // single-statement so concurrent webhook deliveries don't race. Note the
  // conflict `set` deliberately does NOT touch isActiveTenant, so re-syncing
  // an existing membership never flips the user's active workspace.
  await db
    .insert(tenantMembers)
    .values({
      userId,
      tenantId,
      role,
      isActiveTenant,
      status: "active",
      deprovisionedAt: null,
    })
    .onConflictDoUpdate({
      target: [tenantMembers.userId, tenantMembers.tenantId],
      set: {
        role,
        status: "active",
        deprovisionedAt: null,
      },
    });

  await safelyAppendAudit({
    tenantId,
    kind: isNew ? "directory.user.provisioned" : "directory.user.role_changed",
    subjectType: "user",
    subjectId: userId,
    actorUserId: null,
    payload: {
      workosDirectoryUserId: user.id,
      workosDirectoryId: user.directoryId,
      email,
      role,
    },
  });
}

async function deprovisionUser(
  tenantId: string,
  user: DirectoryUserLike,
  kind: "directory.user.deprovisioned" | "directory.user.deactivated" | "directory.user.group_removed",
): Promise<void> {
  const db = getDb();
  const email = extractDirectoryEmail(user);

  // Soft-delete on membership. We DON'T touch the users row — keep the
  // identity around for audit references.
  let [existing] = await db
    .select()
    .from(users)
    .where(eq(users.workosDirectoryUserId, user.id))
    .limit(1);
  if (!existing && email) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail) existing = byEmail;
  }
  if (!existing) {
    // Already gone or never provisioned — webhook is still idempotent,
    // just nothing to do. Skip the audit row too (no subject).
    return;
  }

  await db
    .update(tenantMembers)
    .set({ status: "deprovisioned", deprovisionedAt: new Date(), isActiveTenant: false })
    .where(and(eq(tenantMembers.userId, existing.id), eq(tenantMembers.tenantId, tenantId)));

  await safelyAppendAudit({
    tenantId,
    kind,
    subjectType: "user",
    subjectId: existing.id,
    actorUserId: null,
    payload: {
      workosDirectoryUserId: user.id,
      workosDirectoryId: user.directoryId,
      email,
    },
  });
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    // Audit failure must not bubble — the directory state mutation has
    // already committed and we don't want WorkOS to retry it.
    console.error("[directory-webhook] audit append failed", input.kind, err);
  }
}

// Exported for tests.
export const __testing = { processDsyncEvent };
