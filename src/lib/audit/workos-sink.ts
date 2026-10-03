/**
 * WorkOS Audit Logs sink — the downstream-only mirror for the local
 * hash-chained `audit_events` table.
 *
 * Design rules:
 *   - The local chain is the source of truth. The transactional outbox owns
 *     retries; this module only makes one awaited, time-bounded delivery.
 *   - Gated by the `WORKOS_AUDIT_LOGS_ENABLED=true` env flag so we can ship
 *     dark and flip on per-environment.
 *   - Gated again by the per-tenant `workos_org_id` — a tenant without a
 *     WorkOS organization is silently skipped (return code, not an error).
 *   - Idempotent: the WorkOS Audit Logs `Idempotency-Key` header expires
 *     after 24h; we pass the local `audit_events.id` (a uuid) so retries
 *     within that window deduplicate.
 *   - Strict event-naming. WorkOS rejects flat names like `draft_created`.
 *     We re-shape DraftHR's `{object}.{action}` kinds into the WorkOS
 *     `{group}.{object}.{action}` convention with `mapKindToWorkOSAction`.
 *   - Cross-tenant safety: the caller is responsible for passing only the
 *     workosOrgId that matches `tenantId`. Wrong org → silent cross-tenant
 *     leak, which would be a security bug.
 */

// Soft dependency — the WorkOS client is created lazily so this module can
// be imported by tests that don't set env vars. The actual `@workos-inc/node`
// import is deferred to `getWorkosClient()`.
type AuditLogActor = {
  id: string;
  type: string;
  name?: string;
  metadata?: Record<string, string | number | boolean>;
};
type AuditLogTarget = {
  id: string;
  type: string;
  name?: string;
  metadata?: Record<string, string | number | boolean>;
};
type CreateAuditLogEventOptions = {
  action: string;
  version?: number;
  occurredAt: Date;
  actor: AuditLogActor;
  targets: AuditLogTarget[];
  context: { location: string; userAgent?: string };
  metadata?: Record<string, string | number | boolean>;
};

export type WorkOSAuditEventSnapshot = Omit<CreateAuditLogEventOptions, "occurredAt"> & {
  occurredAt: string;
};

export type WorkosAuditLogsClient = {
  createEvent: (
    organization: string,
    event: CreateAuditLogEventOptions,
    options?: { idempotencyKey?: string },
  ) => Promise<void>;
};

export type SendToWorkOSAuditLogsInput = {
  tenantId: string;
  workosOrgId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  /** DraftHR's internal audit_events.kind — e.g. "draft.exported". */
  action: string;
  /** DraftHR's internal subject_type — e.g. "draft". */
  targetType: string;
  /** DraftHR's internal subject_id — e.g. the draft uuid. */
  targetId: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
  /** Used as the WorkOS Idempotency-Key. Pass the audit_events.id. */
  idempotencyKey: string;
  /** Optional request IP — falls back to "0.0.0.0" so we always have a `location`. */
  ip?: string | null;
  /** Optional User-Agent. */
  userAgent?: string | null;
};

export type SendToWorkOSAuditLogsResult =
  | { ok: true }
  | { ok: false; reason: string; retryable?: boolean; retryAfterMs?: number };

const ENV_FLAG = "WORKOS_AUDIT_LOGS_ENABLED";

/**
 * Maps DraftHR's flat `{object}.{action}` kinds onto WorkOS' required
 * `{group}.{object}.{action}` convention. New kinds added in api/* must
 * also be added here — the default fallback (`workspace.*`) keeps the
 * pipeline alive but logs a warning so we notice unmapped kinds.
 */
export function mapKindToWorkOSAction(kind: string): string {
  // Already three-segment? Trust the caller.
  if (kind.split(".").length >= 3) return kind;

  const KIND_MAP: Record<string, string> = {
    // drafts
    "draft.created": "letters.draft.created",
    "draft.updated": "letters.draft.updated",
    "draft.deleted": "letters.draft.deleted",
    "draft.exported": "letters.draft.exported",
    // sections
    "section.updated": "letters.section.updated",
    // workspace lifecycle
    "tenant.created": "workspace.tenant.created",
    "tenant.updated": "workspace.tenant.updated",
    "tenant.deleted": "workspace.tenant.deleted",
    // invites
    "invite.created": "workspace.invite.created",
    "invite.accepted": "workspace.invite.accepted",
    "invite.revoked": "workspace.invite.revoked",
    // members
    "member.role_changed": "workspace.member.role_changed",
    "member.removed": "workspace.member.removed",
    "member.added": "workspace.member.added",
  };

  const mapped = KIND_MAP[kind];
  if (mapped) return mapped;

  // Unknown kind — synthesise a valid 3-segment name from `subject_type`
  // semantics. The fallback group `app` is recognisable in WorkOS dashboards
  // as something needing a schema definition.
  const parts = kind.split(".");
  if (parts.length === 2) return `app.${parts[0]}.${parts[1]}`;
  return `app.event.${kind.replace(/[^a-z0-9_]+/gi, "_")}`;
}

/**
 * Clamps a metadata bag to WorkOS' shape: string|number|boolean values, 50
 * keys max, 40-char key names, 500-char values. We coerce non-primitives by
 * stringifying. Truncation is silent — the caller's payloadJson is already
 * persisted locally with full fidelity, so this only affects the SIEM copy.
 */
