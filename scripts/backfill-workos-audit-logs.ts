/**
 * One-shot CLI: re-send historical audit_events to WorkOS Audit Logs.
 *
 * Usage:
 *   tsx scripts/backfill-workos-audit-logs.ts --since 2026-01-01
 *
 * Alternatively, set WORKOS_AUDIT_LOGS_BACKFILL_FROM=2026-01-01T00:00:00Z in
 * the environment instead of passing --since.
 *
 * Safety:
 *   - Idempotent. The WorkOS Idempotency-Key header receives each row's
 *     `audit_events.id`, so re-running within 24h dedupes server-side.
 *     Older than 24h re-sending will produce duplicate WorkOS events — the
 *     local chain remains untouched.
 *   - Only tenants with `workos_org_id` set are touched. Tenants without
 *     a configured WorkOS organization are silently skipped.
 *   - Forces WORKOS_AUDIT_LOGS_ENABLED=true for the duration of the
 *     script so a forgotten env flag doesn't no-op the entire backfill.
 *   - Ctrl-C is safe: the loop checks an `aborted` flag between rows.
 *
 * Prerequisites:
 *   - DATABASE_URL must point at the target Postgres (use the unpooled URL
 *     for long-running scripts — the pooler in transaction mode kills
 *     idle conns).
 *   - WORKOS_API_KEY + WORKOS_CLIENT_ID must be set (the SDK refuses to
 *     construct without them).
 */
import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import { getDb, closeDb } from "../src/db/index.js";
import { auditEvents, tenants, users } from "../src/db/schema.js";
import { sendToWorkOSAuditLogs } from "../src/lib/audit/workos-sink.js";

let aborted = false;
process.on("SIGINT", () => {
  console.log("\n[backfill] SIGINT received — finishing current row then exiting…");
  aborted = true;
});

function parseSince(): Date {
  const argIdx = process.argv.findIndex((a) => a === "--since");
  const cli =
    argIdx >= 0 && process.argv[argIdx + 1] ? process.argv[argIdx + 1] : undefined;
  const env = process.env.WORKOS_AUDIT_LOGS_BACKFILL_FROM;
  const raw = cli ?? env;
  if (!raw) {
    console.error(
      "[backfill] Missing --since <ISO timestamp> argument or WORKOS_AUDIT_LOGS_BACKFILL_FROM env var.",
    );
    console.error("[backfill] Example: tsx scripts/backfill-workos-audit-logs.ts --since 2026-01-01");
    process.exit(2);
  }
  const dt = new Date(raw);
  if (isNaN(dt.getTime())) {
    console.error(`[backfill] Could not parse "${raw}" as a date.`);
    process.exit(2);
  }
  return dt;
}

async function main(): Promise<void> {
  const since = parseSince();
  console.log(`[backfill] streaming audit_events created since ${since.toISOString()}`);

  // Force the env flag on for this process — otherwise the sink no-ops and
  // the whole script becomes a 30-minute walk.
  process.env.WORKOS_AUDIT_LOGS_ENABLED = "true";

  const db = getDb();

  const tenantRows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      workosOrgId: tenants.workosOrgId,
    })
    .from(tenants)
    .where(isNotNull(tenants.workosOrgId));

  if (tenantRows.length === 0) {
    console.log("[backfill] no tenants with workos_org_id set — nothing to do.");
    await closeDb();
    return;
  }

  console.log(`[backfill] ${tenantRows.length} tenant(s) configured for WorkOS mirror.`);

  let grandTotal = 0;
  let grandSent = 0;
  let grandFailed = 0;
  let grandSkipped = 0;

  for (const tenant of tenantRows) {
    if (aborted) break;
    if (!tenant.workosOrgId) continue;

    const rows = await db
      .select({
        id: auditEvents.id,
        tenantId: auditEvents.tenantId,
        kind: auditEvents.kind,
        subjectType: auditEvents.subjectType,
        subjectId: auditEvents.subjectId,
        actorUserId: auditEvents.actorUserId,
        payloadJson: auditEvents.payloadJson,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(and(eq(auditEvents.tenantId, tenant.id), gte(auditEvents.createdAt, since)))
      .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));

    console.log(`[backfill] tenant ${tenant.id} (${tenant.name}): ${rows.length} row(s) to mirror`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Per-tenant cache for actor lookups — typical tenants have a small
    // handful of users; saves a round trip per row.
    const actorCache = new Map<string, { email: string | null; name: string | null }>();

    for (const row of rows) {
      if (aborted) break;
      grandTotal++;

      let actorEmail: string | null = null;
      let actorName: string | null = null;
      if (row.actorUserId) {
        const cached = actorCache.get(row.actorUserId);
        if (cached) {
          actorEmail = cached.email;
          actorName = cached.name;
        } else {
          const [u] = await db
            .select({ email: users.email, legalName: users.legalName })
            .from(users)
            .where(eq(users.id, row.actorUserId))
            .limit(1);
          actorEmail = u?.email ?? null;
          actorName = u?.legalName ?? null;
          actorCache.set(row.actorUserId, { email: actorEmail, name: actorName });
        }
      }

      const result = await sendToWorkOSAuditLogs({
        tenantId: row.tenantId,
        workosOrgId: tenant.workosOrgId,
        actorId: row.actorUserId,
        actorEmail,
        actorName,
        action: row.kind,
        targetType: row.subjectType,
        targetId: row.subjectId,
        occurredAt: row.createdAt,
        metadata: row.payloadJson as Record<string, unknown>,
        idempotencyKey: row.id,
      });

      if (result.ok) {
        sent++;
        grandSent++;
      } else if (result.reason === "tenant_not_configured" || result.reason === "feature_flag_off") {
        skipped++;
        grandSkipped++;
      } else {
        failed++;
        grandFailed++;
        console.warn(`[backfill] tenant ${tenant.id} row ${row.id}: ${result.reason}`);
      }

      if ((sent + failed + skipped) % 25 === 0) {
        console.log(
          `[backfill] tenant ${tenant.id}: ${sent + failed + skipped}/${rows.length} processed (sent=${sent}, failed=${failed}, skipped=${skipped})`,
        );
      }
    }

    console.log(
      `[backfill] tenant ${tenant.id} done: sent=${sent}, failed=${failed}, skipped=${skipped} of ${rows.length}`,
    );
  }

  console.log(
    `[backfill] FINAL — total=${grandTotal}, sent=${grandSent}, failed=${grandFailed}, skipped=${grandSkipped}${aborted ? " (aborted)" : ""}`,
  );

  await closeDb();
}

main().catch((err) => {
  console.error("[backfill] fatal", err);
  process.exit(1);
});
