/**
 * Transactional email via Resend. Caller-side contract:
 *   - Soft-fail. Never throw. Email failure must NOT block the user action.
 *   - Missing RESEND_API_KEY → returns { ok: false, error: 'not-configured' }
 *     and logs once per process (so dev doesn't spam, prod alerts once).
 *
 * Roadmap: Resend now, swap to SES at >500k transactional/mo. The shape we
 * return here is provider-agnostic so the call sites don't move.
 */
import { Resend } from "resend";

const DEFAULT_FROM = "DraftHR <no-reply@drafthr.io>";

let cachedClient: Resend | null = null;
let warnedMissingKey = false;

type SendEmailOpts = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function getResend(): Resend | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  const client = getResend();
  if (!client) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "[email] RESEND_API_KEY not set — sendEmail() will soft-fail. " +
          "Invitees will need the copy-link fallback.",
      );
    }
    return { ok: false, error: "not-configured" };
  }

  try {
    const result = await client.emails.send({
      from: opts.from ?? DEFAULT_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? htmlToPlainText(opts.html),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(opts.tags ? { tags: opts.tags } : {}),
    });
    if (result.error) {
      return { ok: false, error: result.error.message ?? result.error.name ?? "unknown" };
    }
    if (!result.data?.id) {
      return { ok: false, error: "no-id-returned" };
    }
    return { ok: true, id: result.data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Strip HTML to a readable text fallback. Email clients without an HTML
 * renderer (or spam filters that prefer text/plain) get something legible.
 * Not a full parser — we control the templates, so the regex strategy holds.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Test-only: clear cached client + warn flag. Not exported via index. */
export function __resetEmailModuleForTests(): void {
  cachedClient = null;
  warnedMissingKey = false;
}
