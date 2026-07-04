/**
 * Tenant-isolation guard (static analysis test).
 *
 * Tenant isolation in this app is enforced per-handler: every query against
 * a tenant-scoped table must be constrained to the caller's tenant (or, for
 * the deliberately cross-tenant marketplace tables, to the caller's user /
 * booking-party). There is no Postgres RLS backstop (the Neon pooler runs in
 * transaction mode, where session-level RLS context doesn't hold), so the
 * ONLY thing preventing a cross-tenant leak is that each handler remembers
 * its scope clause.
 *
 * This test turns that convention into a build-enforced invariant. It scans
 * every handler under api/ for reads (`.from(<table>)`) of a tenant-scoped
 * table and asserts the same file also constrains that access. If someone
 * adds a new handler (or edits an existing one) that reads a tenant-scoped
 * table WITHOUT a recognised scope, this test fails — catching the exact
 * class of bug (a forgotten `where tenant_id = …`) that would otherwise be
 * a silent cross-tenant data leak.
 *
 * It is intentionally conservative: it asserts the *presence* of a scoping
 * signal in the file, not full dataflow correctness. That's enough to force
 * a human to look. When a handler legitimately scopes by something other
 * than tenantId (the marketplace user/booking-party model, or a parent-row
 * tenant check), that signal is in the recognised list below with a comment
 * explaining why it's sound. Adding a table read with no recognised signal
 * is a hard failure — you must either add real scoping or, if it's a genuine
 * exception, document it here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Drizzle table export names that carry a tenant_id column. A `.from(X)` on
 * any of these in a handler MUST be tenant-constrained.
 *
 * Cross-tenant-by-design marketplace tables (consultant_profiles,
 * consultant_bookings) are handled separately below — they scope by user /
 * booking-party rather than tenant, which is the correct model for a
 * marketplace that spans tenants.
 */
const TENANT_SCOPED_TABLES = [
  "drafts",
  "matters",
  "employees",
  "customTemplates",
  "invites",
  "auditEvents",
  "tenantMembers",
  "users",
] as const;

/**
 * Tables whose own rows have no tenant_id but which inherit isolation from a
 * parent row. A read is sound if the file ALSO reads the parent and checks
 * its tenant. (sections → drafts; section_versions → sections → drafts;
 * comments/evidence/approvals → drafts.)
 */
const PARENT_SCOPED_TABLES = ["sections", "sectionVersions", "comments", "evidence", "approvals"] as const;

/**
 * The marketplace tables. Reads are sound when scoped by the caller's user
 * id or by a booking-party ACL — NOT by tenant (the marketplace is global).
 */
const MARKETPLACE_TABLES = ["consultantProfiles", "consultantBookings"] as const;

/** Signals that a file constrains a tenant-scoped table read. */
const TENANT_SCOPE_SIGNALS = [
  /\.tenantId\b/, // eq(table.tenantId, …) or comparing draft.tenantId
  /activeTenant\.id/, // the canonical tenant value
  /tenantId,/, // select includes tenantId then compares
];

/**
 * Verified-sound exceptions: files that scope a tenant/parent-scoped table
 * read by something OTHER than a tenant filter, where that something has
 * been manually confirmed (by the security board) to be a correct
 * authorization. Keyed by the table being read → set of file basenames
 * allowed to read it, each with the reason. A NEW unscoped read of the same
 * table in a file NOT on this list still fails — you must verify it and add
 * it here (or add real tenant scoping).
 */
const VERIFIED_EXCEPTIONS: Record<string, Record<string, string>> = {
  drafts: {
    // Reads the draft only after verifying the share token AND
    // consultantUserId === auth.userRow.id (matter-scoped consultant access).
    "shared.ts": "share-token + consultantUserId ACL (matter-scoped)",
  },
  sections: {
    "shared.ts": "draft already authorized via share-token + consultant ACL",
  },
  users: {
    // Self-scoped: resolves the caller's own row by externalId / userRow.id.
    "session.ts": "self-scoped by session externalId",
    // Joins the requester/consultant identity onto already-authorized bookings.
    "inbox.ts": "users joined onto consultant-scoped bookings",
    "shared.ts": "users joined onto share-token-authorized booking",
    "list-and-create.ts": "users joined onto requester/tenant-scoped bookings",
    // session-with-tenant resolves + upserts the caller's own user row.
    "session-with-tenant.ts": "resolves the caller's own user row",
    // Internal email helper (not a request handler): resolves the two
    // parties' emails by users.id = booking.consultant/requesterUserId,
    // after the booking was authorized by its caller.
    "consultant-emails.ts": "resolves booking parties' emails by id",
    // Admin vetting queue — gated by requireAdmin (server-side
    // DRAFTHR_ADMIN_EMAILS allowlist), intentionally cross-tenant; joins
    // users to show the consultant's email to the admin.
    "admin-queue.ts": "admin-gated (requireAdmin), intentionally cross-tenant",
    // Billing customer get-or-create: reads/writes the caller's OWN user (or
    // tenant) row by primary key — subjectId is the authenticated caller's own
    // id/active tenant, passed by the handler. Self-scoped, not IDOR.
    "stripe-billing.ts": "self-scoped by PK (caller's own user/tenant id)",
  },
  // consultant_profiles is normally user-scoped; the admin endpoints read
  // it cross-tenant ON PURPOSE, gated by requireAdmin instead of by user.
  consultantProfiles: {
    "admin-queue.ts": "admin-gated (requireAdmin), cross-tenant vetting list",
    "admin-review.ts": "admin-gated (requireAdmin), updates any profile's status",
  },
};

