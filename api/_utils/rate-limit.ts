/**
 * Rate limiting.
 *
 * Two layers:
 *   - `rateLimit(req, opts)` is the original synchronous, in-memory limiter.
 *     It is per serverless instance, so on its own it only blunts a burst
 *     that happens to land on one warm instance. Kept as-is for every
 *     existing call site and as the fast first check below.
 *   - `rateLimitDurable(req, opts)` (async) runs the in-memory check first and
 *     then increments a shared fixed-window counter in Postgres
 *     (`rate_limits`) with one atomic INSERT ... ON CONFLICT DO UPDATE ...
 *     RETURNING. That is the one that actually holds across instances, so use
 *     it for anything guarding credentials, codes or outbound email.
 *     `rateLimitKeyDurable(key, opts)` is the same check keyed on an arbitrary
 *     subject (an email address, a tenant, a user) instead of the client IP.
 *
 * Failure policy: if the database is unreachable the durable check fails OPEN
 * (logs with console.error and allows the request), leaving the in-memory
 * check as the only guard. An outage must not lock every user out of sign-in.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { dbEnabled, getDb } from "../../src/db/index.js";
import { jsonError } from "./request.js";

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
// Prune windows older than this, roughly once every PRUNE_EVERY calls.
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;
const PRUNE_EVERY = 200;
let callsSincePrune = 0;

export function rateLimit(req: Request, options: RateLimitOptions): Response | null {
  return memoryHit(`${options.name}:${clientIp(req)}`, options);
}

/**
 * In-memory check, then the shared Postgres counter. Same options and the same
 * 429 response shape as `rateLimit`, so swapping a call site is
 * `rateLimit(req, o)` to `await rateLimitDurable(req, o)`.
 */
export async function rateLimitDurable(
  req: Request,
  options: RateLimitOptions,
): Promise<Response | null> {
  return checkDurable(options.name, `ip:${clientIp(req)}`, options);
}

/**
 * Durable limit on an arbitrary subject (for example `email:alice@acme.com`
 * or `tenant:<uuid>`), independent of the caller's IP. Use alongside the IP
 * limit so a distributed attacker cannot spread guesses over many addresses.
 */
export async function rateLimitKeyDurable(
  subject: string,
  options: RateLimitOptions,
): Promise<Response | null> {
  return checkDurable(options.name, subject, options);
}

async function checkDurable(
  name: string,
  subject: string,
  options: RateLimitOptions,
): Promise<Response | null> {
  const memory = memoryHit(`${name}:${subject}`, options);
  if (memory) return memory;
  if (!dbEnabled()) return null;

  const now = Date.now();
  const windowStartMs = Math.floor(now / options.windowMs) * options.windowMs;
  const durableKey = durableRateLimitKey(name, subject);
  try {
    const db = getDb();
    const res = await db.execute(sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${durableKey}, ${new Date(windowStartMs).toISOString()}::timestamptz, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `);
    maybePrune(now);
    const count = readCount(res);
    if (count === null || count <= options.max) return null;
    return tooManyRequests(windowStartMs + options.windowMs - now);
  } catch (err) {
    console.error("[rate-limit] durable check failed; allowing request", options.name, err);
    return null;
  }
}

/** Stored key: the limit name in clear (for operators) plus a sha256 of the
 *  subject, so the table never holds raw IPs or email addresses and a client
 *  cannot bloat it with an oversized subject. */
export function durableRateLimitKey(name: string, subject: string): string {
  return `${name.slice(0, 80)}:${createHash("sha256").update(subject).digest("hex")}`;
}

function readCount(res: unknown): number | null {
  const rows = (res as { rows?: unknown[] })?.rows ?? (Array.isArray(res) ? res : []);
  const row = rows[0] as { count?: unknown } | undefined;
  if (!row) return null;
  const n = Number(row.count);
  return Number.isFinite(n) ? n : null;
}

function maybePrune(now: number): void {
  callsSincePrune += 1;
  if (callsSincePrune < PRUNE_EVERY) return;
  callsSincePrune = 0;
  const cutoff = new Date(now - PRUNE_OLDER_THAN_MS).toISOString();
  // Fire and forget: pruning is housekeeping and must never slow a request.
  void Promise.resolve()
    .then(() => getDb().execute(sql`DELETE FROM rate_limits WHERE window_start < ${cutoff}::timestamptz`))
    .catch((err) => console.error("[rate-limit] prune failed", err));
}

function memoryHit(key: string, options: RateLimitOptions): Response | null {
  const now = Date.now();
  pruneBuckets(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= options.max) return null;
  return tooManyRequests(bucket.resetAt - now);
}

function tooManyRequests(retryAfterMs: number): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const response = jsonError("Too many requests", 429);
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
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
