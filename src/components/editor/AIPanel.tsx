import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "ai/react";
import { ArrowUp, Sparkles, Wand2, Trash2, Loader2, Check, AlertCircle, RotateCw } from "lucide-react";
import type { AIAction, AIChatScope, Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { buildAgentSystemPrompt, parseAgentReply } from "@/lib/llm/agent";
import { regenerateSection } from "@/lib/llm/draft";
import { Avatar, BrandMark } from "@/components/ds";
import { meIdentity } from "@/lib/comments/identity";
import { uid } from "@/lib/utils";

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  { label: "+ make formal", prompt: "Rewrite this letter in a more formal register. Remove contractions, use full clause names, keep all statutory citations." },
  { label: "+ tribunal-ready", prompt: "Rewrite to be tribunal-ready: strictly factual, no intensifiers, no admissions, reservation of rights at the close, statutory anchors explicit." },
  { label: "+ shorter", prompt: "Tighten the whole letter — cut redundancy, drop adjectives, keep every fact and citation. Aim for 25% shorter." },
  { label: "+ summarise for counsel", prompt: "Summarise this letter for an external solicitor / counsel — what it says, what it relies on, what it asks for, and the key risk points. Plain prose, no bullets unless the structure helps." },
];

const SCOPE_LABEL: Record<AIChatScope, string> = {
  letter: "whole letter",
  section: "section",
  selection: "selection",
};

/**
 * Right-rail AI tab. Uses `useChat` from `ai/react` against /api/agent for
 * streaming, message state, and future tool-call plumbing.
 *
 * Architecture:
 *  - System prompt is rebuilt every turn from the live draft state (via the
 *    `body` prop on useChat) so the agent always has the current section
 *    index, jurisdiction, and meta.
 *  - User messages are tagged with a scope (whole / section / selection)
 *    appended to the user content so the agent knows what to target.
 *  - Assistant replies are parsed for <<APPLY>> sentinels on stream finish;
 *    extracted actions render as Apply buttons under the message.
 *  - Apply triggers regenerateSection(section, instruction) — same path as
 *    Option A's Refine popover. Section version history covers undo.
 *  - Persisted to draft.aiChat for cross-session memory; useChat manages
 *    the in-flight thread, we mirror to the store on each turn.
 */
