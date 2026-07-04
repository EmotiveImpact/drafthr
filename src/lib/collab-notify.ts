/**
 * Collaboration email notifications — the thin "tell a human" layer over the
 * comment/review data that already syncs via draft-extras.
 *
 * Fire-and-forget + soft-fail by design: a notification must NEVER block or
 * break the collaboration action that triggered it (mirrors the dual-write and
 * booking-message helpers). The server (/api/store/notify) resolves the
 * recipient itself (a trusted in-tenant user) and soft-fails when Resend isn't
 * configured, so there is nothing for the caller to handle.
 */
import { toServerUuid } from "@/lib/remote-ids";

type NotifyKind = "comment" | "review-requested";

async function notify(payload: {
  draftId: string;
  kind: NotifyKind;
  recipientUserId?: string;
  message?: string;
}): Promise<void> {
  try {
    await fetch("/api/store/notify", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...payload, draftId: toServerUuid(payload.draftId) }),
    });
  } catch {
    // Offline / server down — the comment is still saved + synced; the email is
    // a best-effort nudge, so we swallow the error entirely.
  }
}

/** Notify the draft author that a reviewer left a comment. No-op server-side
 *  when the commenter IS the author (self-comment) or email isn't configured. */
export function notifyComment(draftId: string, commentBody: string): void {
  void notify({ draftId, kind: "comment", message: commentBody });
}

/** Ask a specific workspace member to review this draft. recipientUserId must
 *  be an active member of the caller's tenant (enforced server-side). */
export function notifyReviewRequested(
  draftId: string,
  recipientUserId: string,
  message?: string,
): void {
  void notify({ draftId, kind: "review-requested", recipientUserId, message });
}
