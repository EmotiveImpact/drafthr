import { and, asc, eq, gt, isNull, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../src/db/index.js";
import { drafts, workspaceFiles } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { logAuthFailure } from "../../_utils/auth-diagnostics.js";
import { createFileUploadToken, fileStorageProvider, readWorkspaceFile, writeLocalFile } from "../../_utils/workspace-file-storage.js";
import { EVIDENCE_MIME, EXPORT_MIME, MAX_EVIDENCE_BYTES, MAX_EXPORT_BYTES, type WorkspaceFile } from "../../../src/lib/storage/workspace-file-types.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";

const prepareSchema = z.object({
  action: z.enum(["prepare", "prepare-import"]), id: z.string().uuid(), draftId: z.string().uuid(),
  importToken: z.string().uuid().optional(),
  purpose: z.enum(["evidence", "export"]), format: z.enum(["pdf", "docx", "txt", "pack"]).optional(),
  filename: z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f\x7f/\\]+$/),
  contentType: z.string().min(1).max(150), size: z.number().int().positive().max(MAX_EXPORT_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), draftRevision: z.number().int().nonnegative(),
}).strict();
type Row = typeof workspaceFiles.$inferSelect;
class FileError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
function failure(error: unknown) {
  if (error instanceof FileError) return jsonError(error.message, error.status);
  logAuthFailure("workspace-files", error);
  return jsonError("Private file storage is temporarily unavailable. The upload has not been confirmed.", 503);
}
async function guard(req: Request, write: boolean) {
  if (write) { const denied = enforceSameOrigin(req); if (denied) return { ok: false as const, response: denied }; }
  if (process.env.DRAFTHR_DATABASE_WORKSPACE !== "true") return { ok: false as const, response: jsonError("Database workspace storage is not enabled", 503) };
  const limited = await rateLimit(req, { name: "workspace-files", max: 120, windowMs: 60_000 });
  if (limited) return { ok: false as const, response: limited };
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth;
  const query = new URL(req.url).searchParams;
  // Authenticated download links cannot set custom headers. A query pin is
  // allowed for reads only; neither value grants membership or access.
  const pin = req.headers.get("X-Workspace-ID") ?? (!write ? query.get("workspaceId") : null);
  if (!auth.activeTenant || !auth.activeMember || serverUuidOrNull(pin) !== auth.activeTenant.id) {
    return { ok: false as const, response: jsonError("The active workspace changed. Reload before continuing.", 409) };
  }
  if (write && !["owner", "admin", "drafter", "reviewer"].includes(auth.activeMember.role)) {
    return { ok: false as const, response: jsonError("This workspace role is read-only", 403) };
  }
  return { ok: true as const, tenantId: auth.activeTenant.id, userId: auth.userRow.id };
}
function metadata(row: Row): Omit<WorkspaceFile, "completedAt"> & { completedAt: number | null } {
  const snapshot = row.snapshotJson as { title?: string; employee?: { legalName?: string }; employer?: { legalName?: string }; mode?: string } | null;
  return { id: row.id, draftId: (row.draftId ?? row.importDraftId)!, purpose: row.purpose as WorkspaceFile["purpose"],
    format: row.format as WorkspaceFile["format"], filename: row.filename, contentType: row.contentType,
    size: row.size, sha256: row.sha256, draftRevision: row.draftRevision,
    createdAt: row.createdAt.getTime(), completedAt: row.completedAt?.getTime() ?? null,
    title: snapshot?.title, recipient: snapshot?.mode === "employee" ? snapshot.employer?.legalName : snapshot?.employee?.legalName };
}
async function ownedFile(id: string, tenantId: string) {
  const [row] = await getDb().select().from(workspaceFiles).where(and(eq(workspaceFiles.id, id), eq(workspaceFiles.tenantId, tenantId)));
  if (!row) throw new FileError("File not found", 404);
  return row;
}

