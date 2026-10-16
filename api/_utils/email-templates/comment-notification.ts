/**
 * "X commented on your draft" — built but not wired (wave-2). When the
 * comments rail starts emitting notifications, the worker should call sendEmail
 * with this template directly.
 */
import { COLORS, ctaButton, escape, renderLayout, sanitizeFreeText } from "./_layout.js";

const COMMENT_PREVIEW_MAX = 200;
const NAME_MAX = 60;
const TITLE_MAX = 120;

// Fixed subject: user-typed names and titles never go in the subject line or
// the inbox preheader, and are stripped of links in the body (anti-phishing).
export const COMMENT_NOTIFICATION_SUBJECT = "[DraftHR] New comment on a letter";

export function commentNotificationEmail(opts: {
  recipientName: string;
  authorName: string;
  draftTitle: string;
  commentBody: string;
  draftUrl: string;
}): { subject: string; html: string } {
  const subject = COMMENT_NOTIFICATION_SUBJECT;
  const authorName = sanitizeFreeText(opts.authorName, NAME_MAX) || "A teammate";
  const recipientName = sanitizeFreeText(opts.recipientName, NAME_MAX) || "there";
  const draftTitle = sanitizeFreeText(opts.draftTitle, TITLE_MAX) || "a letter";
  const preview = sanitizeFreeText(opts.commentBody, COMMENT_PREVIEW_MAX);

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:600;color:${COLORS.ink};">
      ${escape(authorName)} left a comment
    </h1>
    <p style="margin:0 0 16px 0;color:${COLORS.ink};">
      Hi ${escape(recipientName)}, ${escape(authorName)} commented on
      <strong>${escape(draftTitle)}</strong>:
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
      preheader: "Open DraftHR to read and reply to the comment.",
      bodyHtml,
    }),
  };
}
