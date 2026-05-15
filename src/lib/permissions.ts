import type { ReviewStatus } from "./letters/types";
import type { WorkspaceRole } from "./profile";

/** Reviewers + admins/owners can decide a submission. */
export function canApprove(role: WorkspaceRole | undefined): boolean {
  return role === "owner" || role === "admin" || role === "reviewer";
}

/** Everyone except read-only viewers can ship a draft into review. */
export function canSubmitForReview(role: WorkspaceRole | undefined): boolean {
  return role !== "viewer";
}

/**
 * Editor canvas write-gate. Locks the editor while a draft is being
 * approved (reviewer role) or once it's been approved (anyone).
 */
export function canEditDraft(
  role: WorkspaceRole | undefined,
  status: ReviewStatus | undefined
): boolean {
  if (role === "viewer") return false;
  if (status === "approved") return false;
  if (status === "in_review" && role === "reviewer") return false;
  return true;
}
