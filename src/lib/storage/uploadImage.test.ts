import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadImage } from "./uploadImage";

const ONE_BY_ONE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("uploadImage", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
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
});
