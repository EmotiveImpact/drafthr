/**
 * Client-side image uploader — posts a base64 data URL to /api/upload/image
 * and returns the authenticated same-origin image URL.
 *
 * Database workspaces never fall back to embedded browser-only data, including
 * local development. Scope guards discard completions after a workspace switch.
 */
import { isDatabaseWorkspaceEnabled } from "../workspace-flags";
import { isTenantPrivateImagePath, parsePrivateImageUrl } from "./privateImageUrl";
import { workspaceFileContext } from "../database-workspace";
import { rateLimitedRequest } from "./rate-limited-request";

export type ImageUploadScope = { tenantId: string; isCurrent: () => boolean };
export function imageUploadScope(): ImageUploadScope | undefined {
  if (!isDatabaseWorkspaceEnabled()) return undefined;
  return workspaceFileContext();
}
function assertCurrent(scope?: ImageUploadScope) {
  if (scope && !scope.isCurrent()) throw new Error("Workspace changed. Select the image again in your current workspace.");
}

type UploadResponse = { ok: true; url: string } | { ok: false; error: string };

const ENDPOINT = "/api/upload/image";

export async function uploadImage(input: {
  dataUrl: string;
  filename: string;
}, suppliedScope?: ImageUploadScope): Promise<string> {
  const scope = suppliedScope ?? imageUploadScope();
  const mayFallback = import.meta.env.DEV && !isDatabaseWorkspaceEnabled() && !scope;
  assertCurrent(scope);
  // No network call for non-data URLs — they're already remote, return as-is.
  if (!input.dataUrl.startsWith("data:")) {
    if (scope && !isTenantPrivateImagePath(parsePrivateImageUrl(input.dataUrl) ?? "", scope.tenantId)) throw new Error("This image does not belong to the current workspace.");
    return input.dataUrl;
  }

  try {
    const result = await postWithRetry(input, scope);
    assertCurrent(scope);
    if (result.ok) {
      if (scope && (typeof result.url !== "string" || !isTenantPrivateImagePath(parsePrivateImageUrl(result.url) ?? "", scope.tenantId))) throw new Error("Image storage returned an invalid workspace image.");
      return result.url;
    }
    if (mayFallback) {
      console.warn("[uploadImage] upload failed, falling back to data URL", result.error);
      return input.dataUrl;
    }
    throw new Error("Image storage is unavailable. Please try again later.");
  } catch (err) {
    if (mayFallback) {
      console.warn("[uploadImage] network error, falling back to data URL", err);
      return input.dataUrl;
    }
    throw err;
  }
}

async function postWithRetry(input: {
  dataUrl: string;
  filename: string;
}, scope?: ImageUploadScope): Promise<UploadResponse> {
  const first = await postOnce(input, scope);
  if (first.kind === "ok") return first.body;
  // Retry once on 5xx — transient blob hiccups are common, 4xx is deterministic.
  if (first.kind === "retry") {
    const second = await postOnce(input, scope);
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
}, scope?: ImageUploadScope): Promise<PostResult> {
  assertCurrent(scope);
  const response = await rateLimitedRequest(() => fetch(ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(scope ? { "X-Workspace-ID": scope.tenantId } : {}) },
    body: JSON.stringify(input),
  }), () => assertCurrent(scope));
  assertCurrent(scope);
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
