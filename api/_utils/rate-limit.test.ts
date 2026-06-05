import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit.js";

function req(headers: Record<string, string>): Request {
  return new Request("https://app.drafthr.io/api/auth/password", {
    method: "POST",
    headers,
  });
}

describe("rateLimit — client-IP keying is not spoofable via X-Forwarded-For", () => {
  it("keys on the LAST x-forwarded-for hop (proxy-appended), not the spoofable first", () => {
    const name = `t-${"xff"}-${Math.floor(performance.now())}`;
    const opts = { name, max: 2, windowMs: 60_000 };
    // Attacker rotates the LEFTMOST XFF value each request but the real
    // client IP (rightmost, appended by the platform proxy) is constant.
    const realIp = "203.0.113.7";
    expect(rateLimit(req({ "x-forwarded-for": `1.1.1.1, ${realIp}` }), opts)).toBeNull(); // 1
    expect(rateLimit(req({ "x-forwarded-for": `2.2.2.2, ${realIp}` }), opts)).toBeNull(); // 2
    // 3rd request from the same real IP, despite a fresh spoofed leftmost, is limited.
    const limited = rateLimit(req({ "x-forwarded-for": `3.3.3.3, ${realIp}` }), opts);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
  });

  it("prefers x-real-ip when present", () => {
    const name = `t-realip-${Math.floor(performance.now())}`;
    const opts = { name, max: 1, windowMs: 60_000 };
    expect(rateLimit(req({ "x-real-ip": "198.51.100.4" }), opts)).toBeNull();
    expect(rateLimit(req({ "x-real-ip": "198.51.100.4" }), opts)?.status).toBe(429);
  });

  it("separates distinct real client IPs into distinct buckets", () => {
    const name = `t-distinct-${Math.floor(performance.now())}`;
    const opts = { name, max: 1, windowMs: 60_000 };
    expect(rateLimit(req({ "x-real-ip": "10.0.0.1" }), opts)).toBeNull();
    // A genuinely different client is not affected by the first's bucket.
    expect(rateLimit(req({ "x-real-ip": "10.0.0.2" }), opts)).toBeNull();
  });
});
