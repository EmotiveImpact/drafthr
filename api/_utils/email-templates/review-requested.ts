/**
 * "X requested your review on Y" — built but not wired (wave-2). The review
 * workflow will call sendEmail with this template once reviewer assignment
 * lands. Keeping the template here means the brand styling stays consistent.
 */
import { COLORS, ctaButton, escape, renderLayout, sanitizeFreeText } from "./_layout.js";

const NAME_MAX = 60;
const TITLE_MAX = 120;
const MESSAGE_MAX = 500;

// Fixed subject: user-typed names, titles and messages never go in the
// subject line or the inbox preheader, and are stripped of links in the body.
export const REVIEW_REQUESTED_SUBJECT = "[DraftHR] A letter is waiting for your review";

export function reviewRequestedEmail(opts: {
  recipientName: string;
  authorName: string;
  draftTitle: string;
  message?: string;
  draftUrl: string;
}): { subject: string; html: string } {
  const subject = REVIEW_REQUESTED_SUBJECT;
  const authorName = sanitizeFreeText(opts.authorName, NAME_MAX) || "A teammate";
  const recipientName = sanitizeFreeText(opts.recipientName, NAME_MAX) || "there";
  const draftTitle = sanitizeFreeText(opts.draftTitle, TITLE_MAX) || "a letter";
  const message = sanitizeFreeText(opts.message, MESSAGE_MAX);

  const messageBlock = message
    ? `<blockquote style="margin:0 0 16px 0;padding:12px 16px;background:${COLORS.bg};border-left:3px solid ${COLORS.accent};border-radius:6px;color:${COLORS.ink};">
        ${escape(message)}
      </blockquote>`
    : "";

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:600;color:${COLORS.ink};">
      Review requested
    </h1>
    <p style="margin:0 0 16px 0;color:${COLORS.ink};">
      Hi ${escape(recipientName)}, ${escape(authorName)} would like
      your review on <strong>${escape(draftTitle)}</strong>.
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
      preheader: "Open DraftHR to review the letter.",
      bodyHtml,
    }),
  };
}
