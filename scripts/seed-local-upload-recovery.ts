/** Simulate a completed byte transfer whose confirmation was interrupted.
 * Fictional, idempotent local fixture only; never resets an existing upload. */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, closeDb, databaseUrl } from "../src/db/index.js";
import { users, drafts, workspaceFiles } from "../src/db/schema.js";
import { fileStorageProvider, writeLocalFile } from "../api/_utils/workspace-file-storage.js";

if (process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR !== "1") throw new Error("Local emulator guard required");
databaseUrl();
if (fileStorageProvider() !== "local") throw new Error("Local private storage required");
const db = getDb();
const id = "6748275e-25fe-4935-ac5e-6ef82843b667";
try {
  const [user] = await db.select().from(users).where(eq(users.externalId, "user_local_drafthr_demo"));
  if (!user) throw new Error("Sign in with the fictional demo account first");
  const [draft] = await db.select().from(drafts).where(and(eq(drafts.id, "ed6a90e1-2bb2-458a-b418-393c7889d78a"), eq(drafts.authorUserId, user.id)));
  if (!draft || !draft.title?.startsWith("Fictional storage verification") || draft.deletedAt) throw new Error("Fictional local draft required");
  const [existing] = await db.select().from(workspaceFiles).where(eq(workspaceFiles.id, id));
  if (existing) {
    if (existing.tenantId !== draft.tenantId || existing.createdBy !== user.id || existing.draftId !== draft.id) throw new Error("Fixture ID belongs to another record");
    console.log(`Recovery fixture already exists (${existing.status}); left unchanged.`);
  } else {
    const bytes = Buffer.from("Fictional interrupted-upload recovery test. Not employee data and not an employment document.\n");
    const row = { id, tenantId: draft.tenantId, draftId: draft.id, createdBy: user.id, purpose: "evidence", status: "pending",
      filename: "fictional-interrupted-upload.txt", contentType: "text/plain", size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"), draftRevision: draft.revision,
      provider: "local", pathname: `workspace-files/${draft.tenantId}/${id}` };
    await writeLocalFile(row, bytes);
    await db.insert(workspaceFiles).values(row);
    console.log(`Fictional pending upload created: ${id}`);
  }
} finally { await closeDb(); }
