// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createLocalSigner } from "../../src/lib/sign/local-signer";
import { verifyPadesCms } from "../../src/lib/sign/verify";
import { encodeBase64, decodeBase64, encodePackManifest, PACK_FORMAT, type PackManifest } from "../../src/lib/export/pack-integrity";

const state = vi.hoisted(() => ({
  auth: vi.fn(), signer: vi.fn(), audit: vi.fn(), rows: vi.fn(), limit: vi.fn(),
}));
vi.mock("../_utils/workos.js", () => ({ withSessionResponse: (req: Request, handler: (req: Request) => Promise<Response>) => handler(req) }));
vi.mock("../_utils/session-with-tenant.js", () => ({ requireSessionAndTenant: state.auth }));
vi.mock("../_utils/rate-limit.js", () => ({ rateLimit: state.limit }));
vi.mock("../../src/lib/sign/types.js", () => ({ getActiveSigner: state.signer }));
vi.mock("../../src/db/audit.js", () => ({ appendAuditEvent: state.audit }));
vi.mock("../../src/db/index.js", () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: state.rows }) }) }) }) }));
import { POST } from "./manifest";

const draftId = "a358bb74-6202-4bf5-b76e-04cf982b3e82";
const tenantId = "ce2c0080-d1c6-47ec-a3dd-6f0cf74b2d68";
const otherTenant = "5a535ac4-339a-4f05-b0c9-50a54d340cc7";
const manifest = (): PackManifest => ({ format: PACK_FORMAT, hashAlgorithm: "SHA-256", draftId, workspaceId: tenantId,
  draftRevision: 3, generatedAt: "2026-10-03T10:00:00.000Z", metadata: { letterType: "offer" },
  files: [{ path: "letter.pdf", bytes: 3, sha256: createHash("sha256").update("pdf").digest("hex") }] });
function request(options: { body?: unknown; workspaceId?: string; origin?: string } = {}) {
  return new Request("http://localhost:5273/api/sign/manifest", { method: "POST", headers: {
    "Content-Type": "application/json", Origin: options.origin ?? "http://localhost:5273", "X-Workspace-ID": options.workspaceId ?? tenantId,
  }, body: JSON.stringify(options.body ?? { draftId, manifest_b64: encodeBase64(encodePackManifest(manifest())) }) });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SIGNING_KMS_KEY_ID", "alias/test-only-mocked-signing");
  state.auth.mockResolvedValue({ ok: true, activeTenant: { id: tenantId }, activeMember: { role: "owner" }, userRow: { id: draftId } });
  state.rows.mockResolvedValue([{ revision: 3 }]); state.audit.mockResolvedValue(undefined); state.limit.mockResolvedValue(null);
  state.signer.mockImplementation(async () => createLocalSigner());
});
afterEach(() => vi.unstubAllEnvs());

describe("manifest signing authorization and validation", () => {
  it("signs the exact manifest bytes and records a durable signing audit", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json() as { cms_b64: string; public_key_b64: string; content_sha256: string };
    expect(body).toMatchObject({ status: "signed", algorithm: "Ed25519", timestamp: "none" });
    expect(await verifyPadesCms({ cms: decodeBase64(body.cms_b64), expectedContent: encodePackManifest(manifest()),
      expectedPublicKey: decodeBase64(body.public_key_b64), requireTimestamp: false })).toMatchObject({ ok: true, tsa: null });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId, subjectId: draftId,
      payload: expect.objectContaining({ draftRevision: 3, sha256: body.content_sha256, timestamp: "none" }) }));
  });
  it("returns explicitly unsigned when KMS is not configured, without minting a local key", async () => {
    vi.stubEnv("SIGNING_KMS_KEY_ID", ""); vi.stubEnv("DRAFTHR_SIGNING_KEY_HEX", "1".repeat(64));
    const response = await POST(request());
    expect(await response.json()).toEqual({ status: "unsigned", reason: "not_configured" });
    expect(state.signer).not.toHaveBeenCalled(); expect(state.audit).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated, read-only, stale-workspace and foreign-origin requests", async () => {
    expect((await POST(request({ origin: "https://attacker.example" }))).status).toBe(403);
    state.auth.mockResolvedValueOnce({ ok: false, response: new Response("no", { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request({ workspaceId: otherTenant }))).status).toBe(409);
    state.auth.mockResolvedValueOnce({ ok: true, activeTenant: { id: tenantId }, activeMember: { role: "viewer" }, userRow: { id: draftId } });
    expect((await POST(request())).status).toBe(403);
    expect(state.signer).not.toHaveBeenCalled();
  });
  it("rejects malformed and noncanonical manifests before using the signing key", async () => {
    for (const body of [null, { draftId, manifest_b64: "@@@=" }, { draftId, manifest_b64: encodeBase64(new TextEncoder().encode("{}")) },
      { draftId, manifest_b64: encodeBase64(new TextEncoder().encode(JSON.stringify(manifest(), null, 2))) }]) {
      const response = await POST(new Request("http://localhost:5273/api/sign/manifest", {
        method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5273", "X-Workspace-ID": tenantId }, body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
    }
    expect(state.signer).not.toHaveBeenCalled();
  });
  it("rejects cross-tenant manifest claims even if the header has the current workspace", async () => {
    const bytes = encodePackManifest({ ...manifest(), workspaceId: otherTenant });
    expect((await POST(request({ body: { draftId, manifest_b64: encodeBase64(bytes) } }))).status).toBe(409);
    expect(state.signer).not.toHaveBeenCalled();
  });
  it("rejects missing/deleted drafts and stale revisions", async () => {
    state.rows.mockResolvedValueOnce([]);
    expect((await POST(request())).status).toBe(404);
    state.rows.mockResolvedValueOnce([{ revision: 4 }]);
    expect((await POST(request())).status).toBe(409);
    expect(state.signer).not.toHaveBeenCalled();
  });
  it.each(["provider", "audit"])("fails closed on configured %s failures", async failure => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    if (failure === "provider") state.signer.mockRejectedValueOnce(new Error("secret provider detail"));
    else state.audit.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret provider detail");
    log.mockRestore();
  });
  it("rejects invalid provider signatures instead of reporting signed success", async () => {
    const signer = createLocalSigner();
    state.signer.mockResolvedValueOnce({ ...signer, sign: async () => new Uint8Array(64) });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(request())).status).toBe(503);
    expect(state.audit).not.toHaveBeenCalled(); log.mockRestore();
  });
});
