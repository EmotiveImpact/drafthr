import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../src/db/index.js";
import { workspaceCompanySettings, workspaceUserPreferences } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { defaultWorkspacePreferences, workspacePreferencesSchema, type WorkspacePreferences } from "../../../src/lib/workspace-preferences.js";
import { recordsEqual } from "../../../src/lib/record-equality.js";
import { toServerUuid } from "../../../src/lib/remote-ids.js";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { logAuthFailure } from "../../_utils/auth-diagnostics.js";
import { isTenantPrivateImagePath, parsePrivateImageUrl } from "../../../src/lib/storage/privateImageUrl.js";

async function access(req: Request) {
  if (process.env.DRAFTHR_DATABASE_WORKSPACE !== "true") return { ok: false as const, response: jsonError("Workspace storage disabled", 503) };
  const origin = req.method === "GET" ? null : enforceSameOrigin(req);
  if (origin) return { ok: false as const, response: origin };
  const limited = await rateLimit(req, { name: "workspace-preferences", max: 120, windowMs: 60_000 });
  if (limited) return { ok: false as const, response: limited };
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth;
  if (!auth.activeTenant || !auth.activeMember) return { ok: false as const, response: jsonError("Workspace membership required", 403) };
  if (req.headers.get("X-Workspace-ID") !== auth.activeTenant.id) return { ok: false as const, response: Response.json({ error: "Workspace changed", code: "workspace_changed" }, { status: 409 }) };
  return { ok: true as const, tenantId: auth.activeTenant.id, userId: auth.userRow.id, role: auth.activeMember.role,
    id: toServerUuid(`preferences:${auth.activeTenant.id}:${auth.userRow.id}`) };
}
export async function GET(req: Request): Promise<Response> {
  const auth = await access(req); if (!auth.ok) return auth.response;
  try {
    // One repeatable-read transaction keeps the summed revision and its two
    // component snapshots coherent even while another owner changes company details.
    const result = await getDb().transaction(async tx => {
      const [personal] = await tx.select().from(workspaceUserPreferences).where(and(eq(workspaceUserPreferences.tenantId, auth.tenantId), eq(workspaceUserPreferences.userId, auth.userId))).limit(1);
      const [company] = await tx.select().from(workspaceCompanySettings).where(eq(workspaceCompanySettings.tenantId, auth.tenantId)).limit(1);
      const snapshot = personal ? workspacePreferencesSchema.parse(personal.snapshotJson) : defaultWorkspacePreferences(auth.id);
      if (snapshot.role === "employer" || snapshot.role === null) snapshot.employer = company?.employerJson ?? {};
      return { id: auth.id, revision: (personal?.revision ?? 0) + (company?.revision ?? 0), snapshot, deletedAt: null };
    }, { isolationLevel: "repeatable read" });
    return Response.json({ documents: [result], nextCursor: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { logAuthFailure("workspace-preferences-read", error); return jsonError("Could not load workspace settings", 503); }
}
export async function POST(req: Request): Promise<Response> {
  const auth = await access(req); if (!auth.ok) return auth.response;
  const parsed = await readJsonRequest<{ snapshot?: unknown; baseRevision?: number; id?: string }>(req, 4_500_000);
  if (!parsed.ok) return parsed.response;
  const input = workspacePreferencesSchema.safeParse(parsed.body.snapshot);
  if (!input.success || input.data.id !== auth.id || parsed.body.id !== auth.id || !Number.isSafeInteger(parsed.body.baseRevision) || (parsed.body.baseRevision ?? -1) < 0) return jsonError("Invalid workspace settings", 400);
  const snapshot: WorkspacePreferences = input.data;
  for (const image of [snapshot.employer.letterheadDataUrl, snapshot.employer.signatureDataUrl]) {
    const path = image ? parsePrivateImageUrl(image) : null;
    if (path && !isTenantPrivateImagePath(path, auth.tenantId)) return jsonError("Image belongs to another workspace", 422);
  }
  try {
    return await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-records:${auth.tenantId}`}, 0))`);
      const [personal] = await tx.select().from(workspaceUserPreferences).where(and(eq(workspaceUserPreferences.tenantId, auth.tenantId), eq(workspaceUserPreferences.userId, auth.userId))).limit(1);
      const [company] = await tx.select().from(workspaceCompanySettings).where(eq(workspaceCompanySettings.tenantId, auth.tenantId)).limit(1);
      const revision = (personal?.revision ?? 0) + (company?.revision ?? 0);
      if (revision !== parsed.body.baseRevision) return Response.json({ error: "Settings changed on another device. Review the newer version first.", code: "revision_conflict" }, { status: 409 });
      const changesCompany = snapshot.role !== "employee" && !recordsEqual(snapshot.employer, company?.employerJson ?? {});
      if (changesCompany && !["owner", "admin"].includes(auth.role)) return jsonError("An owner or admin must change company details", 403);
      if (changesCompany) await tx.insert(workspaceCompanySettings).values({ tenantId: auth.tenantId, employerJson: snapshot.employer, revision: 1 })
        .onConflictDoUpdate({ target: workspaceCompanySettings.tenantId, set: { employerJson: snapshot.employer, revision: (company?.revision ?? 0) + 1, updatedAt: new Date() } });
      // Employer-mode company data never becomes a private stale duplicate.
      const privateSnapshot = { ...snapshot, employer: snapshot.role === "employee" ? snapshot.employer : {} };
      await tx.insert(workspaceUserPreferences).values({ id: auth.id, tenantId: auth.tenantId, userId: auth.userId, snapshotJson: privateSnapshot, revision: 1 })
        .onConflictDoUpdate({ target: workspaceUserPreferences.id, set: { snapshotJson: privateSnapshot, revision: (personal?.revision ?? 0) + 1, updatedAt: new Date() } });
      const nextRevision = revision + 1 + (changesCompany ? 1 : 0);
      await appendAuditEvent({ tenantId: auth.tenantId, actorUserId: auth.userId, kind: "workspace.preferences_updated", subjectType: "preferences", subjectId: auth.id,
        payload: { revision: nextRevision, companyChanged: changesCompany } }, tx);
      return Response.json({ id: auth.id, revision: nextRevision }, { headers: { "Cache-Control": "no-store" } });
    });
  } catch (error) { logAuthFailure("workspace-preferences-write", error); return jsonError("Could not save workspace settings", 503); }
}
