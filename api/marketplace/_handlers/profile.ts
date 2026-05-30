/**
 * /api/consultant/profile — CRUD for the signed-in user's consultant
 * marketplace card.
 *
 * GET    — returns the caller's profile (or 404 if not enrolled).
 * POST   — upsert (create or replace) — used by /c/profile on first save.
 * PATCH  — partial update (used by edit-in-place affordances).
 *
 * Vetting: profiles ship with status='pending_review'. They don't appear
 * in /api/consultant/marketplace until an admin (or the user — see
 * VETTING_AUTO_PUBLISH below) flips them to 'published'.
 *
 * Until a real admin surface exists, VETTING_AUTO_PUBLISH=1 in the env
 * publishes profiles immediately on first save so the marketplace isn't
 * empty during early development. Flip it off before launch.
 */
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { consultantProfiles } from "../../../src/db/schema.js";

export const config = { runtime: "nodejs" };

const AUTO_PUBLISH = process.env.VETTING_AUTO_PUBLISH === "1";

type Availability = "this_week" | "one_two_weeks" | "three_four_weeks" | "booked";
const AVAILABILITY_VALUES: Availability[] = [
  "this_week",
  "one_two_weeks",
  "three_four_weeks",
  "booked",
];

type ProfileInput = {
  fullName?: string;
  role?: string;
  bio?: string;
  specialty?: string;
  specialties?: string[];
  price?: number;
  currency?: "GBP" | "USD" | "EUR";
  sla?: string;
  photoUrl?: string | null;
  availability?: Availability;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Self-contained base64 image data URLs (the current upload path) — no
// external fetch, safe to render on the public listing.
const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;

/**
 * Validate a consultant photoUrl before it lands on the public marketplace
 * card. Returns { ok, value } — value is the sanitised URL or null.
 *
 * The card is rendered to anonymous visitors, so an unvalidated photoUrl is
 * a beacon / script-injection surface. Allowed:
 *   - null / "" (no photo — clears it)
 *   - data:image/{png,jpg,webp,gif};base64,…  (self-contained, no fetch)
 *   - https://…                                (standard remote image)
 * Rejected: http://, javascript:, data:text/html, and any other scheme —
 * which kills the XSS and mixed-content vectors. (A pure https-beacon to an
 * arbitrary host is lower-severity and tracked in ROADMAP P3; over-
 * restricting to one host would break existing base64 + placeholder usage.)
 */
export function validatePhotoUrl(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false };
  const v = input.trim();
  if (v.length > 2_000_000) return { ok: false }; // ~1.5 MB base64 ceiling
  if (SAFE_DATA_IMAGE_RE.test(v)) return { ok: true, value: v };
  try {
    const u = new URL(v);
    if (u.protocol === "https:") return { ok: true, value: v };
  } catch {
    /* not a parseable URL */
  }
  return { ok: false };
}

export async function GET(req: Request): Promise<Response> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const [row] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.userId, auth.userRow.id))
    .limit(1);

  if (!row) {
    return new Response(JSON.stringify({ profile: null }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return new Response(JSON.stringify({ profile: toClient(row) }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  return writeProfile(req, "POST");
}

export async function PATCH(req: Request): Promise<Response> {
  return writeProfile(req, "PATCH");
}

async function writeProfile(req: Request, method: "POST" | "PATCH"): Promise<Response> {
  const originRes = enforceSameOrigin(req);
  if (originRes) return originRes;
  const limited = rateLimit(req, { name: "consultant-profile", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const parsed = await readJsonRequest<ProfileInput>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.userId, auth.userRow.id))
    .limit(1);

  const fullName = (body.fullName ?? existing?.fullName ?? "").trim();
  const role = (body.role ?? existing?.role ?? "").trim();
  const bio = (body.bio ?? existing?.bio ?? "").trim();

  if (method === "POST") {
    if (!fullName) return jsonError("fullName is required", 400);
    if (!role) return jsonError("role (title) is required", 400);
    if (bio.length < 20)
      return jsonError("bio must be at least 20 characters", 400);
  }

  const initials = fullName ? initialsOf(fullName) : existing?.initials ?? "??";
  const specialties = Array.isArray(body.specialties)
    ? body.specialties.filter((s): s is string => typeof s === "string" && s.length > 0)
    : (existing?.specialties as string[] | undefined) ?? [];

  // Validate photoUrl unless the field was omitted entirely (keep existing).
  let photoUrl: string | null = existing?.photoUrl ?? null;
  if ("photoUrl" in body) {
    const checked = validatePhotoUrl(body.photoUrl);
    if (!checked.ok) {
      return jsonError(
        "photoUrl must be an https URL or a base64 image data URL",
        400,
      );
    }
    photoUrl = checked.value;
  }

  const values = {
    userId: auth.userRow.id,
    initials,
    fullName,
    role,
    bio,
    specialty: (body.specialty ?? existing?.specialty ?? "").trim(),
    specialties,
    price: clampInt(body.price ?? existing?.price ?? 150, 0, 5000),
    currency: (body.currency ?? existing?.currency ?? "GBP") as "GBP" | "USD" | "EUR",
    sla: (body.sla ?? existing?.sla ?? "24-48h").slice(0, 32),
    availability:
      body.availability && AVAILABILITY_VALUES.includes(body.availability)
        ? body.availability
        : (existing?.availability ?? "this_week"),
    photoUrl: body.photoUrl === null ? null : body.photoUrl ?? existing?.photoUrl ?? null,
    // First save publishes immediately when VETTING_AUTO_PUBLISH=1, otherwise
    // pending_review. Subsequent updates preserve whatever the admin set.
    status:
      existing?.status ??
      ((AUTO_PUBLISH ? "published" : "pending_review") as
        | "published"
        | "pending_review"),
    updatedAt: new Date(),
  };

  if (!existing) {
    const [row] = await db
      .insert(consultantProfiles)
      .values(values)
      .returning();
    return new Response(JSON.stringify({ profile: toClient(row), created: true }), {
      status: 201,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const [row] = await db
    .update(consultantProfiles)
    .set(values)
    .where(eq(consultantProfiles.id, existing.id))
    .returning();
  return new Response(JSON.stringify({ profile: toClient(row), created: false }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function DELETE(req: Request): Promise<Response> {
  const originRes = enforceSameOrigin(req);
  if (originRes) return originRes;
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  await db
    .delete(consultantProfiles)
    .where(eq(consultantProfiles.userId, auth.userRow.id));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clampInt(n: number, lo: number, hi: number): number {
  const v = Number.isFinite(n) ? Math.round(n) : lo;
  return Math.min(hi, Math.max(lo, v));
}

function toClient(row: typeof consultantProfiles.$inferSelect) {
  return {
    id: row.id,
    initials: row.initials,
    fullName: row.fullName,
    role: row.role,
    bio: row.bio,
    specialty: row.specialty,
    specialties: row.specialties,
    price: row.price,
    currency: row.currency,
    sla: row.sla,
    availability: row.availability,
    rating: row.rating / 10,
    reviews: row.reviews,
    photoUrl: row.photoUrl,
    status: row.status,
    updatedAt: row.updatedAt.getTime(),
  };
}
