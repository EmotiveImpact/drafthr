/**
 * /api/consultant/marketplace — public-ish listing of published consultants.
 *
 * Requires a signed-in session (so we can apply rate limits and stop
 * scrapers), but the result set is the same for every authenticated user
 * within a tenant — it's not tenant-scoped because consultants are a
 * cross-tenant marketplace.
 *
 * Query params:
 *   q    — text search over name + role (case-insensitive)
 *   tag  — repeatable specialty filter (e.g. ?tag=TUPE&tag=Settlement)
 *   sort — "rating" | "price-asc" | "price-desc" | "sla" (default: rating)
 *   limit — page size, default 50, max 100
 *   offset — pagination offset
 */
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireSession } from "../_utils/workos.js";
import { rateLimit } from "../_utils/rate-limit.js";
import { getDb } from "../../src/db/index.js";
import { consultantProfiles } from "../../src/db/schema.js";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const session = await requireSession(req);
  if (!session.ok) return session.response;

  const limited = rateLimit(req, { name: "consultant-marketplace", max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const tags = url.searchParams.getAll("tag").filter((t) => t.length > 0);
  const sort = (url.searchParams.get("sort") ?? "rating") as
    | "rating"
    | "price-asc"
    | "price-desc"
    | "sla";
  const lim = clampInt(parseInt(url.searchParams.get("limit") ?? "50", 10), 1, 100);
  const off = clampInt(parseInt(url.searchParams.get("offset") ?? "0", 10), 0, 100000);

  const db = getDb();

  const filters = [eq(consultantProfiles.status, "published")];
  if (q) {
    filters.push(
      or(
        ilike(consultantProfiles.fullName, `%${q}%`),
        ilike(consultantProfiles.role, `%${q}%`),
        ilike(consultantProfiles.specialty, `%${q}%`),
      )!,
    );
  }
  if (tags.length > 0) {
    // jsonb ?| array — Postgres "any of these tags". Cast tags through
    // sql.raw so the array literal is interpolated safely.
    filters.push(
      sql`${consultantProfiles.specialties}::jsonb ?| ${sql.raw(`array[${tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]`)}`,
    );
  }

  let orderBy;
  switch (sort) {
    case "price-asc":
      orderBy = asc(consultantProfiles.price);
      break;
    case "price-desc":
      orderBy = desc(consultantProfiles.price);
      break;
    case "sla":
      // SLA is a string like "24-48h" — sort lexically. Good enough until
      // we normalise to hours in a separate column.
      orderBy = asc(consultantProfiles.sla);
      break;
    case "rating":
    default:
      orderBy = desc(consultantProfiles.rating);
  }

  const rows = await db
    .select()
    .from(consultantProfiles)
    .where(and(...filters))
    .orderBy(orderBy)
    .limit(lim)
    .offset(off);

  const consultants = rows.map(toClient);

  return new Response(JSON.stringify({ consultants, count: consultants.length }), {
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
    rating: row.rating / 10,
    reviews: row.reviews,
    photoUrl: row.photoUrl,
  };
}
