import { isSafeImageDataUrl } from "@/lib/safe-data-url";

/**
 * Remote images pasted from the web (an <img src="https://..."> inside the
 * clipboard HTML) displayed in the editor but vanished on every export: the
 * letter sanitiser only keeps data:image/* sources in section HTML, the
 * server PDF renderer blocks all network requests, and the export inliner
 * only fetches from our own image host (SSRF guard).
 *
 * We therefore embed them at PASTE time, in the browser, rather than at
 * export time:
 *  - the browser is the only place that can fetch an arbitrary third-party
 *    host without opening an SSRF hole on the server;
 *  - the image is frozen when the author sees it, so the exported letter
 *    matches what was reviewed even if the source page changes or goes away;
 *  - one embed fixes every consumer at once (page view, PDF server and client
 *    paths, DOCX, the pack, sync to other devices);
 *  - when the fetch fails (CORS, too large, not an image), the author sees a
 *    visible "[image not embedded]" note straight away instead of finding out
 *    from a finished PDF.
 */

/** Same ceiling as files dropped into the editor (SectionEditor MAX_EMBED_BYTES). */
export const MAX_PASTED_IMAGE_BYTES = 5 * 1024 * 1024;

/** Visible note left where a remote image could not be embedded. */
export const IMAGE_NOT_EMBEDDED_NOTE = "[image not embedded]";

const EMBEDDABLE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function isRemoteImageSrc(src: unknown): src is string {
  return typeof src === "string" && /^https?:\/\//i.test(src.trim());
}

/**
 * Fetch a remote image and return it as a data URL, or null when it cannot be
 * embedded (network or CORS failure, non-image, over the size cap). WebP is
 * re-encoded to PNG when the browser can, because Word cannot embed WebP.
 */
export async function fetchImageAsDataUrl(
  url: string,
  opts: { fetcher?: typeof fetch; maxBytes?: number } = {},
): Promise<string | null> {
  const fetcher = opts.fetcher ?? fetch;
  const maxBytes = opts.maxBytes ?? MAX_PASTED_IMAGE_BYTES;
  if (!isRemoteImageSrc(url)) return null;
  try {
    const res = await fetcher(url, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
    if (!EMBEDDABLE_MIME.has(mime)) return null;
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
    if (mime === "image/webp") {
      const png = await reencodeAsPng(bytes, mime);
      if (png && isSafeImageDataUrl(png)) return png;
    }
    const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
    return isSafeImageDataUrl(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  }
}

/**
 * Export-side safety net for content saved before paste-time embedding
 * existed: replace any <img> whose source is not an embedded data: image with
 * the visible note, so the image is flagged in the PDF / DOCX instead of being
 * silently dropped by the sanitiser.
 */
export function markUnembeddedImagesHtml(html: string): string {
  if (!html || !/<img\b/i.test(html)) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = src ? (src[2] ?? src[3] ?? src[4] ?? "") : "";
    if (isSafeImageDataUrl(value.trim())) return tag;
    return `<em>${IMAGE_NOT_EMBEDDED_NOTE}</em>`;
  });
}

async function reencodeAsPng(bytes: Uint8Array, mime: string): Promise<string | null> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
