import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadImage } from "./uploadImage";
import { privateImageUrl } from "./privateImageUrl";

const ONE_BY_ONE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("uploadImage", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("VITE_DRAFTHR_DATABASE_WORKSPACE", "false");
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns the URL from a successful upload", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, url: "https://blob.example/letterheads/abc.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const url = await uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "letterhead.png" });
    expect(url).toBe("https://blob.example/letterheads/abc.png");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("falls back to the original data URL when Blob is not configured", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "blob-not-configured" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const url = await uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "letterhead.png" });
    expect(url).toBe(ONE_BY_ONE_PNG);
  });

  it("fails visibly in production when private storage is unavailable", async () => {
    vi.stubEnv("DEV", false);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "blob-not-configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    await expect(uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "letterhead.png" }))
      .rejects.toThrow("Image storage is unavailable");
  });

  it("retries once on 5xx and returns the second attempt's URL", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ ok: false, error: "upload-failed" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, url: "https://blob.example/x.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const url = await uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "x.png" });
    expect(url).toBe("https://blob.example/x.png");
    expect(calls).toBe(2);
  });

  it("falls back to data URL when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const url = await uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "x.png" });
    expect(url).toBe(ONE_BY_ONE_PNG);
  });

  it("returns non-data URLs unchanged without hitting the network", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const url = await uploadImage({
      dataUrl: "https://blob.example/already-uploaded.png",
      filename: "x.png",
    });
    expect(url).toBe("https://blob.example/already-uploaded.png");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  const tenantId = "12345678-1234-1234-1234-123456789abc";
  const assetUrl = privateImageUrl(`letterheads/${tenantId}/${"a".repeat(64)}.png`);
  it("pins database uploads and accepts only a current tenant's private receipt", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(Response.json({ ok: true, url: assetUrl }));
    globalThis.fetch = fetchSpy;
    const scope = { tenantId, isCurrent: () => true };
    expect(await uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "x.png" }, scope)).toBe(assetUrl);
    expect(fetchSpy).toHaveBeenCalledWith("/api/upload/image", expect.objectContaining({ credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Workspace-ID": tenantId } }));
    for (const url of ["https://public.example/image.png", privateImageUrl(`letterheads/${"b".repeat(8)}-1234-1234-1234-123456789abc/${"a".repeat(64)}.png`), undefined]) {
      globalThis.fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, url }));
      await expect(uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "x.png" }, scope)).rejects.toThrow("invalid workspace image");
    }
  });
  it("never falls back to embedded data on a scoped local upload failure", async () => {
    const scope = { tenantId, isCurrent: () => true };
    globalThis.fetch = vi.fn().mockResolvedValue(Response.json({ ok: false }, { status: 503 }));
    await expect(uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "x.png" }, scope)).rejects.toThrow("storage is unavailable");
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "x.png" }, scope)).rejects.toThrow("offline");
  });
  it("discards stale completions and does not retry into a changed workspace", async () => {
    let current = true;
    const scope = { tenantId, isCurrent: () => current };
    const fetchSpy = vi.fn().mockImplementation(async () => { current = false; return Response.json({ ok: false }, { status: 503 }); });
    globalThis.fetch = fetchSpy;
    await expect(uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "x.png" }, scope)).rejects.toThrow("Workspace changed");
    expect(fetchSpy).toHaveBeenCalledOnce();
    await expect(uploadImage({ dataUrl: ONE_BY_ONE_PNG, filename: "x.png" }, scope)).rejects.toThrow("Workspace changed");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
