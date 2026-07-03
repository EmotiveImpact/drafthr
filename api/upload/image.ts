/**
 * Image upload endpoint — replaces base64-in-localStorage for letterhead /
 * signature images. Writes to Vercel Blob (S3-equivalent for this wave;
 * TODO: swap to S3 KMS-backed bucket when SOC 2 work picks up) and returns
 * a public URL the client persists on the profile/draft instead of the
 * data URL.
 *
 * Accepts either multipart/form-data (file field) or application/json
 * with { dataUrl, filename } — the JSON path is the path of least
 * resistance for the existing FileReader-based client code.
 *
 * SOFT failure mode: if BLOB_READ_WRITE_TOKEN is not configured, we
 * return { ok: false, error: "blob-not-configured" } so local dev keeps
 * working without Vercel Blob set up. The client helper falls back to
 * persisting the original data URL in that case.
 */
import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { rateLimit } from "../_utils/rate-limit.js";
import { enforceSameOrigin, jsonError } from "../_utils/request.js";
import { enforceProductionSession } from "../_utils/production-auth.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const MAX_BYTES = 2 * 1024 * 1024;
// Match repo policy from 0.6.0 security pass — NO SVG, mirrors safe-data-url.ts.
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
// data:image/png;base64,...  — keep the regex pinned to the same mime set above.
// Require at least one real base64 char so a whitespace-only payload doesn't
// match (consistent with isSafeImageDataUrl); the later \s+ strip + payload
// check are defence-in-depth.
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=][a-z0-9+/=\s]*)$/i;

export async function POST(req: Request): Promise<Response> {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;
  const rateLimitError = rateLimit(req, { name: "upload", max: 20, windowMs: 60_000 });
  if (rateLimitError) return rateLimitError;

  // Authenticate BEFORE any environment probe: checking the Blob token first
  // let an unauthenticated caller (past same-origin + rate-limit) distinguish
  // "blob configured" from "not configured" by the response shape. Gate on the
  // session first so the deployment's config posture isn't observable to anon.
  const sessionError = await enforceProductionSession(req);
  if (sessionError) return sessionError;

  // Soft-fail so local dev without a configured Blob store still works —
  // the client falls back to the original data URL.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonResponse({ ok: false, error: "blob-not-configured" }, 200);
  }

  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  let bytes: Uint8Array;
  let mime: string;

  if (contentType.includes("multipart/form-data")) {
    const parsed = await parseMultipart(req);
    if (!parsed.ok) return parsed.response;
    bytes = parsed.bytes;
    mime = parsed.mime;
  } else if (contentType.includes("application/json")) {
    const parsed = await parseJsonDataUrl(req);
    if (!parsed.ok) return parsed.response;
    bytes = parsed.bytes;
    mime = parsed.mime;
  } else {
    return jsonError("Content-Type must be multipart/form-data or application/json", 415);
  }

  if (bytes.byteLength > MAX_BYTES) {
    return jsonError("Image too large (max 2 MB)", 413);
  }
  if (!isValidImagePayload(bytes, mime)) {
    return jsonError("Invalid image payload", 415);
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const ext = EXT_FOR_MIME[mime] ?? "bin";
  // Content-addressed path — uploading the same image twice dedups.
  const pathname = `letterheads/${sha256}.${ext}`;

  try {
    // @vercel/blob's PutBody type accepts Buffer (Node) — wrap so TS is happy
    // without changing the on-disk bytes.
    const blob = await put(pathname, Buffer.from(bytes), {
      access: "public",
      contentType: mime,
      // addRandomSuffix off → stable content-addressed URL across uploads.
      addRandomSuffix: false,
      // allowOverwrite so re-uploading the same content-addressed key is a no-op
      // rather than a 409. The bytes are identical (sha256 in the key), so this
      // is safe by construction.
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return jsonResponse({ ok: true, url: blob.url }, 200);
  } catch (err) {
    console.error("[upload/image] blob put failed", err);
    return jsonResponse({ ok: false, error: "upload-failed" }, 502);
  }
}

type ParseOk = { ok: true; bytes: Uint8Array; mime: string };
type ParseErr = { ok: false; response: Response };

async function parseMultipart(req: Request): Promise<ParseOk | ParseErr> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, response: jsonError("Invalid multipart body", 400) };
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, response: jsonError("file field required", 400) };
  }
  const mime = file.type.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, response: jsonError("Unsupported image type", 415) };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, response: jsonError("Image too large (max 2 MB)", 413) };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  return { ok: true, bytes: buf, mime };
}

async function parseJsonDataUrl(req: Request): Promise<ParseOk | ParseErr> {
  let body: { dataUrl?: unknown; filename?: unknown };
  try {
    const raw = await req.text();
    // Cheap pre-check before JSON.parse — a 2 MB image base64-encoded is
    // ~2.7 MB. Cap at 4 MB to leave headroom for the JSON envelope.
    if (raw.length > 4_000_000) {
      return { ok: false, response: jsonError("Request body too large", 413) };
    }
    body = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError("Invalid JSON", 400) };
  }
  if (typeof body.dataUrl !== "string") {
    return { ok: false, response: jsonError("dataUrl required", 400) };
  }
  const match = DATA_URL_RE.exec(body.dataUrl);
  if (!match) {
    return { ok: false, response: jsonError("Unsupported image data URL", 415) };
  }
  const mimeRaw = match[1].toLowerCase();
  // Normalize image/jpg → image/jpeg so downstream allowlist + content-type are canonical.
  const mime = mimeRaw === "image/jpg" ? "image/jpeg" : mimeRaw;
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, response: jsonError("Unsupported image type", 415) };
  }
  const b64 = match[2].replace(/\s+/g, "");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  } catch {
    return { ok: false, response: jsonError("Invalid base64 payload", 400) };
  }
  return { ok: true, bytes, mime };
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function isValidImagePayload(bytes: Uint8Array, mime: string): boolean {
  switch (mime) {
    case "image/png":
      return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return hasBytes(bytes, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return startsWithAscii(bytes, "GIF87a") || startsWithAscii(bytes, "GIF89a");
    case "image/webp":
      return startsWithAscii(bytes, "RIFF") && startsWithAscii(bytes.subarray(8), "WEBP");
    default:
      return false;
  }
}

function hasBytes(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function startsWithAscii(bytes: Uint8Array, value: string): boolean {
  if (bytes.byteLength < value.length) return false;
  for (let i = 0; i < value.length; i += 1) {
    if (bytes[i] !== value.charCodeAt(i)) return false;
  }
  return true;
}
