// Lazy Drizzle client over Neon's WebSocket pool. Importing this module is
// side-effect free; the pool is only opened on first getDb() call so the
// module is safe to import in environments without DATABASE_URL (tests,
// preview deployments before Marketplace provisioning).
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as schema from "./schema.js";

export { schema };
export * from "./schema.js";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _pool: Pool | null = null;
let _db: Db | null = null;

export function dbEnabled(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  _pool = new Pool({ connectionString: url });
  _db = drizzle(_pool, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
