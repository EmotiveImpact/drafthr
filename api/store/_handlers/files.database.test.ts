// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../../../src/db/index";
import { tenants, users, drafts, workspaceFiles, auditEvents } from "../../../src/db/schema";
import * as audit from "../../../src/db/audit";
import { GET, POST, PATCH } from "./files";
import { POST as saveDraft } from "./drafts";
import type { Draft } from "../../../src/lib/letters/types";
import { workspaceRecoveryCopy } from "../../../src/lib/workspace-recovery-copy";

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", role: "owner" }));
vi.mock("../../_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: async () => ({ ok: true, activeTenant: { id: auth.tenantId }, userRow: { id: auth.userId }, activeMember: { role: auth.role } }),
}));

describe.skipIf(!process.env.DRAFTHR_LOCAL_DATABASE_URL)("private files against isolated local storage and Postgres", () => {
  const tenantA = crypto.randomUUID(), tenantB = crypto.randomUUID(), userId = crypto.randomUUID(), draftA = crypto.randomUUID(), draftB = crypto.randomUUID();
  let root: string;
  let testClient = 0;
  const origin = "http://localhost:5273", bytes = new TextEncoder().encode("Fictional evidence and export verification.\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const snapshot = (id: string) => ({ id, mode: "employer", title: "Original title", letterType: "offer", context: { jurisdiction: "UK" }, employer: {}, employee: { legalName: "Fictional person" }, answers: {}, sections: [], evidence: [], createdAt: 1, updatedAt: 2 });
  const request = (method: string, body?: unknown, query = "", tenantId = auth.tenantId) => new Request(`${origin}/api/store/files${query}`, {
    method, headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenantId, "X-Real-IP": `192.0.2.${testClient}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const prepare = (overrides: Record<string, unknown> = {}) => ({ action: "prepare", id: crypto.randomUUID(), draftId: draftA,
    purpose: "export", format: "txt", filename: "fictional.txt", contentType: "text/plain", size: bytes.length, sha256: digest, draftRevision: 1, ...overrides });
  const upload = (id: string, body = bytes) => PATCH(new Request(`${origin}/api/store/files?id=${id}`, {
    method: "PATCH", headers: { Origin: origin, "X-Workspace-ID": auth.tenantId, "X-Real-IP": `192.0.2.${testClient}` }, body,
  }));
  const complete = (id: string) => POST(request("POST", { action: "complete", id }));
  async function ready(body = prepare()) {
    expect((await POST(request("POST", body))).status).toBe(200);
    expect((await upload(body.id)).status).toBe(200);
    const result = await complete(body.id); expect(result.status).toBe(200);
    return (await result.json() as { file: { id: string } }).file;
  }
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "drafthr-file-tests-"));
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1"); vi.stubEnv("DRAFTHR_LOCAL_FILE_ROOT", root);
    vi.stubEnv("DRAFTHR_DATABASE_WORKSPACE", "true"); vi.stubEnv("DRAFTHR_DATABASE_DRAFTS", "true");
    vi.stubEnv("DRAFTHR_ENFORCE_PAYWALL", "false"); vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "false");
    await getDb().insert(tenants).values([{ id: tenantA, name: "File test A" }, { id: tenantB, name: "File test B" }]);
    await getDb().insert(users).values({ id: userId, externalId: `files-test-${userId}` });
    await getDb().insert(drafts).values([
      { id: draftA, tenantId: tenantA, authorUserId: userId, mode: "employer", letterType: "offer", contextJson: snapshot(draftA).context, snapshotJson: snapshot(draftA), revision: 1 },
      { id: draftB, tenantId: tenantB, authorUserId: userId, mode: "employer", letterType: "offer", contextJson: snapshot(draftB).context, snapshotJson: snapshot(draftB), revision: 1 },
    ]);
  });
  beforeEach(async () => {
    // Independent cases do not share one IP budget; rate limiting remains enabled.
    testClient++;
    auth.tenantId = tenantA; auth.userId = userId; auth.role = "owner";
    await getDb().update(drafts).set({ revision: 1, snapshotJson: snapshot(draftA), deletedAt: null }).where(eq(drafts.id, draftA));
  });
  afterAll(async () => {
    await getDb().delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    await getDb().delete(users).where(eq(users.id, userId)); await closeDb();
    if (root) await rm(root, { recursive: true, force: true }); // Only this suite's mkdtemp directory.
    vi.unstubAllEnvs();
  });

  it("returns the exact immutable bytes and server-captured source revision after later edits", async () => {
    const file = await ready();
    await getDb().update(drafts).set({ revision: 2, snapshotJson: { ...snapshot(draftA), title: "Later title" } }).where(eq(drafts.id, draftA));
    const read = await GET(request("GET", undefined, `?id=${file.id}`));
    expect(read.status).toBe(200); expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes);
    expect(read.headers.get("cache-control")).toBe("private, no-store");
    expect(read.headers.get("content-disposition")).toContain("attachment;");
    expect(read.headers.get("content-security-policy")).toContain("sandbox");
    const [stored] = await getDb().select().from(workspaceFiles).where(eq(workspaceFiles.id, file.id));
    expect(stored.snapshotJson?.title).toBe("Original title"); expect(stored.draftRevision).toBe(1);
    expect((await upload(file.id)).status).toBe(409);
  });
  it("does not expose pending bytes, and retries completion without duplicate audit records", async () => {
    const body = prepare(); await POST(request("POST", body)); await upload(body.id);
    expect((await GET(request("GET", undefined, `?id=${body.id}`))).status).toBe(404);
    expect((await complete(body.id)).status).toBe(200); expect((await complete(body.id)).status).toBe(200);
    const rows = await getDb().select().from(auditEvents).where(and(eq(auditEvents.tenantId, tenantA), eq(auditEvents.kind, "draft.exported")));
    expect(rows.filter(row => row.payloadJson?.fileId === body.id)).toHaveLength(1);
  });

  it("discovers interrupted evidence uploads without exposing bytes or other uploaders' pending work", async () => {
    const body = prepare({ purpose: "evidence", format: undefined });
    expect((await POST(request("POST", body))).status).toBe(200);
    expect((await upload(body.id)).status).toBe(200);
    const list = async () => (await (await GET(request("GET", undefined, `?purpose=evidence&draftId=${draftA}&recovery=true`))).json()) as { files: Array<{ id: string; status: string; completedAt: number | null }> };
    expect((await list()).files.find(file => file.id === body.id)).toMatchObject({ status: "pending", completedAt: null });
    expect((await GET(request("GET", undefined, `?id=${body.id}`))).status).toBe(404);
    auth.userId = crypto.randomUUID();
    expect((await list()).files.some(file => file.id === body.id)).toBe(false);
    expect((await complete(body.id)).status).toBe(403);
    auth.userId = userId;
    expect((await complete(body.id)).status).toBe(200);
    expect((await list()).files.find(file => file.id === body.id)).toMatchObject({ status: "ready", completedAt: expect.any(Number) });
    const [draft] = await getDb().select().from(drafts).where(eq(drafts.id, draftA));
    expect(draft.snapshotJson?.evidence).toEqual([]); // Discovery/completion does not silently attach.
    expect(new Uint8Array(await (await GET(request("GET", undefined, `?id=${body.id}`))).arrayBuffer())).toEqual(bytes);
  });
  it("requires an active same-tenant evidence draft for recovery and excludes staged imports", async () => {
    expect((await GET(request("GET", undefined, "?purpose=evidence&recovery=true"))).status).toBe(400);
    expect((await GET(request("GET", undefined, `?purpose=export&draftId=${draftA}&recovery=true`))).status).toBe(400);
    expect((await GET(request("GET", undefined, `?purpose=evidence&draftId=${draftB}&recovery=true`))).status).toBe(404);
    const staged = prepare({ action: "prepare-import", draftId: draftA, importToken: crypto.randomUUID(), purpose: "evidence", format: undefined, draftRevision: 0 });
    await ready(staged);
    const list = await GET(request("GET", undefined, `?purpose=evidence&draftId=${draftA}&recovery=true`));
    expect((await list.json() as { files: Array<{ id: string }> }).files.some(file => file.id === staged.id)).toBe(false);
    await getDb().update(drafts).set({ deletedAt: new Date() }).where(eq(drafts.id, draftA));
    expect((await GET(request("GET", undefined, `?purpose=evidence&draftId=${draftA}&recovery=true`))).status).toBe(404);
  });

  it("stages import bytes without creating a draft, verifies privately and attaches atomically", async () => {
    const target = crypto.randomUUID(), token = crypto.randomUUID();
    const body = prepare({ action: "prepare-import", draftId: target, importToken: token, purpose: "evidence", format: undefined, draftRevision: 0 });
    await ready(body);
    expect(await getDb().select().from(drafts).where(eq(drafts.id, target))).toHaveLength(0);
    expect((await GET(request("GET", undefined, `?id=${body.id}`))).status).toBe(404);
    expect((await GET(request("GET", undefined, `?id=${body.id}&importToken=${crypto.randomUUID()}`))).status).toBe(404);
    const staged = await GET(request("GET", undefined, `?id=${body.id}&importToken=${token}`));
    expect(staged.status).toBe(200); expect(new Uint8Array(await staged.arrayBuffer())).toEqual(bytes);
    const listing = await GET(request("GET", undefined, "?purpose=evidence"));
    expect((await listing.json() as { files: Array<{ id: string }> }).files.some(file => file.id === body.id)).toBe(false);
    const save = await saveDraft(new Request(`${origin}/api/store/drafts`, { method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenantA }, body: JSON.stringify({ id: target, baseRevision: 0,
        snapshot: { ...snapshot(target), evidence: [{ id: "legacy", kind: "document", content: "", fileId: body.id }] } }) }));
    expect(save.status).toBe(201);
    const [attached] = await getDb().select().from(workspaceFiles).where(eq(workspaceFiles.id, body.id));
    expect(attached.draftId).toBe(target); expect(attached.importDraftId).toBe(target);
    expect((await GET(request("GET", undefined, `?id=${body.id}`))).status).toBe(200);
    expect((await POST(request("POST", body))).status).toBe(200); // Same receipt remains retryable after attachment.
  });
  it("never lets a different importer, draft or workspace adopt staged bytes", async () => {
    const target = crypto.randomUUID(), token = crypto.randomUUID();
    const body = prepare({ action: "prepare-import", draftId: target, importToken: token, purpose: "evidence", format: undefined, draftRevision: 0 });
    await ready(body);
    const attach = (id: string) => saveDraft(new Request(`${origin}/api/store/drafts`, { method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": auth.tenantId }, body: JSON.stringify({ id, baseRevision: 0,
        snapshot: { ...snapshot(id), evidence: [{ id: "legacy", kind: "document", content: "", fileId: body.id }] } }) }));
    expect((await attach(crypto.randomUUID())).status).toBe(422);
    auth.userId = crypto.randomUUID();
    expect((await GET(request("GET", undefined, `?id=${body.id}&importToken=${token}`))).status).toBe(404);
    expect((await attach(target)).status).toBe(422);
    auth.userId = userId; auth.tenantId = tenantB;
    expect((await GET(request("GET", undefined, `?id=${body.id}&importToken=${token}`))).status).toBe(404);
    expect((await attach(target)).status).toBe(422);
  });
  it("retains staged ownership when the destination draft transaction rolls back", async () => {
    const target = crypto.randomUUID();
    const body = prepare({ action: "prepare-import", draftId: target, importToken: crypto.randomUUID(), purpose: "evidence", format: undefined, draftRevision: 0 });
    await ready(body);
    const failingAudit = vi.spyOn(audit, "appendAuditEvent").mockRejectedValueOnce(new Error("Audit unavailable"));
    try {
      const save = await saveDraft(new Request(`${origin}/api/store/drafts`, { method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenantA }, body: JSON.stringify({ id: target, baseRevision: 0,
          snapshot: { ...snapshot(target), evidence: [{ id: "legacy", kind: "document", content: "", fileId: body.id }] } }) }));
      expect(save.status).toBeGreaterThanOrEqual(500);
      expect(await getDb().select().from(drafts).where(eq(drafts.id, target))).toHaveLength(0);
      const [staged] = await getDb().select().from(workspaceFiles).where(eq(workspaceFiles.id, body.id));
      expect(staged.draftId).toBeNull(); expect(staged.status).toBe("ready");
    } finally { failingAudit.mockRestore(); }
  });
  it("rejects invalid staging metadata and changed idempotency content", async () => {
    const base = prepare({ action: "prepare-import", draftId: crypto.randomUUID(), importToken: crypto.randomUUID(), purpose: "evidence", format: undefined, draftRevision: 0 });
    for (const changes of [{ importToken: undefined }, { purpose: "export", format: "txt" }, { draftRevision: 1 }, { action: "prepare" }]) {
      expect((await POST(request("POST", { ...base, ...changes }))).status).toBe(400);
    }
    expect((await POST(request("POST", base))).status).toBe(200);
    expect((await upload(base.id)).status).toBe(200);
    expect((await POST(request("POST", base))).status).toBe(200); // Interrupted completion: same pending upload.
    expect((await complete(base.id)).status).toBe(200);
    expect((await POST(request("POST", { ...base, sha256: "a".repeat(64) }))).status).toBe(409);
    expect((await POST(request("POST", { ...base, importToken: crypto.randomUUID() }))).status).toBe(409);
  });
  it("round-trips a six-megabyte legacy file outside the JSON request body", async () => {
    const large = new Uint8Array(6 * 1024 * 1024).fill(65), token = crypto.randomUUID();
    const body = prepare({ action: "prepare-import", draftId: crypto.randomUUID(), importToken: token, purpose: "evidence", format: undefined,
      draftRevision: 0, size: large.length, sha256: createHash("sha256").update(large).digest("hex") });
    expect((await POST(request("POST", body))).status).toBe(200);
    expect((await upload(body.id, large)).status).toBe(200);
    expect((await complete(body.id)).status).toBe(200);
    const response = await GET(request("GET", undefined, `?id=${body.id}&importToken=${token}`));
    expect(response.status).toBe(200);
    expect(createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex")).toBe(body.sha256);
  });
  it("serves exact authenticated byte ranges and rejects ambiguous or invalid ranges", async () => {
    const file = await ready();
    const ranged = request("GET", undefined, `?id=${file.id}`); ranged.headers.set("Range", "bytes=1-3");
    const response = await GET(ranged);
    expect(response.status).toBe(206); expect(response.headers.get("Content-Range")).toBe(`bytes 1-3/${bytes.length}`);
    expect(response.headers.get("Content-Length")).toBe("3"); expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes.slice(1, 4));
    for (const value of ["bytes=3-1", "bytes=0-9999", "bytes=0-1,3-4", "bytes=-3", "bytes=0-"]) {
      const invalid = request("GET", undefined, `?id=${file.id}`); invalid.headers.set("Range", value);
      expect((await GET(invalid)).status).toBe(416);
    }
  });
  it("migrates a large browser attachment through the real client and database handlers before publishing its draft", async () => {
    // Runtime integration of the browser module; don't add DOM dependencies to
    // the production API TypeScript project just to type-check this fixture.
    const clientModule = "../../../src/lib/storage/legacy-file-import";
    const { importLegacyDraftFiles, stagedFileUploader } = await import(clientModule);
    const large = Buffer.alloc(6 * 1024 * 1024, 65), target = crypto.randomUUID(), token = crypto.randomUUID();
    const source = { ...snapshot(target), evidence: [{ id: "legacy", kind: "document", content: "Fictional migration test", filename: "large.txt",
      fileDataUrl: `data:text/plain;base64,${large.toString("base64")}`, uploadedAt: 1, includeVerbatim: false }] } as unknown as Draft;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers); if (init.method === "POST" || init.method === "PATCH") headers.set("Origin", origin);
      const req = new Request(new URL(url, origin), { ...init, headers });
      return init.method === "POST" ? POST(req) : init.method === "PATCH" ? PATCH(req) : GET(req);
    }));
    try {
      const imported = await importLegacyDraftFiles(source, tenantA, token, stagedFileUploader(tenantA, () => {}), () => {});
      expect(JSON.stringify(imported).length).toBeLessThan(2000);
      expect(source.evidence![0].fileDataUrl).toContain("data:text/plain");
      expect(await getDb().select().from(drafts).where(eq(drafts.id, target))).toHaveLength(0);
      const saved = await saveDraft(new Request(`${origin}/api/store/drafts`, { method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenantA },
        body: JSON.stringify({ id: target, baseRevision: 0, snapshot: imported }) }));
      expect(saved.status).toBe(201);
      const [row] = await getDb().select().from(drafts).where(eq(drafts.id, target));
      expect(JSON.stringify(row.snapshotJson)).not.toContain("data:text/plain");
      expect(row.snapshotJson).toEqual(imported);
      const loaded = await GET(request("GET", undefined, `?id=${imported.evidence![0].fileId}`));
      expect(Buffer.from(await loaded.arrayBuffer()).equals(large)).toBe(true);
      const retried = await importLegacyDraftFiles(source, tenantA, token, stagedFileUploader(tenantA, () => {}), () => {});
      expect(retried).toEqual(imported);
    } finally { vi.unstubAllGlobals(); }
  });
  it("rejects wrong size/hash and never marks an unverified file ready", async () => {
    const body = prepare(); await POST(request("POST", body));
    expect((await upload(body.id, new Uint8Array(bytes.length + 1))).status).toBe(413);
    expect((await upload(body.id, new Uint8Array(bytes.length))).status).toBe(503);
    expect((await complete(body.id)).status).toBe(503);
    const [row] = await getDb().select().from(workspaceFiles).where(eq(workspaceFiles.id, body.id));
    expect(row.status).toBe("pending");
  });
  it("rejects stale source revisions, cross-tenant draft IDs, malformed names and unsupported files", async () => {
    for (const [overrides, status] of [
      [{ draftRevision: 2 }, 409], [{ draftId: draftB }, 404], [{ filename: "../../secret" }, 400],
      [{ contentType: "text/html" }, 415], [{ purpose: "evidence", format: undefined, size: 11 * 1024 * 1024 }, 415],
    ] as const) expect((await POST(request("POST", prepare(overrides)))).status).toBe(status);
  });
  it("enforces workspace pins and denies viewer uploads while permitting authenticated reads", async () => {
    const file = await ready(); auth.role = "viewer";
    expect((await POST(request("POST", prepare()))).status).toBe(403);
    expect((await GET(request("GET", undefined, `?id=${file.id}`))).status).toBe(200);
    expect((await GET(request("GET", undefined, `?id=${file.id}`, tenantB))).status).toBe(409);
    const link = await GET(new Request(`${origin}/api/store/files?id=${file.id}&workspaceId=${tenantA}`));
    expect(link.status).toBe(200);
  });
  it("does not list, download, finish, or reuse another tenant's upload ID", async () => {
    const body = prepare(); await ready(body); auth.tenantId = tenantB;
    expect((await GET(request("GET", undefined, `?id=${body.id}`))).status).toBe(404);
    expect((await complete(body.id)).status).toBe(404);
    expect((await POST(request("POST", { ...body, draftId: draftB }))).status).toBe(404);
    expect((await (await GET(request("GET"))).json() as { files: unknown[] }).files).toEqual([]);
  });
  it("preserves completed exports when a draft is soft-deleted but hides its evidence", async () => {
    const exported = await ready(), evidence = await ready(prepare({ purpose: "evidence", format: undefined }));
    await getDb().update(drafts).set({ deletedAt: new Date() }).where(eq(drafts.id, draftA));
    expect((await GET(request("GET", undefined, `?id=${exported.id}`))).status).toBe(200);
    expect((await GET(request("GET", undefined, `?id=${evidence.id}`))).status).toBe(404);
  });
  it("rolls completion back if its authoritative audit fails", async () => {
    const body = prepare(); await POST(request("POST", body)); await upload(body.id);
    const spy = vi.spyOn(audit, "appendAuditEvent").mockRejectedValueOnce(new Error("Injected audit failure"));
    try { expect((await complete(body.id)).status).toBe(503); } finally { spy.mockRestore(); }
    const [row] = await getDb().select().from(workspaceFiles).where(eq(workspaceFiles.id, body.id));
    expect(row.status).toBe("pending"); expect((await complete(body.id)).status).toBe(200);
  });
  it("rejects attaching evidence that is not a ready file owned by the workspace", async () => {
    const file = await ready(prepare({ purpose: "evidence", format: undefined }));
    const post = (fileId: string) => saveDraft(new Request(`${origin}/api/store/drafts`, { method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenantA },
      body: JSON.stringify({ id: draftA, baseRevision: 1, snapshot: { ...snapshot(draftA), evidence: [{ id: "ev", kind: "document", fileId, content: "", uploadedAt: 1, includeVerbatim: false }] } }),
    }));
    expect((await post(crypto.randomUUID())).status).toBe(422);
    expect((await post(file.id)).status).toBe(200);
  });
  it("keeps shared evidence downloadable from a copied draft when its source is soft-deleted", async () => {
    const file = await ready(prepare({ purpose: "evidence", format: undefined }));
    const copyId = crypto.randomUUID();
    const response = await saveDraft(new Request(`${origin}/api/store/drafts`, { method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenantA },
      body: JSON.stringify({ id: copyId, baseRevision: 0, snapshot: { ...snapshot(copyId), evidence: [{ id: "copy-evidence", kind: "document", fileId: file.id, content: "", uploadedAt: 1, includeVerbatim: false }] } }),
    }));
    expect(response.status).toBe(201);
    await getDb().update(drafts).set({ deletedAt: new Date() }).where(eq(drafts.id, draftA));
    expect((await GET(request("GET", undefined, `?id=${file.id}`))).status).toBe(200);
  });
  it("creates a fresh recovery draft after deletion and preserves exact evidence without approval or export claims", async () => {
    const file = await ready(prepare({ purpose: "evidence", format: undefined }));
    await getDb().update(drafts).set({ deletedAt: new Date(), revision: 2 }).where(eq(drafts.id, draftA));
    expect((await GET(request("GET", undefined, `?id=${file.id}`))).status).toBe(404);
    const original = { ...snapshot(draftA), reviewStatus: "approved", approvals: [{ id: "old-approval" }], exports: [{ id: "old-export" }],
      evidence: [{ id: "copy-evidence", kind: "document", fileId: file.id, content: "", uploadedAt: 1, includeVerbatim: false }] } as unknown as Draft;
    const copy = workspaceRecoveryCopy(`${userId}:${tenantA}`, "drafts", original) as Draft;
    const response = await saveDraft(new Request(`${origin}/api/store/drafts`, { method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "X-Workspace-ID": tenantA },
      body: JSON.stringify({ id: copy.id, baseRevision: 0, snapshot: copy }),
    }));
    expect(response.status).toBe(201);
    const [stored] = await getDb().select().from(drafts).where(eq(drafts.id, copy.id));
    expect(stored.reviewStatus).toBe("draft"); expect(stored.snapshotJson?.approvals).toEqual([]); expect(stored.snapshotJson?.exports).toEqual([]);
    const read = await GET(request("GET", undefined, `?id=${file.id}`));
    expect(read.status).toBe(200); expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes);
    const [deleted] = await getDb().select().from(drafts).where(eq(drafts.id, draftA));
    expect(deleted.deletedAt).not.toBeNull(); expect(deleted.revision).toBe(2);
  });
});
