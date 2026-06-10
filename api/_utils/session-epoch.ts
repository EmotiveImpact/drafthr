/**
 * Per-user session epoch — the server-side session-revocation primitive.
 * (Security board SE-03, 2026-06-10.)
 *
 * A sealed `drafthr_session` cookie carries the epoch that was current when it
 * was minted. `requireSessionAndTenant` rejects any cookie whose epoch is
 * behind the user's stored epoch. Bumping the epoch — on sign-out and on
 * password reset — therefore invalidates EVERY outstanding cookie for that user
 * immediately, instead of letting an exfiltrated cookie stay valid for the full
 * 7-day TTL.
 *
 * Deliberately NOT a Drizzle-schema column. The `users` table is loaded with a
 * `select()` (all columns) on the auth hot path; if `session_epoch` were in the
 * schema, that select would reference the column and a deploy that landed
 * BEFORE the migration would 500 every authenticated request. Managing it via
 * defensive raw SQL means: column absent → the query throws → we return `null`
 * → enforcement is skipped → auth behaves exactly as it does today. Once
 * migration `0010_session_epoch` is applied, revocation activates with no code
 * change. Safe in either deploy order.
 *
 * All DB access here is best-effort: a transient error returns `null` (unknown)
 * rather than `0`, so a blip never spuriously logs a valid user out.
 */
import { sql } from "drizzle-orm";
import { dbEnabled, getDb } from "../../src/db/index.js";

function firstRow(res: unknown): Record<string, unknown> | undefined {
  // neon-serverless (pg-style) returns { rows: [...] }; tolerate a bare array too.
  const rows = (res as { rows?: unknown[] })?.rows ?? (Array.isArray(res) ? res : []);
  return rows[0] as Record<string, unknown> | undefined;
}

function toEpoch(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The user's current session epoch, or `null` if it can't be determined
 * (DB off, column not migrated yet, transient error, or no such user). Callers
 * MUST treat `null` as "skip enforcement", never as `0`.
 */
export async function getUserSessionEpoch(externalId: string): Promise<number | null> {
  if (!dbEnabled()) return null;
  try {
    const res = await getDb().execute(
      sql`SELECT session_epoch FROM users WHERE external_id = ${externalId} LIMIT 1`,
    );
    const row = firstRow(res);
    return row ? toEpoch(row.session_epoch) : null;
  } catch {
    return null; // column not migrated / transient — do not enforce
  }
}

/**
 * Increment the user's epoch, invalidating all outstanding cookies. Returns the
 * NEW epoch (so the caller minting a fresh cookie can embed it), or `null` if
 * the bump couldn't be applied. Best-effort — never throws.
 */
export async function bumpUserSessionEpoch(externalId: string): Promise<number | null> {
  if (!dbEnabled()) return null;
  try {
    const res = await getDb().execute(
      sql`UPDATE users SET session_epoch = session_epoch + 1, updated_at = now() WHERE external_id = ${externalId} RETURNING session_epoch`,
    );
    const row = firstRow(res);
    return row ? toEpoch(row.session_epoch) : null;
  } catch {
    return null;
  }
}

/**
 * Is a cookie's epoch stale relative to the user's stored epoch? Pure so it can
 * be unit-tested without a DB.
 *
 *   - `dbEpoch === null` (unknown) → NOT stale (fail open, don't log out a valid
 *     user on a transient read failure or a pre-migration deploy).
 *   - a missing cookie epoch is treated as 0 (back-compat: cookies minted before
 *     this feature lack the field; they stay valid until the user's epoch is
 *     first bumped).
 */
export function isCookieEpochStale(
  cookieEpoch: number | undefined,
  dbEpoch: number | null,
): boolean {
  if (dbEpoch === null) return false;
  return (cookieEpoch ?? 0) !== dbEpoch;
}
