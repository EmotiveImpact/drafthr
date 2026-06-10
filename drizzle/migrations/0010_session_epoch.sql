-- Server-side session revocation (security board SE-03, 2026-06-10).
--
-- Per-user epoch counter. The sealed `drafthr_session` cookie carries the epoch
-- it was minted with; the API (requireSessionAndTenant) rejects any cookie whose
-- epoch is behind this column. The epoch is bumped on sign-out and on password
-- reset, so a stolen/extra cookie is invalidated immediately instead of
-- surviving its full 7-day TTL.
--
-- Adding a NOT NULL column with a constant DEFAULT is an instant, non-locking
-- metadata change in Postgres 11+. The application reads/writes this column via
-- defensive raw SQL (api/_utils/session-epoch.ts), so it degrades safely if this
-- migration has not yet been applied.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "session_epoch" integer NOT NULL DEFAULT 0;
