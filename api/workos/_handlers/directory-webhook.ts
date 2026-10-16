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
 * tenant whose workos_org_id matches the event's organization_id, and every
 * match and write after that is confined to that tenant. The provisioning
 * policy lives in api/_utils/directory-provisioning.ts.
 */
import { getWorkos } from "../../_utils/workos.js";
import { jsonError } from "../../_utils/request.js";
import { createDrizzleDirectoryStore, type DirectoryStore } from "../../_utils/directory-store.js";
import {
  deprovisionDirectoryUser,
  provisionDirectoryUser,
  type DirectoryUserLike,
} from "../../_utils/directory-provisioning.js";

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

async function processDsyncEvent(
  event: DsyncEvent,
  store: DirectoryStore = createDrizzleDirectoryStore(),
): Promise<void> {
  // Resolve organization → tenant. dsync.group.user_* nest org id inside
  // user/group; dsync.user.* + dsync.group.* have it on the top-level data.
  // Every write below is scoped to this tenant (see directory-provisioning.ts).
  const orgId = resolveOrganizationId(event);
  if (!orgId) {
    console.warn("[directory-webhook] event without organization_id, skipping", event.event);
    return;
  }

  const tenantId = await store.findTenantIdByOrgId(orgId);
  if (!tenantId) {
    // No mapped tenant — this happens during initial dashboard wiring before
    // an admin pairs the org. We don't error out; we just acknowledge.
    console.warn("[directory-webhook] no tenant for workos_org_id", orgId);
    return;
  }

  switch (event.event) {
    case "dsync.user.created":
    case "dsync.user.updated":
      await provisionDirectoryUser(store, tenantId, event.data);
      return;
    case "dsync.user.deleted":
      await deprovisionDirectoryUser(store, tenantId, event.data, "directory.user.deprovisioned");
      return;
    case "dsync.group.user_added":
      // Same upsert path as user.created — group membership simply confirms
      // the user should be active in the tenant.
      await provisionDirectoryUser(store, tenantId, event.data.user);
      return;
    case "dsync.group.user_removed":
      await deprovisionDirectoryUser(store, tenantId, event.data.user, "directory.user.group_removed");
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

// Exported for tests.
export const __testing = { processDsyncEvent };