function isExcepted(table: string, file: string): boolean {
  const base = file.split("/").pop() ?? file;
  return Boolean(VERIFIED_EXCEPTIONS[table]?.[base]);
}

/** Signals that a marketplace read is scoped by user / booking party. */
const MARKETPLACE_SCOPE_SIGNALS = [
  /userRow\.id/,
  /consultantUserId/,
  /requesterUserId/,
  /\.userId\b/,
  /status:\s*"published"|status,\s*"published"|eq\(consultantProfiles\.status/, // public listing: published-only
  /shareToken/, // share-token-scoped draft fetch
  /consultantProfiles\.id,\s*body\.consultantProfileId|consultantProfiles\.id,\s*booking/, // lookup by marketplace global id
];

/** Signals that a parent-scoped read checks the parent's tenant. */
const PARENT_SCOPE_SIGNALS = [
  /\.tenantId\b/,
  /activeTenant\.id/,
  /draftBelongsToTenant/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      out.push(...walk(p));
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

function readsTable(src: string, table: string): boolean {
  // Match `.from(table)` and `.from(\n  table)`; also join targets.
  const re = new RegExp(`\\.(from|leftJoin|innerJoin|rightJoin)\\(\\s*${table}\\b`);
  return re.test(src);
}

describe("tenant-isolation guard", () => {
  const files = walk(API_DIR);

  it("scans a non-trivial number of handler files (sanity)", () => {
    // If this drops to ~0 the walker is broken and the guard is a no-op.
    expect(files.length).toBeGreaterThan(15);
  });

  for (const table of TENANT_SCOPED_TABLES) {
    it(`every read of tenant-scoped table '${table}' is tenant-constrained`, () => {
      const offenders: string[] = [];
      for (const f of files) {
        const src = readFileSync(f, "utf8");
        if (!readsTable(src, table)) continue;
        if (isExcepted(table, f)) continue;
        const scoped = TENANT_SCOPE_SIGNALS.some((re) => re.test(src));
        if (!scoped) offenders.push(f.replace(API_DIR, "api"));
      }
      expect(
        offenders,
        `These files read '${table}' (tenant-scoped) without any tenant-scope signal ` +
          `(.tenantId / activeTenant.id). Add a 'where tenant_id = activeTenant.id' ` +
          `clause, or — if this is a verified exception — document it in ` +
          `tenant-isolation.guard.test.ts.\nOffenders:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  }

  for (const table of MARKETPLACE_TABLES) {
    it(`every read of marketplace table '${table}' is user/party-scoped`, () => {
      const offenders: string[] = [];
      for (const f of files) {
        const src = readFileSync(f, "utf8");
        if (!readsTable(src, table)) continue;
        // The email helper resolves rows by id from an already-authorized
        // booking; allow it explicitly.
        if (f.endsWith("consultant-emails.ts")) continue;
        if (isExcepted(table, f)) continue;
        const scoped =
          MARKETPLACE_SCOPE_SIGNALS.some((re) => re.test(src)) ||
          TENANT_SCOPE_SIGNALS.some((re) => re.test(src));
        if (!scoped) offenders.push(f.replace(API_DIR, "api"));
      }
      expect(
        offenders,
        `These files read marketplace table '${table}' without a user/booking-party ` +
          `scope. The marketplace is cross-tenant, so reads must be constrained by ` +
          `userRow.id / consultantUserId / requesterUserId / share token / ` +
          `published-status. Offenders:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  }

  for (const table of PARENT_SCOPED_TABLES) {
    it(`every read of parent-scoped table '${table}' checks a parent tenant`, () => {
      const offenders: string[] = [];
      for (const f of files) {
        const src = readFileSync(f, "utf8");
        if (!readsTable(src, table)) continue;
        if (isExcepted(table, f)) continue;
        const scoped = PARENT_SCOPE_SIGNALS.some((re) => re.test(src));
        if (!scoped) offenders.push(f.replace(API_DIR, "api"));
      }
      expect(
        offenders,
        `These files read parent-scoped table '${table}' without checking the parent ` +
          `row's tenant (.tenantId / draftBelongsToTenant). Offenders:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  }
});
