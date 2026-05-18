/**
 * diagnose-session — explain why /api/auth/session returns activeTenant=null
 * for a given user.
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/diagnose-session.ts \
 *     --email user@example.com
 *   npx dotenv -e .env.local -- npx tsx scripts/diagnose-session.ts \
 *     --workos-id user_01HABC...
 *   npx dotenv -e .env.local -- npx tsx scripts/diagnose-session.ts \
 *     --user-id 1f2a... (the DB-side users.id UUID)
 *
 * What it does (read-only — never writes):
 *   1. Resolve `users` row by external_id, email, or id.
 *   2. Dump every `tenant_members` row for that user (with status, role,
 *      isActiveTenant, joinedAt, deprovisioned_at).
 *   3. Dump the corresponding `tenants` row metadata.
 *   4. Replay the /api/auth/session resolution logic — including the
 *      auto-election fallback shipped for bug #onboarding-bounce — and
 *      print a verdict:
 *         "Session will return activeTenant=X (reason)"
 *      or "Session will return activeTenant=null because Y"
 *
 * If you find a data bug (e.g. only deprovisioned rows), the verdict
 * explains exactly what SQL to run to restore access.
 */
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { tenantMembers, tenants, users } from "../src/db/schema";

type Args = {
  email: string | null;
  workosId: string | null;
  userId: string | null;
};

function parseArgs(): Args {
  const args: Args = { email: null, workosId: null, userId: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      if (flag === "--help" || flag === "-h") {
        printHelp();
        process.exit(0);
      }
      continue;
    }
    if (flag === "--email") args.email = value;
    else if (flag === "--workos-id") args.workosId = value;
    else if (flag === "--user-id") args.userId = value;
    i++;
  }
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "diagnose-session — diagnose why /api/auth/session returns activeTenant=null.",
      "",
      "Usage:",
      "  npx dotenv -e .env.local -- npx tsx scripts/diagnose-session.ts \\",
      "    [--email user@example.com] [--workos-id user_01...] [--user-id <uuid>]",
      "",
      "Provide ONE of --email, --workos-id, or --user-id. Read-only.",
    ].join("\n"),
  );
}

