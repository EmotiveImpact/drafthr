import { useMemo, useRef, useState } from "react";
import { ArrowUp, Sparkles, Wand2, Trash2, Loader2, Check, AlertCircle } from "lucide-react";
import type { AIChatMessage, AIChatScope, AIAction, Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { streamDraft } from "@/lib/llm/client";
import { buildAgentMessages, parseAgentReply } from "@/lib/llm/agent";
import { regenerateSection } from "@/lib/llm/draft";
import { Avatar, BrandMark } from "@/components/ds";
import { meIdentity } from "@/lib/comments/identity";

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
 * Right-rail AI tab. A draft-scoped chat with a drafting agent that can
 * propose section-level changes via the <<APPLY>> sentinel protocol.
 *
 * Architecture:
 *  - Chat state persisted on `draft.aiChat` (zustand).
 *  - User messages carry a scope (whole letter / section / selection).
 *  - Assistant messages stream through `/api/draft` like the section
 *    generator. On finalize, we parse out <<APPLY>> blocks and surface
 *    them as Apply buttons under the message.
 *  - Apply -> regenerateSection(section, instruction) -> proposed action
 *    transitions to "applied". Section version history covers undo.
 */
export function AIPanel({ draft, activeSectionId }: { draft: Draft; activeSectionId: string | null }) {
  const profile = useProfileStore((s) => s.profile);
  const me = meIdentity(profile);

  const appendAIMessage = useDraftStore((s) => s.appendAIMessage);
  const appendAIMessageBody = useDraftStore((s) => s.appendAIMessageBody);
  const finalizeAIMessage = useDraftStore((s) => s.finalizeAIMessage);
  const updateAIAction = useDraftStore((s) => s.updateAIAction);
  const clearAIChat = useDraftStore((s) => s.clearAIChat);
  // Section regenerate plumbing — same actions as the editor uses.
  const updateSection = useDraftStore((s) => s.updateSection);
  const appendToSection = useDraftStore((s) => s.appendToSection);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const pushSectionVersion = useDraftStore((s) => s.pushSectionVersion);

  const messages = draft.aiChat ?? [];

  const [scope, setScope] = useState<AIChatScope>("letter");
  const [body, setBody] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const scopeSection: Section | undefined = useMemo(() => {
    if (scope !== "section") return undefined;
    return draft.sections.find((s) => s.id === activeSectionId) ?? draft.sections[0];
  }, [scope, draft.sections, activeSectionId]);

  const scopeLabel: string =
    scope === "section" && scopeSection
      ? `section "${scopeSection.title}" (id=${scopeSection.id})`
      : SCOPE_LABEL[scope];

  const send = async () => {
    const text = body.trim();
    if (!text || streaming) return;
    setBody("");
    appendAIMessage(draft.id, {
      role: "user",
      body: text,
      scope,
      sectionId: scopeSection?.id,
    });
    const assistantId = appendAIMessage(draft.id, {
      role: "assistant",
      body: "",
      streaming: true,
    });

    const history = draft.aiChat ?? [];
    const messagesPayload = buildAgentMessages(draft, history, text, scopeLabel);

    setStreaming(true);
    abortRef.current = new AbortController();
    let acc = "";
    try {
      await streamDraft({
        messages: messagesPayload,
        temperature: 0.4,
        maxTokens: 1100,
        model: profile.defaults.qwenModel,
        signal: abortRef.current.signal,
        onToken: (delta) => {
          acc += delta;
          appendAIMessageBody(draft.id, assistantId, delta);
        },
      });
      const { body: cleaned, actions } = parseAgentReply(acc, draft.sections);
      // Replace the streamed body with the cleaned version (strip sentinels) +
      // attach proposed actions.
      finalizeAIMessage(draft.id, assistantId, actions);
      // The streamed body still contains the raw sentinels — overwrite it.
      // We simulate by pushing a "delta" of the cleaned text minus what we already wrote.
      // Easiest: re-set the body via a dedicated rewrite path.
      useDraftStore.setState((s) => {
        const d = s.drafts[draft.id];
        if (!d) return s;
        return {
          drafts: {
            ...s.drafts,
            [draft.id]: {
              ...d,
              aiChat: (d.aiChat ?? []).map((m) =>
                m.id === assistantId ? { ...m, body: cleaned } : m
              ),
            },
          },
        };
      });
    } catch (err) {
      finalizeAIMessage(draft.id, assistantId);
      useDraftStore.setState((s) => {
        const d = s.drafts[draft.id];
        if (!d) return s;
        return {
          drafts: {
            ...s.drafts,
            [draft.id]: {
              ...d,
              aiChat: (d.aiChat ?? []).map((m) =>
                m.id === assistantId
                  ? { ...m, body: `Couldn't reach the model: ${err instanceof Error ? err.message : "unknown error"}` }
                  : m
              ),
            },
          },
        };
      });
    } finally {
      setStreaming(false);
    }
  };

  const apply = async (messageId: string, action: AIAction) => {
    const section = draft.sections.find((s) => s.id === action.sectionId);
    if (!section) {
      updateAIAction(draft.id, messageId, action.id, { status: "failed" });
      return;
    }
    updateAIAction(draft.id, messageId, action.id, { status: "applied", appliedAt: Date.now() });
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
      updateAIAction(draft.id, messageId, action.id, { status: "failed" });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--ds-line-2)] shrink-0">
        <Wand2 className="size-4 text-[var(--ds-muted)]" />
        <span className="text-[13px] font-medium text-[var(--ds-ink)]">AI agent</span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Clear this chat thread?")) clearAIChat(draft.id);
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
            <p className="text-[12px] text-[var(--ds-muted)] mt-1 leading-relaxed">
              I can rewrite sections, add clauses, tighten prose, summarise for counsel, or just answer questions about the structure.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} me={me} draft={draft} onApply={apply} />
        ))}
      </div>

      <div className="shrink-0 border-t border-[var(--ds-line-2)] bg-[var(--ds-surface)]">
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
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 px-3 py-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ask the AI agent..."
            rows={1}
            className="flex-1 min-h-[36px] max-h-[120px] resize-none px-2.5 py-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={streaming || !body.trim()}
            className="size-8 rounded-md bg-[var(--ds-ink)] text-white grid place-items-center disabled:opacity-30"
            aria-label="Send"
          >
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setBody(q.prompt)}
              disabled={streaming}
              className="text-[11px] px-2 py-1 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)] text-[var(--ds-body)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Message({
  message,
  me,
  draft,
  onApply,
}: {
  message: AIChatMessage;
  me: { initials: string; name: string; email?: string };
  draft: Draft;
  onApply: (messageId: string, action: AIAction) => void;
}) {
  const isUser = message.role === "user";
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
          {isUser && message.scope && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--ds-line-2)] text-[var(--ds-muted)]">
              {SCOPE_LABEL[message.scope]}
              {message.scope === "section" && message.sectionId && (() => {
                const sec = draft.sections.find((s) => s.id === message.sectionId);
                return sec ? ` · ${sec.title}` : "";
              })()}
            </span>
          )}
        </div>
        {message.scope === "selection" && message.quote && (
          <div className="text-[11px] italic text-[var(--ds-body)] bg-[var(--comment-highlight,#fef3c7)] border-l-2 border-[var(--comment-highlight-strong,#fde68a)] px-2 py-1 rounded mt-1">
            "{message.quote}"
          </div>
        )}
        <div
          className={
            "mt-1 text-[13px] leading-relaxed whitespace-pre-wrap rounded-md px-3 py-2 " +
            (isUser
              ? "bg-[var(--ds-ink)] text-white"
              : "bg-[var(--ds-surface-2)] text-[var(--ds-body)]")
          }
        >
          {message.body || (message.streaming && <span className="text-[var(--ds-muted)]">…</span>)}
        </div>

        {message.actions && message.actions.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.actions.map((a) => (
              <ActionRow key={a.id} action={a} onApply={() => onApply(message.id, a)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
