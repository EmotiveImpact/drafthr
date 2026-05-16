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
 *    letterhead + signature in the doc.
 *
 * Failures inline-skip: if a fetch returns non-2xx or non-image, we leave
 * the original src in place so the render path can decide (alt fallback or
 * just drop the tag). Better than throwing and losing the whole export.
 */

const IMG_TAG_RE = /<img\s+[^>]*src="(https:\/\/[^"]+)"[^>]*>/gi;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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
  try {
    const res = await fetcher(url);
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
    if (!ALLOWED_MIME.has(mime)) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
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
