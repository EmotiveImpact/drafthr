/**
 * GET /api/marketplace/admin-queue
 *
 * Cross-tenant list of consultant profiles for the admin vetting screen.
 * Admin-only (server-side `DRAFTHR_ADMIN_EMAILS` allowlist). Defaults to
 * the review queue (status='pending_review'); ?status=all returns every
 * profile so an admin can re-moderate published/rejected ones too.
 *
 * Returns the consultant's email (joined from users) so the admin knows
 * who they're approving — this is an admin surface, so that PII exposure
 * is intentional and gated.
 */
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "../../_utils/admin.js";
import { getDb } from "../../../src/db/index.js";
import { consultantProfiles, users } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const url = new URL(req.url);
  const wantAll = url.searchParams.get("status") === "all";

  const db = getDb();
  const base = db
    .select({
      id: consultantProfiles.id,
      initials: consultantProfiles.initials,
      fullName: consultantProfiles.fullName,
      role: consultantProfiles.role,
      bio: consultantProfiles.bio,
      specialty: consultantProfiles.specialty,
      specialties: consultantProfiles.specialties,
      price: consultantProfiles.price,
      currency: consultantProfiles.currency,
      sla: consultantProfiles.sla,
      photoUrl: consultantProfiles.photoUrl,
      status: consultantProfiles.status,
      createdAt: consultantProfiles.createdAt,
      updatedAt: consultantProfiles.updatedAt,
      email: users.email,
    })
    .from(consultantProfiles)
    .leftJoin(users, eq(users.id, consultantProfiles.userId))
    .orderBy(desc(consultantProfiles.updatedAt));

  const rows = wantAll
    ? await base
    : await base.where(eq(consultantProfiles.status, "pending_review"));

  const profiles = rows.map((r) => ({
    ...r,
    rating: undefined, // admins don't need the rating column here
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  }));

  return new Response(JSON.stringify({ profiles, count: profiles.length }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
