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
 *
 * Re-vetting: editing a field the admin vetted (see VETTED_FIELDS) sends a
 * published, paused or rejected profile back to 'pending_review', which takes
 * it out of the public listing until an admin approves it again. Cosmetic and
 * operational fields (photo, availability, turnaround) stay exempt. A
 * suspended profile stays suspended whatever is edited.
 */
import { eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { consultantBookings, consultantProfiles } from "../../../src/db/schema.js";
import { isSafeImageDataUrl } from "../../../src/lib/safe-data-url.js";

export const config = { runtime: "nodejs" };

// Dev/demo convenience: skip admin vetting and publish a consultant's first
// save immediately. HARD-DISABLED in production regardless of the flag, so a
// misconfigured prod env can never ship unvetted consultant cards (name, bio,
// rate, photo) to the public marketplace listing. (Security board PM-05.)
const AUTO_PUBLISH =
  process.env.VETTING_AUTO_PUBLISH === "1" && process.env.VERCEL_ENV !== "production";

const CURRENCY_VALUES = ["GBP", "USD", "EUR"] as const;

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

/**
 * The fields admin vetting covers: identity, credentials (the role line), the
 * claims in the bio and specialty quote, practice areas and jurisdictions (the
 * specialties tags), and the rate. Changing any of them needs a fresh review.
 * Exempt: photoUrl and availability (cosmetic), and sla (a turnaround
 * estimate, not a vetted claim). initials is derived from fullName.
 */
export const VETTED_FIELDS = [
  "fullName",
  "role",
  "bio",
  "specialty",
  "specialties",
  "price",
  "currency",
] as const;

type VettedValues = Pick<typeof consultantProfiles.$inferSelect, (typeof VETTED_FIELDS)[number]>;

/** True when any vetted field differs between the stored profile and the write. */
export function changesVettedFields(existing: VettedValues, next: VettedValues): boolean {
  return VETTED_FIELDS.some(
    (f) => JSON.stringify(existing[f] ?? null) !== JSON.stringify(next[f] ?? null),
  );
}

/** Statuses a vetted-field edit sends back to the review queue. */
const REVET_STATUSES = new Set(["published", "paused", "rejected"]);

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  // Canonical base64-image check (shared with the client + sanitiser) — rejects
  // whitespace-only payloads the old inline regex accepted.
  if (isSafeImageDataUrl(v)) return { ok: true, value: v };
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

  // Validate currency against the DB CHECK enum — a cast (not a runtime check)
  // let an off-enum value reach the constraint and escape as an uncaught 500.
  if (body.currency !== undefined && !CURRENCY_VALUES.includes(body.currency)) {
    return jsonError("currency must be GBP, USD or EUR", 400);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(consultantProfiles)
    .where(eq(consultantProfiles.userId, auth.userRow.id))
    .limit(1);

  // Coerce string fields defensively: a non-string body value would throw on
  // .trim() below and surface as a 500 (the handler has no try/catch).
  const asStr = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const fullName = asStr(body.fullName, existing?.fullName ?? "").trim();
  const role = asStr(body.role, existing?.role ?? "").trim();
  const bio = asStr(body.bio, existing?.bio ?? "").trim();

  if (method === "POST") {
    if (!fullName) return jsonError("fullName is required", 400);
    if (!role) return jsonError("role (title) is required", 400);
    if (bio.length < 20)
      return jsonError("bio must be at least 20 characters", 400);
  }

  const initials = fullName ? initialsOf(fullName) : existing?.initials ?? "??";
  // Cap the specialty quote at 120 characters, but leave a stored one that
  // predates the cap alone when it's resubmitted unchanged (the profile form
  // sends it on every save): truncating it would count as a vetted edit and
  // pull the profile from the listing over a photo or availability change.
  const specialtyIn = asStr(body.specialty, existing?.specialty ?? "").trim();
  const specialty = specialtyIn === existing?.specialty ? existing.specialty : specialtyIn.slice(0, 120);
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
    specialty,
    specialties,
    price: clampInt(body.price ?? existing?.price ?? 150, 0, 5000),
    currency: (["GBP", "USD", "EUR"].includes(body.currency as string)
      ? body.currency
      : existing?.currency ?? "GBP") as "GBP" | "USD" | "EUR",
    sla: (typeof body.sla === "string" ? body.sla : existing?.sla ?? "24-48h").slice(0, 32),
    availability:
      body.availability && AVAILABILITY_VALUES.includes(body.availability)
        ? body.availability
        : (existing?.availability ?? "this_week"),
    // Use the VALIDATED value (validatePhotoUrl above), not the raw body —
    // otherwise the sanitisation is discarded on the accept path.
    photoUrl,
    // First save publishes immediately when VETTING_AUTO_PUBLISH=1, otherwise
    // pending_review. Subsequent updates preserve whatever the admin set,
    // unless a vetted field changed (below).
    status:
      existing?.status ??
      ((AUTO_PUBLISH ? "published" : "pending_review") as
        | "published"
        | "pending_review"),
    updatedAt: new Date(),
  };
  if (existing && REVET_STATUSES.has(existing.status) && changesVettedFields(existing, values)) {
    values.status = AUTO_PUBLISH ? "published" : "pending_review";
  }

  if (!existing) {
    // PATCH is a partial update of an EXISTING profile. Creating one here would
    // bypass the POST validation gauntlet (empty name/bio) AND flip the user's
    // isConsultant routing on the strength of an empty row. Only POST creates.
    if (method === "PATCH") return jsonError("No profile to update", 404);
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
  const [profile] = await db
    .select({ id: consultantProfiles.id })
    .from(consultantProfiles)
    .where(eq(consultantProfiles.userId, auth.userRow.id))
    .limit(1);
  if (!profile) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // Refuse to hard-delete a profile that has bookings. The FK cascade
  // (consultant_bookings → booking_payments) would wipe every HR tenant's
  // booking history with this consultant AND the booking_payments rows holding
  // checkout_session_id / payment_intent_id for money already captured — the
  // platform's only record linking a Stripe charge to what it paid for, and the
  // pointer needed for refunds/disputes. Also blocks rating-laundering via
  // delete + re-enrol. (Matches the repo's soft-delete-for-audit convention.)
  const [existingBooking] = await db
    .select({ id: consultantBookings.id })
    .from(consultantBookings)
    .where(eq(consultantBookings.consultantProfileId, profile.id))
    .limit(1);
  if (existingBooking) {
    return jsonError(
      "Cannot delete a profile with existing bookings — contact support to close your account",
      409,
    );
  }

  await db.delete(consultantProfiles).where(eq(consultantProfiles.id, profile.id));
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