export async function POST(req: Request): Promise<Response> {
  const access = await guard(req, true);
  if (!access.ok) return access.response;
  const parsed = await readJsonRequest<Record<string, unknown>>(req, 8_000);
  if (!parsed.ok) return parsed.response;
  try {
    if (parsed.body?.action === "prepare" || parsed.body?.action === "prepare-import") {
      const validated = prepareSchema.safeParse(parsed.body);
      if (!validated.success) return jsonError("Invalid file metadata", 400);
      const body = validated.data;
      const importing = body.action === "prepare-import";
      if (importing ? (!body.importToken || body.draftRevision !== 0 || body.purpose !== "evidence")
        : (body.importToken !== undefined || body.draftRevision < 1)) return jsonError("Invalid import metadata", 400);
      if (body.purpose === "evidence" ? (!EVIDENCE_MIME.has(body.contentType) || body.size > MAX_EVIDENCE_BYTES || body.format !== undefined)
        : (!body.format || EXPORT_MIME[body.format] !== body.contentType)) return jsonError("Unsupported file type or size", 415);
      const provider = fileStorageProvider();
      const row = await getDb().transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-records:${access.tenantId}`}, 0))`);
        const [existing] = await tx.select().from(workspaceFiles).where(eq(workspaceFiles.id, body.id));
        if (existing) {
          if (existing.tenantId !== access.tenantId || existing.createdBy !== access.userId) throw new FileError("File not found", 404);
          if ((existing.draftId ?? existing.importDraftId) !== body.draftId || existing.importToken !== (body.importToken ?? null)) throw new FileError("This upload ID belongs to another draft or import");
          for (const key of ["purpose", "filename", "contentType", "size", "sha256", "draftRevision"] as const) {
            if (existing[key] !== body[key]) throw new FileError("This upload ID already belongs to different content");
          }
          if (existing.format !== (body.format ?? null)) throw new FileError("This upload ID already belongs to another format");
          return existing;
        }
        const [draft] = importing ? [] : await tx.select().from(drafts).where(and(eq(drafts.id, body.draftId), eq(drafts.tenantId, access.tenantId), isNull(drafts.deletedAt)));
        if (!importing && !draft) throw new FileError("Draft not found", 404);
        if (!importing && (!draft!.snapshotJson || draft!.revision !== body.draftRevision)) throw new FileError("The draft changed. Save and reload it before uploading or exporting.");
        const [created] = await tx.insert(workspaceFiles).values({ ...body, format: body.format ?? null,
          draftId: importing ? null : body.draftId, importToken: body.importToken ?? null, importDraftId: importing ? body.draftId : null,
          tenantId: access.tenantId, createdBy: access.userId, provider,
          pathname: `workspace-files/${access.tenantId}/${body.id}`,
          snapshotJson: body.purpose === "export" ? draft!.snapshotJson : null,
        }).returning();
        return created;
      });
      if (row.status === "ready") return json({ ready: true, file: metadata(row) });
      return json({ ready: false, id: row.id, pathname: row.pathname, provider: row.provider, token: await createFileUploadToken(row) });
    }
    if (parsed.body?.action !== "complete" || !serverUuidOrNull(parsed.body.id as string)) return jsonError("Invalid upload action", 400);
    const file = await ownedFile(String(parsed.body.id), access.tenantId);
    if (file.createdBy !== access.userId) throw new FileError("Only the uploader can complete this file", 403);
    if (file.status === "ready") return json({ file: metadata(file) });
    await readWorkspaceFile(file); // Read, bound, and hash actual stored bytes, not client claims.
    const ready = await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-records:${access.tenantId}`}, 0))`);
      const [current] = await tx.select().from(workspaceFiles).where(eq(workspaceFiles.id, file.id));
      if (current.status === "ready") return current;
      if (file.draftId) {
        const [draft] = await tx.select({ id: drafts.id }).from(drafts).where(and(eq(drafts.id, file.draftId), eq(drafts.tenantId, access.tenantId), isNull(drafts.deletedAt)));
        if (!draft) throw new FileError("This draft was deleted before the upload finished");
      } else if (!file.importToken || !file.importDraftId) throw new FileError("Invalid staged import");
      const [saved] = await tx.update(workspaceFiles).set({ status: "ready", completedAt: new Date() }).where(eq(workspaceFiles.id, file.id)).returning();
      await appendAuditEvent({ tenantId: access.tenantId, actorUserId: access.userId,
        kind: file.purpose === "export" ? "draft.exported" : "evidence.uploaded", subjectType: file.draftId ? "draft" : "file", subjectId: file.draftId ?? file.id,
        payload: { fileId: file.id, sha256: file.sha256, size: file.size, draftRevision: file.draftRevision, format: file.format } }, tx);
      return saved;
    });
    return json({ file: metadata(ready) });
  } catch (error) { return failure(error); }
}

/** Loopback demo adapter only. Hosted browsers upload directly to private Blob
 * using a scoped token, avoiding the serverless request-body size limit. */
