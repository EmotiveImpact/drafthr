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
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { draftExtras, drafts } from "../../../src/db/schema.js";

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
  const tenantId = auth.activeTenant.id;

  const parsed = await readJsonRequest<ExtrasInput>(req, 4_000_000);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body || typeof body.id !== "string" || !body.id) return jsonError("Draft id required", 400);
  const extras = body.extras && typeof body.extras === "object" ? body.extras : {};

  try {
    const db = getDb();
    // IDOR: the draft must exist in the caller's tenant before we attach extras.
    const [draft] = await db
      .select({ id: drafts.id, tenantId: drafts.tenantId })
      .from(drafts)
      .where(eq(drafts.id, body.id))
      .limit(1);
    if (!draft) return jsonError("Draft not found", 404);
    if (draft.tenantId !== tenantId) {
      return jsonError("Draft belongs to a different workspace", 403);
    }

    await db
      .insert(draftExtras)
      .values({ draftId: body.id, tenantId, extrasJson: extras, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: draftExtras.draftId,
        // Scope the update to this tenant as defence-in-depth.
        where: eq(draftExtras.tenantId, tenantId),
        set: { extrasJson: extras, updatedAt: new Date() },
      });

    return new Response(JSON.stringify({ ok: true, id: body.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/draft-extras POST] failed", err);
    return jsonError("Draft extras sync failed", 500);
  }
}
