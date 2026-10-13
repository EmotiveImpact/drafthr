import { useEffect, useMemo, useState } from "react";
import { Check, MessageSquare, Quote, Reply, Trash2 } from "lucide-react";
import type { Comment, Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { notifyComment } from "@/lib/collab-notify";
import {
  type CommentIdentity,
  type CommentViewer,
  canDeleteComment,
  identityForComment,
  listIdentities,
  meIdentity,
} from "@/lib/comments/identity";
import { useCommentViewer } from "@/lib/comments/useCommentViewer";
import { Avatar, EmptyState } from "@/components/ds";
import { cn } from "@/lib/utils";

type PendingComment = {
  sectionId: string;
  quote?: string;
  applyMark?: (commentId: string) => void;
  /** Pre-assigned id when the highlight span already exists on the page
   *  (pagedly wrote it + fired onCommentAdd). The thread must share this id. */
  commentId?: string;
};

type SectionGroup = {
  sectionId: string;
  sectionTitle: string;
  threads: { root: Comment; replies: Comment[] }[];
};

/**
 * Threaded comments anchored to letter sections. New comments always use the
 * current profile identity so comment authorship cannot be switched in the UI.
 */
export function CommentsPanel({
  draft,
  pendingComment,
  onPendingCommentConsumed,
}: {
  draft: Draft;
  pendingComment?: PendingComment | null;
  onPendingCommentConsumed?: () => void;
}) {
  const profile = useProfileStore((s) => s.profile);
  const addComment = useDraftStore((s) => s.addComment);
  const deleteComment = useDraftStore((s) => s.deleteComment);
  const resolveComment = useDraftStore((s) => s.resolveComment);

  const identities = useMemo(() => listIdentities(draft, profile), [draft, profile]);
  const me = useMemo(() => meIdentity(profile), [profile]);
  const viewer = useCommentViewer();

  const [showResolved, setShowResolved] = useState(false);
  const [composerSection, setComposerSection] = useState<string | null>(null);
  const [composerBody, setComposerBody] = useState("");
  const [composerQuote, setComposerQuote] = useState<string | undefined>();
  const [composerApplyMark, setComposerApplyMark] = useState<((id: string) => void) | undefined>();
  // Pre-assigned id when the highlight already exists (pagedly review surface).
  const [composerCommentId, setComposerCommentId] = useState<string | undefined>();

  // When the parent hands us a pending comment (e.g. user clicked + Comment on
  // a text selection in the editor), auto-open the composer for that section.
  useEffect(() => {
    if (!pendingComment) return;
    setComposerSection(pendingComment.sectionId);
    setComposerBody("");
    setComposerQuote(pendingComment.quote);
    setComposerApplyMark(() => pendingComment.applyMark);
    setComposerCommentId(pendingComment.commentId);
    onPendingCommentConsumed?.();
  }, [pendingComment, onPendingCommentConsumed]);

  const groups = useMemo<SectionGroup[]>(() => {
    const all = draft.comments ?? [];
    const visible = showResolved ? all : all.filter((c) => !c.resolved);
    return draft.sections.map((s) => {
      const inSection = visible.filter((c) => c.sectionId === s.id);
      const roots = inSection.filter((c) => !c.parentId).sort((a, b) => a.createdAt - b.createdAt);
      const threads = roots.map((root) => ({
        root,
        replies: inSection
          .filter((c) => c.parentId === root.id)
          .sort((a, b) => a.createdAt - b.createdAt),
      }));
      return { sectionId: s.id, sectionTitle: s.title, threads };
    });
  }, [draft.comments, draft.sections, showResolved]);

  const totalActive = (draft.comments ?? []).filter((c) => !c.resolved).length;

  const post = (sectionId: string, parentId?: string, body?: string) => {
    const text = (body ?? composerBody).trim();
    if (!text || !me) return;
    // Root comments from the pagedly review surface carry a pre-assigned id
    // (the highlight span already exists on the page); reuse it so the thread
    // and the on-page highlight share one id, and skip applyMark (no span to
    // write, pagedly already did).
    const explicitId = parentId ? undefined : composerCommentId;
    const newId = addComment(
      draft.id,
      {
        sectionId,
        parentId,
        authorId: me.id,
        authorUserId: viewer.userId ?? undefined,
        authorName: me.name,
        authorEmail: me.email,
        body: text,
        quote: parentId ? undefined : composerQuote,
      },
      explicitId,
    );
    if (!parentId && !explicitId && composerApplyMark && newId) {
      composerApplyMark(newId);
    }
    // Best-effort: email the draft author that a comment landed (server skips
    // self-comments + soft-fails without Resend). The comment itself is already
    // saved and synced via the store; this is only the notification nudge.
    notifyComment(draft.id, text);
    setComposerBody("");
    setComposerSection(null);
    setComposerQuote(undefined);
    setComposerApplyMark(undefined);
    setComposerCommentId(undefined);
  };

  return (
    <div className="h-full overflow-auto py-1 text-[13px] text-[var(--ds-body)]">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="size-4 text-[var(--ds-muted)]" />
        <span className="text-[13.5px] font-medium text-[var(--ds-ink)]">Comments</span>
        {totalActive > 0 && (
          <span className="ds-mono rounded-[6px] bg-[var(--ds-amber-bg)] px-1.5 text-[12px] text-[var(--ds-amber-fg)]">{totalActive}</span>
        )}
        <button type="button" onClick={() => setShowResolved((v) => !v)} className={cn(quietBtn, "ml-auto")}>
          {showResolved ? "Hide resolved" : "Show resolved"}
        </button>
      </div>

      {totalActive === 0 && groups.every((g) => g.threads.length === 0) ? (
        <EmptyState
          size="sm"
          icon={MessageSquare}
          title="No comments yet"
          body="Select text in any section and click + Comment to start a thread."
        />
      ) : null}

      {groups.map((g) => (
        <section key={g.sectionId} className="mb-3" data-comments-anchor={g.sectionId}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[11.5px] font-medium uppercase tracking-[0.06em] text-[var(--ds-subtle)]">
              {g.sectionTitle}
            </span>
            <button
              type="button"
              className={quietBtn}
              onClick={() => {
                setComposerSection(g.sectionId);
                setComposerBody("");
                // Clear any quote/mark carried over from a text-selection flow,
                // otherwise a fresh section comment would attach the stale quote
                // and apply a highlight mark to unrelated text.
                setComposerQuote(undefined);
                setComposerApplyMark(undefined);
                setComposerCommentId(undefined);
              }}
            >
              + Comment
            </button>
          </div>

          {composerSection === g.sectionId && (
            <Composer
              identity={me}
              body={composerBody}
              setBody={setComposerBody}
              quote={composerQuote}
              onCancel={() => {
                setComposerSection(null);
                setComposerBody("");
                setComposerQuote(undefined);
                setComposerApplyMark(undefined);
                setComposerCommentId(undefined);
              }}
              onPost={() => post(g.sectionId)}
            />
          )}

          {g.threads.length === 0 && composerSection !== g.sectionId && (
            <p className="m-0 mb-2 text-[12.5px] text-[var(--ds-subtle)]">No comments.</p>
          )}

          {g.threads.map(({ root, replies }) => (
            <Thread
              key={root.id}
              draftId={draft.id}
              identities={identities}
              viewer={viewer}
              me={me}
              root={root}
              replies={replies}
              onPost={(parentId, body) => post(g.sectionId, parentId, body)}
              onDelete={(cid) => deleteComment(draft.id, cid)}
              onResolve={(cid, val) => resolveComment(draft.id, cid, val)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

const quietBtn =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] px-2 text-[12.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

const iconBtn =
  "grid size-7 shrink-0 place-items-center rounded-[7px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]";

function QuoteBox({ quote, icon }: { quote: string; icon?: boolean }) {
  return (
    <div className="mb-2 flex items-start gap-1 rounded-[6px] border-l-[3px] border-[var(--comment-highlight-strong)] bg-[var(--comment-highlight)] p-2">
      {icon && <Quote className="mt-0.5 size-3 shrink-0 opacity-60" />}
      <span className="font-serif text-[13px] italic leading-relaxed text-[var(--ds-body)]">"{quote}"</span>
    </div>
  );
}

function Thread({
  draftId: _draftId,
  identities,
  viewer,
  me,
  root,
  replies,
  onPost,
  onDelete,
  onResolve,
}: {
  draftId: string;
  identities: CommentIdentity[];
  viewer: CommentViewer;
  me: CommentIdentity | undefined;
  root: Comment;
  replies: Comment[];
  onPost: (parentId: string, body: string) => void;
  onDelete: (cid: string) => void;
  onResolve: (cid: string, resolved: boolean) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");

  return (
    <div
      data-comment-id={root.id}
      className={cn(
        "mb-2 scroll-mt-4 rounded-[10px] border border-[var(--ds-line)] p-2.5",
        root.resolved ? "bg-[var(--ds-surface-2)] opacity-60" : "bg-[var(--ds-surface)]"
      )}
    >
      {root.quote && <QuoteBox quote={root.quote} />}
      <CommentRow
        comment={root}
        identities={identities}
        viewer={viewer}
        onDelete={() => onDelete(root.id)}
        onResolve={() => onResolve(root.id, !root.resolved)}
      />

      {replies.map((r) => (
        <div key={r.id} className="ml-4 mt-2 border-t border-[var(--ds-line-2)] pt-2">
          <CommentRow comment={r} identities={identities} viewer={viewer} onDelete={() => onDelete(r.id)} />
        </div>
      ))}

      {!root.resolved && (
        <div className="mt-2">
          {replying ? (
            <Composer
              identity={me}
              body={reply}
              setBody={setReply}
              onCancel={() => {
                setReplying(false);
                setReply("");
              }}
              onPost={() => {
                if (reply.trim()) {
                  onPost(root.id, reply);
                  setReply("");
                  setReplying(false);
                }
              }}
            />
          ) : (
            <button type="button" className={cn(quietBtn, "-ml-2")} onClick={() => setReplying(true)}>
              <Reply className="size-3" /> Reply
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  identities,
  viewer,
  onDelete,
  onResolve,
}: {
  comment: Comment;
  identities: CommentIdentity[];
  viewer: CommentViewer;
  onDelete: () => void;
  onResolve?: () => void;
}) {
  // A teammate's synced comment renders under their name, never as "me".
  const ident = identityForComment(comment, identities, viewer);
  const mayDelete = canDeleteComment(comment, viewer);
  return (
    <div className="flex items-start gap-2">
      <Avatar
        seed={ident?.email ?? ident?.id ?? comment.authorEmail ?? comment.authorName}
        name={ident?.name ?? comment.authorName}
        email={ident?.email ?? comment.authorEmail}
        initials={ident?.initials}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-[var(--ds-ink)]">{ident.name}</div>
            <div className="text-[12px] text-[var(--ds-muted)]">{formatTime(comment.createdAt)}</div>
          </div>
          <div className="flex shrink-0 gap-0.5">
            {onResolve && (
              <button
                type="button"
                onClick={onResolve}
                aria-label={comment.resolved ? "Mark unresolved" : "Resolve"}
                className={cn(iconBtn, comment.resolved && "text-[var(--ds-green-fg)]")}
              >
                <Check className="size-3.5" />
              </button>
            )}
            {mayDelete && (
              <button type="button" onClick={onDelete} aria-label="Delete" className={iconBtn}>
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="m-0 mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ds-body)]">{comment.body}</p>
      </div>
    </div>
  );
}

function Composer({
  identity,
  body,
  setBody,
  quote,
  onCancel,
  onPost,
}: {
  identity: CommentIdentity | undefined;
  body: string;
  setBody: (s: string) => void;
  quote?: string;
  onCancel: () => void;
  onPost: () => void;
}) {
  return (
    <div className="mb-2 rounded-[10px] border border-[var(--ds-line-strong)] p-2.5">
      {quote && <QuoteBox quote={quote} icon />}
      <div className="flex items-start gap-2">
        <Avatar
          seed={identity?.email ?? identity?.id ?? "?"}
          name={identity?.name}
          email={identity?.email}
          initials={identity?.initials}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <textarea
            aria-label="Comment"
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            autoFocus
            className="w-full resize-y rounded-[8px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 py-2 text-[13px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-line-strong)] focus-visible:shadow-[var(--ds-focus-ring)]"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-7 items-center rounded-[7px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2.5 text-[12.5px] font-medium text-[var(--ds-ink)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!body.trim()}
              onClick={onPost}
              className="inline-flex h-7 items-center rounded-[7px] bg-[var(--ds-accent)] px-2.5 text-[12.5px] font-medium text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
