/**
 * Workspace invite email — sent when an admin POSTs /api/workspace/invite.
 * Renders the brand shell + a CTA pointing at /join/{code}. Soft-fails are
 * handled by the caller; this template is pure (no IO).
 *
 * Anti-phishing: this mail goes out from DraftHR's own domain to an address
 * the inviter chose, so every user-controlled string is treated as hostile.
 *   - The subject and the inbox preheader are fixed DraftHR copy. Workspace
 *     and inviter names never appear in them (those are the lines a
 *     recipient reads before deciding to trust the mail).
 *   - In the body, workspace and inviter names are stripped of links, email
 *     addresses and control characters, capped in length, and HTML-escaped.
 *   - The only link is the invite URL the server built.
 */
import {
  COLORS,
  ctaButton,
  escape,
  formatDate,
  renderLayout,
  sanitizeFreeText,
} from "./_layout.js";

export const INVITE_SUBJECT = "You have been invited to a workspace on DraftHR";
export const INVITE_NAME_MAX_CHARS = 60;

const ROLE_LABELS: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  drafter: "drafter",
  reviewer: "reviewer",
  viewer: "viewer",
};

export function workspaceInviteEmail(opts: {
  inviterName: string;
  inviterEmail: string;
  workspaceName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): { subject: string; html: string } {
  // Unknown roles never echo caller input.
  const roleLabel = ROLE_LABELS[opts.role] ?? "member";
  const workspaceName =
    sanitizeFreeText(opts.workspaceName, INVITE_NAME_MAX_CHARS) || "a DraftHR workspace";
  const inviterName = sanitizeFreeText(opts.inviterName, INVITE_NAME_MAX_CHARS) || "A teammate";
  // The inviter's address comes from their verified sign-in, not free text,
  // so it is shown as-is (escaped) to help the recipient judge the invite.
  const inviterEmail = opts.inviterEmail.trim().slice(0, 320);

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;color:${COLORS.ink};">
      You've been invited to ${escape(workspaceName)}
    </h1>
    <p style="margin:0 0 12px 0;color:${COLORS.ink};">
      <strong>${escape(inviterName)}</strong>
      ${inviterEmail ? `<span style="color:${COLORS.muted};">(${escape(inviterEmail)})</span>` : ""}
      invited you to join <strong>${escape(workspaceName)}</strong>
      on DraftHR as <strong>${escape(roleLabel)}</strong>.
    </p>
    <p style="margin:0 0 4px 0;color:${COLORS.ink};">
      DraftHR is where HR teams draft, review, and ship letters that hold up under scrutiny.
    </p>
    ${ctaButton("Accept invite", opts.inviteUrl)}
    <p style="margin:0 0 8px 0;color:${COLORS.muted};font-size:13px;">
      Or paste this link into your browser:<br />
      <a href="${escape(opts.inviteUrl)}" style="color:${COLORS.ink};text-decoration:underline;word-break:break-all;">${escape(opts.inviteUrl)}</a>
    </p>
    <p style="margin:24px 0 0 0;color:${COLORS.muted};font-size:13px;">
      This invite expires on <strong>${escape(formatDate(opts.expiresAt))}</strong>.
      If you didn't expect this email, you can safely ignore it. DraftHR will never
      ask for your password or payment details by email.
    </p>
  `;

  return {
    subject: INVITE_SUBJECT,
    html: renderLayout({
      preheader: "Accept your invitation to collaborate on DraftHR.",
      bodyHtml,
    }),
  };
}