type Membership = {
  tenantId: string;
  role: string;
  isActiveTenant: boolean;
  status: string;
  joinedAt: Date | null;
  deprovisionedAt: Date | null;
  tenantName: string | null;
  tenantWorkosOrgId: string | null;
  tenantCreatedAt: Date | null;
};

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.email && !args.workosId && !args.userId) {
    printHelp();
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run via `npx dotenv -e .env.local -- ...`");
    process.exit(2);
  }

  const db = getDb();

  // --- 1. Resolve the users row ---------------------------------------------
  let userRow:
    | {
        id: string;
        externalId: string;
        email: string | null;
        legalName: string | null;
        tenantId: string | null;
        workspaceRole: string;
        userType: string;
        workosDirectoryUserId: string | null;
        workosDirectoryId: string | null;
        createdAt: Date;
        updatedAt: Date;
      }
    | undefined;

  if (args.userId) {
    [userRow] = await db.select().from(users).where(eq(users.id, args.userId)).limit(1);
  } else if (args.workosId) {
    [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.externalId, args.workosId))
      .limit(1);
  } else if (args.email) {
    [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.email, args.email))
      .limit(1);
  }

  banner("1. users row");
  if (!userRow) {
    console.log(
      "  NO row found. The user has never completed their first authenticated\n" +
        "  request (requireSessionAndTenant() upserts on first hit). Until they\n" +
        "  do, /api/auth/session will return activeTenant=null, hasAnyTenant=false.",
    );
    console.log("\nVerdict: Session will return activeTenant=null because the users row does not exist.");
    await closeDb();
    return;
  }
  printRow(userRow);

  // --- 2. tenant_members rows ----------------------------------------------
  banner("2. tenant_members rows for this user");
  const memberships: Membership[] = await db
    .select({
      tenantId: tenantMembers.tenantId,
      role: tenantMembers.role,
      isActiveTenant: tenantMembers.isActiveTenant,
      status: tenantMembers.status,
      joinedAt: tenantMembers.joinedAt,
      deprovisionedAt: tenantMembers.deprovisionedAt,
      tenantName: tenants.name,
      tenantWorkosOrgId: tenants.workosOrgId,
      tenantCreatedAt: tenants.createdAt,
    })
    .from(tenantMembers)
    .leftJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(eq(tenantMembers.userId, userRow.id));

  if (memberships.length === 0) {
    console.log("  NONE. User has no workspace membership rows at all.");
  } else {
    for (const m of memberships) {
      console.log(
        [
          `  - tenant_id=${m.tenantId}`,
          `    tenant_name=${m.tenantName ?? "<missing tenant row!>"}`,
          `    workos_org_id=${m.tenantWorkosOrgId ?? "-"}`,
          `    role=${m.role}`,
          `    is_active_tenant=${m.isActiveTenant}`,
          `    status=${m.status}`,
          `    joined_at=${m.joinedAt?.toISOString() ?? "?"}`,
          `    deprovisioned_at=${m.deprovisionedAt?.toISOString() ?? "-"}`,
        ].join("\n"),
      );
    }
  }

  // --- 3. Verdict — replay the session handler's logic ----------------------
  banner("3. Verdict — replaying /api/auth/session resolution");
  const live = memberships.filter((m) => m.status !== "deprovisioned" && m.tenantName);
  const flaggedActive = live.find((m) => m.isActiveTenant);

  if (live.length === 0 && memberships.length > 0) {
    console.log(
      "  Every membership is either deprovisioned or points at a missing tenant row.",
    );
    console.log(
      "  hasAnyTenant=false → user will be sent to /signup/workspace (create/join).",
    );
    console.log(
      "  Verdict: Session will return activeTenant=null because no LIVE memberships exist.",
    );
    console.log("\n  To restore a deprovisioned seat (data fix):");
    console.log(`    UPDATE tenant_members`);
    console.log(`       SET status = 'active', deprovisioned_at = NULL, is_active_tenant = true`);
    console.log(`     WHERE user_id = '${userRow.id}'`);
    console.log(`       AND tenant_id = '<the tenant_id you want active>';`);
  } else if (live.length === 0) {
    console.log("  hasAnyTenant=false → user will be sent to /signup/workspace.");
    console.log(
      "  Verdict: Session will return activeTenant=null because user has zero memberships.",
    );
  } else if (flaggedActive && flaggedActive.tenantName) {
    console.log(
      `  Verdict: Session will return activeTenant={id:${flaggedActive.tenantId}, name:${flaggedActive.tenantName}, role:${flaggedActive.role}}.`,
    );
    console.log("  is_active_tenant=true on that row — no auto-election needed.");
  } else {
    // No row flagged active — replay the auto-election logic from
    // api/auth/_handlers/session.ts::electDefaultMembership.
    const elected = electDefault(live);
    if (elected && elected.tenantName) {
      console.log(
        `  No membership flagged is_active_tenant=true, but ${live.length} live membership(s) exist.`,
      );
      console.log(
        `  Auto-election will pick tenant_id=${elected.tenantId} (${elected.tenantName})`,
      );
      console.log(
        `  reason: newest joinedAt (${elected.joinedAt?.toISOString() ?? "?"}), tiebreaker lowest tenant_id.`,
      );
      console.log(
        `\n  Verdict: Session will return activeTenant={id:${elected.tenantId}, name:${elected.tenantName}, role:${elected.role}} after the post-0.14 fix.`,
      );
      console.log(
        "  (Pre-fix versions returned activeTenant=null and bounced the user to /signup/workspace.)",
      );
      console.log("\n  To pin the active tenant directly (data fix, instead of relying on auto-election):");
      console.log(`    BEGIN;`);
      console.log(`    UPDATE tenant_members SET is_active_tenant = false WHERE user_id = '${userRow.id}';`);
      console.log(
        `    UPDATE tenant_members SET is_active_tenant = true WHERE user_id = '${userRow.id}' AND tenant_id = '${elected.tenantId}';`,
      );
      console.log(`    COMMIT;`);
    }
  }

  await closeDb();
}

/** Mirror of api/auth/_handlers/session.ts::electDefaultMembership. */
function electDefault(live: Membership[]): Membership | null {
  if (live.length === 0) return null;
  const sorted = [...live].sort((a, b) => {
    const ta = a.joinedAt?.getTime() ?? 0;
    const tb = b.joinedAt?.getTime() ?? 0;
    if (tb !== ta) return tb - ta;
    return a.tenantId < b.tenantId ? -1 : a.tenantId > b.tenantId ? 1 : 0;
  });
  return sorted[0];
}

function banner(title: string): void {
  console.log(`\n== ${title} ==`);
}

function printRow(obj: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(obj)) {
    let printed: string;
    if (v instanceof Date) printed = v.toISOString();
    else if (v === null || v === undefined) printed = "-";
    else printed = String(v);
    console.log(`  ${k}: ${printed}`);
  }
}

main().catch((err) => {
  console.error("\n✗ diagnose-session failed:", err);
  process.exit(1);
});
