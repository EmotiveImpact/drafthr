import { get } from "@vercel/blob";
import { isTenantPrivateImagePath } from "../../src/lib/storage/privateImageUrl.js";
import { jsonError } from "./request.js";
import { findWorkspaceAsset } from "./workspace-assets.js";
import { readWorkspaceFile } from "./workspace-file-storage.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Called only after session + active-tenant authentication by the route or PDF export. */
export async function readPrivateImage(pathname: string, tenantId: string): Promise<Response> {
  if (!isTenantPrivateImagePath(pathname, tenantId)) return jsonError("Image not found", 404);
  if (process.env.DRAFTHR_DATABASE_WORKSPACE === "true") {
    try {
      const asset = await findWorkspaceAsset(pathname, tenantId);
      if (asset) {
        if (asset.status !== "ready") return jsonError("Image not found", 404);
        const bytes = await readWorkspaceFile(asset);
        return imageResponse(bytes, asset.contentType, asset.size);
      }
      // Compatibility for authenticated, tenant-scoped images uploaded before
      // asset metadata existed. Hash against the content-addressed path; do not
      // pretend an unregistered Blob has already been migrated into the DB.
      if (!process.env.BLOB_READ_WRITE_TOKEN) return jsonError("Image not found", 404);
      const extension = pathname.split(".").at(-1)!;
      const contentType = ({ png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[extension];
      const result = await get(pathname, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN, useCache: false });
      if (!result || result.statusCode !== 200) return jsonError("Image not found", 404);
      await result.stream.cancel();
      if (result.blob.size <= 0 || result.blob.size > MAX_IMAGE_BYTES) return jsonError("Invalid stored image", 415);
      const bytes = await readWorkspaceFile({ pathname, provider: "vercel", contentType, size: result.blob.size, sha256: pathname.split("/").at(-1)!.split(".")[0] });
      return imageResponse(bytes, contentType, bytes.byteLength);
    } catch {
      return jsonError("Image storage unavailable", 503);
    }
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return jsonError("Image storage unavailable", 503);

  try {
    const result = await get(pathname, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200) return jsonError("Image not found", 404);
    const { contentType, size } = result.blob;
    if (!ALLOWED_MIME.has(contentType) || size > MAX_IMAGE_BYTES) {
      await result.stream.cancel();
      return jsonError("Invalid stored image", 415);
    }
    return new Response(result.stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[upload/image] private blob get failed", err);
    return jsonError("Image storage unavailable", 502);
  }
}

function imageResponse(bytes: Uint8Array, contentType: string, size: number) {
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": contentType, "Content-Length": String(size),
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
