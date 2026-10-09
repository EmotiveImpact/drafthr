import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VERCEL_BLOB_PUBLIC_HOST_SUFFIX,
  inlineImagesForExport,
  isAllowedImageHost,
  parseAllowedHosts,
} from "./inlineImagesForExport";

// A 1x1 transparent PNG — used as the fetched blob payload.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("isAllowedImageHost — SSRF guard (senior sweep B3)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows Vercel Blob hosts over https", () => {
    expect(isAllowedImageHost("https://abc123.public.blob.vercel-storage.com/x.png")).toBe(true);
  });
  it("rejects non-https", () => {
    expect(isAllowedImageHost("http://abc.public.blob.vercel-storage.com/x.png")).toBe(false);
  });
  it("rejects IP-literal hosts (metadata/loopback/private vectors)", () => {
    expect(isAllowedImageHost("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedImageHost("https://127.0.0.1/x.png")).toBe(false);
    expect(isAllowedImageHost("https://10.0.0.5/x.png")).toBe(false);
  });
  it("rejects an arbitrary host not on the allowlist", () => {
    expect(isAllowedImageHost("https://evil.example.com/x.png")).toBe(false);
  });
  it("honours extra hosts the server passes in from IMAGE_INLINE_ALLOWED_HOSTS", () => {
    const extra = parseAllowedHosts("cdn.acme.test, Blob.Example,,");
    expect(extra).toEqual(["cdn.acme.test", "blob.example"]);
    expect(isAllowedImageHost("https://cdn.acme.test/x.png", extra)).toBe(true);
    expect(isAllowedImageHost("https://blob.example/x.png", extra)).toBe(true);
    expect(isAllowedImageHost("https://other.test/x.png", extra)).toBe(false);
    expect(parseAllowedHosts(undefined)).toEqual([]);
  });
  it("does not read the environment itself (the browser caller passes nothing)", () => {
    vi.stubEnv("IMAGE_INLINE_ALLOWED_HOSTS", "cdn.acme.test");
    expect(isAllowedImageHost("https://cdn.acme.test/x.png")).toBe(false);
  });
  it("works where `process` does not exist, as in the browser DOCX export", () => {
    const g = globalThis as { process?: unknown };
    const saved = g.process;
    let blob: boolean | Error;
    let other: boolean | Error;
    try {
      g.process = undefined;
      const run = (url: string) => {
        try {
          return isAllowedImageHost(url);
        } catch (err) {
          return err as Error;
        }
      };
      blob = run("https://abc123.public.blob.vercel-storage.com/x.png");
      other = run("https://cdn.acme.test/x.png");
    } finally {
      g.process = saved;
    }
    expect(blob).toBe(true);
    expect(other).toBe(false);
  });
  it("names the Blob host suffix the CSP allows", () => {
    expect(VERCEL_BLOB_PUBLIC_HOST_SUFFIX).toBe(".public.blob.vercel-storage.com");
  });
});

describe("inlineImagesForExport", () => {
  // The existing tests use https://blob.example/* — allowlist it so the
  // inlining behaviour is exercised; the SSRF rejection is covered separately.
  const opts = { extraAllowedHosts: ["blob.example"] };
  it("leaves html unchanged when there are no https images", async () => {
    const html = `<p>Hello</p><img src="data:image/png;base64,AAAA" />`;
    const out = await inlineImagesForExport(html, makeFetcher(), opts);
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
    const out = await inlineImagesForExport(html, fetcher, opts);
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
    await inlineImagesForExport(html, fetchSpy as unknown as typeof fetch, opts);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("leaves the src intact when fetch fails", async () => {
    const fetcher = vi.fn(async () =>
      new Response("not found", { status: 404 }),
    );
    const html = `<img src="https://blob.example/missing.png" />`;
    const out = await inlineImagesForExport(html, fetcher as unknown as typeof fetch, opts);
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
    const out = await inlineImagesForExport(html, fetcher as unknown as typeof fetch, opts);
    expect(out).toContain("https://blob.example/scary.svg");
    expect(out).not.toContain("data:image/svg+xml");
  });

  it("#B3: NEVER fetches a non-allowlisted (SSRF) URL", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(new Blob([new Uint8Array(PNG_BYTES)]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    const html = `<img src="https://169.254.169.254/latest/meta-data/" /><img src="https://internal.svc/secret.png" />`;
    const out = await inlineImagesForExport(html, fetchSpy as unknown as typeof fetch, opts);
    expect(fetchSpy).not.toHaveBeenCalled();
    // src left intact (downstream render decides) — but no fetch happened.
    expect(out).toContain("169.254.169.254");
  });

  it("#SA-04: rejects an oversize Content-Length WITHOUT buffering the body", async () => {
    let bodyRead = false;
    const fetcher = vi.fn(async () => ({
      ok: true,
      headers: {
        get: (name: string) => {
          const n = name.toLowerCase();
          if (n === "content-type") return "image/png";
          if (n === "content-length") return String(50 * 1024 * 1024); // 50MB > 10MB cap
          return null;
        },
      },
      // If this is called the guard failed — we must bail on Content-Length first.
      arrayBuffer: async () => {
        bodyRead = true;
        return new ArrayBuffer(50 * 1024 * 1024);
      },
    })) as unknown as typeof fetch;

    const html = `<img src="https://blob.example/huge.png" />`;
    const out = await inlineImagesForExport(html, fetcher, opts);
    expect(fetcher).toHaveBeenCalledTimes(1); // it DID fetch (headers), but…
    expect(bodyRead).toBe(false); // …never buffered the 50MB body
    expect(out).toContain("https://blob.example/huge.png"); // src left intact, not inlined
  });
});

function makeFetcher(map: Record<string, { bytes: Uint8Array; contentType: string }> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input.toString();
    const entry = map[url];
    if (!entry) return new Response("not found", { status: 404 });
    const body = new ArrayBuffer(entry.bytes.byteLength);
    new Uint8Array(body).set(entry.bytes);
    return {
      ok: true,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? entry.contentType : null),
      },
      arrayBuffer: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

describe("inlineImagesForExport — resource caps", () => {
  const png = (bytes: number) =>
    new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "image/png" } });

  it("fetches at most 20 distinct images", async () => {
    const fetcher = vi.fn(async () => png(10));
    const html = Array.from(
      { length: 30 },
      (_, i) => `<img src="https://s.public.blob.vercel-storage.com/${i}.png">`,
    ).join("");
    await inlineImagesForExport(html, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(20);
  });

  it("stops inlining once the combined byte budget is spent", async () => {
    const nineMb = 9 * 1024 * 1024;
    const fetcher = vi.fn(async () => png(nineMb));
    const html = Array.from(
      { length: 5 },
      (_, i) => `<img src="https://s.public.blob.vercel-storage.com/${i}.png">`,
    ).join("");
    const out = await inlineImagesForExport(html, fetcher as unknown as typeof fetch);
    // 25 MB budget: two 9 MB images fit, the third exceeds the remaining 7 MB.
    expect((out.match(/data:image\/png/g) ?? []).length).toBe(2);
  });
});
