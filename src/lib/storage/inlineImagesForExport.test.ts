import { describe, expect, it, vi } from "vitest";
import { inlineImagesForExport } from "./inlineImagesForExport";

// A 1x1 transparent PNG — used as the fetched blob payload.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("inlineImagesForExport", () => {
  it("leaves html unchanged when there are no https images", async () => {
    const html = `<p>Hello</p><img src="data:image/png;base64,AAAA" />`;
    const out = await inlineImagesForExport(html, makeFetcher());
    expect(out).toBe(html);
  });

  it("replaces https://... img src with a data: URL", async () => {
    const fetcher = makeFetcher({
      "https://blob.example/letterhead.png": {
        bytes: PNG_BYTES,
        contentType: "image/png",
      },
    });
    const html = `<div><img src="https://blob.example/letterhead.png" alt="hd" /></div>`;
    const out = await inlineImagesForExport(html, fetcher);
    expect(out).toContain('src="data:image/png;base64,');
    expect(out).not.toContain("https://blob.example/letterhead.png");
    expect(out).toContain('alt="hd"');
  });

  it("dedups duplicate urls — one fetch per unique url", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(new Blob([new Uint8Array(PNG_BYTES)]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    const html = `<img src="https://blob.example/a.png" /><img src="https://blob.example/a.png" />`;
    await inlineImagesForExport(html, fetchSpy as unknown as typeof fetch);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("leaves the src intact when fetch fails", async () => {
    const fetcher = vi.fn(async () =>
      new Response("not found", { status: 404 }),
    );
    const html = `<img src="https://blob.example/missing.png" />`;
    const out = await inlineImagesForExport(html, fetcher as unknown as typeof fetch);
    expect(out).toContain("https://blob.example/missing.png");
  });

  it("rejects non-image content types", async () => {
    const fetcher = vi.fn(async () =>
      new Response("<svg/>", {
        status: 200,
        headers: { "Content-Type": "image/svg+xml" },
      }),
    );
    const html = `<img src="https://blob.example/scary.svg" />`;
    const out = await inlineImagesForExport(html, fetcher as unknown as typeof fetch);
    expect(out).toContain("https://blob.example/scary.svg");
    expect(out).not.toContain("data:image/svg+xml");
  });
});

function makeFetcher(map: Record<string, { bytes: Uint8Array; contentType: string }> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const entry = map[url];
    if (!entry) return new Response("not found", { status: 404 });
    // Wrap in Blob — Response BodyInit doesn't accept raw Uint8Array under
    // current lib.dom types (jsdom env).
    return new Response(new Blob([new Uint8Array(entry.bytes)]), {
      status: 200,
      headers: { "Content-Type": entry.contentType },
    });
  }) as unknown as typeof fetch;
}