export function AIPanel({ draft, activeSectionId }: { draft: Draft; activeSectionId: string | null }) {
  const profile = useProfileStore((s) => s.profile);
  const me = meIdentity(profile);

  const updateSection = useDraftStore((s) => s.updateSection);
  const appendToSection = useDraftStore((s) => s.appendToSection);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const pushSectionVersion = useDraftStore((s) => s.pushSectionVersion);
  const clearAIChat = useDraftStore((s) => s.clearAIChat);

  const [scope, setScope] = useState<AIChatScope>("letter");
  // Map of message-id → parsed actions (proposed/applied/failed). Kept in
  // local state so each useChat turn surfaces its actions immediately.
  const [actionsByMsg, setActionsByMsg] = useState<Record<string, AIAction[]>>({});

  const scopeSection: Section | undefined = useMemo(() => {
    if (scope !== "section") return undefined;
    return draft.sections.find((s) => s.id === activeSectionId) ?? draft.sections[0];
  }, [scope, draft.sections, activeSectionId]);

  const scopeLabel: string =
    scope === "section" && scopeSection
      ? `section "${scopeSection.title}" (id=${scopeSection.id})`
      : SCOPE_LABEL[scope];

  // Rebuild the system prompt on every turn (the model needs the live draft).
  const system = useMemo(() => buildAgentSystemPrompt(draft), [draft]);

  // Hydrate from persisted chat on mount and when draft id changes.
  const initialMessages = useMemo(
    () =>
      (draft.aiChat ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.body,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.id]
  );

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    setInput,
    isLoading,
    setMessages,
    stop,
    reload,
    error,
  } = useChat({
    api: "/api/agent",
    id: `agent-${draft.id}`,
    initialMessages,
    body: {
      system,
      model: profile.defaults.qwenModel,
    },
    onFinish: (msg) => {
      // Parse <<APPLY>> sentinels from the final assistant text.
      const { body, actions } = parseAgentReply(msg.content, draft.sections);
      if (actions.length > 0) {
        setActionsByMsg((prev) => ({ ...prev, [msg.id]: actions }));
      }
      // Replace the message body with the cleaned (sentinel-stripped) text.
      if (body !== msg.content) {
        setMessages((all) =>
          all.map((m) => (m.id === msg.id ? { ...m, content: body } : m))
        );
      }
      // Mirror to persisted chat in the store.
      mirrorToStore();
    },
    onError: (err) => {
      console.error("[AIPanel] useChat error:", err);
    },
  });

  // Mirror useChat's working messages into draft.aiChat on every turn so the
  // thread survives reloads. We only keep the canonical fields.
  const mirrorToStore = () => {
    useDraftStore.setState((s) => {
      const d = s.drafts[draft.id];
      if (!d) return s;
      return {
        drafts: {
          ...s.drafts,
          [draft.id]: {
            ...d,
            aiChat: messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              body: m.content,
              createdAt: Date.now(),
            })),
            updatedAt: Date.now(),
          },
        },
      };
    });
  };

  const lastSubmittedScope = useRef<AIChatScope>(scope);

  /**
   * Capture the user's current text selection from anywhere in the editor
   * canvas (section editor or preview). Returns the trimmed quoted text and
   * the section id that contains it, if we can resolve it.
   */
  const captureSelection = (): { quote: string; sectionId?: string } | null => {
    if (typeof window === "undefined") return null;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const quote = sel.toString().trim();
    if (!quote) return null;
    const range = sel.getRangeAt(0);
    const startEl: Element | null =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const sectionEl = startEl?.closest?.("[data-section-id]") as HTMLElement | null;
    return { quote, sectionId: sectionEl?.getAttribute("data-section-id") ?? undefined };
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Resolve the actual scope payload at submit time:
    //  - selection: grab live window selection + the containing section id
    //  - section:   use the active section (Editor or Preview-clicked)
    //  - letter:    no-op
    let resolvedLabel = scopeLabel;
    let scopePayload = "";
    if (scope === "selection") {
      const captured = captureSelection();
      if (captured) {
        const sec = captured.sectionId
          ? draft.sections.find((s) => s.id === captured.sectionId)
          : undefined;
        resolvedLabel = sec
          ? `selection in section "${sec.title}" (id=${sec.id})`
          : "selection";
        scopePayload = `\n[selection: "${captured.quote}"${
          captured.sectionId ? ` from section_id=${captured.sectionId}` : ""
        }]`;
      } else {
        // Fall back to whole letter — no selection = no-op selection scope.
        resolvedLabel = "whole letter (no active selection)";
      }
    }

    // Append scope info to the message so the agent has the literal target.
    const scoped = `${input.trim()}\n[scope: ${resolvedLabel}]${scopePayload}`;
    lastSubmittedScope.current = scope;
    handleSubmit(e, {
      body: {
        system,
        model: profile.defaults.qwenModel,
      },
      data: undefined,
      allowEmptySubmit: false,
    });
    // Replace the just-pushed user message body so it carries the resolved
    // scope label + (for selection) the live quote — for both display and
    // /api/agent's payload.
    requestAnimationFrame(() => {
      setMessages((all) => {
        const last = all[all.length - 1];
        if (!last || last.role !== "user") return all;
        return all.map((m, i) => (i === all.length - 1 ? { ...m, content: scoped } : m));
      });
    });
  };

  useEffect(() => {
    // On scope change, do nothing — we re-tag messages on submit.
  }, [scope]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--ds-line-2)] shrink-0">
        <Wand2 className="size-4 text-[var(--ds-muted)]" />
        <span className="text-[13px] font-medium text-[var(--ds-ink)]">AI agent</span>
        <span className="text-[11px] text-[var(--ds-subtle)]">· {profile.defaults.qwenModel ?? "qwen3-max"}</span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Clear this chat thread?")) {
                clearAIChat(draft.id);
                setMessages([]);
                setActionsByMsg({});
              }
            }}
            className="ml-auto text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] inline-flex items-center gap-1"
          >
            <Trash2 className="size-3" /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <BrandMark size={36} className="mx-auto mb-3" />
            <p className="text-[13px] text-[var(--ds-ink)] font-medium">Ask me anything about this draft.</p>
            <p className="text-[12px] text-[var(--ds-muted)] mt-1 leading-relaxed max-w-xs mx-auto">
              I can rewrite sections, add clauses, tighten prose, summarise for counsel, or just answer questions about the structure.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <Message
            key={m.id}
            id={m.id}
            role={m.role as "user" | "assistant"}
            content={m.content}
            streaming={isLoading && m === messages[messages.length - 1] && m.role === "assistant"}
            me={me}
            draft={draft}
            actions={actionsByMsg[m.id] ?? []}
            onApply={(action) => apply(m.id, action)}
          />
        ))}
        {error && (
          <div className="rounded-md border border-[var(--ds-red-bg)] bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)] text-[12px] px-3 py-2 flex items-center gap-2">
            <AlertCircle className="size-3.5" />
            <span className="flex-1">Couldn't reach the model.</span>
            <button onClick={() => reload()} className="inline-flex items-center gap-1 hover:underline">
              <RotateCw className="size-3" /> Retry
            </button>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-[var(--ds-line-2)] bg-[var(--ds-surface)]">
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          {(["letter", "section", "selection"] as AIChatScope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={
                "text-[10px] px-2 py-0.5 rounded-full border transition " +
                (scope === s
                  ? "bg-[var(--ds-ink)] text-white border-[var(--ds-ink)]"
                  : "bg-[var(--ds-surface)] text-[var(--ds-muted)] border-[var(--ds-line)] hover:text-[var(--ds-ink)]")
              }
            >
              {SCOPE_LABEL[s]}
              {s === "section" && scopeSection ? ` · ${scopeSection.title}` : ""}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 px-3 py-2">
          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder="Ask the AI agent..."
            rows={1}
            className="flex-1 min-h-[36px] max-h-[120px] resize-none px-2.5 py-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e as unknown as React.FormEvent);
              }
            }}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={() => stop()}
              className="size-8 rounded-md bg-[var(--ds-line)] text-[var(--ds-ink)] grid place-items-center"
              aria-label="Stop"
            >
              <Loader2 className="size-4 animate-spin" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="size-8 rounded-md bg-[var(--ds-ink)] text-white grid place-items-center disabled:opacity-30"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setInput(q.prompt)}
              disabled={isLoading}
              className="text-[11px] px-2 py-1 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );

  async function apply(messageId: string, action: AIAction) {
    const section = draft.sections.find((s) => s.id === action.sectionId);
    if (!section) {
      setActionsByMsg((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).map((a) =>
          a.id === action.id ? { ...a, status: "failed" } : a
        ),
      }));
      return;
    }
    setActionsByMsg((prev) => ({
      ...prev,
      [messageId]: (prev[messageId] ?? []).map((a) =>
        a.id === action.id ? { ...a, status: "applied", appliedAt: Date.now() } : a
      ),
    }));
    try {
      const ctl = new AbortController();
      await regenerateSection(
        draft,
        section,
        { appendToSection, setSectionStatus, pushSectionVersion, updateSection },
        ctl.signal,
        {},
        action.instruction
      );
    } catch (err) {
      console.error(err);
      setActionsByMsg((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).map((a) =>
          a.id === action.id ? { ...a, status: "failed" } : a
        ),
      }));
    }
  }
}

