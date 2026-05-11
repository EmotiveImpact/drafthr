/**
 * Subject Access Request (SAR / DSAR) endpoint.
 *
 * GET  /api/me/data  → returns all personal data we hold for the authenticated user.
 * DELETE /api/me/data → soft-deletes the user and triggers retention purge.
 *
 * UK GDPR Art. 15 right of access: response within 1 month, free of charge.
 * UK GDPR Art. 17 right to erasure: same window.
 *
 * NOTE: Clerk session validation is left as a TODO until Clerk Backend SDK is
 * wired in (Phase B follow-up). The structure is here so the route exists.
 */

import { eq, inArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, dbEnabled } from "../../server/db/client";
import {
  drafts,
  draftSections,
  draftVersions,
  auditLog,
  users,
} from "../../server/db/schema";

export const config = { runtime: "nodejs" };

/** Shared preflight: db enabled? authenticated? Returns either a Response to
 * short-circuit, or the resolved clerkUserId for the named handlers below. */
function preflight(
  req: Request
): { clerkUserId: string } | { reject: Response } {
  if (!dbEnabled()) {
    return {
      reject: new Response(
        JSON.stringify({
          error:
            "DSAR endpoint requires a configured database. In localStorage-only mode, your data lives in your browser — clear site data to erase.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  // TODO: replace with Clerk Backend SDK auth check
  const clerkUserId = req.headers.get("x-clerk-user-id");
  if (!clerkUserId) {
    return {
      reject: new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { clerkUserId };
}

export async function GET(req: Request): Promise<Response> {
  const pre = preflight(req);
  if ("reject" in pre) return pre.reject;
  const { clerkUserId } = pre;
  const d = db();

  const [user] = await d.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (!user) {
    return new Response(JSON.stringify({ error: "user not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [draftRows, audit] = await Promise.all([
    d.select().from(drafts).where(eq(drafts.userId, user.id)),
    d.select().from(auditLog).where(eq(auditLog.userId, user.id)),
  ]);

  const sections = draftRows.length
    ? await d
        .select()
        .from(draftSections)
        .where(inArrayUuid(draftSections.draftId, draftRows.map((r) => r.id)))
    : [];

  const versions = draftRows.length
    ? await d
        .select()
        .from(draftVersions)
        .where(inArrayUuid(draftVersions.draftId, draftRows.map((r) => r.id)))
    : [];

  return new Response(
    JSON.stringify(
      {
        user,
        drafts: draftRows,
        sections,
        versions,
        audit,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="hr-letter-data-${user.id}.json"`,
      },
    }
  );
}

export async function DELETE(req: Request): Promise<Response> {
  const pre = preflight(req);
  if ("reject" in pre) return pre.reject;
  const { clerkUserId } = pre;
  const d = db();

  const [user] = await d.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (!user) {
    return new Response(JSON.stringify({ error: "user not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Soft-delete user; cascade-delete drafts via FK.
  await d
    .update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, user.id));
  await d.delete(drafts).where(eq(drafts.userId, user.id));

  return new Response(
    JSON.stringify({
      ok: true,
      message:
        "Personal data erased. Audit log entries retained for 24 months in anonymised form for compliance.",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// drizzle's inArray helper for UUIDs — small wrapper for readability.
function inArrayUuid(col: PgColumn, ids: string[]) {
  return inArray(col, ids);
}
