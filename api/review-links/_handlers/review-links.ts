/**
 * /api/store/review-links?op=…  (dispatched from api/store/[action].ts)
 *
 * The review loop's server side: secure links for "someone you trust", and
 * the shared progress of teammate and expert reviews.
 *
 *   GET  op=open         token          the reviewer opens a secure link (no account)
 *   POST op=act          token          suggest, comment, remove, message, send back
 *   POST op=create                      the asker sends it out (trusted: issues + emails the link)
 *   POST op=revoke                      recall or finish: the link stops working
 *   GET  op=status       linkId|bookingId   the asker follows the review
 *   POST op=ask                         send it back to the reviewer with a question
 *   POST op=message                     the asker's message to the reviewer
 *   GET  op=assigned     draftId        a teammate's reviews on a letter
 *   POST op=team-act     linkId         a teammate's opened, approve, message, send back
 *   GET  op=expert-open  bookingId      the booked expert opens the review
 *   POST op=expert-act   bookingId      the expert's suggest, comment, message, send back
 *
 * Everything fails softly: a missing table (migration 0022 not run) or no
 * database answers 503 { code: "not-ready" } with words the screens show.
 * All rules live in ../_service.ts (tested there).
 */
import { and, desc, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit, rateLimitKeyDurable } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { sendEmail } from "../../_utils/email.js";
import { paymentStatusOf } from "../../_utils/marketplace-payments.js";
import { getDb } from "../../../src/db/index.js";
import { consultantBookings, tenantMembers } from "../../../src/db/schema.js";
import { reviewLinks, type ReviewLinkRow } from "../_table.js";
import { trustedLinkEmail } from "../_email.js";
import {
  LinkError,
  NOT_READY_MESSAGE,
  actWithToken,
  askAgain,
  askerMessage,
  assignedTo,
  createLink,
  expertAct,
  expertOpen,
  isNotReady,
  linkStatus,
  openWithToken,
  revokeLink,
  teamAct,
  type Actor,
  type Ctx,
  type Directory,
  type ReviewLinkRepo,
} from "../_service.js";

export const config = { runtime: "nodejs" };

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

function drizzleRepo(): ReviewLinkRepo {
  return {
    async insert(row) {
      const [created] = await getDb().insert(reviewLinks).values(row).returning();
      return created;
    },
    async findById(id) {
      const [r] = await getDb().select().from(reviewLinks).where(eq(reviewLinks.id, id)).limit(1);
      return r ?? null;
    },
    async findByTokenHash(hash) {
      const [r] = await getDb().select().from(reviewLinks).where(eq(reviewLinks.tokenHash, hash)).limit(1);
      return r ?? null;
    },
    async findByClientReview(tenantId, clientReviewId) {
      const [r] = await getDb()
        .select()
        .from(reviewLinks)
        .where(and(eq(reviewLinks.tenantId, tenantId), eq(reviewLinks.clientReviewId, clientReviewId)))
        .limit(1);
      return r ?? null;
    },
    async findByBooking(bookingId) {
      const [r] = await getDb()
        .select()
        .from(reviewLinks)
        .where(eq(reviewLinks.bookingId, bookingId))
        .orderBy(desc(reviewLinks.createdAt))
        .limit(1);
      return r ?? null;
    },
    async findAssigned(tenantId, draftId, reviewerUserId) {
      return getDb()
        .select()
        .from(reviewLinks)
        .where(
          and(
            eq(reviewLinks.tenantId, tenantId),
            eq(reviewLinks.draftId, draftId),
            eq(reviewLinks.reviewerUserId, reviewerUserId),
          ),
        )
        .orderBy(desc(reviewLinks.createdAt))
        .limit(20);
    },
    async update(id, patch) {
      const [r] = await getDb().update(reviewLinks).set(patch).where(eq(reviewLinks.id, id)).returning();
      return r ?? null;
    },
  };
}

function drizzleDirectory(): Directory {
  return {
    async isMember(tenantId, userId) {
      const [m] = await getDb()
        .select({ userId: tenantMembers.userId })
        .from(tenantMembers)
        .where(
          and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId), eq(tenantMembers.status, "active")),
        )
        .limit(1);
      return !!m;
    },
    async booking(bookingId) {
      // Read by id; the service then binds it to the caller as requesterUserId
      // (the asker) or consultantUserId (the expert) before using it.
      const [b] = await getDb()
        .select({
          id: consultantBookings.id,
          tenantId: consultantBookings.tenantId,
          requesterUserId: consultantBookings.requesterUserId,
          consultantUserId: consultantBookings.consultantUserId,
          status: consultantBookings.status,
        })
        .from(consultantBookings)
        .where(eq(consultantBookings.id, bookingId))
        .limit(1);
      if (!b) return null;
      const paid = (await paymentStatusOf(getDb(), b.id)) === "paid";
      return { ...b, paid };
    },
  };
}

function ctx(): Ctx {
  return { repo: drizzleRepo(), dir: drizzleDirectory() };
}

/* ------------------------------------------------------------------ */
/*  Responses                                                          */
/* ------------------------------------------------------------------ */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

