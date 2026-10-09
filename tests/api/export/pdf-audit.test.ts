// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  exportedHtmlMatchesStored,
  storedDraftSha256,
  type StoredSection,
} from "../../../api/_utils/export-integrity.js";

const { appendAuditEvent, db } = vi.hoisted(() => ({
  appendAuditEvent: vi.fn(async () => {}),
  db: {
    draftRows: [] as Array<{ id: string }>,
    sectionRows: [] as unknown[],
    calls: [] as string[],
    failSections: false,
  },
}));

vi.mock("../../../api/_utils/rate-limit.js", () => ({ rateLimit: () => null, clientIp: () => "203.0.113.9" }));
vi.mock("../../../api/_utils/request.js", () => ({ enforceSameOrigin: () => null }));
vi.mock("../../../api/_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({ ok: true, activeTenant: { id: "t1" }, userRow: { id: "u1" } }),
}));
vi.mock("../../../api/_utils/tsa.js", () => ({ requestTsr: async () => null, parseTsr: () => null }));
vi.mock("../../../src/db/audit.js", () => ({ appendAuditEvent }));
vi.mock("../../../src/db/index.js", () => ({
  getDb: () => {
    const chain = (table: string) => ({
      where: () => ({
        limit: async () => {
          db.calls.push(`${table}.limit`);
          return db.draftRows;
        },
        orderBy: async () => {
          db.calls.push(`${table}.orderBy`);
          if (db.failSections) throw new Error("connection terminated");
          return db.sectionRows;
        },
      }),
    });
    return {
      select: () => ({
        from: (t: { [k: symbol]: unknown }) => {
          const name = String(
            (t as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] ?? "unknown",
          );
          return chain(name);
        },
      }),
    };
  },
}));
vi.mock("@sparticuz/chromium-min", () => ({ default: { args: [], executablePath: async () => "/bin/true" } }));
vi.mock("puppeteer-core", () => ({
  default: {
    launch: async () => ({
      newPage: async () => ({
        setDefaultTimeout: () => {},
        setDefaultNavigationTimeout: () => {},
        setJavaScriptEnabled: async () => {},
        setRequestInterception: async () => {},
        on: () => {},
        setContent: async () => {},
        pdf: async () => new Uint8Array([37, 80, 68, 70]),
      }),
      close: async () => {},
    }),
  },
}));

import { POST } from "../../../api/export/pdf.js";

const DRAFT_UUID = "11111111-2222-4333-8444-555555555555";
const SECTIONS: StoredSection[] = [
  { sectionId: "opening", title: "Opening", html: "<p>Dear Jamie,</p>", position: 0 },
  {
    sectionId: "body",
    title: "Body",
    html: '<p>Your conduct on <strong>3 March</strong> breached policy <span class="figure-ref" data-fig-id="e1">[See Fig 1]</span>.</p>',
    position: 1,
  },
];

function request(html: string): Request {
  return new Request("https://app.example/api/export/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ html, filename: "x.pdf", draftId: DRAFT_UUID }),
  });
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test";
  appendAuditEvent.mockClear();
  db.draftRows = [{ id: DRAFT_UUID }];
  db.sectionRows = SECTIONS;
  db.calls = [];
  db.failSections = false;
});

describe("draft.exported audit entry", () => {
  it("records the hash of the STORED draft and that the rendered HTML matched it", async () => {
    const html =
      '<div><img src="data:image/png;base64,AAAA"></div><p>Dear Jamie,</p><p>Your conduct on <strong>3 March</strong> breached policy <span class="figure-ref" data-fig-id="e1">[See Fig 2]</span>.</p><hr><p>Disclaimer</p>';
    const res = await POST(request(html));
    expect(res.status).toBe(200);
    expect(appendAuditEvent).toHaveBeenCalledTimes(1);
    const payload = (appendAuditEvent.mock.calls[0] as unknown as [{ payload: Record<string, unknown>; kind: string }])[0];
    expect(payload.kind).toBe("draft.exported");
    expect(payload.payload.draftSha256).toBe(storedDraftSha256(SECTIONS));
    expect(payload.payload.renderedHtmlMatchesDraft).toBe(true);
    expect(payload.payload.storedSectionCount).toBe(2);
    expect(db.calls).toEqual(["drafts.limit", "sections.orderBy"]);
    expect(payload.payload.renderedHtmlSha256).not.toBe(payload.payload.draftSha256);
  });

  it("flags client HTML that does not carry the stored text, without trusting it for the hash", async () => {
    const res = await POST(request("<p>Dear Jamie,</p><p>Something entirely different.</p>"));
    expect(res.status).toBe(200);
    const payload = (appendAuditEvent.mock.calls[0] as unknown as [{ payload: Record<string, unknown> }])[0];
    expect(payload.payload.draftSha256).toBe(storedDraftSha256(SECTIONS));
    expect(payload.payload.renderedHtmlMatchesDraft).toBe(false);
  });

  it("still returns the PDF when the stored-draft lookup or the audit write fails", async () => {
    db.failSections = true;
    expect((await POST(request("<p>Dear Jamie,</p>"))).status).toBe(200);
    expect(appendAuditEvent).not.toHaveBeenCalled();

    db.failSections = false;
    appendAuditEvent.mockRejectedValueOnce(new Error("audit insert failed"));
    expect((await POST(request("<p>Dear Jamie,</p>"))).status).toBe(200);
  });

  it("writes no audit row for a draft outside the tenant, but still renders", async () => {
    db.draftRows = [];
    const res = await POST(request("<p>x</p>"));
    expect(res.status).toBe(200);
    expect(appendAuditEvent).not.toHaveBeenCalled();
    expect(db.calls).not.toContain("sections.orderBy");
  });
});

describe("exportedHtmlMatchesStored", () => {
  it("ignores suggestion marks in either state and merged accepted insertions", () => {
    const stored: StoredSection[] = [
      {
        sectionId: "body",
        title: "Body",
        position: 0,
        html: '<p>We will pay <del data-status="accepted">two</del><ins data-status="accepted">three</ins> weeks of notice.</p>',
      },
    ];
    expect(exportedHtmlMatchesStored("<p>We will pay three weeks of notice.</p>", stored)).toBe(true);
    expect(exportedHtmlMatchesStored("<p>We will pay three weeks.</p>", stored)).toBe(false);
  });

  it("requires the stored sections in order", () => {
    expect(exportedHtmlMatchesStored("<p>breached policy</p><p>Dear Jamie</p>", SECTIONS)).toBe(false);
  });

  it("decodes entities on both sides", () => {
    const stored: StoredSection[] = [{ sectionId: "b", title: "B", position: 0, html: "<p>Smith &amp; Co</p>" }];
    expect(exportedHtmlMatchesStored("<p>Smith &#38; Co</p>", stored)).toBe(true);
  });
});
