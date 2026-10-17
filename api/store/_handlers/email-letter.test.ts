/**
 * POST /api/store/email-letter ("Email it from DraftHR"): the letter goes to
 * the address stored on the letter only, inside the caller's workspace, never
 * for viewers, and a missing Resend key is a soft "not-configured" result.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const DRAFT_ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

const h = vi.hoisted(() => ({
  authed: true,
  role: "admin" as string,
  draft: null as Record<string, unknown> | null,
  sections: [] as { html: string; position: number }[],
  sendResult: { ok: true, id: "em_123" } as { ok: true; id: string } | { ok: false; error: string },
  sent: [] as Array<{ to: unknown; subject: string; html: string; text?: string; replyTo?: string }>,
  audits: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../_utils/rate-limit.js", () => ({
  rateLimit: () => null,
  rateLimitDurable: async () => null,
  rateLimitKeyDurable: async () => null,
}));

vi.mock("../../_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () =>
    h.authed
      ? {
          ok: true,
          session: { user: { id: "wos_1", email: "alex@harbourfoods.co.uk", firstName: "Alex", lastName: "Morgan" } },
          userRow: { id: "user_1", email: "alex@harbourfoods.co.uk", legalName: "Alex Morgan" },
          activeTenant: { id: "tenant_1", name: "Harbour Foods" },
          activeMember: { role: h.role },
          userType: "customer",
          canCreateTenant: true,
        }
      : { ok: false, response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) },
}));

vi.mock("../../_utils/email.js", () => ({
  sendEmail: async (opts: { to: unknown; subject: string; html: string; text?: string; replyTo?: string }) => {
    h.sent.push(opts);
    return h.sendResult;
  },
}));

vi.mock("../../../src/db/audit.js", () => ({
  appendAuditEvent: async (e: Record<string, unknown>) => {
    h.audits.push(e);
    return { id: "a", seq: 1, rowHash: "x", prevHash: "0", createdAt: new Date() };
  },
}));

vi.mock("../../../src/db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (h.draft ? [h.draft] : []),
          orderBy: async () => h.sections,
        }),
      }),
    }),
  }),
}));

function post(body: unknown): Request {
  return new Request("https://app.drafthr.io/api/store/email-letter", {
    method: "POST",
    headers: { origin: "https://app.drafthr.io", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function letter(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: DRAFT_ID,
    tenantId: "tenant_1",
    title: "Final written warning",
    letterType: "warning",
    mode: "employer",
    employeeJson: { legalName: "Jordan Hale", email: "jordan.hale@harbourfoods.co.uk" },
    employerJson: { legalName: "Harbour Foods Ltd" },
    answersJson: {},
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  h.authed = true;
  h.role = "admin";
  h.draft = letter();
  h.sections = [
    { position: 0, html: "<p>Dear Jordan,</p>" },
    {
      position: 1,
      html: '<p>This is a final written warning.<ins data-status="pending">Pending words.</ins><del data-status="pending"> Kept words.</del><ins data-status="accepted"> Accepted words.</ins></p>',
    },
  ];
  h.sendResult = { ok: true, id: "em_123" };
  h.sent = [];
  h.audits = [];
});

describe("POST /api/store/email-letter", () => {
  it("emails the stored address once, with a subject naming the letter, and writes the audit event", async () => {
    const { POST } = await import("./email-letter.js");
    const res = await POST(post({ draftId: DRAFT_ID, to: "jordan.hale@harbourfoods.co.uk" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "em_123", to: "jordan.hale@harbourfoods.co.uk" });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe("jordan.hale@harbourfoods.co.uk");
    expect(h.sent[0].subject).toBe("Final written warning from Harbour Foods Ltd");
    expect(h.sent[0].replyTo).toBe("alex@harbourfoods.co.uk");
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      tenantId: "tenant_1",
      kind: "draft.letter-emailed",
      subjectId: DRAFT_ID,
      payload: { to: "jordan.hale@harbourfoods.co.uk", messageId: "em_123" },
    });
  });

  it("sends the final text: accepted changes in, pending suggestions out, no markup", async () => {
    const { POST } = await import("./email-letter.js");
    await POST(post({ draftId: DRAFT_ID }));
    const text = h.sent[0].text ?? "";
    expect(text).toContain("This is a final written warning. Kept words. Accepted words.");
    expect(text).not.toContain("Pending words");
    expect(h.sent[0].html).not.toContain("<ins");
  });

  it("escapes letter text in the HTML body", async () => {
    h.sections = [{ position: 0, html: "<p>&lt;script&gt;alert(1)&lt;/script&gt; and 5 &gt; 3</p>" }];
    const { POST } = await import("./email-letter.js");
    await POST(post({ draftId: DRAFT_ID }));
    expect(h.sent[0].html).not.toContain("<script>");
    expect(h.sent[0].html).toContain("&lt;script&gt;");
  });

  it("returns the soft not-configured result when the Resend key is missing", async () => {
    h.sendResult = { ok: false, error: "not-configured" };
    const { POST } = await import("./email-letter.js");
    const res = await POST(post({ draftId: DRAFT_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "not-configured" });
    expect(h.audits).toHaveLength(0);
  });

  it("returns send-failed (not a 500) when the provider refuses", async () => {
    h.sendResult = { ok: false, error: "Resend 422: bad" };
    const { POST } = await import("./email-letter.js");
    const res = await POST(post({ draftId: DRAFT_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: "send-failed" });
  });

  it("refuses a letter in another workspace with 403", async () => {
    h.draft = letter({ tenantId: "tenant_2" });
    const { POST } = await import("./email-letter.js");
    const res = await POST(post({ draftId: DRAFT_ID }));
    expect(res.status).toBe(403);
    expect(h.sent).toHaveLength(0);
  });

  it("refuses a viewer with 403", async () => {
    h.role = "viewer";
    const { POST } = await import("./email-letter.js");
    const res = await POST(post({ draftId: DRAFT_ID }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "viewer" });
    expect(h.sent).toHaveLength(0);
  });

  it("returns 401 with no session", async () => {
    h.authed = false;
    const { POST } = await import("./email-letter.js");
    const res = await POST(post({ draftId: DRAFT_ID }));
    expect(res.status).toBe(401);
    expect(h.sent).toHaveLength(0);
  });

  it("returns 404 for an unknown or deleted letter", async () => {
    h.draft = null;
    const { POST } = await import("./email-letter.js");
    expect((await POST(post({ draftId: DRAFT_ID }))).status).toBe(404);
    h.draft = letter({ deletedAt: new Date() });
    expect((await POST(post({ draftId: DRAFT_ID }))).status).toBe(404);
    expect(h.sent).toHaveLength(0);
  });

  it("refuses when the letter has no address (422) or an invalid one (400)", async () => {
    const { POST } = await import("./email-letter.js");
    h.draft = letter({ employeeJson: { legalName: "Jordan Hale" } });
    const missing = await POST(post({ draftId: DRAFT_ID }));
    expect(missing.status).toBe(422);
    expect(await missing.json()).toMatchObject({ error: "no-recipient-email" });
    h.draft = letter({ employeeJson: { legalName: "Jordan Hale", email: "a@x.com, b@evil.example" } });
    expect((await POST(post({ draftId: DRAFT_ID }))).status).toBe(400);
    expect(h.sent).toHaveLength(0);
  });

  it.each(["a@x.com, b@evil.example", "Boss <a@x.com>", "not-an-email"])(
    "rejects a body address %j with 400 and sends nothing",
    async (to) => {
      const { POST } = await import("./email-letter.js");
      const res = await POST(post({ draftId: DRAFT_ID, to }));
      expect(res.status).toBe(400);
      expect(h.sent).toHaveLength(0);
    }
  );

  it("never relays to an address that is not the letter's own (409)", async () => {
    const { POST } = await import("./email-letter.js");
    const res = await POST(post({ draftId: DRAFT_ID, to: "someone@evil.example" }));
    expect(res.status).toBe(409);
    expect(h.sent).toHaveLength(0);
  });

  it("uses the employer's address on an employee's own letter", async () => {
    h.draft = letter({
      mode: "employee",
      employeeJson: { legalName: "Jordan Hale", email: "jordan@home.example" },
      employerJson: { legalName: "Harbour Foods Ltd", signatoryName: "Ruth Adeyemi" },
      answersJson: { recipientEmail: "ruth.adeyemi@harbourfoods.co.uk" },
    });
    const { POST } = await import("./email-letter.js");
    await POST(post({ draftId: DRAFT_ID }));
    expect(h.sent[0].to).toBe("ruth.adeyemi@harbourfoods.co.uk");
  });

  it("refuses an empty letter with 422", async () => {
    h.sections = [{ position: 0, html: "<p> </p>" }];
    const { POST } = await import("./email-letter.js");
    expect((await POST(post({ draftId: DRAFT_ID }))).status).toBe(422);
    expect(h.sent).toHaveLength(0);
  });

  it("refuses a cross-site request", async () => {
    const { POST } = await import("./email-letter.js");
    const res = await POST(
      new Request("https://app.drafthr.io/api/store/email-letter", {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ draftId: DRAFT_ID }),
      })
    );
    expect(res.status).toBe(403);
    expect(h.sent).toHaveLength(0);
  });
});
