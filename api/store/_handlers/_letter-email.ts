/**
 * The email that carries a letter sent from DraftHR ("Email it from
 * DraftHR" on the Send step), built on the server from the letter AS STORED
 * for the tenant, never from client HTML.
 *
 * The letter's final text: accepted suggestions applied, pending and
 * rejected suggestions dropped (a pending insertion was never part of the
 * letter; a pending deletion keeps the original words), comment marks and
 * every other tag removed, entities decoded. The result is plain
 * paragraphs, escaped again for the HTML body, so nothing a user typed can
 * reach the email as markup.
 */

export type StoredLetterSection = { html: string; position: number };

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    const c = code.toLowerCase();
    try {
      if (c.startsWith("#x")) return String.fromCodePoint(parseInt(c.slice(2), 16));
      if (c.startsWith("#")) return String.fromCodePoint(parseInt(c.slice(1), 10));
    } catch {
      return m;
    }
    return NAMED[c] ?? m;
  });
}

function statusOf(tag: string): string {
  const m = tag.match(/data-status\s*=\s*"([^"]*)"/i);
  return (m?.[1] ?? "pending").toLowerCase();
}

/** One section's HTML as the final text, paragraphs separated by blank lines. */
export function finalSectionText(html: string): string {
  let s = html ?? "";
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  // Insertions: kept only when accepted.
  s = s.replace(/(<ins\b[^>]*>)([\s\S]*?)<\/ins>/gi, (_m, open: string, inner: string) =>
    statusOf(open) === "accepted" ? inner : ""
  );
  // Deletions: the words go only when the deletion was accepted.
  s = s.replace(/(<del\b[^>]*>)([\s\S]*?)<\/del>/gi, (_m, open: string, inner: string) =>
    statusOf(open) === "accepted" ? "" : inner
  );
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/(p|h[1-6]|li|div|tr|blockquote|ul|ol|table)>/gi, "\n\n")
    .replace(/<\/(td|th)>/gi, "  ")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(s)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The whole letter as paragraphs (sections in order, empty ones skipped). */
export function finalLetterParagraphs(sections: StoredLetterSection[]): string[] {
  return [...sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => finalSectionText(s.html))
    .filter(Boolean)
    .flatMap((t) => t.split(/\n{2,}/))
    .map((p) => p.trim())
    .filter(Boolean);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Header-safe single line (no control characters, trimmed, capped). */
export function oneLine(value: string, max = 160): string {
  return value.replace(/[\x00-\x1F\x7F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export type LetterEmailInput = {
  letterTitle: string;
  employerName: string;
  senderName: string;
  recipientName: string;
  paragraphs: string[];
};

/** Subject, HTML and text of the letter email. */
export function letterEmail(input: LetterEmailInput): { subject: string; html: string; text: string } {
  const title = oneLine(input.letterTitle) || "A letter";
  const employer = oneLine(input.employerName);
  const sender = oneLine(input.senderName);
  const subject = employer ? `${title} from ${employer}` : title;
  const intro = employer
    ? `${sender || "Your employer"} at ${employer} has sent you this letter.`
    : `${sender || "The sender"} has sent you this letter.`;
  const greeting = input.recipientName ? `To ${oneLine(input.recipientName)},` : "";

  const para = (p: string) =>
    `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f6;color:#111110;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f6;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;">
            <tr>
              <td style="padding:0 4px 14px 4px;font-size:14px;line-height:1.5;color:#2b2a28;">
                ${greeting ? `${escapeHtml(greeting)}<br>` : ""}${escapeHtml(intro)} Reply to this email if you have any questions.
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e8e8ea;border-radius:12px;padding:36px 40px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;color:#111110;">
                ${input.paragraphs.map(para).join("\n                ")}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 4px 0 4px;font-size:12px;line-height:1.5;color:#6b6b70;">
                Sent with DraftHR on behalf of ${escapeHtml(employer || sender || "the sender")}. Keep this email as your copy of the letter.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    greeting,
    `${intro} Reply to this email if you have any questions.`,
    "",
    "----------------------------------------",
    "",
    input.paragraphs.join("\n\n"),
    "",
    "----------------------------------------",
    `Sent with DraftHR on behalf of ${employer || sender || "the sender"}. Keep this email as your copy of the letter.`,
  ]
    .filter((l, i) => i > 0 || l)
    .join("\n");

  return { subject, html, text };
}
