/**
 * Replace approved HTTPS and authenticated same-origin image sources in `html`
 * with base64 data URLs. Used by export paths whose downstream renderer can't
 * (or shouldn't) hit the network:
 *
 *  - Server-side PDF (api/export/pdf.ts) blocks all non-data:/about: network
 *    requests during Puppeteer render — a security guarantee from 0.6.0. We
 *    preserve that guarantee by inlining before the render starts.
 *  - Client-side DOCX and offline export packs parse data: URLs into image
 *    bytes; https URLs would degrade to "[Image: alt]". Inlining keeps the
 *    letterhead + signature in the doc.
 *
 * Legacy remote images keep their existing skip behaviour. Private workspace
 * assets fail visibly: a successful export must not silently omit branding.
 */

import { parsePrivateImageUrl } from "./privateImageUrl";

const IMG_TAG_RE = /<img\s+[^>]*src="((?:https:\/\/|\/api\/upload\/image\?path=)[^"]+)"[^>]*>/gi;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
// ~10 MB ceiling on a single inlined image (defends the SSRF timing/size oracle
// and keeps the export payload sane).
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * SSRF guard for the server-side export inliner. `inlineImagesForExport` runs
 * inside a Vercel function (api/export/pdf.ts) and fetches user-controlled
 * image URLs — without a guard, any authenticated user could make the function
 * fetch cloud-metadata / internal hosts (blind SSRF). Only allow https on a
 * known image host: Vercel Blob (*.public.blob.vercel-storage.com) plus any
 * hosts in IMAGE_INLINE_ALLOWED_HOSTS. Reject IP-literal hosts outright (kills
 * the obvious 169.254.169.254 / 127.0.0.1 / 10.x vectors and forces everything
 * through the host allowlist). (Senior sweep B3.)
 */
export function isAllowedImageHost(rawUrl: string): boolean {
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
  if (host.endsWith(".public.blob.vercel-storage.com")) return true;
  const extra = (process.env.IMAGE_INLINE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(host);
}

export async function inlineImagesForExport(
  html: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const matches: { url: string; index: number; length: number }[] = [];
  IMG_TAG_RE.lastIndex = 0;
  for (let m = IMG_TAG_RE.exec(html); m !== null; m = IMG_TAG_RE.exec(html)) {
    matches.push({ url: m[1], index: m.index, length: m[0].length });
  }
  if (matches.length === 0) return html;

  // Dedup by URL so the same letterhead used N times is fetched once.
  const uniqueUrls = Array.from(new Set(matches.map((m) => m.url)));
  const resolved = new Map<string, string>();
  await Promise.all(
    uniqueUrls.map(async (url) => {
      const dataUrl = await tryFetchAsDataUrl(url, fetcher);
      if (!dataUrl && parsePrivateImageUrl(url)) throw new Error("A private image could not be loaded. Please retry the export; no complete document was produced.");
      if (dataUrl) resolved.set(url, dataUrl);
    }),
  );

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
): Promise<string | null> {
  // SSRF guard: refuse anything not on the image-host allowlist BEFORE any
  // network call. (Senior sweep B3.)
  if (!isAllowedImageHost(url) && !parsePrivateImageUrl(url)) return null;
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
    if (Number.isFinite(declaredLen) && declaredLen > MAX_IMAGE_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // Defense in depth: a server can lie about / omit Content-Length, so still
    // enforce the cap on the actual bytes read.
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;
    return `data:${mime};base64,${bytesToBase64(buf)}`;
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
