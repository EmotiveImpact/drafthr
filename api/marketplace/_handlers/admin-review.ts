/**
 * POST /api/marketplace/admin-review
 *
 * Approve or reject a consultant profile. Admin-only (server-side
 * allowlist). Body: { profileId, action: "approve" | "reject" }.
 *   approve → status = "published" (appears in the public marketplace)
 *   reject  → status = "rejected"  (hidden; consultant must revise)
 *
 * This is the REAL vetting action — the client `/admin/consultants` page
 * calls it. Unlike the old no-op, it mutates server state and is gated by
 * a server-side admin check, not a client allowlist.
 */
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireAdmin } from "../../_utils/admin.js";
import { getDb } from "../../../src/db/index.js";
import { consultantProfiles } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

type Body = { profileId?: string; action?: string };

export async function POST(req: Request): Promise<Response> {
  const originRes = enforceSameOrigin(req);
  if (originRes) return originRes;
  const limited = rateLimit(req, { name: "admin-review", max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const profileId = typeof parsed.body.profileId === "string" ? parsed.body.profileId : "";
  const action = parsed.body.action;
  if (!profileId) return jsonError("profileId required", 400);
  if (action !== "approve" && action !== "reject") {
    return jsonError("action must be 'approve' or 'reject'", 400);
  }

  const status = action === "approve" ? "published" : "rejected";

  const db = getDb();
  const [updated] = await db
    .update(consultantProfiles)
    .set({ status, updatedAt: new Date() })
    .where(eq(consultantProfiles.id, profileId))
    .returning({ id: consultantProfiles.id, status: consultantProfiles.status });

  if (!updated) return jsonError("Profile not found", 404);

  return new Response(JSON.stringify({ ok: true, id: updated.id, status: updated.status }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
