/**
 * Daily retention purge.
 *
 * Hard-deletes drafts whose retentionUntil has passed AND deletedAt is set.
 * Soft-deletes drafts whose retentionUntil has passed and were never opened
 * recently. Configure to run daily via Vercel Cron in vercel.json:
 *   {"crons": [{"path": "/api/cron/retention-purge", "schedule": "0 3 * * *"}]}
 *
 * Authentication: Vercel Cron provides a CRON_SECRET via Authorization header.
 * Reject any request that doesn't match.
 */

import { lt, and, isNotNull } from "drizzle-orm";
import { db, dbEnabled } from "../../server/db/client";
import { drafts } from "../../server/db/schema";

export const config = { runtime: "nodejs" };

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  if (!dbEnabled()) {
    return new Response(JSON.stringify({ skipped: "no DB configured" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const d = db();
  const now = new Date();

  // Hard-delete already-soft-deleted rows that are also past retention.
  const purged = await d
    .delete(drafts)
    .where(and(isNotNull(drafts.deletedAt), lt(drafts.retentionUntil, now)))
    .returning({ id: drafts.id });

  // Soft-delete rows that have aged out without being touched.
  const softDeleted = await d
    .update(drafts)
    .set({ deletedAt: now })
    .where(and(lt(drafts.retentionUntil, now)))
    .returning({ id: drafts.id });

  return new Response(
    JSON.stringify({
      purgedCount: purged.length,
      softDeletedCount: softDeleted.length,
      ranAt: now.toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
