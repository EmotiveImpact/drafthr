/**
 * "X requested your review on Y" — built but not wired (wave-2). The review
 * workflow will call sendEmail with this template once reviewer assignment
 * lands. Keeping the template here means the brand styling stays consistent.
 */
import { COLORS, ctaButton, escape, renderLayout } from "./_layout.js";

export function reviewRequestedEmail(opts: {
  recipientName: string;
  authorName: string;
  draftTitle: string;
  message?: string;
  draftUrl: string;
}): { subject: string; html: string } {
  const subject = `[DraftHR] ${opts.authorName} requested your review on ${opts.draftTitle}`;

  const messageBlock = opts.message
    ? `<blockquote style="margin:0 0 16px 0;padding:12px 16px;background:${COLORS.bg};border-left:3px solid ${COLORS.accent};border-radius:6px;color:${COLORS.ink};">
        ${escape(opts.message)}
      </blockquote>`
    : "";

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:600;color:${COLORS.ink};">
      Review requested
    </h1>
    <p style="margin:0 0 16px 0;color:${COLORS.ink};">
      Hi ${escape(opts.recipientName)}, ${escape(opts.authorName)} would like
      your review on <strong>${escape(opts.draftTitle)}</strong>.
    </p>
    ${messageBlock}
    ${ctaButton("Open draft", opts.draftUrl)}
    <p style="margin:24px 0 0 0;color:${COLORS.muted};font-size:13px;">
      You can leave inline comments, request changes, or approve from the draft
      view. Replies notify the author.
    </p>
  `;

  return {
    subject,
    html: renderLayout({
      preheader: `${opts.authorName} requested your review on ${opts.draftTitle}.`,
      bodyHtml,
    }),
  };
}
