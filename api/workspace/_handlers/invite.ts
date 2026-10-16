/**
 * POST /api/workspace/invite — admin-only. Creates a pending `invites` row +
 * returns the {inviteLink} for manual copy. If RESEND_API_KEY is set we MAY
 * email it (soft-skip on missing key — never blocks).
 *
 * Invite codes are 32 url-safe chars (~190 bits of entropy). The accept route
 * is the only one that consumes them; revoke clears revokedAt.
 *
 * Abuse controls (an invite is an email sent from DraftHR's domain to an
 * address the caller chooses, so it is a phishing vector):
 *   - only owners and admins of the active workspace may invite;
 *   - the recipient must be exactly one well-formed address (no lists);
 *   - durable limits per workspace and per inviting user, on top of the
 *     per-IP limit, shared across every serverless instance;
 *   - the email template keeps user text out of the subject and strips
 *     links from it in the body (see email-templates/invite.ts).
 */
import { randomBytes } from "node:crypto";
import { enforceSameOrigin, jsonError, readJsonRequest } from "../../_utils/request.js";
import { rateLimitDurable, rateLimitKeyDurable } from "../../_utils/rate-limit.js";
import { requireSessionAndTenant } from "../../_utils/session-with-tenant.js";
import { sendEmail } from "../../_utils/email.js";
import { workspaceInviteEmail } from "../../_utils/email-templates/invite.js";
import { getDb } from "../../../src/db/index.js";
import { invites } from "../../../src/db/schema.js";
import { appendAuditEvent } from "../../../src/db/audit.js";
import { canManageOwners } from "../../../src/lib/permissions.js";

export const config = { runtime: "nodejs" };

type Body = { email?: string; role?: string };

const ALLOWED_ROLES = new Set(["owner", "admin", "drafter", "reviewer", "viewer"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);
const MAX_EMAIL = 320;
// One address only: no commas, semicolons, spaces, angle brackets or quotes,
// so the value can never expand into several recipients or a display name.
const SINGLE_EMAIL_RE = /^[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[a-z]{2,}$/i;

// Durable invite budgets. Generous for a real team onboarding colleagues,
// far too low to be useful for bulk sending.
const INVITES_PER_TENANT = { name: "workspace-invite-tenant", max: 50, windowMs: 24 * 60 * 60_000 };
const INVITES_PER_USER_HOUR = { name: "workspace-invite-user", max: 20, windowMs: 60 * 60_000 };

export function isSingleEmailAddress(value: string): boolean {
  return value.length <= MAX_EMAIL && SINGLE_EMAIL_RE.test(value);
}

export async function POST(req: Request): Promise<Response> {
  const sameOrigin = enforceSameOrigin(req);
  if (sameOrigin) return sameOrigin;
  const limited = await rateLimitDurable(req, { name: "workspace-invite", max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonRequest<Body>(req);
  if (!parsed.ok) return parsed.response;
  const email = (typeof parsed.body.email === "string" ? parsed.body.email : "").trim().toLowerCase();
  const role = typeof parsed.body.role === "string" ? parsed.body.role : "drafter";
  if (!email || !isSingleEmailAddress(email)) return jsonError("Valid email required", 400);
  if (!ALLOWED_ROLES.has(role)) return jsonError("Invalid role", 400);

  const auth = await requireSessionAndTenant(req);
  if (!auth.ok) return auth.response;
  if (!auth.activeTenant) return jsonError("No active workspace", 400);
  const memberRole = auth.activeMember?.role ?? "drafter";
  if (!ADMIN_ROLES.has(memberRole)) return jsonError("Admin role required", 403);
  if (!canManageOwners(memberRole, role)) return jsonError("only owners can mint owners.", 403);

  const perTenant = await rateLimitKeyDurable(`tenant:${auth.activeTenant.id}`, INVITES_PER_TENANT);
  if (perTenant) return perTenant;
  const perUser = await rateLimitKeyDurable(`user:${auth.userRow.id}`, INVITES_PER_USER_HOUR);
  if (perUser) return perUser;

  try {
    const db = getDb();
    const inviteCode = generateInviteCode();
    const [invite] = await db
      .insert(invites)
      .values({
        tenantId: auth.activeTenant.id,
        email,
        role,
        inviteCode,
        createdByUserId: auth.userRow.id,
      })
      .returning();

    const origin = req.headers.get("origin") ?? "";
    const inviteLink = `${origin}/join/${invite.inviteCode}`;

    await safelyAppendAudit({
      tenantId: auth.activeTenant.id,
      kind: "tenant.invite-created",
      subjectType: "invite",
      subjectId: invite.id,
      actorUserId: auth.userRow.id,
      payload: { email, role },
    });

    // Best-effort email — never block the invite creation on send failure.
    // The frontend still has inviteLink in the response for manual share.
    const inviterName = auth.userRow.legalName ?? auth.userRow.email ?? "A teammate";
    const inviterEmail = auth.userRow.email ?? "";
    const emailResult = await sendEmail({
      to: email,
      ...workspaceInviteEmail({
        inviterName,
        inviterEmail,
        workspaceName: auth.activeTenant.name,
        role,
        inviteUrl: inviteLink,
        expiresAt: invite.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
      ...(inviterEmail ? { replyTo: inviterEmail } : {}),
      tags: [
        { name: "kind", value: "workspace-invite" },
        { name: "tenant", value: auth.activeTenant.id },
      ],
    });
    if (!emailResult.ok) {
      console.warn("[workspace/invite] email send failed:", emailResult.error);
    }

    return new Response(
      JSON.stringify({
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          inviteCode: invite.inviteCode,
          inviteLink,
          expiresAt: invite.expiresAt,
        },
        emailSent: emailResult.ok,
      }),
      { status: 201, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[workspace/invite] failed", err);
    return jsonError("Failed to create invite", 500);
  }
}

function generateInviteCode(): string {
  // 24 bytes → 32 base64url chars after padding strip. ~190 bits.
  return randomBytes(24).toString("base64url");
}

async function safelyAppendAudit(input: Parameters<typeof appendAuditEvent>[0]): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.error("[audit] append failed", input.kind, err);
  }
}
