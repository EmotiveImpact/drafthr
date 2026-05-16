/**
 * Workspace invite email — sent when an admin POSTs /api/workspace/invite.
 * Renders the brand shell + a CTA pointing at /join/{code}. Soft-fails are
 * handled by the caller; this template is pure (no IO).
 */
import { COLORS, ctaButton, escape, formatDate, renderLayout } from "./_layout.js";

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
  const roleLabel = ROLE_LABELS[opts.role] ?? opts.role;
  const subject = `${opts.inviterName} invited you to ${opts.workspaceName} on DraftHR`;

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;color:${COLORS.ink};">
      You've been invited to ${escape(opts.workspaceName)}
    </h1>
    <p style="margin:0 0 12px 0;color:${COLORS.ink};">
      <strong>${escape(opts.inviterName)}</strong>
      <span style="color:${COLORS.muted};">(${escape(opts.inviterEmail)})</span>
      invited you to join <strong>${escape(opts.workspaceName)}</strong>
      on DraftHR as <strong>${escape(roleLabel)}</strong>.
    </p>
    <p style="margin:0 0 4px 0;color:${COLORS.ink};">
      DraftHR is where HR teams draft, review, and ship letters that hold up under scrutiny.
    </p>
    ${ctaButton("Accept invite", opts.inviteUrl)}
    <p style="margin:0 0 8px 0;color:${COLORS.muted};font-size:13px;">
      Or paste this link into your browser:<br />
      <a href="${escape(opts.inviteUrl)}" style="color:${COLORS.accent};word-break:break-all;">${escape(opts.inviteUrl)}</a>
    </p>
    <p style="margin:24px 0 0 0;color:${COLORS.muted};font-size:13px;">
      This invite expires on <strong>${escape(formatDate(opts.expiresAt))}</strong>.
      If you didn't expect this email, you can safely ignore it.
    </p>
  `;

  return {
    subject,
    html: renderLayout({
      preheader: `${opts.inviterName} invited you to ${opts.workspaceName} as ${roleLabel}.`,
      bodyHtml,
    }),
  };
}