function fail(err: unknown): Response {
  if (err instanceof LinkError) return json({ error: err.message, code: err.code }, err.status);
  if (isNotReady(err)) return json({ error: NOT_READY_MESSAGE, code: "not-ready" }, 503);
  console.error("[review-links]", err);
  return json({ error: "Something went wrong with this review. Try again in a moment.", code: "error" }, 500);
}

function serverFlagOff(): boolean {
  const v = (process.env.FEATURE_TRUSTED_REVIEW_LINKS ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

const FLAG_OFF = json({ error: "Secure review links aren't available.", code: "off" }, 404);

async function signedIn(req: Request): Promise<{ ok: true; actor: Actor } | { ok: false; response: Response }> {
  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth;
  const name =
    auth.userRow.legalName?.trim() ||
    [auth.session.user.firstName, auth.session.user.lastName].filter(Boolean).join(" ").trim() ||
    auth.session.user.email ||
    "";
  return { ok: true, actor: { userId: auth.userRow.id, tenantId: auth.activeTenant?.id ?? null, name } };
}

/* ------------------------------------------------------------------ */
/*  GET                                                                */
/* ------------------------------------------------------------------ */

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const op = url.searchParams.get("op") ?? "";
  try {
    if (op === "open") {
      if (serverFlagOff()) return FLAG_OFF;
      const limited = rateLimit(req, { name: "review-link-token", max: 60, windowMs: 60_000 });
      if (limited) return limited;
      return json(await openWithToken(ctx(), url.searchParams.get("token")));
    }

    const limited = rateLimit(req, { name: "review-links", max: 120, windowMs: 60_000 });
    if (limited) return limited;
    const who = await signedIn(req);
    if (!who.ok) return who.response;

    if (op === "status") {
      return json(
        await linkStatus(ctx(), who.actor, {
          linkId: url.searchParams.get("linkId") ?? undefined,
          bookingId: url.searchParams.get("bookingId") ?? undefined,
        }),
      );
    }
    if (op === "assigned") return json({ reviews: await assignedTo(ctx(), who.actor, url.searchParams.get("draftId")) });
    if (op === "expert-open") return json(await expertOpen(ctx(), who.actor, url.searchParams.get("bookingId")));
    return jsonError("Unknown operation", 404);
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/*  POST                                                               */
/* ------------------------------------------------------------------ */

type Body = Record<string, unknown>;

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const url = new URL(req.url);
  const op = url.searchParams.get("op") ?? "";
  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  try {
    if (op === "act") {
      if (serverFlagOff()) return FLAG_OFF;
      const limited = rateLimit(req, { name: "review-link-token", max: 60, windowMs: 60_000 });
      if (limited) return limited;
      return json({ state: await actWithToken(ctx(), url.searchParams.get("token"), body) });
    }

    const limited = rateLimit(req, { name: "review-links", max: 120, windowMs: 60_000 });
    if (limited) return limited;
    const who = await signedIn(req);
    if (!who.ok) return who.response;
    const c = ctx();

    switch (op) {
      case "create": {
        if (body.kind === "trusted") {
          if (serverFlagOff()) return FLAG_OFF;
          // Sending email to an address someone typed: hold it to a few an hour per person.
          const capped = await rateLimitKeyDurable(`user:${who.actor.userId}`, {
            name: "review-link-email",
            max: 20,
            windowMs: 60 * 60_000,
          });
          if (capped) return capped;
        }
        const { row, token } = await createLink(c, who.actor, body);
        let emailed = false;
        let linkUrl: string | undefined;
        if (token && row.reviewerEmail) {
          linkUrl = `${new URL(req.url).origin}/r/${token}`;
          emailed = await emailLink(row, linkUrl);
        }
        return json({
          linkId: row.id,
          url: linkUrl,
          expiresAt: row.expiresAt?.getTime() ?? null,
          emailed,
        });
      }
      case "revoke":
        await revokeLink(c, who.actor, body);
        return json({ ok: true });
      case "ask":
        await askAgain(c, who.actor, body);
        return json({ ok: true });
      case "message":
        return json({ messages: await askerMessage(c, who.actor, body) });
      case "team-act":
        return json({ state: await teamAct(c, who.actor, url.searchParams.get("linkId"), body) });
      case "expert-act":
        return json({ state: await expertAct(c, who.actor, url.searchParams.get("bookingId"), body) });
      default:
        return jsonError("Unknown operation", 404);
    }
  } catch (err) {
    return fail(err);
  }
}

async function emailLink(row: ReviewLinkRow, linkUrl: string): Promise<boolean> {
  if (!row.reviewerEmail || !row.expiresAt) return false;
  const letter = row.letter as { letterType?: string };
  const mail = trustedLinkEmail({
    reviewerName: row.reviewerName,
    askerName: row.askerName,
    letterType: letter.letterType ?? "",
    url: linkUrl,
    expiresAt: row.expiresAt.getTime(),
  });
  const res = await sendEmail({
    to: row.reviewerEmail,
    subject: mail.subject,
    html: mail.html,
    tags: [{ name: "kind", value: "trusted-review-link" }],
  });
  if (!res.ok && process.env.NODE_ENV !== "production") {
    // Local development without email: the link is in the server log.
    console.info(`[review-links] link for ${row.reviewerEmail}: ${linkUrl}`);
  }
  return res.ok;
}
