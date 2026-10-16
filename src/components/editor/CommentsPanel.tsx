import { useEffect, useMemo, useState } from "react";
import { Badge, Box, Button, Flex, IconButton, Text, TextArea } from "@radix-ui/themes";
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
    // write — pagedly already did).
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
    // saved + synced via the store — this is only the notification nudge.
    notifyComment(draft.id, text);
    setComposerBody("");
    setComposerSection(null);
    setComposerQuote(undefined);
    setComposerApplyMark(undefined);
    setComposerCommentId(undefined);
  };

  return (
    <Box className="h-full overflow-auto" p="4">
      <Flex align="center" gap="2" mb="3">
        <MessageSquare className="size-4 text-[var(--gray-11)]" />
        <Text size="2" weight="medium">Comments</Text>
        {totalActive > 0 && <Badge color="amber" variant="soft">{totalActive}</Badge>}
        <Box className="ml-auto">
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => setShowResolved((v) => !v)}
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
          </Button>
        </Box>
      </Flex>

      {totalActive === 0 && groups.every((g) => g.threads.length === 0) ? (
        <EmptyState
          size="sm"
          icon={MessageSquare}
          title="No comments yet"
          body="Select text in any section and click + Comment to start a thread."
        />
      ) : null}

      {groups.map((g) => (
        <Box key={g.sectionId} mb="3" data-comments-anchor={g.sectionId}>
          <Flex align="center" justify="between" mb="1">
            <Text size="1" weight="medium" color="gray" className="uppercase tracking-wider">
              {g.sectionTitle}
            </Text>
            <Button
              size="1"
              variant="ghost"
              color="gray"
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
            </Button>
          </Flex>

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
            <Text size="1" color="gray" as="p" className="italic" mb="2">No comments.</Text>
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
        </Box>
      ))}
    </Box>
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
    <Box
      mb="2"
      p="2"
      data-comment-id={root.id}
      style={{
        border: "1px solid var(--gray-5)",
        borderRadius: "var(--radius-3)",
        background: root.resolved ? "var(--gray-2)" : "var(--color-background)",
        opacity: root.resolved ? 0.6 : 1,
        scrollMarginTop: 16,
      }}
    >
      {root.quote && (
        <Box
          mb="2"
          p="2"
          style={{
            background: "var(--comment-highlight)",
            borderLeft: "3px solid var(--comment-highlight-strong)",
            borderRadius: "var(--radius-2)",
          }}
        >
          <Text size="1" className="leading-relaxed italic">"{root.quote}"</Text>
        </Box>
      )}
      <CommentRow
        comment={root}
        identities={identities}
        viewer={viewer}
        onDelete={() => onDelete(root.id)}
        onResolve={() => onResolve(root.id, !root.resolved)}
      />

      {replies.map((r) => (
        <Box
          key={r.id}
          mt="2"
          pt="2"
          ml="4"
          style={{ borderTop: "1px solid var(--gray-4)" }}
        >
          <CommentRow
            comment={r}
            identities={identities}
            viewer={viewer}
            onDelete={() => onDelete(r.id)}
          />
        </Box>
      ))}

      {!root.resolved && (
        <Box mt="2">
          {replying ? (
            <Composer
              identity={me}
              body={reply}
              setBody={setReply}
              onCancel={() => { setReplying(false); setReply(""); }}
              onPost={() => {
                if (reply.trim()) {
                  onPost(root.id, reply);
                  setReply("");
                  setReplying(false);
                }
              }}
            />
          ) : (
            <Button
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => setReplying(true)}
            >
              <Reply className="size-3" /> Reply
            </Button>
          )}
        </Box>
      )}
    </Box>
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
    <Flex gap="2" align="start">
      <Avatar
        seed={ident?.email ?? ident?.id ?? comment.authorEmail ?? comment.authorName}
        name={ident?.name ?? comment.authorName}
        email={ident?.email ?? comment.authorEmail}
        initials={ident?.initials}
        size="lg"
      />
      <Box className="flex-1 min-w-0">
        <Flex align="center" gap="2" justify="between">
          <Box className="min-w-0">
            <Text size="1" weight="medium" as="div" className="truncate">
              {ident.name}
            </Text>
            <Text size="1" color="gray" as="div">
              {formatTime(comment.createdAt)}
            </Text>
          </Box>
          <Flex gap="1" className="shrink-0">
            {onResolve && (
              <IconButton
                size="1"
                variant="ghost"
                color={comment.resolved ? "green" : "gray"}
                onClick={onResolve}
                aria-label={comment.resolved ? "Mark unresolved" : "Resolve"}
              >
                <Check className="size-3" />
              </IconButton>
            )}
            {mayDelete && (
              <IconButton size="1" variant="ghost" color="gray" onClick={onDelete} aria-label="Delete">
                <Trash2 className="size-3" />
              </IconButton>
            )}
          </Flex>
        </Flex>
        <Text size="1" as="p" mt="1" className="leading-relaxed whitespace-pre-wrap">
          {comment.body}
        </Text>
      </Box>
    </Flex>
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
    <Box
      mb="2"
      p="2"
      style={{ border: "1px solid var(--gray-6)", borderRadius: "var(--radius-3)" }}
    >
      {quote && (
        <Box
          mb="2"
          p="2"
          style={{
            background: "var(--comment-highlight)",
            borderLeft: "3px solid var(--comment-highlight-strong)",
            borderRadius: "var(--radius-2)",
          }}
        >
          <Flex align="start" gap="1">
            <Quote className="size-3 mt-0.5 shrink-0 opacity-60" />
            <Text size="1" className="leading-relaxed italic">"{quote}"</Text>
          </Flex>
        </Box>
      )}
      <Flex gap="2" align="start">
        <Avatar
          seed={identity?.email ?? identity?.id ?? "?"}
          name={identity?.name}
          email={identity?.email}
          initials={identity?.initials}
          size="md"
        />
        <Box className="flex-1">
          <TextArea
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            autoFocus
          />
          <Flex gap="2" mt="2" justify="end">
            <Button size="1" variant="soft" color="gray" onClick={onCancel}>Cancel</Button>
            <Button size="1" disabled={!body.trim()} onClick={onPost}>Post</Button>
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
