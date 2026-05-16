/**
 * "X commented on your draft" — built but not wired (wave-2). When the
 * comments rail starts emitting notifications, the worker should call sendEmail
 * with this template directly.
 */
import { COLORS, ctaButton, escape, renderLayout } from "./_layout.js";

const COMMENT_PREVIEW_MAX = 200;

export function commentNotificationEmail(opts: {
  recipientName: string;
  authorName: string;
  draftTitle: string;
  commentBody: string;
  draftUrl: string;
}): { subject: string; html: string } {
  const subject = `[DraftHR] ${opts.authorName} commented on ${opts.draftTitle}`;
  const preview = truncate(opts.commentBody, COMMENT_PREVIEW_MAX);

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:600;color:${COLORS.ink};">
      ${escape(opts.authorName)} left a comment
    </h1>
    <p style="margin:0 0 16px 0;color:${COLORS.ink};">
      Hi ${escape(opts.recipientName)}, ${escape(opts.authorName)} commented on
      <strong>${escape(opts.draftTitle)}</strong>:
    </p>
    <blockquote style="margin:0 0 16px 0;padding:12px 16px;background:${COLORS.bg};border-left:3px solid ${COLORS.accent};border-radius:6px;color:${COLORS.ink};font-style:italic;">
      ${escape(preview)}
    </blockquote>
    ${ctaButton("View comment", opts.draftUrl)}
    <p style="margin:24px 0 0 0;color:${COLORS.muted};font-size:13px;">
      You're receiving this because you're a participant on this draft. Manage
      notification preferences in your DraftHR settings.
    </p>
  `;

  return {
    subject,
    html: renderLayout({
      preheader: `${opts.authorName} commented: ${truncate(opts.commentBody, 80)}`,
      bodyHtml,
    }),
  };
}

function truncate(input: string, max: number): string {
  const trimmed = input.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + "…";
}
