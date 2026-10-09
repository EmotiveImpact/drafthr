/**
 * /api/store/draft-extras — sync target for a draft's collaboration data
 * (comments, timeline, approvals, outcomeSought) that the draft row + sections
 * don't carry.
 *
 * Deliberately SEPARATE from /api/store/drafts so it's fully decoupled: a failed
 * or absent extras write/read can never block a draft from saving or loading.
 * Same guards as drafts (same-origin + dual-write flag + rate-limit + session/
 * tenant + IDOR). Excludes evidence file blobs (those are base64 → object
 * storage, not a JSON column).
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { draftExtras, drafts } from "../../../src/db/schema.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";
import {
  approvalsForWrite,
  commentsForWrite,
  rejectReadOnlyMember,
  timelineForWrite,
} from "../../_utils/workspace-role.js";

export const config = { runtime: "nodejs" };

type ExtrasInput = {
  /** Draft id (already mapped to the server UUID by the client). */
  id: string;
  extras: Record<string, unknown>;
};

export async function GET(req: Request): Promise<Response> {
  if (process.env.DRAFTHR_DUAL_WRITE !== "true") return jsonError("Dual-write disabled", 503);
  const limited = rateLimit(req, { name: "store-draft-extras-get", max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);

  try {
    const db = getDb();
    const rows = await db
      .select({
        draftId: draftExtras.draftId,
        extras: draftExtras.extrasJson,
        updatedAt: draftExtras.updatedAt,
      })
      .from(draftExtras)
      .where(eq(draftExtras.tenantId, auth.activeTenant.id));

    const out = rows.map((r) => ({
      id: r.draftId,
      extras: r.extras ?? {},
      updatedAt: r.updatedAt.getTime(),
    }));
    return new Response(JSON.stringify({ extras: out }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/draft-extras GET] failed", err);
    return jsonError("Draft extras fetch failed", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  if (process.env.DRAFTHR_DUAL_WRITE !== "true") return jsonError("Dual-write disabled", 503);
  const limited = rateLimit(req, { name: "store-draft-extras", max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const readOnly = rejectReadOnlyMember(auth);
  if (readOnly) return readOnly;
  const tenantId = auth.activeTenant.id;

  const parsed = await readJsonRequest<ExtrasInput>(req, 4_000_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body || typeof body.id !== "string" || !body.id) return jsonError("Draft id required", 400);
  // Guard the uuid-column query: a non-uuid client id would otherwise throw a
  // Postgres 22P02 and surface as a 500 (400 is the app's convention here).
  const draftId = serverUuidOrNull(body.id);
  if (!draftId) return jsonError("Invalid draft id", 400);
  const incoming = body.extras && typeof body.extras === "object" ? body.extras : {};

  try {
    const db = getDb();
    // IDOR: the draft must exist in the caller's tenant before we attach extras.
    const [draft] = await db
      .select({ id: drafts.id, tenantId: drafts.tenantId, deletedAt: drafts.deletedAt })
      .from(drafts)
      .where(eq(drafts.id, draftId))
      .limit(1);
    if (!draft) return jsonError("Draft not found", 404);
    if (draft.tenantId !== tenantId) {
      return jsonError("Draft belongs to a different workspace", 403);
    }
    if (draft.deletedAt) return jsonError("Draft was deleted", 410);

    // Merge per item against what the server already holds, never replace
    // the blob: approvals are append-only and only approvers may add
    // decisions (approvalsForWrite); comments merge by id with tombstones and
    // author-only deletes (commentsForWrite); the timeline is append-only.
    const [existing] = await db
      .select({ extras: draftExtras.extrasJson })
      .from(draftExtras)
      .where(and(eq(draftExtras.draftId, draftId), eq(draftExtras.tenantId, tenantId)))
      .limit(1);
    const stored = (existing?.extras as Record<string, unknown> | null) ?? {};
    const inc = incoming as Record<string, unknown>;
    const extras = {
      ...stored,
      ...incoming,
      comments: commentsForWrite(auth, stored.comments, inc.comments),
      timeline: timelineForWrite(stored.timeline, inc.timeline),
      approvals: approvalsForWrite(auth, stored.approvals, inc.approvals),
      outcomeSought: "outcomeSought" in inc ? inc.outcomeSought : stored.outcomeSought,
    };

    await db
      .insert(draftExtras)
      .values({ draftId, tenantId, extrasJson: extras, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: draftExtras.draftId,
        // Scope the update to this tenant as defence-in-depth.
        where: eq(draftExtras.tenantId, tenantId),
        set: { extrasJson: extras, updatedAt: new Date() },
      });

    // Return the merged result so the caller can adopt other devices' changes.
    return new Response(JSON.stringify({ ok: true, id: draftId, extras }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/draft-extras POST] failed", err);
    return jsonError("Draft extras sync failed", 500);
  }
}
