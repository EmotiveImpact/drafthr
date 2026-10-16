import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MessageSquarePlus, Reply, Trash2, X } from "lucide-react";
import type { Comment, Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { notifyComment } from "@/lib/collab-notify";
import {
  type CommentViewer,
  canDeleteComment,
  identityForComment,
  meIdentity,
  listIdentities,
} from "@/lib/comments/identity";
import { useCommentViewer } from "@/lib/comments/useCommentViewer";
import { useProfileStore } from "@/lib/profile";
import { Avatar } from "@/components/ds";

/**
 * Change A: comments no longer live in a tab — they pop up as a floating
 * panel anchored to whatever text the user just selected (new-thread mode)
 * or to whatever comment highlight they tapped (existing-thread mode).
 *
 *   • Self-positions below the anchor element, clamped to the viewport.
 *   • Repositions on scroll / resize so it tracks the text it's about.
 *   • Closes on Esc, on outside click, and on explicit X button.
 *   • Portalled to <body> so it can escape the editor's overflow + paged
 *     transforms without z-index gymnastics.
 *
 * The Thread + Composer markup is intentionally lighter than the old
 * right-rail CommentsPanel — anchored panels live or die by how quickly
 * the user can scan and dismiss them.
 */

const PANEL_WIDTH = 320;
const GAP = 8; // px between anchor rect and panel
const VIEWPORT_PADDING = 12;

type FloatingMode =
  | { kind: "new"; sectionId: string; quote?: string; applyMark?: (commentId: string) => void }
  | { kind: "existing"; commentId: string };

export type FloatingAnchor = {
  /** Read the anchor's current bounding rect. For DOM-element anchors
   *  (existing thread on a comment mark) this re-queries getBoundingClientRect
   *  so the panel tracks scroll. For static selection-rect anchors
   *  (new thread from a now-cleared selection) it returns the cached rect. */
  getRect: () => DOMRect | null;
  /** Optional element the click-outside detector should treat as "inside"
   *  (so tapping the underlying comment mark doesn't immediately close
   *  the panel it just opened). */
  containerEl?: HTMLElement | null;
  /** Line the panel up with the anchor's left edge (default) or its right
   *  edge (a margin card: the panel then sits under the card, beside the
   *  page, not over the letter). */
  align?: "start" | "end";
};

export function FloatingCommentPanel({
  draft,
  anchor,
  mode,
  focusReply,
  returnFocus,
  onClose,
}: {
  draft: Draft;
  anchor: FloatingAnchor | null;
  mode: FloatingMode;
  /** Existing thread: put the cursor in the reply box when it opens. */
  focusReply?: boolean;
  /** Where focus goes back to when the panel is closed with Esc or Close. */
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}) {
  const profile = useProfileStore((s) => s.profile);
  const addComment = useDraftStore((s) => s.addComment);
  const deleteComment = useDraftStore((s) => s.deleteComment);
  const resolveComment = useDraftStore((s) => s.resolveComment);

  const me = useMemo(() => meIdentity(profile), [profile]);
  const identities = useMemo(() => listIdentities(draft, profile), [draft, profile]);
  const viewer = useCommentViewer();

  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const updateRef = useRef<(() => void) | null>(null);

  // Position the panel below the anchor's rect, clamped to viewport.
  useEffect(() => {
    if (!anchor) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = anchor.getRect();
      if (!rect) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const naturalTop = rect.bottom + GAP;
      const panelH = panelRef.current?.offsetHeight ?? 220;
      const overflowsBottom = naturalTop + panelH + VIEWPORT_PADDING > vh;
      const top = overflowsBottom
        ? Math.max(VIEWPORT_PADDING, rect.top - GAP - panelH)
        : naturalTop;
      const naturalLeft = anchor.align === "end" ? rect.right - PANEL_WIDTH : rect.left;
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, naturalLeft),
        Math.max(VIEWPORT_PADDING, vw - PANEL_WIDTH - VIEWPORT_PADDING)
      );
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
    };
    updateRef.current = update;
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor]);

  // Place it again once its real height is known (the first pass guesses),
  // and whenever it grows (a reply added), so it never covers its anchor.
  const shown = pos !== null;
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!shown || !el) return;
    updateRef.current?.();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateRef.current?.());
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown]);

  // Esc + outside-click close. Esc and Close hand focus back to where the
  // panel was opened from; a click elsewhere leaves focus where it landed.
  const closeAndReturn = () => {
    onClose();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  };
  const closeAndReturnRef = useRef(closeAndReturn);
  closeAndReturnRef.current = closeAndReturn;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAndReturnRef.current();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t)) return;
      if (anchor?.containerEl?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose, anchor]);

  if (!anchor || !pos) return null;

  // Resolve the thread + replies in existing mode.
  let rootComment: Comment | null = null;
  let replies: Comment[] = [];
  if (mode.kind === "existing") {
    const all = draft.comments ?? [];
    rootComment = all.find((c) => c.id === mode.commentId) ?? null;
    if (rootComment) {
      replies = all
        .filter((c) => c.parentId === rootComment!.id)
        .sort((a, b) => a.createdAt - b.createdAt);
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={mode.kind === "new" ? "Add comment" : "Comment thread"}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: PANEL_WIDTH,
        zIndex: 60,
      }}
      className="rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_12px_32px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] p-3 text-[13px] animate-in fade-in slide-in-from-bottom-1 duration-150"
    >
      <header className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--ds-muted)]">
          {mode.kind === "new" ? (
            <>
              <MessageSquarePlus className="size-3" /> New comment
            </>
          ) : (
            <>
              <Reply className="size-3" /> Thread
              {rootComment?.resolved && (
                <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)] px-1.5 py-0.5 text-[10px]">
                  <Check className="size-2.5" /> Resolved
                </span>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={closeAndReturn}
          className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)]"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </header>

      {mode.kind === "new" ? (
        <NewCommentComposer
          quote={mode.quote}
          me={me}
          onSubmit={(body) => {
            const id = addComment(draft.id, {
              sectionId: mode.sectionId,
              authorId: me.id,
              authorUserId: viewer.userId ?? undefined,
              authorName: me.name ?? "Me",
              authorEmail: me.email,
              body,
              quote: mode.quote,
              resolved: false,
            });
            mode.applyMark?.(id);
            // Email the author that a comment landed, as the Comments panel
            // does (best effort; the server skips self-comments).
            notifyComment(draft.id, body);
            onClose();
          }}
        />
      ) : rootComment ? (
        <ThreadView
          draftId={draft.id}
          root={rootComment}
          replies={replies}
          identities={identities}
          viewer={viewer}
          me={me}
          autoFocus={focusReply}
          onReply={(body) => {
            addComment(draft.id, {
              sectionId: rootComment.sectionId,
              parentId: rootComment.id,
              authorId: me.id,
              authorUserId: viewer.userId ?? undefined,
              authorName: me.name ?? "Me",
              authorEmail: me.email,
              body,
              resolved: false,
            });
            notifyComment(draft.id, body);
          }}
          onDelete={(id) => deleteComment(draft.id, id)}
          onToggleResolve={() =>
            resolveComment(draft.id, rootComment.id, !rootComment.resolved)
          }
        />
      ) : (
        <p className="text-[12px] text-[var(--ds-muted)] py-3">Comment not found.</p>
      )}
    </div>,
    document.body
  );
}

