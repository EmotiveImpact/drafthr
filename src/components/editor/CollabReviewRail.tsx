import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  Lightbulb,
  MessageSquare,
  MessageSquareWarning,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { Draft, Section } from "@/lib/letters/types";
import type { WorkspaceRole } from "@/lib/profile";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { canApprove, canSubmitForReview } from "@/lib/permissions";
import { meIdentity } from "@/lib/comments/identity";
import { sanitizeLetterHtml } from "@/lib/sanitize";
import { uid } from "@/lib/utils";
import { Avatar, avatarColor } from "@/components/ds";
import { CommentsPanel } from "./CommentsPanel";
import { SuggestEditDialog } from "./SuggestEditDialog";
import type { ReviewDialogKind } from "./ReviewDialog";
import { Button } from "@/components/ui/button";

type PendingComment = {
  sectionId: string;
  quote?: string;
  applyMark?: (commentId: string) => void;
};

/**
 * The unified collaborative-review rail — review as a first-class dock in the
 * EDITOR (distinct from ReviewRail.tsx, which is the /review step's
 * health-check rail). Per the approved collab-review design:
 *
 *   [ Reviewers + status ]
 *   [ Suggestions | Comments tabs ]
 *   [ suggestion cards: who · before/after · accept/reject ]
 *   [ approval footer driven by reviewStatus ]
 *
 * It COMPOSES the existing machinery (pendingChange accept/reject, threaded
 * comments, the approval state machine) into one surface — no new data paths,
 * so everything stays consistent with the inline marks on the canvas.
 */
