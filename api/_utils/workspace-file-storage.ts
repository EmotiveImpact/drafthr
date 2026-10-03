import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { databaseUrl } from "../../src/db/index.js";
import { parsePrivateImageUrl, privateImageUrl } from "../../src/lib/storage/privateImageUrl.js";

type StoredFile = { pathname: string; provider: string; size: number; sha256: string; contentType: string };

export function fileStorageProvider(): "local" | "vercel" {
  if (process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR === "1") {
    localRoot();
    return "local";
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Private file storage is not configured");
  return "vercel";
}
function localRoot() {
  if (process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR !== "1" || process.env.NODE_ENV === "production" ||
      (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development")) throw new Error("Local file storage is disabled");
  databaseUrl(); // Includes the separate loopback database guard.
  const root = process.env.DRAFTHR_LOCAL_FILE_ROOT;
  if (!root || !path.isAbsolute(root) || root === "/") throw new Error("An absolute local demo file directory is required");
  return root;
}
function localPath(file: StoredFile) {
  const validPath = /^workspace-files\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(file.pathname) ||
    parsePrivateImageUrl(privateImageUrl(file.pathname)) === file.pathname;
  if (file.provider !== "local" || !validPath) throw new Error("Invalid local file path");
  return path.join(localRoot(), file.pathname);
}
export async function createFileUploadToken(file: StoredFile) {
  if (file.provider === "local") { localPath(file); return null; }
  if (fileStorageProvider() !== "vercel") throw new Error("File storage provider mismatch");
  return generateClientTokenFromReadWriteToken({
    pathname: file.pathname, token: process.env.BLOB_READ_WRITE_TOKEN,
    allowedContentTypes: [file.contentType], maximumSizeInBytes: file.size,
    addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 10 * 60_000,
  });
}
export function verifyFileBytes(file: StoredFile, bytes: Uint8Array) {
  if (bytes.byteLength !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    throw new Error("File size or checksum did not match the upload");
  }
}
export async function writeLocalFile(file: StoredFile, bytes: Uint8Array) {
  verifyFileBytes(file, bytes);
  const target = localPath(file);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  try { await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    verifyFileBytes(file, await readFile(target)); // Identical retries are safe; no overwrite.
  }
}
export async function readWorkspaceFile(file: StoredFile): Promise<Uint8Array> {
  if (file.provider === "local") {
    const bytes = await readFile(localPath(file));
    verifyFileBytes(file, bytes);
    return bytes;
  }
  if (fileStorageProvider() !== "vercel") throw new Error("File storage provider mismatch");
  const result = await get(file.pathname, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN, useCache: false });
  if (!result || result.statusCode !== 200) throw new Error("Uploaded file is unavailable");
  if (result.blob.size !== file.size || result.blob.contentType.split(";")[0] !== file.contentType) {
    await result.stream.cancel(); throw new Error("Stored file metadata did not match");
  }
  const reader = result.stream.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > file.size) { await reader.cancel(); throw new Error("Stored file is too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  verifyFileBytes(file, bytes);
  return bytes;
}
