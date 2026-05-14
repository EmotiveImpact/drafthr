import { useEffect, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { MessageSquarePlus, Send, Quote, ExternalLink, Check } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { Avatar } from "@/components/ds";
import { meIdentity } from "@/lib/comments/identity";

/**
 * Inline comment composer popover.
 *
 * Anchors to a trigger (the section header's comment button, OR the
 * BubbleMenu "+ Comment" pill, OR the Preview's per-section overlay
 * button). Pops a small textarea so the user can post a comment in
 * one click WITHOUT switching to the right rail.
 *
 * New comments use the current profile identity.
 *
 * If the trigger carried a quoted text + applyMark callback, we show
 * the quote at the top and apply the inline mark after the comment is
 * posted (matches the BubbleMenu / Preview selection flow).
 *
 * "Open thread" link switches the right rail to the Comments tab.
 */
export function CommentPopover({
  draft,
  sectionId,
  quote,
  applyMark,
  onOpenThread,
  trigger,
  open,
  onOpenChange,
}: {
  draft: Draft;
  /** Section the comment is anchored to. */
  sectionId: string;
  /** Optional quoted text — renders as a blockquote at the top of the composer. */
  quote?: string;
  /** Optional Tiptap mark applier — called with the new comment id after Post. */
  applyMark?: (commentId: string) => void;
  /** Callback to open the right-rail Comments tab (e.g. "see full thread"). */
  onOpenThread: () => void;
  trigger: React.ReactNode;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  const profile = useProfileStore((s) => s.profile);
  const addComment = useDraftStore((s) => s.addComment);

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const me = useMemo(() => meIdentity(profile), [profile]);
  const [body, setBody] = useState("");
  const [posted, setPosted] = useState(false);

  // Reset on open.
  useEffect(() => {
    if (isOpen) {
      setBody("");
      setPosted(false);
    }
  }, [isOpen]);

  const post = () => {
    const text = body.trim();
    if (!text) return;
    const newId = addComment(draft.id, {
      sectionId,
      authorId: me.id,
      authorName: me.name,
      authorEmail: me.email,
      body: text,
      quote,
    });
    if (applyMark && newId) applyMark(newId);
    setBody("");
    setPosted(true);
    // Auto-close after a brief confirmation flash so the user sees the post landed.
    setTimeout(() => {
      setOpen(false);
    }, 700);
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[340px] rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_10px_24px_rgba(15,17,21,0.10),0_1px_3px_rgba(15,17,21,0.04)] p-3 text-[13px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <MessageSquarePlus className="size-3.5 text-[var(--ds-muted)]" />
            <h4 className="text-[12px] font-semibold text-[var(--ds-ink)] m-0">
              Add a comment
            </h4>
            <button
              type="button"
              onClick={() => {
                onOpenThread();
                setOpen(false);
              }}
              className="ml-auto text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] inline-flex items-center gap-1"
              title="Open the full comments thread in the right rail"
            >
              Open thread <ExternalLink className="size-3" />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <Avatar
              seed={me.email ?? me.id}
              name={me.name}
              email={me.email}
              initials={me.initials}
              size="md"
            />
            <span className="text-[11px] text-[var(--ds-muted)]">{me.name}</span>
          </div>

          {/* Anchored quote (if present). */}
          {quote && (
            <div
              className="mb-2 p-2 rounded-[var(--r-sm)] text-[11px] italic leading-relaxed"
              style={{
                background: "var(--comment-highlight, #fef3c7)",
                borderLeft: "3px solid var(--comment-highlight-strong, #fde68a)",
                color: "var(--ds-ink)",
              }}
            >
              <Quote className="inline size-3 mr-1 opacity-60" />
              "{quote}"
            </div>
          )}

          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your comment…"
            rows={3}
            className="w-full text-[13px] px-2.5 py-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                post();
              }
            }}
          />

          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-[10px] text-[var(--ds-subtle)]">⌘ + Enter to post</p>
            {posted ? (
              <span className="text-[11px] text-[var(--ds-green-fg)] inline-flex items-center gap-1">
                <Check className="size-3" /> Posted
              </span>
            ) : (
              <button
                type="button"
                onClick={post}
                disabled={!body.trim()}
                className="text-[12px] px-2 h-7 rounded-md bg-[var(--ds-ink)] text-white inline-flex items-center gap-1 hover:opacity-90 disabled:opacity-30"
              >
                <Send className="size-3" /> Post
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
