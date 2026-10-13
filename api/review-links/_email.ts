/**
 * The secure link email for "someone you trust". It names who asked and the
 * kind of letter, says when the link stops working and that no account is
 * needed. It never carries the letter's text, the employee's name or the
 * asker's own words: only the link opens those.
 */
import { COLORS, ctaButton, escape, renderLayout, sanitizeFreeText } from "../_utils/email-templates/_layout.js";

export const TRUSTED_LINK_SUBJECT = "[DraftHR] You've been asked to review a letter";

/** "final_written_warning" → "final written warning". */
export function letterTypeWords(letterType: string): string {
  const words = letterType.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return words || "letter";
}

function fmtExpiry(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
}

export function trustedLinkEmail(opts: {
  reviewerName: string;
  askerName: string;
  letterType: string;
  url: string;
  expiresAt: number;
}): { subject: string; html: string } {
  const reviewer = sanitizeFreeText(opts.reviewerName, 60) || "there";
  const asker = sanitizeFreeText(opts.askerName, 60) || "A colleague";
  const kind = sanitizeFreeText(letterTypeWords(opts.letterType), 60) || "letter";
  const article = /^[aeiou]/i.test(kind) ? "an" : "a";
  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;font-weight:600;color:${COLORS.ink};">
      A letter to review
    </h1>
    <p style="margin:0 0 16px 0;color:${COLORS.ink};">
      Hi ${escape(reviewer)}, ${escape(asker)} has asked you to look over ${article} ${escape(kind)} before it goes out.
      You can suggest changes and leave comments. Nothing changes in the letter until they accept it.
    </p>
    ${ctaButton("Open the letter", opts.url)}
    <p style="margin:0 0 8px 0;color:${COLORS.muted};font-size:13px;">
      You don't need an account. The link works until ${escape(fmtExpiry(opts.expiresAt))} and shows only this letter and the files shared with you.
    </p>
    <p style="margin:0;color:${COLORS.muted};font-size:13px;">
      Please don't forward this email: anyone with the link can open the letter.
    </p>
  `;
  return {
    subject: TRUSTED_LINK_SUBJECT,
    html: renderLayout({ preheader: "Open the secure link to review the letter.", bodyHtml }),
  };
}
