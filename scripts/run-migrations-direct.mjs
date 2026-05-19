/**
 * Direct migration runner — bypasses drizzle-kit's migrate command which
 * hangs against Neon's pooled connection. Connects to the unpooled URL
 * with @neondatabase/serverless, runs every pending migration file from
 * drizzle/migrations/ in journal order, and records each one in
 * __drizzle_migrations so drizzle-kit migrate stays in sync going forward.
 *
 * Usage: node scripts/run-migrations-direct.mjs
 *
 * Idempotent — migrations that are already recorded in __drizzle_migrations
 * are skipped. Migrations that aren't recorded but were partially applied
 * (e.g. some statements ran before a previous crash) rely on the SQL files
 * using IF NOT EXISTS / IF NOT EXISTS guards on every statement, which
 * 0003 and 0004 do.
 */
import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("DATABASE_URL_UNPOOLED / DATABASE_URL not set in .env.local");
  process.exit(2);
}

// Use the `postgres` npm package (which drizzle-kit itself uses for
// migrations) instead of @neondatabase/serverless. The serverless HTTP
// driver silently no-ops on DDL like ALTER TABLE — see earlier debug
// session where ADD COLUMN IF NOT EXISTS reported success but never
// took effect. The `postgres` package speaks the real Postgres wire
// protocol and handles DDL + DO blocks correctly.
const sql = postgres(url, { ssl: "require", max: 1 });

// Bootstrap drizzle's migration tracker if it doesn't exist. (drizzle-kit
// migrate creates this lazily; we do the same so a fresh DB also works.)
await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
await sql`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )
`;

const journal = JSON.parse(
  readFileSync("drizzle/migrations/meta/_journal.json", "utf8"),
);
const entries = journal.entries ?? [];

// Drizzle's hash is sha256 of the SQL file content (NOT the file name).
function hashOf(content) {
  return createHash("sha256").update(content).digest("hex");
}

const applied = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
const appliedHashes = new Set(applied.map((r) => r.hash));

console.log(`drizzle journal entries: ${entries.length}`);
console.log(`already-applied migrations: ${applied.length}`);

for (const entry of entries) {
  const file = `drizzle/migrations/${entry.tag}.sql`;
  const content = readFileSync(file, "utf8");
  const hash = hashOf(content);

  if (appliedHashes.has(hash)) {
    console.log(`  - ${entry.tag}: already applied`);
    continue;
  }

  console.log(`  + ${entry.tag}: applying…`);

  // Drizzle generates SQL with --> statement-breakpoint markers between
  // statements. Split on those so we execute each one in its own
  // round-trip — Neon's serverless HTTP driver doesn't support multi-
  // statement strings.
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    // sql.unsafe runs a string that may contain semicolons etc, exactly
    // as written. Safe here because the input is our committed SQL file,
    // not user input. With the `postgres` package this routes through
    // the real wire protocol so DDL actually applies.
    await sql.unsafe(stmt);
  }

  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${Date.now()})
  `;
  console.log(`  ✓ ${entry.tag}: applied`);
}

console.log("done.");
await sql.end();
