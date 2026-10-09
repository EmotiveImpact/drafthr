/**
 * POST /api/workspace/invite abuse controls: role gate, single-recipient
 * validation, durable per-workspace and per-user limits, and the email that
 * actually goes out (fixed subject, no user links in the body).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  role: "admin" as string,
  workspaceName: "Acme HR",
  inviterName: "Sarah Patel" as string | null,
  refuse: null as string | null,
  keyCalls: [] as { name: string; subject: string }[],
  sent: [] as { to: unknown; subject: string; html: string }[],
  inserted: [] as Record<string, unknown>[],
}));

vi.mock("../../_utils/rate-limit.js", () => ({
  rateLimit: () => null,
  rateLimitDurable: async () => null,
  rateLimitKeyDurable: async (subject: string, opts: { name: string }) => {
    h.keyCalls.push({ name: opts.name, subject });
    return h.refuse === opts.name
      ? new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 })
      : null;
  },
}));

vi.mock("../../_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({
    ok: true,
    session: { user: { id: "wos_1", email: "sarah@acme.com" } },
    userRow: { id: "user_1", email: "sarah@acme.com", legalName: h.inviterName },
    activeTenant: { id: "tenant_1", name: h.workspaceName },
    activeMember: { role: h.role },
    userType: "customer",
    canCreateTenant: true,
  }),
}));

vi.mock("../../_utils/email.js", () => ({
  sendEmail: async (opts: { to: unknown; subject: string; html: string }) => {
    h.sent.push(opts);
    return { ok: true, id: "em_1" };
  },
}));

vi.mock("../../../src/db/audit.js", () => ({
  appendAuditEvent: async () => ({ id: "a", seq: 1, rowHash: "x", prevHash: "0", createdAt: new Date() }),
}));

vi.mock("../../../src/db/index.js", () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        h.inserted.push(v);
        return {
          returning: async () => [
            { id: "inv_1", ...v, expiresAt: new Date("2026-11-01T00:00:00Z") },
          ],
        };
      },
    }),
  }),
}));

function post(body: unknown): Request {
  return new Request("https://app.drafthr.io/api/workspace/invite", {
    method: "POST",
    headers: { origin: "https://app.drafthr.io", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.role = "admin";
  h.workspaceName = "Acme HR";
  h.inviterName = "Sarah Patel";
  h.refuse = null;
  h.keyCalls = [];
  h.sent = [];
  h.inserted = [];
});

describe("POST /api/workspace/invite", () => {
  it("creates the invite and sends a mail with a fixed subject", async () => {
    const { POST } = await import("./invite.js");
    const res = await POST(post({ email: "new@acme.com", role: "drafter" }));
    expect(res.status).toBe(201);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe("new@acme.com");
    expect(h.sent[0].subject).toBe("You have been invited to a workspace on DraftHR");
  });

  it.each(["drafter", "reviewer", "viewer"])("refuses a %s with 403", async (role) => {
    h.role = role;
    const { POST } = await import("./invite.js");
    const res = await POST(post({ email: "new@acme.com", role: "viewer" }));
    expect(res.status).toBe(403);
    expect(h.sent).toHaveLength(0);
    expect(h.inserted).toHaveLength(0);
  });

  it.each([
    "a@acme.com, b@evil.example",
    "a@acme.com;b@evil.example",
    "Boss <a@acme.com>",
    "not-an-email",
    `${"x".repeat(320)}@acme.com`,
  ])("rejects recipient %j with 400", async (email) => {
    const { POST } = await import("./invite.js");
    const res = await POST(post({ email, role: "drafter" }));
    expect(res.status).toBe(400);
    expect(h.sent).toHaveLength(0);
  });

  it("applies durable per-workspace and per-user limits", async () => {
    const { POST } = await import("./invite.js");
    await POST(post({ email: "new@acme.com", role: "drafter" }));
    expect(h.keyCalls).toContainEqual({ name: "workspace-invite-tenant", subject: "tenant:tenant_1" });
    expect(h.keyCalls).toContainEqual({ name: "workspace-invite-user", subject: "user:user_1" });
  });

  it.each(["workspace-invite-tenant", "workspace-invite-user"])(
    "returns 429 and sends nothing when %s is exhausted",
    async (name) => {
      h.refuse = name;
      const { POST } = await import("./invite.js");
      const res = await POST(post({ email: "new@acme.com", role: "drafter" }));
      expect(res.status).toBe(429);
      expect(h.sent).toHaveLength(0);
      expect(h.inserted).toHaveLength(0);
    },
  );

  it("keeps attacker text out of the subject and strips links from the body", async () => {
    h.workspaceName = "URGENT payroll update: verify at https://evil.example/login now";
    h.inviterName = "IT Support (visit pay-now.co.uk)";
    const { POST } = await import("./invite.js");
    const res = await POST(post({ email: "victim@acme.com", role: "drafter" }));
    expect(res.status).toBe(201);
    const mail = h.sent[0];
    expect(mail.subject).not.toMatch(/URGENT|payroll|IT Support/);
    expect(mail.html).not.toContain("evil.example");
    expect(mail.html).not.toContain("pay-now.co.uk");
    // The only links are the server-built invite URL (and the font stylesheet).
    const hrefs = Array.from(mail.html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
    for (const href of hrefs) {
      expect(href.startsWith("https://app.drafthr.io/join/") || href.startsWith("https://fonts.")).toBe(true);
    }
  });
});
