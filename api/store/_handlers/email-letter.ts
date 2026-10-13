/**
 * /api/store/email-letter: "Email it from DraftHR" on the letter's Send step.
 *
 * POST { draftId, to? }
 *   Sends the letter, as stored for the caller's workspace, to the letter's
 *   own recipient address through Resend (api/_utils/email.ts), with replies
 *   going to the sender. Returns { ok: true, id } once Resend accepts it.
 *
 * SECURITY: no open relay. The address is read from the stored letter
 *   (employer letters: employee_json.email or answers.employeeEmail; an
 *   employee's own letter: answers.recipientEmail). `to` from the body is
 *   only compared with it (a mismatch means the client's copy has not
 *   synced yet: 409) and is never used as the recipient. The draft is
 *   tenant-checked (IDOR guard); viewers cannot send; durable rate limits
 *   per IP, per user and per workspace.
 *
 * Soft-fail: a missing RESEND_API_KEY returns 200 { ok: false, reason:
 *   "not-configured" } and a provider error 200 { ok: false, reason:
 *   "send-failed" }; the client turns both into plain words and the letter is
 *   not marked as sent. No new table: the send is written to the audit log
 *   ("draft.letter-emailed") and the client keeps the sent record on the
 *   letter.
 */
import { and, asc, eq } from "drizzle-orm";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimitDurable, rateLimitKeyDurable } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { getDb } from "../../../src/db/index.js";
import { drafts, sections } from "../../../src/db/schema.js";
import { serverUuidOrNull } from "../../../src/lib/remote-ids.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { sendEmail } from "../../_utils/email.js";
import { finalLetterParagraphs, letterEmail } from "./_letter-email.js";

export const config = { runtime: "nodejs" };

type Body = { draftId?: string; to?: string };

const MAX_EMAIL = 254;
const SINGLE_EMAIL_RE = /^[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[a-z]{2,}$/i;

export function isSingleEmailAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_EMAIL && SINGLE_EMAIL_RE.test(value.trim());
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function prettyLetterType(letterType: string): string {
  const s = letterType.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Letter";
}

/** The address stored on the letter, the only one this endpoint emails. */
export function storedRecipient(row: {
  mode: string;
  employeeJson: Record<string, unknown> | null;
  employerJson: Record<string, unknown> | null;
  answersJson: Record<string, unknown> | null;
}): { email: string; name: string } {
  const answers = row.answersJson ?? {};
  if (row.mode === "employee") {
    const employer = row.employerJson ?? {};
    return {
      email: str(answers.recipientEmail),
      name: str(employer.signatoryName) || str(employer.legalName),
    };
  }
  const employee = row.employeeJson ?? {};
  return {
    email: str(employee.email) || str(answers.employeeEmail),
    name: str(employee.legalName),
  };
}

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = await rateLimitDurable(req, { name: "store-email-letter", max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req, 20_000);
  if (!parsed.ok) return parsed.response;
  const draftId = serverUuidOrNull(parsed.body.draftId ?? null);
  if (!draftId) return jsonError("Invalid draft id", 400);
  const expected = parsed.body.to === undefined ? null : str(parsed.body.to);
  if (expected !== null && !isSingleEmailAddress(expected)) return jsonError("invalid-address", 400);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const tenantId = auth.activeTenant.id;
  if ((auth.activeMember?.role ?? "") === "viewer") {
    return jsonError("viewer", 403);
  }

  const perUser = await rateLimitKeyDurable(`user:${auth.userRow.id}`, { name: "email-letter-user", max: 30, windowMs: 3_600_000 });
  if (perUser) return perUser;
  const perTenant = await rateLimitKeyDurable(`tenant:${tenantId}`, { name: "email-letter-tenant", max: 100, windowMs: 3_600_000 });
  if (perTenant) return perTenant;

  try {
    const db = getDb();
    const [draft] = await db
      .select({
        id: drafts.id,
        tenantId: drafts.tenantId,
        title: drafts.title,
        letterType: drafts.letterType,
        mode: drafts.mode,
        employeeJson: drafts.employeeJson,
        employerJson: drafts.employerJson,
        answersJson: drafts.answersJson,
        deletedAt: drafts.deletedAt,
      })
      .from(drafts)
      .where(eq(drafts.id, draftId))
      .limit(1);
    if (!draft || draft.deletedAt) return jsonError("not-found", 404);
    if (draft.tenantId !== tenantId) return jsonError("other-workspace", 403);

    const recipient = storedRecipient(draft);
    if (!recipient.email) return jsonError("no-recipient-email", 422);
    if (!isSingleEmailAddress(recipient.email)) return jsonError("invalid-address", 400);
    if (expected !== null && expected.toLowerCase() !== recipient.email.toLowerCase()) {
      return jsonError("address-mismatch", 409);
    }

    const rows = await db
      .select({ html: sections.html, position: sections.position })
      .from(sections)
      .where(and(eq(sections.draftId, draft.id), eq(sections.tenantId, tenantId)))
      .orderBy(asc(sections.position));
    const paragraphs = finalLetterParagraphs(rows.filter(Boolean));
    if (paragraphs.length === 0) return jsonError("empty-letter", 422);

    const employer = draft.employerJson ?? {};
    const senderName =
      auth.userRow.legalName?.trim() ||
      [auth.session.user.firstName, auth.session.user.lastName].filter(Boolean).join(" ").trim() ||
      "";
    const mail = letterEmail({
      letterTitle: draft.title?.trim() || prettyLetterType(draft.letterType),
      employerName: str(employer.legalName) || auth.activeTenant.name || "",
      senderName,
      recipientName: recipient.name,
      paragraphs,
    });
    const replyTo = auth.userRow.email || auth.session.user.email || undefined;

    const result = await sendEmail({
      to: recipient.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: replyTo ?? undefined,
      tags: [{ name: "kind", value: "letter" }],
    });
    if (!result.ok) {
      if (result.error === "not-configured") return json({ ok: false, reason: "not-configured" });
      console.warn("[store/email-letter] send failed:", result.error);
      return json({ ok: false, reason: "send-failed" });
    }

    try {
      await appendAuditEvent({
        tenantId,
        kind: "draft.letter-emailed",
        subjectType: "draft",
        subjectId: draft.id,
        actorUserId: auth.userRow.id,
        payload: { to: recipient.email, messageId: result.id },
      });
    } catch (err) {
      console.error("[audit] append failed", "draft.letter-emailed", err);
    }

    return json({ ok: true, id: result.id, to: recipient.email });
  } catch (err) {
    console.error("[store/email-letter] failed", err);
    return jsonError("Email failed", 500);
  }
}
