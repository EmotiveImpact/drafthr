/**
 * Every credential, code and auth-email endpoint must go through the durable
 * (Postgres-backed) limiter, not only the per-instance in-memory one. The
 * limiter itself is covered in api/_utils/rate-limit.durable.test.ts; here we
 * only lock the wiring: when the durable check refuses, the handler returns
 * its 429 before doing any WorkOS work.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const limits = vi.hoisted(() => ({
  ipCalls: [] as string[],
  keyCalls: [] as { name: string; subject: string }[],
  refuseIp: false,
  refuseKeyName: null as string | null,
}));

function tooMany(): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60" },
  });
}

vi.mock("../../_utils/rate-limit.js", () => ({
  clientIp: () => "203.0.113.1",
  rateLimit: () => null,
  rateLimitDurable: async (_req: Request, opts: { name: string }) => {
    limits.ipCalls.push(opts.name);
    return limits.refuseIp ? tooMany() : null;
  },
  rateLimitKeyDurable: async (subject: string, opts: { name: string }) => {
    limits.keyCalls.push({ name: opts.name, subject });
    return limits.refuseKeyName === opts.name ? tooMany() : null;
  },
}));

const workosCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../_utils/workos.js", () => {
  const touch = () => {
    workosCalls.count += 1;
    throw new Error("WorkOS must not be called when rate limited");
  };
  return {
    getWorkos: () => ({
      userManagement: new Proxy({}, { get: () => touch }),
    }),
    buildSessionCookie: async () => "drafthr_session=x",
    buildClearCookie: () => "drafthr_oauth_state=; Max-Age=0",
    buildStateCookie: async () => "drafthr_oauth_state=x",
    readStateCookie: async () => "state",
    STATE_COOKIE: "drafthr_oauth_state",
  };
});

function post(path: string, body: unknown): Request {
  return new Request(`https://app.drafthr.io/api/auth/${path}`, {
    method: "POST",
    headers: { origin: "https://app.drafthr.io", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  limits.ipCalls = [];
  limits.keyCalls = [];
  limits.refuseIp = false;
  limits.refuseKeyName = null;
  workosCalls.count = 0;
});

const ipLimited: [string, string, () => Promise<{ POST: (r: Request) => Promise<Response> }>, unknown][] = [
  ["password", "auth-password", () => import("./password.js"), { email: "a@b.co", password: "x" }],
  ["sign-up", "auth-sign-up", () => import("./sign-up.js"), { email: "a@b.co", password: "12345678", firstName: "A", lastName: "B" }],
  ["verify-email", "auth-verify-email", () => import("./verify-email.js"), { code: "123456", userId: "user_1" }],
  ["resend-verification", "auth-resend-verification", () => import("./resend-verification.js"), { email: "a@b.co" }],
  ["password-reset-request", "auth-password-reset-request", () => import("./password-reset-request.js"), { email: "a@b.co" }],
  ["password-reset-confirm", "auth-password-reset-confirm", () => import("./password-reset-confirm.js"), { token: "t", password: "12345678" }],
  ["callback", "auth-callback", () => import("./callback.js"), { code: "c", state: "state" }],
];

describe("auth endpoints use the durable limiter", () => {
  it.each(ipLimited)("%s refuses with 429 when the durable per-IP check refuses", async (path, name, load, body) => {
    limits.refuseIp = true;
    const { POST } = await load();
    const res = await POST(post(path, body));
    expect(res.status).toBe(429);
    expect(limits.ipCalls).toContain(name);
    expect(workosCalls.count).toBe(0);
  });

  const perSubject: [string, string, () => Promise<{ POST: (r: Request) => Promise<Response> }>, unknown, string][] = [
    ["password", "auth-password-email", () => import("./password.js"), { email: "Victim@Acme.com", password: "x" }, "email:victim@acme.com"],
    ["sign-up", "auth-sign-up-email", () => import("./sign-up.js"), { email: "victim@acme.com", password: "12345678", firstName: "A", lastName: "B" }, "email:victim@acme.com"],
    ["resend-verification", "auth-resend-verification-email", () => import("./resend-verification.js"), { email: "victim@acme.com" }, "email:victim@acme.com"],
    ["password-reset-request", "auth-password-reset-email", () => import("./password-reset-request.js"), { email: "victim@acme.com" }, "email:victim@acme.com"],
    ["verify-email", "auth-verify-email-subject", () => import("./verify-email.js"), { code: "123456", userId: "user_1" }, "user:user_1"],
  ];

  it.each(perSubject)("%s also limits per account across IPs", async (path, name, load, body, subject) => {
    limits.refuseKeyName = name;
    const { POST } = await load();
    const res = await POST(post(path, body));
    expect(res.status).toBe(429);
    expect(limits.keyCalls).toContainEqual({ name, subject });
    expect(workosCalls.count).toBe(0);
  });
});
