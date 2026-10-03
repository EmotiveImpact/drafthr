/** CI/local disposable database bootstrap. Never loads .env files, accepts a
 * remote URL or drops/replaces a database. Explicit consent plus _test suffix
 * prevents accidentally applying this to the app's local workspace database. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";

let client;
try {
  // URL parsing and driver errors can include credentials. Keep initialization
  // inside the same sanitized boundary as all test-database operations.
  const value = process.env.DRAFTHR_LOCAL_DATABASE_URL;
  if (process.env.DRAFTHR_ALLOW_TEST_DATABASE_MIGRATIONS !== "1" || !value) {
    throw new Error("Explicit local test migration consent and connection are required.");
  }
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1"].includes(url.hostname)
    || url.port !== "55432" || !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname) || url.search || url.hash) {
    throw new Error("Test migrations only accept localhost:55432 with a database name ending in _test.");
  }
  client = postgres(value, { max: 1, ssl: false, connect_timeout: 3 });
  await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await client`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`;
  const journal = JSON.parse(readFileSync(new URL("../drizzle/migrations/meta/_journal.json", import.meta.url), "utf8"));
  const applied = new Set((await client`SELECT hash FROM drizzle.__drizzle_migrations`).map(row => row.hash));
  for (const entry of journal.entries) {
    if (!/^\d{4}_[a-z0-9_]+$/.test(entry.tag)) throw new Error("Invalid migration tag");
    const content = readFileSync(new URL(`../drizzle/migrations/${entry.tag}.sql`, import.meta.url), "utf8");
    const hash = createHash("sha256").update(content).digest("hex");
    if (applied.has(hash)) continue;
    await client.begin(async tx => {
      for (const statement of content.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) await tx.unsafe(statement);
      await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entry.when})`;
    });
    console.log(`Applied test migration ${entry.tag}`);
  }
} catch {
  console.error("Test database setup failed. Check explicit migration consent, the disposable localhost:55432 _test database and migration history. No connection credentials or SQL details are printed.");
  process.exitCode = 1;
} finally {
  try { await client?.end(); } catch {
    console.error("Test database connection cleanup failed.");
    process.exitCode = 1;
  }
}
