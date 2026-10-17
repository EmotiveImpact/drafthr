// Live verification of the Neon DB schema + hash-chain integrity.
//
// Run: `npx dotenv -e .env.local -- npx tsx scripts/db-verify.ts`
//
// 1. List every public-schema table (sanity check: 13 tables landed)
// 2. Insert a test tenant
// 3. Append 3 audit events under that tenant
// 4. Run verifyAuditChain — expect ok: true, rowCount: 3
// 5. Try to tamper with one row's payload, expect the trigger to refuse it
// 6. Restore + clean up (DELETE tenant — cascade clears audit events)
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { tenants, auditEvents } from "../src/db/schema";
import { appendAuditEvent } from "../src/db/audit";
import { verifyAuditChain } from "../src/db/audit-verify";

async function main() {
  const db = getDb();

  console.log("\n== 1. Tables in public schema ==");
  const tables = await db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  for (const row of tables.rows as { table_name: string }[]) {
    console.log("  -", row.table_name);
  }

  console.log("\n== 2. Insert test tenant ==");
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `verify-test-${Date.now()}` })
    .returning();
  console.log("  tenant.id =", tenant.id);

  console.log("\n== 3. Append 3 audit events ==");
  for (let i = 1; i <= 3; i++) {
    const r = await appendAuditEvent({
      tenantId: tenant.id,
      kind: `verify.test.${i}`,
      subjectType: "draft",
      subjectId: "00000000-0000-0000-0000-000000000001",
      payload: { step: i, note: `event ${i}` },
    });
    console.log(`  event ${i}: rowHash = ${r.rowHash.slice(0, 16)}…`);
  }

  console.log("\n== 4. Verify chain (clean) ==");
  const clean = await verifyAuditChain(tenant.id);
  console.log("  result:", JSON.stringify(clean));
  if (!clean.ok || clean.rowCount !== 3) {
    throw new Error(`expected ok with 3 rows, got ${JSON.stringify(clean)}`);
  }

  console.log("\n== 5. Tamper with one row, expect the database to refuse ==");
  // Migration 0021 makes audit_events append-only: a direct UPDATE is rejected
  // by trigger. (The hash chain would also catch it; see src/db/audit.seq.test.ts.)
  let tamperRejected = false;
  try {
    await db.execute(
      sql`UPDATE ${auditEvents} SET payload_json = '{"step":1,"note":"TAMPERED"}'::jsonb WHERE tenant_id = ${tenant.id} AND kind = 'verify.test.1'`,
    );
  } catch (err) {
    tamperRejected = true;
    console.log("  update rejected:", err instanceof Error ? err.message : String(err));
  }
  if (!tamperRejected) {
    throw new Error("expected the append-only trigger to reject a direct UPDATE");
  }
  const afterTamper = await verifyAuditChain(tenant.id);
  if (!afterTamper.ok) {
    throw new Error(`chain should be intact after a rejected tamper, got ${JSON.stringify(afterTamper)}`);
  }
  console.log("  ✓ append-only trigger rejected the tamper; chain still verifies");

  console.log("\n== 6. Cleanup — delete test tenant (cascade clears events) ==");
  await db.execute(sql`DELETE FROM ${tenants} WHERE id = ${tenant.id}`);
  console.log("  cleaned.");

  console.log("\n✓ All checks passed. Schema + hash chain are live.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Verification failed:", err);
  process.exit(1);
});
