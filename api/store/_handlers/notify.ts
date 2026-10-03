/**
 * /api/store/notify — collaboration email notifications (Resend).
 *
 * POST { draftId, kind, recipientUserId?, message? }
 *   kind = "comment"          → notify the draft AUTHOR that a reviewer commented
 *   kind = "review-requested" → notify a chosen reviewer they've been asked to review
 *
 * The collaboration data (comments / approvals) already syncs via draft-extras;
 * this endpoint is purely the "tell a human" layer that was missing. It never
 * blocks the user action: a missing RESEND_API_KEY or a send failure soft-fails
 * (returns { ok:true, emailed:false }) exactly like the consultant-booking mails.
 *
 * SECURITY — no open relay. We NEVER email a client-supplied address. Recipients
 * are resolved server-side to a row we trust:
 *   - "comment": the draft's own authorUserId.
 *   - "review-requested": a userId that MUST be an active member of the caller's
 *     tenant (workspace reviewers only). A non-member → 403.
 * The draft is tenant-verified (IDOR guard) and the title/author are read from
 * the DB, never trusted from the body.
 */
import { and, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimit } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { drafts, tenantMembers, users } from "../../../src/db/schema.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { sendEmail } from "../../_utils/email.js";
import { commentNotificationEmail } from "../../_utils/email-templates/comment-notification.js";
import { reviewRequestedEmail } from "../../_utils/email-templates/review-requested.js";

export const config = { runtime: "nodejs" };

type NotifyKind = "comment" | "review-requested";

type Body = {
  draftId?: string;
  kind?: NotifyKind;
  /** Required for review-requested; must be an active member of this tenant. */
  recipientUserId?: string;
  /** Comment body (kind=comment) or the review note (kind=review-requested). */
  message?: string;
};

const MAX_MESSAGE_CHARS = 4_000;

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  // Email-sending is a spendy side effect — keep it modestly rate-limited.
  const limited = await rateLimit(req, { name: "store-notify", max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const draftId = serverUuidOrNull(body.draftId ?? null);
  if (!draftId) return jsonError("Invalid draft id", 400);
  const kind = body.kind;
  if (kind !== "comment" && kind !== "review-requested") {
    return jsonError("kind must be 'comment' or 'review-requested'", 400);
  }
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_CHARS) : "";

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const tenantId = auth.activeTenant.id;

  try {
    const db = getDb();

    // IDOR guard + trustworthy title: read the draft in the caller's tenant.
    const [draft] = await db
      .select({ id: drafts.id, tenantId: drafts.tenantId, title: drafts.title, letterType: drafts.letterType, authorUserId: drafts.authorUserId })
      .from(drafts)
      .where(eq(drafts.id, draftId))
      .limit(1);
    if (!draft) return jsonError("Draft not found", 404);
    if (draft.tenantId !== tenantId) {
      return jsonError("Draft belongs to a different workspace", 403);
    }

    // Resolve the recipient to a trusted, in-tenant user row.
    const recipientUserId =
      kind === "comment" ? draft.authorUserId : serverUuidOrNull(body.recipientUserId ?? null);
    if (!recipientUserId) {
      return jsonError("recipientUserId required", 400);
    }
    // Don't email someone about their own action.
    if (recipientUserId === auth.userRow.id) {
      return new Response(JSON.stringify({ ok: true, emailed: false, reason: "self" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // The recipient MUST be an active member of this tenant (no open relay).
    const [recipient] = await db
      .select({ id: users.id, email: users.email, legalName: users.legalName })
      .from(users)
      .innerJoin(tenantMembers, eq(tenantMembers.userId, users.id))
      .where(
        and(
          eq(users.id, recipientUserId),
          eq(tenantMembers.tenantId, tenantId),
          eq(tenantMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!recipient) {
      return jsonError("Recipient is not a member of this workspace", 403);
    }
    if (!recipient.email) {
      return new Response(JSON.stringify({ ok: true, emailed: false, reason: "no-recipient-email" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const authorName =
      auth.userRow.legalName?.trim() ||
      [auth.session.user.firstName, auth.session.user.lastName].filter(Boolean).join(" ").trim() ||
      auth.session.user.email ||
      "A teammate";
    const recipientName = recipient.legalName?.trim() || recipient.email.split("@")[0];
    const draftTitle = draft.title?.trim() || prettyLetterType(draft.letterType);
    const origin = new URL(req.url).origin;
    const draftUrl = `${origin}/editor/${draft.id}/review`;

    const rendered =
      kind === "comment"
        ? commentNotificationEmail({ recipientName, authorName, draftTitle, commentBody: message || "(no preview)", draftUrl })
        : reviewRequestedEmail({ recipientName, authorName, draftTitle, message: message || undefined, draftUrl });

    // Soft-fail: never let an email problem break the collaboration action.
    const result = await sendEmail({
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      tags: [{ name: "kind", value: kind }],
    });

    await safelyAppendAudit({
      tenantId,
      kind: kind === "comment" ? "draft.comment-notified" : "draft.review-requested",
      subjectType: "draft",
      subjectId: draft.id,
      actorUserId: auth.userRow.id,
      payload: { recipientUserId: recipient.id, emailed: result.ok },
    });

    return new Response(JSON.stringify({ ok: true, emailed: result.ok }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[store/notify] failed", err);
    return jsonError("Notify failed", 500);
  }
}

function prettyLetterType(letterType: string): string {
  return letterType.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
