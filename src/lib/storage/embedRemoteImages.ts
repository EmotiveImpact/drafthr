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

/** Give up on a remote image that has not arrived by then. */
const FETCH_TIMEOUT_MS = 15_000;
/** Longest edge when an image is redrawn through a canvas (ample for print). */
const MAX_REDRAW_EDGE_PX = 2400;

type ImageLoader = (url: string, maxBytes: number, timeoutMs: number) => Promise<string | null>;

/**
 * Fetch a remote image and return it as a data URL, or null when it cannot be
 * embedded (network or CORS failure, non-image, over the size cap). WebP is
 * re-encoded to PNG when the browser can, because Word cannot embed WebP.
 *
 * The app's Content-Security-Policy limits fetch() to our own origin and a
 * few service hosts such as Vercel Blob (connect-src) but allows images from
 * any https host (img-src), so in production a third-party fetch is refused
 * and the image is loaded through an <img> element and redrawn on a canvas
 * instead. Both need the host to allow CORS.
 */
export async function fetchImageAsDataUrl(
  url: string,
  opts: { fetcher?: typeof fetch; maxBytes?: number; loadImage?: ImageLoader; timeoutMs?: number } = {},
): Promise<string | null> {
  const fetcher = opts.fetcher ?? fetch;
  const maxBytes = opts.maxBytes ?? MAX_PASTED_IMAGE_BYTES;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  if (!isRemoteImageSrc(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetcher(url, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    // Refused by the CSP (or CORS, or the network): try the <img> route.
    if (controller.signal.aborted) return null;
    return (opts.loadImage ?? loadImageAsDataUrl)(url, maxBytes, timeoutMs);
  }
  try {
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
    if (!EMBEDDABLE_MIME.has(mime)) return null;
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const bytes = await readCapped(res, maxBytes);
    if (!bytes || bytes.byteLength === 0) return null;
    if (mime === "image/webp") {
      const png = await reencodeAsPng(bytes, mime);
      if (png && isSafeImageDataUrl(png)) return png;
    }
    const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
    return isSafeImageDataUrl(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a response body, giving up as soon as it passes `maxBytes`. A missing
 * or false Content-Length must not let a huge body be buffered in full.
 */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : bytes;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Load an image through an <img> element (allowed by img-src) and redraw it on
 * a canvas, scaled down to MAX_REDRAW_EDGE_PX. PNG keeps transparency; a
 * photo too big as PNG is retried as JPEG on white. A host without CORS
 * fails to load (crossOrigin="anonymous"), so the canvas is never tainted.
 */
function loadImageAsDataUrl(url: string, maxBytes: number, timeoutMs: number): Promise<string | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const finish = (value: string | null) => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (value === null) img.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.onerror = () => finish(null);
    img.onload = () => {
      try {
        const { naturalWidth: w, naturalHeight: h } = img;
        if (!w || !h) return finish(null);
        const scale = Math.min(1, MAX_REDRAW_EDGE_PX / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL("image/png");
        if (dataUrlByteLength(dataUrl) > maxBytes) {
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          dataUrl = canvas.toDataURL("image/jpeg", 0.88);
        }
        finish(dataUrlByteLength(dataUrl) <= maxBytes && isSafeImageDataUrl(dataUrl) ? dataUrl : null);
      } catch {
        finish(null);
      }
    };
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.src = url;
  });
}

function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
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
