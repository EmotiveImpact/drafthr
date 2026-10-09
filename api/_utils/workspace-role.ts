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

const BILLING_ROLES = new Set(["owner", "admin"]);

/**
 * 403 unless the caller can manage the workspace's billing (owner or admin).
 * A workspace plan lands on the shared workspace Stripe customer, so a viewer
 * or drafter should not be able to start one.
 */
export function rejectNonBillingManager(auth: MemberLike): Response | null {
  if (BILLING_ROLES.has(auth.activeMember?.role ?? "")) return null;
  return jsonError("Only workspace owners or admins can manage the workspace plan", 403);
}

type ApprovalLike = { id?: unknown; decision?: unknown };

/**
 * The approvals list to store when a member syncs a draft's extras. Approvals
 * are an append-only record, so entries already on the server are always kept
 * (a sync can't erase who approved what), and a caller who cannot decide
 * reviews can't add an "approved" or "changes requested" entry of their own;
 * other entries (such as "submitted") pass through.
 */
export function approvalsForWrite(
  auth: MemberLike,
  stored: unknown,
  incoming: unknown,
): ApprovalLike[] {
  const storedList = Array.isArray(stored) ? (stored as ApprovalLike[]) : [];
  const incomingList = Array.isArray(incoming) ? (incoming as ApprovalLike[]) : [];
  const canDecide = APPROVER_ROLES.has(auth.activeMember?.role ?? "");
  const seen = new Set(storedList.map((a) => String(a?.id)));
  const out = [...storedList];
  for (const a of incomingList) {
    if (!a || typeof a !== "object" || typeof a.id !== "string" || seen.has(a.id)) continue;
    if (!canDecide && typeof a.decision === "string" && DECISION_STATUSES.has(a.decision)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

type SectionLike = { sectionId: string; title?: string; html: string };

/**
 * 409 when a write would change the letter content of an approved draft
 * without first taking it out of "approved". The editor locks approved
 * drafts, but the server accepted new sections as long as the status was
 * re-sent unchanged, so an approved letter could be rewritten and still show
 * as approved. Moving the status out of approved (re-opening review) is how
 * an approved letter is edited.
 */
export function rejectEditOfApprovedDraft(
  storedStatus: string | null | undefined,
  nextStatus: string | null | undefined,
  storedSections: SectionLike[],
  incomingSections: SectionLike[] | null | undefined,
): Response | null {
  if (storedStatus !== "approved") return null;
  if (nextStatus && nextStatus !== "approved") return null;
  if (!incomingSections) return null;
  if (!sectionsDiffer(storedSections, incomingSections)) return null;
  return jsonError("This letter is approved and locked. Re-open it for review before editing.", 409);
}

function sectionsDiffer(a: SectionLike[], b: SectionLike[]): boolean {
  if (a.length !== b.length) return true;
  const byId = new Map(a.map((s) => [s.sectionId, s]));
  return b.some((s) => {
    const prev = byId.get(s.sectionId);
    return !prev || prev.html !== s.html || (prev.title ?? "") !== (s.title ?? "");
  });
}