export function CollabReviewRail({
  draft,
  role,
  canResolve,
  onOpenReviewDialog,
  onWithdraw,
  pendingComment,
  onPendingCommentConsumed,
  focusCommentId,
  onFocusCommentConsumed,
}: {
  draft: Draft;
  role: WorkspaceRole | undefined;
  /** Whether the viewer may Accept/Reject suggestions (the canvas edit gate). */
  canResolve: boolean;
  onOpenReviewDialog: (kind: ReviewDialogKind) => void;
  onWithdraw: () => void;
  pendingComment?: PendingComment | null;
  onPendingCommentConsumed?: () => void;
  /** Set when the user clicks a comment highlight in the letter — the rail
   *  switches to the Comments tab and scrolls that thread into view. */
  focusCommentId?: string | null;
  onFocusCommentConsumed?: () => void;
}) {
  const profile = useProfileStore((s) => s.profile);
  const me = meIdentity(profile);
  const [tab, setTab] = useState<"suggestions" | "comments">("suggestions");
  // The reviewer-side "Suggest an edit" flow, owned by the rail so the Review
  // step needs no extra wiring: pick a section → SuggestEditDialog → the
  // proposal lands as an attributed pendingChange the author accepts/rejects.
  const [suggestPickerOpen, setSuggestPickerOpen] = useState(false);
  const [suggestSection, setSuggestSection] = useState<Section | null>(null);

  const reviewStatus = draft.reviewStatus ?? "draft";
  const suggestions = useMemo(
    () => draft.sections.filter((s) => s.pendingChange),
    [draft.sections],
  );
  const openComments = (draft.comments ?? []).filter((c) => !c.resolved).length;
  const openCount = suggestions.length + openComments;

  // Latest approval entry per reviewer → the status list at the top.
  const reviewers = useMemo(() => {
    const latest = new Map<string, { decision: string; body?: string }>();
    for (const a of draft.approvals ?? []) {
      if (!a.reviewerName?.trim()) continue;
      latest.set(a.reviewerName.trim(), { decision: a.decision, body: a.body });
    }
    return [...latest.entries()].map(([name, v]) => ({ name, ...v }));
  }, [draft.approvals]);

  const latestChangesNote = useMemo(
    () =>
      (draft.approvals ?? [])
        .slice()
        .reverse()
        .find((a) => a.decision === "changes_requested"),
    [draft.approvals],
  );

  const scrollToSection = (sectionId: string) => {
    // The paged letter (Review step) marks sections with data-section-anchor;
    // the sections canvas uses data-section-id. Try both.
    const el =
      document.querySelector<HTMLElement>(`[data-section-anchor="${sectionId}"]`) ??
      document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Clicking a comment highlight in the letter focuses that thread here.
  useEffect(() => {
    if (!focusCommentId) return;
    setTab("comments");
    // Defer so the Comments tab has mounted before we look for the thread.
    const t = setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-comment-id="${focusCommentId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocusCommentConsumed?.();
    }, 60);
    return () => clearTimeout(t);
  }, [focusCommentId, onFocusCommentConsumed]);

  const submitSuggestion = (section: Section, proposedHtml: string) => {
    useDraftStore.getState().proposeSectionChange(draft.id, section.id, {
      id: uid("sug"),
      createdAt: Date.now(),
      proposedHtml,
      instruction: "Suggested edit",
      source: "review",
      authorId: me.email || me.name,
      authorName: me.name,
      // Inline: stage the change as <ins>/<del data-suggestion-id> marks in
      // section.html so it renders as a redline ON the pagedly page (now that
      // pagedly preserves our suggestion marks), not just as a rail card. The
      // rail card still shows for accept/reject; both read the same pendingChange.
      diffViewMode: "inline",
    });
    toast.success("Suggestion sent to the author");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── header: title + open count + reviewers ── */}
      <div className="shrink-0 border-b border-[var(--ds-line-2)] px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-[var(--ds-muted)]" />
          <span className="text-[13px] font-semibold text-[var(--ds-ink)]">Review</span>
          <span className="ml-auto rounded-full bg-[var(--ds-line-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--ds-muted)]">
            {openCount} open
          </span>
        </div>
        <div className="mt-2.5 flex flex-col gap-0.5">
          {/* the current user */}
          <ReviewerRow
            seed={me.email ?? me.name}
            name="You"
            sub={role ? roleLabel(role) : undefined}
            status={role === "reviewer" ? "Reviewing" : "Author"}
            tone="neutral"
          />
          {reviewers
            .filter((r) => r.name !== me.name)
            .map((r) => (
              <ReviewerRow
                key={r.name}
                seed={r.name}
                name={r.name}
                status={
                  r.decision === "approved"
                    ? "Approved"
                    : r.decision === "changes_requested"
                      ? "Changes"
                      : "Reviewing"
                }
                tone={
                  r.decision === "approved"
                    ? "good"
                    : r.decision === "changes_requested"
                      ? "warn"
                      : "info"
                }
              />
            ))}
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="flex shrink-0 gap-1 border-b border-[var(--ds-line-2)] px-3 py-2">
        <TabButton
          on={tab === "suggestions"}
          onClick={() => setTab("suggestions")}
          icon={<Lightbulb className="size-3" />}
          label="Suggestions"
          count={suggestions.length}
        />
        <TabButton
          on={tab === "comments"}
          onClick={() => setTab("comments")}
          icon={<MessageSquare className="size-3" />}
          label="Comments"
          count={openComments}
        />
      </div>

      {/* ── feed ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "suggestions" ? (
          <>
            {/* Propose an edit from HERE — the review surface — instead of
             * having to go back to Edit. Pick a section, edit a copy, and the
             * author gets the attributed accept/reject card. Hidden once the
             * draft is approved (canvas is locked, review is over). */}
            {reviewStatus !== "approved" && (
              <div className="px-3 pt-3">
                <button
                  type="button"
                  onClick={() => setSuggestPickerOpen((v) => !v)}
                  className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--ds-line)] text-[12px] font-semibold text-[var(--ds-muted)] hover:border-[var(--ds-ink)] hover:text-[var(--ds-ink)]"
                >
                  <Lightbulb className="size-3.5" /> Suggest an edit…
                </button>
                {suggestPickerOpen && (
                  <div className="mt-1.5 overflow-hidden rounded-md border border-[var(--ds-line)]">
                    {draft.sections
                      .filter((s) => s.status !== "streaming" && !s.pendingChange)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSuggestSection(s);
                            setSuggestPickerOpen(false);
                          }}
                          className="block w-full border-b border-[var(--ds-line-2)] px-3 py-1.5 text-left text-[12px] text-[var(--ds-body)] last:border-b-0 hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
                        >
                          {s.title}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            {suggestions.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] italic text-[var(--ds-muted)]">
                No open suggestions. Reviewer edits and AI proposals land here for
                accept / reject.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5 p-3">
                {suggestions.map((section) => (
                  <SuggestionCard
                    key={section.id}
                    section={section}
                    canResolve={canResolve}
                    onJump={() => scrollToSection(section.id)}
                    onAccept={() =>
                      useDraftStore.getState().acceptSectionPending(draft.id, section.id)
                    }
                    onReject={() =>
                      useDraftStore.getState().rejectSectionPending(draft.id, section.id)
                    }
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <CommentsPanel
            draft={draft}
            pendingComment={pendingComment}
            onPendingCommentConsumed={onPendingCommentConsumed}
          />
        )}
      </div>

      {/* ── approval footer (state machine) ── */}
      <div
        className={
          "shrink-0 border-t px-4 py-3 " +
          (reviewStatus === "changes_requested"
            ? "border-[var(--ds-amber-bg)] bg-[var(--ds-amber-bg)]"
            : reviewStatus === "approved"
              ? "border-[var(--ds-green-bg)] bg-[var(--ds-green-bg)]"
              : "border-[var(--ds-line)] bg-[var(--ds-surface-2)]")
        }
      >
        {reviewStatus === "draft" && (
          <>
            <p className="mb-2 text-[12px] leading-snug text-[var(--ds-muted)]">
              Ready for a second pair of eyes? Send it to a teammate for sign-off.
            </p>
            <Button
              size="sm"
              className="w-full"
              disabled={!canSubmitForReview(role)}
              onClick={() => onOpenReviewDialog("submit")}
            >
              <Send className="mr-1.5 size-3.5" /> Submit for approval
            </Button>
          </>
        )}

        {reviewStatus === "in_review" && (
          <>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ds-amber-fg)]">
              <Send className="size-3.5" /> Awaiting sign-off
            </div>
            {canApprove(role) ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenReviewDialog("request_changes")}
                >
                  Request changes
                </Button>
                <Button size="sm" className="flex-1" onClick={() => onOpenReviewDialog("approve")}>
                  <CheckCircle2 className="mr-1.5 size-3.5" /> Approve
                </Button>
              </div>
            ) : canSubmitForReview(role) ? (
              <p className="text-[12px] leading-snug text-[var(--ds-muted)]">
                A reviewer is looking at this draft. You can withdraw it to keep
                editing.
              </p>
            ) : (
              <p className="text-[12px] leading-snug text-[var(--ds-muted)]">
                A reviewer is looking at this draft.
              </p>
            )}
            {/* Withdraw is an AUTHOR-side action: not for viewers (can't edit
             * anyway) and not for the assigned reviewer — their pushback path
             * is "Request changes", which requires an explanatory note rather
             * than silently cancelling the review. */}
            {role !== "reviewer" && canSubmitForReview(role) && (
              <button
                type="button"
                onClick={onWithdraw}
                className="mt-2 w-full text-center text-[11.5px] font-medium text-[var(--ds-muted)] underline-offset-2 hover:text-[var(--ds-ink)] hover:underline"
              >
                Withdraw from review
              </button>
            )}
          </>
        )}

        {reviewStatus === "changes_requested" && (
          <>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ds-amber-fg)]">
              <MessageSquareWarning className="size-3.5" />
              {latestChangesNote?.reviewerName
                ? `${latestChangesNote.reviewerName} requested changes`
                : "Changes requested"}
            </div>
            {latestChangesNote?.body && (
              <p className="mb-2 border-l-2 border-[var(--ds-amber-fg)]/40 pl-2 text-[12px] italic leading-snug text-[var(--ds-body)]">
                “{latestChangesNote.body}”
              </p>
            )}
            <Button
              size="sm"
              className="w-full"
              disabled={!canSubmitForReview(role)}
              onClick={() => onOpenReviewDialog("submit")}
            >
              <Send className="mr-1.5 size-3.5" /> Re-submit for approval
            </Button>
          </>
        )}

        {reviewStatus === "approved" && (
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ds-green-fg)]">
            <CheckCircle2 className="size-3.5" /> Approved — clear to export and send.
          </div>
        )}
      </div>

      {suggestSection && (
        <SuggestEditDialog
          open
          onOpenChange={(next) => !next && setSuggestSection(null)}
          section={suggestSection}
          onSubmit={(proposedHtml) => submitSuggestion(suggestSection, proposedHtml)}
        />
      )}
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────── */

