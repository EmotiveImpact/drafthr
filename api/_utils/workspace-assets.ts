import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { getDb } from "../../src/db/index.js";
import { workspaceAssets } from "../../src/db/schema.js";
import { appendAuditEvent } from "../../src/db/audit.js";
import { isTenantPrivateImagePath } from "../../src/lib/storage/privateImageUrl.js";
import { fileStorageProvider, readWorkspaceFile, verifyFileBytes, writeLocalFile } from "./workspace-file-storage.js";

type AssetInput = { tenantId: string; userId: string; pathname: string; contentType: string; sha256: string; bytes: Uint8Array };

/** Content addressing makes interrupted and concurrent uploads retryable. A
 * failed audit leaves pending metadata and private bytes for a safe retry. */
export async function storeWorkspaceAsset(input: AssetInput): Promise<void> {
  if (!isTenantPrivateImagePath(input.pathname, input.tenantId)) throw new Error("Invalid asset path");
  const db = getDb();
  await db.insert(workspaceAssets).values({ tenantId: input.tenantId, createdBy: input.userId,
    pathname: input.pathname, contentType: input.contentType, size: input.bytes.byteLength,
    sha256: input.sha256, provider: fileStorageProvider() }).onConflictDoNothing({ target: workspaceAssets.pathname });
  const [row] = await db.select().from(workspaceAssets).where(and(eq(workspaceAssets.pathname, input.pathname), eq(workspaceAssets.tenantId, input.tenantId)));
  if (!row || row.contentType !== input.contentType || row.sha256 !== input.sha256) throw new Error("Asset metadata mismatch");
  verifyFileBytes(row, input.bytes);
  if (row.status === "ready") { await readWorkspaceFile(row); return; }
  if (row.provider === "local") await writeLocalFile(row, input.bytes);
  else {
    try {
      await put(row.pathname, Buffer.from(input.bytes), { access: "private", contentType: row.contentType,
        addRandomSuffix: false, allowOverwrite: false, token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch {
      // An identical object may already exist after a lost response. Never
      // accept that assumption without reading and hashing the stored object.
      await readWorkspaceFile(row);
    }
  }
  await readWorkspaceFile(row);
  await db.transaction(async tx => {
    const [current] = await tx.select().from(workspaceAssets).where(eq(workspaceAssets.id, row.id)).for("update");
    if (!current) throw new Error("Asset was removed before completion");
    if (current.status === "ready") return;
    await tx.update(workspaceAssets).set({ status: "ready", completedAt: new Date() }).where(eq(workspaceAssets.id, row.id));
    await appendAuditEvent({ tenantId: input.tenantId, actorUserId: input.userId, kind: "asset.uploaded",
      subjectType: "asset", subjectId: row.id, payload: { sha256: row.sha256, size: row.size, contentType: row.contentType } }, tx);
  });
}

export async function findWorkspaceAsset(pathname: string, tenantId: string) {
  const [row] = await getDb().select().from(workspaceAssets).where(and(eq(workspaceAssets.pathname, pathname), eq(workspaceAssets.tenantId, tenantId)));
  return row;
}
