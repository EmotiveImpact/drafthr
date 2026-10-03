import { jsonError } from "./request.js";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../../src/db/index.js";

type RateLimitOptions = {
  name: string;
  max: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000;

/** Shared counters in every hosted environment. Memory is for local/test only;
 * a missing database or failed check must never silently disable protection. */
export async function rateLimit(req: Request, options: RateLimitOptions): Promise<Response | null> {
  const hosted = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV) || process.env.NODE_ENV === "production";
  const requested = process.env.DRAFTHR_RATE_LIMIT_BACKEND;
  const memory = !hosted && (requested === "memory" || (!requested && process.env.NODE_ENV === "test"));
  if (!Number.isSafeInteger(options.max) || options.max < 1 || !Number.isSafeInteger(options.windowMs) || options.windowMs < 1) {
    return unavailable();
  }
  if (memory) return memoryRateLimit(req, options);
  try {
    const key = createHash("sha256").update(JSON.stringify([options.name, options.max, options.windowMs, clientIp(req)])).digest("hex");
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '3000ms'`);
      // One atomic upsert: concurrent workers cannot each grant the last slot.
      // Capture one instant for every decision. Separate volatile clock reads
      // can straddle expiry and reset the window while retaining old hits.
      const rows = await tx.execute(sql`
        WITH rate_limit_now AS MATERIALIZED (SELECT clock_timestamp() AS at)
        INSERT INTO rate_limit_buckets (key, hits, expires_at)
        SELECT ${key}, 1, at + ${options.windowMs} * interval '1 millisecond' FROM rate_limit_now WHERE true
        ON CONFLICT (key) DO UPDATE SET
          hits = CASE WHEN rate_limit_buckets.expires_at <= (SELECT at FROM rate_limit_now) THEN 1 ELSE LEAST(rate_limit_buckets.hits + 1, ${options.max + 1}) END,
          expires_at = CASE WHEN rate_limit_buckets.expires_at <= (SELECT at FROM rate_limit_now)
            THEN (SELECT at FROM rate_limit_now) + ${options.windowMs} * interval '1 millisecond' ELSE rate_limit_buckets.expires_at END
        RETURNING hits, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - (SELECT at FROM rate_limit_now))))) AS retry_after
      `);
      const values = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
      const row = values[0] as { hits: number; retry_after: number } | undefined;
      if (!row || !Number.isFinite(Number(row.hits)) || !Number.isFinite(Number(row.retry_after))) throw new Error("Invalid rate limit result");
      // Lock cleanup candidates without waiting on another request's upsert.
      // Otherwise two workers refreshing old counters can each hold one row
      // and wait for the other's row during this cleanup, causing a deadlock.
      if (Date.now() >= nextCleanupAt) {
        await tx.execute(sql`DELETE FROM rate_limit_buckets WHERE key IN (
          SELECT key FROM rate_limit_buckets WHERE expires_at < clock_timestamp() - interval '1 hour'
          ORDER BY expires_at, key LIMIT 1000 FOR UPDATE SKIP LOCKED
        )`);
        nextCleanupAt = Date.now() + 60_000;
      }
      return row;
    });
    return Number(result.hits) > options.max ? limitedResponse(Number(result.retry_after)) : null;
  } catch {
    // No IP, credentials, request body, SQL parameters or provider errors in logs.
    console.error(JSON.stringify({ event: "rate_limit_unavailable", level: "error" }));
    return unavailable();
  }
}

let nextCleanupAt = 0;
function unavailable(): Response {
  const response = jsonError("Request protection is temporarily unavailable. Please retry shortly.", 503);
  response.headers.set("Retry-After", "5");
  return response;
}
function limitedResponse(seconds: number): Response {
  const response = jsonError("Too many requests", 429);
  response.headers.set("Retry-After", String(Math.max(1, Math.ceil(seconds))));
  return response;
}
function memoryRateLimit(req: Request, options: RateLimitOptions): Response | null {
  const now = Date.now();
  pruneBuckets(now);

  const key = `${options.name}:${clientIp(req)}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= options.max) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return limitedResponse(retryAfterSeconds);
}

/** Resolve the trustworthy client IP (proxy-set x-real-ip, else the last,
 *  proxy-appended x-forwarded-for hop). Exported so other handlers (e.g. the
 *  export audit IP) use the SAME spoof-resistant value as the rate limiter.
 *  (Senior sweep B14.) */
export function clientIp(req: Request): string {
  // Use the LAST hop of x-forwarded-for, not the first. The platform proxy
  // (Vercel) appends the real client IP as the rightmost entry; the leftmost
  // entries are client-supplied and trivially spoofable — keying on [0] lets
  // an attacker rotate `X-Forwarded-For: <random>` to land in a fresh bucket
  // every request and defeat the limit. x-real-ip (single value, proxy-set)
  // is preferred when present.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    return hops[hops.length - 1] || "unknown";
  }
  return "unknown";
}

function pruneBuckets(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;
  const overflow = buckets.size - MAX_BUCKETS + 1;
  for (const key of Array.from(buckets.keys()).slice(0, overflow)) {
    buckets.delete(key);
  }
}