/* ----------------------------- Composer ----------------------------- */

function NewCommentComposer({
  quote,
  me,
  onSubmit,
}: {
  quote?: string;
  me: ReturnType<typeof meIdentity>;
  onSubmit: (body: string) => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div>
      {quote && (
        <div className="mb-2 p-2 text-[11.5px] italic leading-snug bg-[var(--comment-highlight)] border-l-2 border-[var(--comment-highlight-strong)] rounded">
          "{quote}"
        </div>
      )}
      <div className="flex items-start gap-2">
        <Avatar size="sm" seed={me.email ?? me.id} initials={me.initials} />
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          className="flex-1 min-w-0 resize-none rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-1.5 text-[12.5px] leading-relaxed focus:outline-none focus:border-[var(--ds-ink)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-[var(--ds-subtle)] mr-1">⌘ + Enter</span>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-[var(--ds-ink)] text-white text-[11.5px] font-medium disabled:opacity-40 hover:opacity-90 transition"
        >
          Post
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Thread ------------------------------ */

function ThreadView({
  root,
  replies,
  identities,
  viewer,
  me,
  onReply,
  onDelete,
  onToggleResolve,
  autoFocus,
}: {
  draftId: string;
  root: Comment;
  replies: Comment[];
  identities: ReturnType<typeof listIdentities>;
  viewer: CommentViewer;
  me: ReturnType<typeof meIdentity>;
  onReply: (body: string) => void;
  onDelete: (commentId: string) => void;
  onToggleResolve: () => void;
  /** Put the cursor in the reply box on open. */
  autoFocus?: boolean;
}) {
  const [replyValue, setReplyValue] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) replyRef.current?.focus({ preventScroll: true });
    // Once, when the thread opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitReply = () => {
    const t = replyValue.trim();
    if (!t) return;
    onReply(t);
    setReplyValue("");
  };

  return (
    <div className="space-y-2">
      {root.quote && (
        <div className="p-2 text-[11.5px] italic leading-snug bg-[var(--comment-highlight)] border-l-2 border-[var(--comment-highlight-strong)] rounded">
          "{root.quote}"
        </div>
      )}

      <CommentBody
        comment={root}
        author={identityForComment(root, identities, viewer)}
        onDelete={canDeleteComment(root, viewer) ? () => onDelete(root.id) : undefined}
        onToggleResolve={onToggleResolve}
        showResolve
      />

      {replies.map((r) => (
        <div
          key={r.id}
          className="ml-5 pt-1.5 border-t border-[var(--ds-line-2)]"
        >
          <CommentBody
            comment={r}
            author={identityForComment(r, identities, viewer)}
            onDelete={canDeleteComment(r, viewer) ? () => onDelete(r.id) : undefined}
          />
        </div>
      ))}

      {!root.resolved && (
        <div className="pt-1.5 border-t border-[var(--ds-line-2)]">
          <div className="flex items-start gap-2 mt-1">
            <Avatar size="sm" seed={me.email ?? me.id} initials={me.initials} />
            <textarea
              ref={replyRef}
              aria-label="Reply"
              value={replyValue}
              onChange={(e) => setReplyValue(e.target.value)}
              placeholder="Reply…"
              rows={2}
              className="flex-1 min-w-0 resize-none rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-2 py-1.5 text-[12.5px] focus:outline-none focus:border-[var(--ds-ink)]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitReply();
                }
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-end">
            <button
              type="button"
              onClick={submitReply}
              disabled={!replyValue.trim()}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] disabled:opacity-40 transition"
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentBody({
  comment,
  author,
  onDelete,
  onToggleResolve,
  showResolve,
}: {
  comment: Comment;
  author: { name?: string; initials: string; email?: string; id: string };
  /** Omitted when the viewer may not delete this comment. */
  onDelete?: () => void;
  onToggleResolve?: () => void;
  showResolve?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Avatar size="sm" seed={author.email ?? author.id} initials={author.initials} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-[var(--ds-ink)] truncate">
            {author.name ?? "Someone"}
          </span>
          <span className="text-[10px] text-[var(--ds-subtle)] tabular-nums">
            {relTime(comment.createdAt)}
          </span>
        </div>
        <p className="text-[12.5px] text-[var(--ds-body)] mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
          {comment.body}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {showResolve && onToggleResolve && (
          <button
            type="button"
            onClick={onToggleResolve}
            className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)]"
            aria-label={comment.resolved ? "Reopen" : "Resolve"}
            title={comment.resolved ? "Reopen" : "Resolve"}
          >
            <Check className="size-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-red-bg)] hover:text-[var(--ds-red-fg)]"
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}
