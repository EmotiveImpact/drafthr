/**
 * Live verification of the dual-write + audit-chain pipeline against Neon.
 *
 * Run: `npx dotenv -e .env.local -- npx tsx scripts/dual-write-verify.ts`
 *
 * 1. Mint a tenant + user + tenant_member.
 * 2. Insert a draft + 3 sections directly (mirroring what /api/store/drafts
 *    does — we can't make an HTTP call in a script, but the DB writes are
 *    identical).
 * 3. Append a `draft.created` audit event with the same payload the API uses.
 * 4. Verify the chain.
 * 5. Update the draft, append `draft.updated`, re-verify.
 * 6. Delete + append `draft.deleted`, re-verify.
 * 7. Tamper with row 0 and confirm the chain breaks (defensibility demo).
 * 8. Cleanup — DELETE the tenant; cascade clears everything we wrote.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { tenants, users, tenantMembers, drafts, sections } from "../src/db/schema";
import { appendAuditEvent } from "../src/db/audit";
import { verifyAuditChain } from "../src/db/audit-verify";

async function main() {
  const db = getDb();

  console.log("\n== 1. Mint tenant + user + tenant_member ==");
  const [tenant] = await db.insert(tenants).values({ name: `dw-verify-${Date.now()}` }).returning();
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      externalId: `wos_test_${Date.now()}`,
      email: "test@drafthr.io",
      legalName: "DW Verify Test",
      workspaceRole: "owner",
      userType: "customer",
    })
    .returning();
  await db.insert(tenantMembers).values({
    userId: user.id,
    tenantId: tenant.id,
    role: "owner",
    isActiveTenant: true,
  });
  console.log("  tenant.id =", tenant.id);
  console.log("  user.id   =", user.id);

  console.log("\n== 2. Insert draft + sections (mirrors /api/store/drafts POST) ==");
  const [draft] = await db
    .insert(drafts)
    .values({
      tenantId: tenant.id,
      authorUserId: user.id,
      letterType: "termination",
      mode: "employer",
      title: "Verify test draft",
      jurisdiction: "UK",
      reviewStatus: "draft",
      contextJson: { mode: "employer", jurisdiction: "UK" },
      employerJson: { legalName: "Acme" },
      employeeJson: { legalName: "Jane Doe" },
      answersJson: { foo: "bar" },
    })
    .returning();
  for (let i = 0; i < 3; i++) {
    await db.insert(sections).values({
      draftId: draft.id,
      sectionId: `sec_${i}`,
      title: `Section ${i}`,
      html: `<p>Body ${i}</p>`,
      status: "ready",
      position: i,
    });
  }
  console.log("  draft.id =", draft.id);

  console.log("\n== 3. Append draft.created audit event ==");
  await appendAuditEvent({
    tenantId: tenant.id,
    kind: "draft.created",
    subjectType: "draft",
    subjectId: draft.id,
    actorUserId: user.id,
    payload: { letterType: "termination", title: "Verify test draft", sectionCount: 3, mode: "employer" },
  });

  console.log("\n== 4. Verify chain (1 row) ==");
  let result = await verifyAuditChain(tenant.id);
  if (!result.ok || result.rowCount !== 1) throw new Error(`expected 1 row, got ${JSON.stringify(result)}`);
  console.log("  ✓ chain ok, 1 row");

  console.log("\n== 5. Update + append draft.updated, re-verify ==");
  await db.update(drafts).set({ title: "Verify test draft (renamed)" }).where(sql`id = ${draft.id}`);
  await appendAuditEvent({
    tenantId: tenant.id,
    kind: "draft.updated",
    subjectType: "draft",
    subjectId: draft.id,
    actorUserId: user.id,
    payload: { title: "Verify test draft (renamed)", reviewStatus: "draft", sectionCount: 3 },
  });
  result = await verifyAuditChain(tenant.id);
  if (!result.ok || result.rowCount !== 2) throw new Error(`expected 2 rows, got ${JSON.stringify(result)}`);
  console.log("  ✓ chain ok, 2 rows");

  console.log("\n== 6. Delete + append draft.deleted, re-verify ==");
  await appendAuditEvent({
    tenantId: tenant.id,
    kind: "draft.deleted",
    subjectType: "draft",
    subjectId: draft.id,
    actorUserId: user.id,
    payload: { letterType: "termination", title: "Verify test draft (renamed)" },
  });
  await db.delete(drafts).where(sql`id = ${draft.id}`);
  result = await verifyAuditChain(tenant.id);
  if (!result.ok || result.rowCount !== 3) throw new Error(`expected 3 rows, got ${JSON.stringify(result)}`);
  console.log("  ✓ chain ok, 3 rows");

  console.log("\n== 7. Tamper with row 0, confirm break ==");
  await db.execute(
    sql`UPDATE audit_events SET payload_json = '{"letterType":"TAMPERED"}'::jsonb WHERE tenant_id = ${tenant.id} AND kind = 'draft.created'`,
  );
  const tampered = await verifyAuditChain(tenant.id);
  if (tampered.ok) throw new Error("tampering not detected — chain hash regression");
  console.log("  ✓ chain broke at row", tampered.brokenAtId, "reason:", tampered.reason);

  console.log("\n== 8. Cleanup ==");
  await db.execute(sql`DELETE FROM ${tenants} WHERE id = ${tenant.id}`);
  console.log("  ✓ tenant + cascade cleared.");

  console.log("\n✓ Dual-write verification passed.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Verification failed:", err);
  process.exit(1);
});
