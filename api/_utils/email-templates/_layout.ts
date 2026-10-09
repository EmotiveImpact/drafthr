/**
 * Shared shell for transactional emails. Inline styles only — Gmail/Outlook
 * strip <style> blocks routinely. Max-width 560px is the dominant convention
 * for transactional templates (renders cleanly on phones + the Gmail inline
 * preview pane). System font fallback before Playfair so the layout doesn't
 * break when the Google Font CDN is blocked.
 */

const BRAND_INK = "#0f172a"; // slate-900
const BRAND_ACCENT = "#1d4ed8"; // blue-700 — CTA + links
const BRAND_MUTED = "#64748b"; // slate-500
const BRAND_BORDER = "#e2e8f0"; // slate-200
const BRAND_BG = "#f8fafc"; // slate-50 — page background

const PLAYFAIR_HREF =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap";

const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const SERIF_STACK = `'Playfair Display', Georgia, 'Times New Roman', serif`;

export const COLORS = {
  ink: BRAND_INK,
  accent: BRAND_ACCENT,
  muted: BRAND_MUTED,
  border: BRAND_BORDER,
  bg: BRAND_BG,
} as const;

export const FONTS = {
  sans: SYSTEM_FONT_STACK,
  serif: SERIF_STACK,
} as const;

export type LayoutOpts = {
  preheader?: string; // Hidden preview text in the inbox list.
  bodyHtml: string;
};

/**
 * Wraps body content in the brand shell. The preheader span is invisible but
 * inboxes (Gmail, Apple Mail) surface it next to the subject — controls the
 * preview text instead of letting Resend pull a random first sentence.
 */
export function renderLayout(opts: LayoutOpts): string {
  const preheader = opts.preheader
    ? `<span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escape(
        opts.preheader,
      )}</span>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${PLAYFAIR_HREF}" />
    <title>DraftHR</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND_BG};color:${BRAND_INK};font-family:${SYSTEM_FONT_STACK};-webkit-font-smoothing:antialiased;">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND_BG};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${BRAND_BORDER};border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <div style="font-family:${SERIF_STACK};font-weight:700;font-size:22px;line-height:1;letter-spacing:-0.01em;color:${BRAND_INK};">DraftHR</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px 32px;font-size:15px;line-height:1.55;color:${BRAND_INK};">
                ${opts.bodyHtml}
              </td>
            </tr>
          </table>
          <div style="max-width:560px;margin:16px auto 0;color:${BRAND_MUTED};font-size:12px;line-height:1.5;text-align:center;">
            Sent by DraftHR. If this isn't relevant to you, you can safely ignore this email.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** HTML-escape user-supplied strings before inlining into a template. */
export function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function ctaButton(label: string, href: string): string {
  // Bulletproof button pattern — table-based so Outlook doesn't collapse the padding.
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="${BRAND_ACCENT}" style="border-radius:8px;">
        <a href="${escape(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;font-family:${SYSTEM_FONT_STACK};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          ${escape(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

export function formatDate(d: Date): string {
  // "May 23, 2026" — works regardless of recipient locale (no commas/periods
  // that mean different things in EU vs US date formats).
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Free-text sanitising for anything a user typed (workspace names, display
// names, letter titles, messages). Outbound email is sent from DraftHR's
// domain, so user text must never be able to turn it into a convincing
// phishing message: no links (mail clients auto-link bare domains too), no
// email addresses, no control or bidi-override characters, and a hard length
// cap. Callers still HTML-escape the result; this is about content, not markup.
const URL_WITH_SCHEME_RE = /\b[a-z][a-z0-9+.-]*:\/\/\S*/gi;
const WWW_RE = /\bwww\.\S*/gi;
const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+/g;
// Bare domains such as "evil.example" or "pay-now.co.uk/login": two or more
// labels with an alphabetic final label of 2 to 24 characters.
const BARE_DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b(?:\/\S*)?/gi;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

export function sanitizeFreeText(value: string | null | undefined, maxChars: number): string {
  if (!value) return "";
  const cleaned = String(value)
    .replace(CONTROL_RE, " ")
    .replace(URL_WITH_SCHEME_RE, " ")
    .replace(WWW_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(BARE_DOMAIN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars).trimEnd() + "…";
}
