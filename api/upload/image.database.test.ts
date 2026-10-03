// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../../src/db/index";
import { tenants, users, workspaceAssets, auditEvents } from "../../src/db/schema";
import * as audit from "../../src/db/audit";
import { GET, POST } from "./image";
import { parsePrivateImageUrl, privateImageUrl } from "../../src/lib/storage/privateImageUrl";
import { writeLocalFile } from "../_utils/workspace-file-storage";

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", role: "owner" }));
vi.mock("../_utils/session-with-tenant.js", () => ({ requireSessionAndTenant: async () => ({ ok: true,
  activeTenant: { id: auth.tenantId }, userRow: { id: auth.userId }, activeMember: { role: auth.role } }) }));

describe.skipIf(!process.env.DRAFTHR_LOCAL_DATABASE_URL)("workspace images against isolated local Postgres and private files", () => {
  const tenantA = crypto.randomUUID(), tenantB = crypto.randomUUID(), userId = crypto.randomUUID();
  const origin = "http://localhost:5273";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
  let root: string;
  const request = (bytes = png, pin: string | null = auth.tenantId) => new Request(`${origin}/api/upload/image`, { method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...(pin ? { "X-Workspace-ID": pin } : {}) },
    body: JSON.stringify({ dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, filename: "fictional.png" }) });
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "drafthr-asset-tests-"));
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1"); vi.stubEnv("DRAFTHR_LOCAL_FILE_ROOT", root);
    vi.stubEnv("DRAFTHR_DATABASE_WORKSPACE", "true"); vi.stubEnv("WORKOS_AUDIT_LOGS_ENABLED", "false"); vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await getDb().insert(tenants).values([{ id: tenantA, name: "Asset test A" }, { id: tenantB, name: "Asset test B" }]);
    await getDb().insert(users).values({ id: userId, externalId: `asset-test-${userId}` });
  });
  beforeEach(() => { auth.tenantId = tenantA; auth.userId = userId; auth.role = "owner"; });
  afterAll(async () => {
    await getDb().delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    await getDb().delete(users).where(eq(users.id, userId)); await closeDb();
    if (root) await rm(root, { recursive: true, force: true }); // Only this suite's mkdtemp directory.
    vi.unstubAllEnvs();
  });
  it("stores exact private bytes with durable tenant metadata and one audit event across retries", async () => {
    const res = await POST(request()); expect(res.status).toBe(200);
    const { url } = await res.json() as { url: string };
    const [row] = await getDb().select().from(workspaceAssets).where(eq(workspaceAssets.pathname, parsePrivateImageUrl(url)!));
    expect(row).toMatchObject({ tenantId: tenantA, createdBy: userId, status: "ready", provider: "local", size: png.length, sha256: createHash("sha256").update(png).digest("hex") });
    const read = await GET(new Request(origin + url)); expect(read.status).toBe(200);
    expect(Buffer.from(await read.arrayBuffer())).toEqual(png);
    expect(read.headers.get("cache-control")).toBe("private, no-store");
    const retry = await POST(request()); expect(await retry.json()).toEqual({ ok: true, url });
    const events = await getDb().select().from(auditEvents).where(and(eq(auditEvents.tenantId, tenantA), eq(auditEvents.subjectId, row.id)));
    expect(events).toHaveLength(1);
    auth.tenantId = tenantB;
    expect((await GET(new Request(origin + url))).status).toBe(404);
  });
  it("rejects absent/stale workspace pins and read-only upload roles", async () => {
    expect((await POST(request(png, null))).status).toBe(409);
    expect((await POST(request(png, tenantB))).status).toBe(409);
    auth.role = "viewer";
    expect((await POST(request())).status).toBe(403);
  });
  it("keeps failed completion private and recovers after audit rollback without duplicate metadata", async () => {
    const bytes = Buffer.concat([png, Buffer.from("audit-test")]);
    const pathname = `letterheads/${tenantA}/${createHash("sha256").update(bytes).digest("hex")}.png`;
    const failing = vi.spyOn(audit, "appendAuditEvent").mockRejectedValueOnce(new Error("Audit unavailable"));
    try { expect((await POST(request(bytes))).status).toBe(502); } finally { failing.mockRestore(); }
    const [pending] = await getDb().select().from(workspaceAssets).where(eq(workspaceAssets.pathname, pathname));
    expect(pending.status).toBe("pending"); expect(pending.completedAt).toBeNull();
    expect((await GET(new Request(origin + privateImageUrl(pathname)))).status).toBe(404);
    expect((await POST(request(bytes))).status).toBe(200);
    const rows = await getDb().select().from(workspaceAssets).where(eq(workspaceAssets.pathname, pathname));
    expect(rows).toHaveLength(1); expect(rows[0].status).toBe("ready");
  });
  it("rejects corrupted stored bytes and traversal without returning a successful receipt", async () => {
    const bytes = Buffer.concat([png, Buffer.from("corruption-test")]);
    const uploaded = await POST(request(bytes)); expect(uploaded.status).toBe(200);
    const { url } = await uploaded.json() as { url: string };
    const pathname = parsePrivateImageUrl(url)!;
    await writeFile(path.join(root, pathname), Buffer.from("corrupt"));
    expect((await GET(new Request(origin + url))).status).toBe(503);
    expect((await POST(request(bytes))).status).toBe(502);
    await expect(writeLocalFile({ pathname: "letterheads/../../escape.png", provider: "local", size: png.length, sha256: createHash("sha256").update(png).digest("hex"), contentType: "image/png" }, png)).rejects.toThrow("Invalid local file path");
  });
});
