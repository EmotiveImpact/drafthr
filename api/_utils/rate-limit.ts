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

export function rateLimit(req: Request, options: RateLimitOptions): Response | null {
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
