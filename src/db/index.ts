// Lazy Drizzle client over Neon's WebSocket pool. Importing this module is
// side-effect free; the pool is only opened on first getDb() call so the
// module is safe to import in environments without DATABASE_URL (tests,
// preview deployments before Marketplace provisioning).
import { drizzle } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { Pool } from "@neondatabase/serverless";
import postgres from "postgres";
import * as schema from "./schema.js";

export { schema };
export * from "./schema.js";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Driver-owned timeouts cancel connection/pool waiters instead of leaving a
// Promise.race loser alive to acquire a connection or execute a late write.
export const DATABASE_CONNECTION_TIMEOUT_MS = 3_000;

let _pool: Pool | null = null;
let _localSql: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

export function dbEnabled(): boolean {
  return Boolean(databaseUrl());
}

export function getDb(): Db {
  if (_db) return _db;
  const url = databaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR === "1") {
    _localSql = postgres(url, { max: 5, connect_timeout: DATABASE_CONNECTION_TIMEOUT_MS / 1000 });
    _db = drizzlePostgres(_localSql, { schema }) as unknown as Db;
    return _db;
  }
  _pool = new Pool({ connectionString: url, connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS });
  _db = drizzle(_pool, { schema });
  return _db;
}

/** Vercel dev can inject cloud DATABASE_URL values over shell env overrides. */
export function databaseUrl(): string | undefined {
  if (process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR !== "1") return process.env.DATABASE_URL;
  const url = process.env.DRAFTHR_LOCAL_DATABASE_URL;
  if (!url) throw new Error("Local demo auth requires DRAFTHR_LOCAL_DATABASE_URL");
  const parsed = new URL(url);
  if (!(["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.port === "55432")) {
    throw new Error("Local demo auth requires the disposable localhost database");
  }
  return url;
}

export async function closeDb(): Promise<void> {
  if (_localSql) {
    await _localSql.end();
    _localSql = null;
    _db = null;
  }
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