export async function PATCH(req: Request): Promise<Response> {
  const access = await guard(req, true);
  if (!access.ok) return access.response;
  const id = serverUuidOrNull(new URL(req.url).searchParams.get("id"));
  if (!id) return jsonError("Invalid file ID", 400);
  try {
    const file = await ownedFile(id, access.tenantId);
    if (file.provider !== "local" || file.createdBy !== access.userId || fileStorageProvider() !== "local") return jsonError("Direct server upload is disabled", 403);
    if (file.status !== "pending") return jsonError("This file is immutable", 409);
    if (!req.body) return jsonError("File body required", 400);
    const reader = req.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > file.size) { await reader.cancel(); return jsonError("File exceeds its declared size", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    await writeLocalFile(file, Buffer.concat(chunks));
    return json({ uploaded: true });
  } catch (error) { return failure(error); }
}

export async function GET(req: Request): Promise<Response> {
  const access = await guard(req, false);
  if (!access.ok) return access.response;
  const query = new URL(req.url).searchParams;
  try {
    if (query.has("id")) {
      const id = serverUuidOrNull(query.get("id"));
      if (!id) return jsonError("File not found", 404);
      const file = await ownedFile(id, access.tenantId);
      if (file.status !== "ready") return jsonError("File not found", 404);
      // Evidence on deleted drafts is not exposed. Completed exports remain
      // available as historical artifacts even when their draft is soft-deleted.
      if (!file.draftId) {
        if (file.createdBy !== access.userId || !file.importToken || query.get("importToken") !== file.importToken) return jsonError("File not found", 404);
      } else if (file.purpose === "evidence") {
        // Duplicating a draft can retain an immutable evidence reference in
        // the same workspace. Deleting the source draft must not break copies.
        const [draft] = await getDb().select({ id: drafts.id }).from(drafts).where(and(
          eq(drafts.tenantId, access.tenantId), isNull(drafts.deletedAt),
          or(eq(drafts.id, file.draftId), sql`${drafts.snapshotJson}->'evidence' @> ${JSON.stringify([{ fileId: file.id }])}::jsonb`),
        )).limit(1);
        if (!draft) return jsonError("File not found", 404);
      }
      const bytes = await readWorkspaceFile(file);
      let start = 0, end = bytes.byteLength - 1;
      const range = req.headers.get("Range");
      if (range) {
        const match = /^bytes=(\d+)-(\d+)$/.exec(range);
        if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2])) ||
            Number(match[1]) > Number(match[2]) || Number(match[2]) >= bytes.byteLength) {
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}`, "Cache-Control": "no-store" } });
        }
        start = Number(match[1]); end = Number(match[2]);
      }
      return new Response(Buffer.from(bytes.subarray(start, end + 1)), { status: range ? 206 : 200, headers: {
        "Content-Type": file.contentType, "Content-Length": String(bytes.byteLength),
        "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`, "Content-Length": String(end - start + 1) } : {}),
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
      } });
    }
    const cursor = query.get("cursor"), draftId = query.get("draftId");
    if ((cursor && !serverUuidOrNull(cursor)) || (draftId && !serverUuidOrNull(draftId))) return jsonError("Invalid file cursor or draft ID", 400);
    const purpose = query.get("purpose") ?? "export";
    if (!["export", "evidence"].includes(purpose)) return jsonError("Invalid file purpose", 400);
    const recovery = query.get("recovery") === "true";
    if (recovery) {
      if (purpose !== "evidence" || !draftId) return jsonError("Evidence recovery requires a draft", 400);
      const [draft] = await getDb().select({ id: drafts.id }).from(drafts).where(and(
        eq(drafts.id, draftId), eq(drafts.tenantId, access.tenantId), isNull(drafts.deletedAt),
      ));
      if (!draft) return jsonError("Draft not found", 404);
    }
    const rows = await getDb().select().from(workspaceFiles).where(and(
      eq(workspaceFiles.tenantId, access.tenantId), eq(workspaceFiles.purpose, purpose),
      recovery ? or(eq(workspaceFiles.status, "ready"), and(eq(workspaceFiles.status, "pending"), eq(workspaceFiles.createdBy, access.userId)))
        : eq(workspaceFiles.status, "ready"),
      isNotNull(workspaceFiles.draftId),
      cursor ? gt(workspaceFiles.id, cursor) : undefined, draftId ? eq(workspaceFiles.draftId, draftId) : undefined,
    )).orderBy(asc(workspaceFiles.id)).limit(101);
    const page = rows.slice(0, 100);
    return json({ files: page.map(row => recovery ? { ...metadata(row), status: row.status } : metadata(row)), nextCursor: rows.length > 100 ? page[page.length - 1].id : null });
  } catch (error) { return failure(error); }
}