export function shapeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, string | number | boolean> = {};
  let keyCount = 0;
  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    if (keyCount >= 50) break;
    if (rawValue === undefined || rawValue === null) continue;
    const key = rawKey.slice(0, 40);
    let value: string | number | boolean;
    if (typeof rawValue === "string") value = rawValue.slice(0, 500);
    else if (typeof rawValue === "number" || typeof rawValue === "boolean") value = rawValue;
    else {
      try {
        value = JSON.stringify(rawValue).slice(0, 500);
      } catch {
        value = String(rawValue).slice(0, 500);
      }
    }
    out[key] = value;
    keyCount++;
  }
  return out;
}

// Lazy client factory — overridable for tests via `setWorkosAuditLogsClient`.
let injectedClient: WorkosAuditLogsClient | null = null;

export function setWorkosAuditLogsClient(client: WorkosAuditLogsClient | null): void {
  injectedClient = client;
}

async function getWorkosAuditLogsClient(): Promise<WorkosAuditLogsClient | null> {
  if (injectedClient) return injectedClient;
  // Avoid pulling in the SDK if env isn't set — the import itself is cheap
  // but the WorkOS constructor throws on missing env.
  if (!process.env.WORKOS_API_KEY) return null;
  try {
    const { WorkOS } = await import("@workos-inc/node");
    const workos = new WorkOS(process.env.WORKOS_API_KEY, {
      clientId: process.env.WORKOS_CLIENT_ID,
      timeout: 10_000,
    });
    return workos.auditLogs as unknown as WorkosAuditLogsClient;
  } catch {
    return null;
  }
}

export function isWorkOSAuditLogsEnabled(): boolean {
  return process.env[ENV_FLAG] === "true";
}

export async function isWorkOSAuditLogsReady(): Promise<boolean> {
  return isWorkOSAuditLogsEnabled() && Boolean(await getWorkosAuditLogsClient());
}

/**
 * Mirror an `audit_events` row to WorkOS. Returns { ok: false, reason } for
 * silent-skip conditions (disabled flag, missing org_id) and for caught
 * exceptions; never throws.
 */
export async function sendToWorkOSAuditLogs(
  input: SendToWorkOSAuditLogsInput,
): Promise<SendToWorkOSAuditLogsResult> {
  if (!isWorkOSAuditLogsEnabled()) return { ok: false, reason: "feature_flag_off" };
  if (!input.workosOrgId) return { ok: false, reason: "tenant_not_configured" };
  if (!input.idempotencyKey) return { ok: false, reason: "missing_idempotency_key" };

  return sendWorkOSAuditSnapshot(input.workosOrgId, buildWorkOSAuditSnapshot(input), input.idempotencyKey);
}

/** Freeze the exact provider body before the first delivery attempt. */
export function buildWorkOSAuditSnapshot(input: SendToWorkOSAuditLogsInput): WorkOSAuditEventSnapshot {

  // Build the actor. We always need *some* id — WorkOS rejects empty strings.
  // For system-driven events (no actor_user_id), fall back to a stable
  // "system" sentinel tied to the tenant.
  const actor: AuditLogActor = input.actorId
    ? {
        type: "user",
        id: input.actorId,
        ...(input.actorName ? { name: input.actorName } : {}),
        ...(input.actorEmail
          ? { metadata: { email: input.actorEmail.slice(0, 500) } }
          : {}),
      }
    : {
        type: "system",
        id: `system:tenant:${input.tenantId}`,
        name: "DraftHR system",
      };

  const target: AuditLogTarget = {
    type: input.targetType,
    id: input.targetId,
  };

  return {
    action: mapKindToWorkOSAction(input.action),
    occurredAt: input.occurredAt.toISOString(),
    actor,
    targets: [target],
    context: {
      location: input.ip && input.ip.trim() ? input.ip.trim() : "0.0.0.0",
      ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 500) } : {}),
    },
    ...(input.metadata ? { metadata: shapeMetadata(input.metadata) } : {}),
  };
}

export async function sendWorkOSAuditSnapshot(
  workosOrgId: string,
  snapshot: WorkOSAuditEventSnapshot,
  idempotencyKey: string,
): Promise<SendToWorkOSAuditLogsResult> {
  if (!isWorkOSAuditLogsEnabled()) return { ok: false, reason: "feature_flag_off" };
  if (!workosOrgId) return { ok: false, reason: "tenant_not_configured" };
  if (!idempotencyKey) return { ok: false, reason: "missing_idempotency_key" };
  const client = await getWorkosAuditLogsClient();
  if (!client) return { ok: false, reason: "workos_client_unavailable", retryable: true };

  try {
    await client.createEvent(workosOrgId, { ...snapshot, occurredAt: new Date(snapshot.occurredAt) }, {
      idempotencyKey,
    });
    return { ok: true };
  } catch (err) {
    // Provider exception messages/bodies may echo private event data. Persist
    // only a stable code; never log the payload, names, emails or raw errors.
    const status = Number((err as { status?: unknown; statusCode?: unknown } | null)?.status
      ?? (err as { statusCode?: unknown } | null)?.statusCode);
    const reason = Number.isInteger(status) && status >= 400 && status <= 599
      ? `workos_http_${status}` : "workos_transport_error";
    const retryAfter = Number((err as { retryAfter?: unknown } | null)?.retryAfter);
    return {
      ok: false, reason,
      retryable: !Number.isFinite(status) || status >= 500 || status === 429 || status === 408,
      ...(status === 429 && Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterMs: retryAfter * 1000 } : {}),
    };
  }
}
