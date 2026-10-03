import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());
const requireSessionAndTenantMock = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({ put: putMock, get: getMock }));
vi.mock("../_utils/session-with-tenant.js", () => ({
  requireSessionAndTenant: requireSessionAndTenantMock,
}));

import { GET, POST } from "./image.js";
import { parsePrivateImageUrl, privateImageUrl } from "../../src/lib/storage/privateImageUrl.js";

const TENANT = "12345678-1234-1234-1234-123456789abc";
const OTHER_TENANT = "abcdefab-1234-1234-1234-123456789abc";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;

describe("private image upload and read", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test_store_secret");
    vi.stubEnv("DRAFTHR_DEV_NO_AUTH", "");
    putMock.mockReset().mockResolvedValue({ url: "https://private.blob.vercel-storage.com/secret" });
    getMock.mockReset();
    requireSessionAndTenantMock.mockReset().mockResolvedValue({
      ok: true,
      activeTenant: { id: TENANT },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stores a private tenant-scoped blob and returns only the authenticated route", async () => {
    const res = await POST(new Request("http://localhost:5273/api/upload/image", {
      method: "POST",
      headers: { Origin: "http://localhost:5273", "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: DATA_URL, filename: "letterhead.png" }),
    }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; url: string };
    expect(body.ok).toBe(true);
    const pathname = parsePrivateImageUrl(body.url);
    expect(pathname).toMatch(new RegExp(`^letterheads/${TENANT}/[0-9a-f]{64}\\.png$`));
    expect(body.url).not.toContain("blob.vercel-storage.com");
    expect(putMock).toHaveBeenCalledWith(pathname, expect.any(Buffer), expect.objectContaining({
      access: "private",
      token: "vercel_blob_rw_test_store_secret",
    }));
  });

  it("serves only images belonging to the active tenant", async () => {
    const ownPath = `letterheads/${TENANT}/${"a".repeat(64)}.png`;
    getMock.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(PNG);
          controller.close();
        },
      }),
      blob: { contentType: "image/png", size: PNG.byteLength },
    });
    const own = await GET(new Request(`http://localhost:5273${privateImageUrl(ownPath)}`));
    expect(own.status).toBe(200);
    expect(own.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(PNG);
    expect(getMock).toHaveBeenCalledWith(ownPath, expect.objectContaining({ access: "private" }));

    getMock.mockClear();
    const foreignPath = `letterheads/${OTHER_TENANT}/${"b".repeat(64)}.png`;
    const foreign = await GET(new Request(`http://localhost:5273${privateImageUrl(foreignPath)}`));
    expect(foreign.status).toBe(404);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated image read before accessing Blob", async () => {
    requireSessionAndTenantMock.mockResolvedValue({
      ok: false,
      response: new Response("Unauthorized", { status: 401 }),
    });
    const ownPath = `letterheads/${TENANT}/${"a".repeat(64)}.png`;
    const res = await GET(new Request(`http://localhost:5273${privateImageUrl(ownPath)}`));
    expect(res.status).toBe(401);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("returns a storage error instead of pretending the upload succeeded", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    const res = await POST(new Request("http://localhost:5273/api/upload/image", {
      method: "POST",
      headers: { Origin: "http://localhost:5273", "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: DATA_URL, filename: "letterhead.png" }),
    }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "blob-not-configured" });
    expect(putMock).not.toHaveBeenCalled();
  });
});
