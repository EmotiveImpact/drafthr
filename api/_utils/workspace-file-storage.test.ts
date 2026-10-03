// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createFileUploadToken, fileStorageProvider, readWorkspaceFile } from "./workspace-file-storage";
const mocks = vi.hoisted(() => ({ get: vi.fn(), token: vi.fn() }));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));
vi.mock("@vercel/blob/client", () => ({ generateClientTokenFromReadWriteToken: mocks.token }));
const bytes = new TextEncoder().encode("fictional private bytes");
const file = { pathname: "workspace-files/24a61f20-204c-40a2-8e39-0af46c5fc5bc/8d98cba8-36db-455c-9813-01e1a22a0d66", provider: "vercel", size: bytes.length,
  contentType: "text/plain", sha256: createHash("sha256").update(bytes).digest("hex") };
describe("private object storage boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "0");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token-not-a-real-credential");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("issues a short-lived exact-path, exact-type token with overwrite forbidden", async () => {
    mocks.token.mockResolvedValue("scoped-token");
    expect(await createFileUploadToken(file)).toBe("scoped-token");
    expect(mocks.token).toHaveBeenCalledWith(expect.objectContaining({ pathname: file.pathname, maximumSizeInBytes: file.size,
      allowedContentTypes: ["text/plain"], allowOverwrite: false, addRandomSuffix: false }));
    expect(mocks.token.mock.calls[0][0].validUntil).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
  });
  it("reads privately without cache and verifies actual bytes", async () => {
    mocks.get.mockResolvedValue({ statusCode: 200, blob: { size: bytes.length, contentType: "text/plain" },
      stream: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) });
    expect(await readWorkspaceFile(file)).toEqual(Buffer.from(bytes));
    expect(mocks.get).toHaveBeenCalledWith(file.pathname, expect.objectContaining({ access: "private", useCache: false }));
  });
  it("rejects a lying stream or a corrupted object", async () => {
    for (const contents of [new Uint8Array(bytes.length + 1), new Uint8Array(bytes.length)]) {
      mocks.get.mockResolvedValue({ statusCode: 200, blob: { size: bytes.length, contentType: "text/plain" },
        stream: new ReadableStream({ start(controller) { controller.enqueue(contents); controller.close(); } }) });
      await expect(readWorkspaceFile(file)).rejects.toThrow();
    }
  });
  it("never falls back to local files when hosted storage is missing", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(() => fileStorageProvider()).toThrow("not configured");
  });
  it("forbids the local adapter in deployed and production environments", () => {
    vi.stubEnv("DRAFTHR_LOCAL_WORKOS_EMULATOR", "1"); vi.stubEnv("VERCEL_ENV", "preview");
    expect(() => fileStorageProvider()).toThrow("disabled");
    vi.stubEnv("VERCEL_ENV", "development"); vi.stubEnv("NODE_ENV", "production");
    expect(() => fileStorageProvider()).toThrow("disabled");
  });
});