function Message({
  role,
  content,
  streaming,
  me,
  draft,
  actions,
  onApply,
}: {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
  me: { initials: string; name: string; email?: string };
  draft: Draft;
  actions: AIAction[];
  onApply: (action: AIAction) => void;
}) {
  const isUser = role === "user";
  // For user messages we appended the scope as the last bracketed line —
  // strip it for display, render it as a chip.
  const { body, scopeChip } = parseScopeFromUserBody(content, isUser);

  // Strip <<APPLY>> sentinels from streaming display so the user doesn't
  // see them mid-flight.
  const displayBody = isUser ? body : stripSentinels(content);

  return (
    <div className="flex gap-2 items-start">
      {isUser ? (
        <Avatar seed={me.email ?? me.name} name={me.name} email={me.email} initials={me.initials} size="md" />
      ) : (
        <BrandMark size={24} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--ds-ink)]">
            {isUser ? "You" : "DRAFTHR"}
          </span>
          {scopeChip && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--ds-line-2)] text-[var(--ds-muted)] truncate max-w-[200px]">
              {scopeChip}
            </span>
          )}
        </div>
        <div
          className={
            "mt-1 text-[13px] leading-relaxed whitespace-pre-wrap rounded-md px-3 py-2 " +
            (isUser
              ? "bg-[var(--ds-ink)] text-white"
              : "bg-[var(--ds-surface-2)] text-[var(--ds-body)]")
          }
        >
          {displayBody || (streaming && <span className="text-[var(--ds-muted)]">…</span>)}
        </div>

        {actions.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {actions.map((a) => (
              <ActionRow key={a.id} action={a} onApply={() => onApply(a)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
  void draft;
  void uid;
}

function ActionRow({ action, onApply }: { action: AIAction; onApply: () => void }) {
  return (
    <div className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-3 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3 text-[var(--ds-muted)] shrink-0" />
        <span className="font-medium text-[var(--ds-ink)] truncate">{action.sectionTitle}</span>
        <div className="ml-auto flex items-center gap-2">
          {action.status === "proposed" && (
            <button
              type="button"
              onClick={onApply}
              className="text-[11px] px-2 py-1 rounded-md bg-[var(--ds-ink)] text-white hover:opacity-90"
            >
              Apply
            </button>
          )}
          {action.status === "applied" && (
            <span className="text-[11px] text-[var(--ds-green-fg)] inline-flex items-center gap-1">
              <Check className="size-3" /> Applied
            </span>
          )}
          {action.status === "failed" && (
            <span className="text-[11px] text-[var(--ds-red-fg)] inline-flex items-center gap-1">
              <AlertCircle className="size-3" /> Failed
            </span>
          )}
        </div>
      </div>
      <div className="text-[11px] text-[var(--ds-muted)] leading-relaxed mt-1 italic">
        {action.instruction}
      </div>
    </div>
  );
}

/** Strip <<APPLY>> sentinels for display while assistant text is streaming. */
function stripSentinels(content: string): string {
  return content.replace(/<<APPLY[\s\S]*?<<\/APPLY>>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * For a user message authored as `<text>\n[scope: ...]`, split out the scope
 * label so we can render it as a chip and not duplicate it in the bubble.
 */
function parseScopeFromUserBody(content: string, isUser: boolean): { body: string; scopeChip?: string } {
  if (!isUser) return { body: content };
  const m = content.match(/^([\s\S]*?)\n\[scope:\s*([^\]]+)\]\s*$/);
  if (!m) return { body: content };
  return { body: m[1].trim(), scopeChip: m[2].trim() };
}