function roleLabel(role: WorkspaceRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function ReviewerRow({
  seed,
  name,
  sub,
  status,
  tone,
}: {
  seed: string;
  name: string;
  sub?: string;
  status: string;
  tone: "good" | "warn" | "info" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)]"
      : tone === "warn"
        ? "bg-[var(--ds-amber-bg)] text-[var(--ds-amber-fg)]"
        : tone === "info"
          ? "bg-[var(--ds-blue-bg)] text-[var(--ds-blue-fg)]"
          : "bg-[var(--ds-line-2)] text-[var(--ds-muted)]";
  return (
    <div className="flex items-center gap-2 rounded-md px-1 py-1">
      <Avatar seed={seed} name={name === "You" ? sub ?? name : name} size="md" />
      <div className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[12px] font-semibold text-[var(--ds-ink)]">
          {name}
        </span>
        {sub && <span className="block text-[10.5px] text-[var(--ds-subtle)]">{sub}</span>}
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneClass}`}>{status}</span>
    </div>
  );
}

function TabButton({
  on,
  onClick,
  icon,
  label,
  count,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold transition " +
        (on
          ? "bg-[var(--ds-line-2)] text-[var(--ds-ink)]"
          : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]")
      }
    >
      {icon}
      {label}
      <span className={"text-[10.5px] font-medium " + (on ? "text-[var(--ds-ink)]" : "text-[var(--ds-subtle)]")}>
        {count}
      </span>
    </button>
  );
}

function SuggestionCard({
  section,
  canResolve,
  onJump,
  onAccept,
  onReject,
}: {
  section: Section;
  canResolve: boolean;
  onJump: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const pending = section.pendingChange;
  if (!pending) return null;

  const human = Boolean(pending.authorName);
  const seed = pending.authorId ?? pending.authorName ?? "";
  const accent = human ? avatarColor(seed) : "var(--ds-amber-fg)";
  // "Before" prefers the pre-diff snapshot (inline mode stashes the diffed
  // HTML into section.html, so raw section.html would show ins/del noise).
  const beforeHtml = pending.prevHtml ?? section.html;

  return (
    <div
      className="overflow-hidden rounded-[10px] border bg-[var(--ds-surface)]"
      style={{ borderColor: `color-mix(in srgb, ${accent} 45%, var(--ds-line))` }}
    >
      <button
        type="button"
        onClick={onJump}
        className="flex w-full items-center gap-2 px-3 pb-1.5 pt-2.5 text-left"
        title="Jump to this section"
      >
        {human ? (
          <Avatar seed={seed} name={pending.authorName} size="sm" />
        ) : (
          <Sparkles className="size-3.5 shrink-0 text-[var(--ds-amber-fg)]" />
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ds-ink)]">
          {human ? `${pending.authorName} suggests` : "AI proposed"}
          <span className="ml-1 font-normal text-[var(--ds-subtle)]">· {section.title}</span>
        </span>
      </button>
      {pending.instruction && pending.instruction !== "Suggested edit" && (
        <p className="px-3 pb-1 text-[11.5px] leading-snug text-[var(--ds-muted)]">
          <span className="font-semibold">Why:</span> {pending.instruction}
        </p>
      )}
      <div className="mx-3 mb-2 flex flex-col gap-1">
        <DiffPane label="Before" tone="rem" html={beforeHtml} />
        <DiffPane label="After" tone="add" html={pending.proposedHtml} />
      </div>
      {canResolve ? (
        <div className="flex gap-2 px-3 pb-2.5">
          <button
            type="button"
            onClick={onReject}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[11.5px] font-semibold text-[var(--ds-body)] hover:bg-[var(--ds-line-2)]"
          >
            <X className="size-3" /> Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-[var(--ds-green-fg)] text-[11.5px] font-semibold text-white hover:brightness-110"
          >
            <Check className="size-3" /> Accept
          </button>
        </div>
      ) : (
        <p className="px-3 pb-2.5 text-[11px] italic text-[var(--ds-muted)]">Awaiting the author</p>
      )}
    </div>
  );
}

function DiffPane({ label, tone, html }: { label: string; tone: "rem" | "add"; html: string }) {
  return (
    <div
      className={
        "rounded-md border px-2 py-1.5 " +
        (tone === "rem"
          ? "border-[var(--ds-red-bg)] bg-[var(--ds-red-bg)]/50"
          : "border-[var(--ds-green-bg)] bg-[var(--ds-green-bg)]/60")
      }
    >
      <span
        className={
          "mb-0.5 block text-[9.5px] font-bold uppercase tracking-[0.06em] " +
          (tone === "rem" ? "text-[var(--ds-red-fg)]" : "text-[var(--ds-green-fg)]")
        }
      >
        {label}
      </span>
      <div
        className="max-h-24 overflow-hidden text-[11.5px] leading-snug text-[var(--ds-body)] [&_p]:m-0 [&_p]:mb-1"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: sanitizeLetterHtml(html) }}
      />
    </div>
  );
}
