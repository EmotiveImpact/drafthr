import { toServerUuid } from "@/lib/remote-ids";
import { isDualWriteEnabled, syncDraft } from "@/lib/dual-write";

/**
 * "Email it from DraftHR": the client side of POST /api/store/email-letter.
 * The server emails the letter's stored recipient (never an address from
 * here); `to` is sent only so the server can refuse when its copy of the
 * letter has a different address. Every failure comes back as plain words;
 * the caller marks the letter as sent only on { ok: true }.
 */

export type EmailFailure =
  | "not-ready"
  | "network"
  | "signed-out"
  | "viewer"
  | "other-workspace"
  | "not-synced"
  | "no-address"
  | "invalid-address"
  | "rate-limited"
  | "send-failed";

export type EmailResult = { ok: true; id: string } | { ok: false; reason: EmailFailure; message: string };

export const EMAIL_MESSAGES: Record<EmailFailure, string> = {
  "not-ready": "Email from DraftHR isn't set up yet. Download it and send it yourself instead.",
  network: "DraftHR couldn't be reached. Check your connection, or download it and send it yourself.",
  "signed-out": "Your session has ended. Sign in again, then send it.",
  viewer: "Only editors can send letters.",
  "other-workspace": "This letter belongs to another workspace, so it can't be emailed from here.",
  "not-synced": "This letter hasn't finished saving to DraftHR. Wait a moment and try again.",
  "no-address": "There's no email address on this letter yet. Add one, then try again.",
  "invalid-address": "That email address doesn't look right. Check it and try again.",
  "rate-limited": "That's a lot of emails in a short time. Wait a minute and try again.",
  "send-failed": "The email didn't go. Try again, or download it and send it yourself.",
};

const fail = (reason: EmailFailure): EmailResult => ({ ok: false, reason, message: EMAIL_MESSAGES[reason] });

/** Map the endpoint's reply to a result. Exported for tests. */
export function interpretEmailResponse(status: number, body: unknown): EmailResult {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!b) return fail("not-ready");
  if (status === 200) {
    if (b.ok === true && typeof b.id === "string" && b.id) return { ok: true, id: b.id };
    if (b.reason === "not-configured") return fail("not-ready");
    return fail("send-failed");
  }
  const error = typeof b.error === "string" ? b.error : "";
  if (status === 401) return fail("signed-out");
  if (status === 403) return fail(error === "viewer" ? "viewer" : "other-workspace");
  if (status === 404) return fail(/unknown store path/i.test(error) ? "not-ready" : "not-synced");
  if (status === 409) return fail("not-synced");
  if (status === 422) return fail(error === "no-recipient-email" ? "no-address" : "not-synced");
  if (status === 400) return fail(error === "invalid-address" ? "invalid-address" : "not-synced");
  if (status === 429) return fail("rate-limited");
  if (status === 503 || status === 501 || status === 502) return fail("not-ready");
  return fail("send-failed");
}

export async function emailLetterFromDraftHR(draftId: string, to: string): Promise<EmailResult> {
  // The server reads the stored letter, so push the latest copy first.
  try {
    if (isDualWriteEnabled()) await syncDraft(draftId);
  } catch {
    // The server will say if its copy is behind.
  }
  let res: Response;
  try {
    res = await fetch("/api/store/email-letter", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ draftId: toServerUuid(draftId), to }),
    });
  } catch {
    return fail("network");
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return fail("not-ready");
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return fail("not-ready");
  }
  return interpretEmailResponse(res.status, body);
}
