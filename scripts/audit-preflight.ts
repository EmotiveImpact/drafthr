/** Run with node --import tsx scripts/audit-preflight.ts --read-only.
 * Explicit URL only; no .env discovery, writes, schema changes or providers. */
import postgres from "postgres";
import { verifyHistoricalAuditRows } from "../src/db/audit-history.js";

let db: ReturnType<typeof postgres> | undefined;
try {
  // URL/driver errors can carry the original connection string, so even
  // initialization belongs inside the deliberately sanitized error boundary.
  const value = process.env.AUDIT_PREFLIGHT_DATABASE_URL;
  if (process.argv[2] !== "--read-only" || !value) {
    throw new Error("Explicit read-only invocation and connection are required.");
  }
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname.includes("-pooler")) {
    throw new Error("A direct PostgreSQL connection is required.");
  }
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  db = postgres(value, { max: 1, connect_timeout: 3, ssl: local ? false : "require" });
  const totals = await db.begin("isolation level repeatable read read only", async tx => {
    await tx`SET LOCAL statement_timeout = '30s'`;
    // Do not let an RLS-filtered view look like an empty, verified history.
    // This does not bypass RLS: PostgreSQL rejects queries needing its filters.
    await tx`SET LOCAL row_security = off`;
    const sequenceColumns = await tx`SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_events' AND column_name = 'sequence'`;
    const hasSequence = sequenceColumns.length > 0;
    const tenants = await tx`SELECT DISTINCT tenant_id FROM public.audit_events ORDER BY tenant_id`;
    let rowsChecked = 0, failures = 0;
    for (const tenant of tenants) {
      // Only one tenant's history is held in memory at a time. The surrounding
      // read-only repeatable-read transaction gives every check one snapshot.
      const rows = await tx`SELECT id, row_hash, prev_hash, kind, subject_id, payload_json, created_at,
        ${hasSequence ? tx`sequence` : tx`NULL::bigint`} AS sequence
        FROM public.audit_events WHERE tenant_id = ${tenant.tenant_id}`;
      const result = verifyHistoricalAuditRows(rows.map(row => ({ id: row.id, rowHash: row.row_hash,
        prevHash: row.prev_hash, kind: row.kind, subjectId: row.subject_id, payload: row.payload_json,
        createdAt: new Date(row.created_at), ...(hasSequence ? { sequence: Number(row.sequence) } : {}) })));
      rowsChecked += rows.length;
      if (!result.ok) {
        failures++;
        // IDs/reason only: never print the HR payload, credentials or SQL.
        console.error(JSON.stringify({ tenantId: tenant.tenant_id, ...result }));
      }
    }
    return { ok: failures === 0, tenantsChecked: tenants.length, rowsChecked, failures, sequenceChecked: hasSequence };
  });
  console.log(JSON.stringify(totals));
  if (!totals.ok) process.exitCode = 1;
} catch {
  console.error("Audit preflight could not complete. No data was changed. Check the approved connection and database availability.");
  process.exitCode = 1;
} finally {
  try { await db?.end(); } catch {
    console.error("Audit preflight connection cleanup failed.");
    process.exitCode = 1;
  }
}
