/**
 * Client-side image uploader — posts a base64 data URL to /api/upload/image
 * and returns the resulting Blob URL.
 *
 * Falls back to returning the original data URL unchanged when:
 *   - the endpoint reports `blob-not-configured` (local dev without Vercel
 *     Blob set up — see api/upload/image.ts soft-fail path)
 *   - the network call fails after one retry
 *
 * Fall-back preserves the existing behavior so the app keeps working before
 * the user has wired Vercel Blob; production with the env var set fails hard
 * via the toast / error log if the upload still doesn't go through.
 */

type UploadResponse = { ok: true; url: string } | { ok: false; error: string };

const ENDPOINT = "/api/upload/image";

export async function uploadImage(input: {
  dataUrl: string;
  filename: string;
}): Promise<string> {
  // No network call for non-data URLs — they're already remote, return as-is.
  if (!input.dataUrl.startsWith("data:")) return input.dataUrl;

  try {
    const result = await postWithRetry(input);
    if (result.ok) return result.url;
    // Soft failure: keep working in dev / when ops hasn't provisioned Blob yet.
    if (result.error === "blob-not-configured") return input.dataUrl;
    console.warn("[uploadImage] upload failed, falling back to data URL", result.error);
    return input.dataUrl;
  } catch (err) {
    console.warn("[uploadImage] network error, falling back to data URL", err);
    return input.dataUrl;
  }
}

async function postWithRetry(input: {
  dataUrl: string;
  filename: string;
}): Promise<UploadResponse> {
  const first = await postOnce(input);
  if (first.kind === "ok") return first.body;
  // Retry once on 5xx — transient blob hiccups are common, 4xx is deterministic.
  if (first.kind === "retry") {
    const second = await postOnce(input);
    if (second.kind === "ok") return second.body;
    if (second.kind === "retry") return { ok: false, error: "upload-failed" };
    return second.body;
  }
  return first.body;
}

type PostResult =
  | { kind: "ok"; body: UploadResponse }
  | { kind: "retry"; body: UploadResponse }
  | { kind: "error"; body: UploadResponse };

async function postOnce(input: {
  dataUrl: string;
  filename: string;
}): Promise<PostResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  let body: UploadResponse;
  try {
    body = (await response.json()) as UploadResponse;
  } catch {
    body = { ok: false, error: `bad-response-${response.status}` };
  }
  if (response.ok && (body as UploadResponse).ok) {
    return { kind: "ok", body };
  }
  if (response.status >= 500) return { kind: "retry", body };
  return { kind: "error", body };
}
