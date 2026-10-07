/**
 * Server-side mirror of the client role gates in src/lib/permissions.ts.
 *
 * The client hides edit and approve controls by role, but the store write
 * endpoints used to check only "signed in + active workspace", so a viewer
 * could still write drafts, and any member could set reviewStatus to
 * "approved" with a hand-built request. These helpers close that gap.
 */
import { jsonError } from "./request.js";

type MemberLike = { activeMember: { role: string } | null };

const DECISION_STATUSES = new Set(["approved", "changes_requested"]);
const APPROVER_ROLES = new Set(["owner", "admin", "reviewer"]);

/** 403 when the caller is a read-only viewer; null when the write may proceed. */
export function rejectReadOnlyMember(auth: MemberLike): Response | null {
  if (auth.activeMember?.role === "viewer") {
    return jsonError("Viewers have read-only access to this workspace", 403);
  }
  return null;
}

/**
 * 403 when the write would move a draft INTO a review decision (approved or
 * changes requested) and the caller's role cannot decide reviews. Re-sending
 * an unchanged status is allowed so ordinary sync of an already-approved
 * draft keeps working.
 */
export function rejectUnauthorisedReviewDecision(
  auth: MemberLike,
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
): Response | null {
  if (!nextStatus || !DECISION_STATUSES.has(nextStatus)) return null;
  if (nextStatus === previousStatus) return null;
  if (APPROVER_ROLES.has(auth.activeMember?.role ?? "")) return null;
  return jsonError("Only reviewers, admins or owners can approve or request changes", 403);
}
