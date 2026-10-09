/**
 * Replace every https://... image src in `html` with a base64 data URL by
 * fetching the bytes. Used by export paths whose downstream renderer can't
 * (or shouldn't) hit the network:
 *
 *  - Server-side PDF (api/export/pdf.ts) blocks all non-data:/about: network
 *    requests during Puppeteer render — a security guarantee from 0.6.0. We
 *    preserve that guarantee by inlining before the render starts.
 *  - Client-side DOCX (lib/export/docx.ts) parses data: URLs into image
 *    bytes; https URLs would degrade to "[Image: alt]". Inlining keeps the
 *    letterhead + signature in the doc. This path runs in the browser, so
 *    the module must not touch `process`, and the Blob host must be in the
 *    CSP connect-src (vercel.json).
 *
 * Failures inline-skip: if a fetch returns non-2xx or non-image, we leave
 * the original src in place so the render path can decide (alt fallback or
 * just drop the tag). Better than throwing and losing the whole export.
 */

const IMG_TAG_RE = /<img\s+[^>]*src="(https:\/\/[^"]+)"[^>]*>/gi;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
// ~10 MB ceiling on a single inlined image (defends the SSRF timing/size oracle
// and keeps the export payload sane).
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// A letter carries a letterhead, a signature and the odd embedded image. Cap
// the number of distinct images and their combined size so one request can't
// make the export function buffer hundreds of 10 MB objects before rendering.
const MAX_IMAGES = 20;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

/** Public Vercel Blob hosts, where api/upload/image.ts stores letter images. */
export const VERCEL_BLOB_PUBLIC_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * Parse a comma-separated host list such as the server's
 * IMAGE_INLINE_ALLOWED_HOSTS env var into lower-cased host names.
 */
export function parseAllowedHosts(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * SSRF guard for the server-side export inliner. `inlineImagesForExport` runs
 * inside a Vercel function (api/export/pdf.ts) and fetches user-controlled
 * image URLs — without a guard, any authenticated user could make the function
 * fetch cloud-metadata / internal hosts (blind SSRF). Only allow https on a
 * known image host: Vercel Blob (*.public.blob.vercel-storage.com) plus any
 * `extraHosts` the server passes in (from IMAGE_INLINE_ALLOWED_HOSTS). Reject
 * IP-literal hosts outright (kills the obvious 169.254.169.254 / 127.0.0.1 /
 * 10.x vectors and forces everything through the host allowlist). (Senior
 * sweep B3.)
 *
 * The extra hosts are a parameter rather than read from the environment here
 * because the DOCX export calls this in the browser, where `process` does not
 * exist and reading it threw for every non-Blob image.
 */
export function isAllowedImageHost(rawUrl: string, extraHosts: readonly string[] = []): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  // Reject IP-literal hosts (v4 or bracketed v6) — never a legit CDN here, and
  // the cheapest way to block metadata/loopback/private-range targets.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || u.hostname.startsWith("[")) {
    return false;
  }
  if (host.endsWith(VERCEL_BLOB_PUBLIC_HOST_SUFFIX)) return true;
  return extraHosts.some((h) => h.trim().toLowerCase() === host);
}

export type InlineImagesOptions = {
  /** Extra https hosts to inline from, beyond Vercel Blob (server only). */
  extraAllowedHosts?: readonly string[];
};

export async function inlineImagesForExport(
  html: string,
  fetcher: typeof fetch = fetch,
  options: InlineImagesOptions = {},
): Promise<string> {
  const extraHosts = options.extraAllowedHosts ?? [];
  const matches: { url: string; index: number; length: number }[] = [];
  IMG_TAG_RE.lastIndex = 0;
  for (let m = IMG_TAG_RE.exec(html); m !== null; m = IMG_TAG_RE.exec(html)) {
    matches.push({ url: m[1], index: m.index, length: m[0].length });
  }
  if (matches.length === 0) return html;

  // Dedup by URL so the same letterhead used N times is fetched once.
  const uniqueUrls = Array.from(new Set(matches.map((m) => m.url))).slice(0, MAX_IMAGES);
  const resolved = new Map<string, string>();
  // Sequential on purpose: a letter has a handful of images, and fetching one
  // at a time lets the running byte budget stop the work early.
  let budget = MAX_TOTAL_BYTES;
  for (const url of uniqueUrls) {
    if (budget <= 0) break;
    const fetched = await tryFetchAsDataUrl(url, fetcher, Math.min(MAX_IMAGE_BYTES, budget), extraHosts);
    if (!fetched) continue;
    budget -= fetched.bytes;
    resolved.set(url, fetched.dataUrl);
  }

  return html.replace(IMG_TAG_RE, (full, src: string) => {
    const data = resolved.get(src);
    if (!data) return full;
    // Only the src attribute changes — keep alt / style / etc. intact.
    return full.replace(src, data);
  });
}

async function tryFetchAsDataUrl(
  url: string,
  fetcher: typeof fetch,
  maxBytes: number,
  extraHosts: readonly string[],
): Promise<{ dataUrl: string; bytes: number } | null> {
  // SSRF guard: refuse anything not on the image-host allowlist BEFORE any
  // network call. (Senior sweep B3.)
  if (!isAllowedImageHost(url, extraHosts)) return null;
  try {
    // redirect:"manual" so an allowlisted host can't 30x us onto an internal
    // target — a redirect yields an opaqueredirect/non-2xx we simply skip.
    const res = await fetcher(url, { redirect: "manual" } as RequestInit);
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
    if (!ALLOWED_MIME.has(mime)) return null;
    // Reject oversize objects from the advertised Content-Length BEFORE buffering
    // the whole body into memory. Any tenant can upload to the allowlisted Vercel
    // blob namespace, so without this an attacker could make the export function
    // buffer a multi-hundred-MB object per <img> (memory/cost amplification) and
    // only fail the cap after the full read. (Security board SA-04, 2026-06-10.)
    const declaredLen = Number(res.headers.get("content-length"));
    if (Number.isFinite(declaredLen) && declaredLen > maxBytes) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // Defense in depth: a server can lie about / omit Content-Length, so still
    // enforce the cap on the actual bytes read.
    if (buf.byteLength > maxBytes) return null;
    return { dataUrl: `data:${mime};base64,${bytesToBase64(buf)}`, bytes: buf.byteLength };
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // node + jsdom both have Buffer; browsers fall back to btoa via binary string.
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
