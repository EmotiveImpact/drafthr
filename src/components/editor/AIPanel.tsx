import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { Markdown } from "./Markdown";
import { ArrowUp, Sparkles, Wand2, Trash2, Loader2, Check, AlertCircle, RotateCw } from "lucide-react";
import type { AIChatScope, Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { buildAgentSystemPrompt } from "@/lib/llm/agent";
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

type RegenerateInput = { section_id: string; instruction: string };

/**
 * Right-rail AI tab — SDK-native v6 tool-calling.
 *
 *  - Transport: DefaultChatTransport against /api/agent with a
 *    prepareSendMessagesRequest that re-injects the live system prompt
 *    and model on every send, and ships full UIMessages so tool-call
 *    history rides along.
 *  - Tools: the `regenerateSection` tool (see lib/llm/tools.ts) is
 *    declared HUMAN-IN-THE-LOOP — no server-side execute. The model
 *    streams a `tool-regenerateSection` part with the proposed args;
 *    the user reviews + clicks Apply; we run regenerateSection() and
 *    push the outcome back via addToolResult() so the agent can
 *    continue reasoning.
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
  const [input, setInput] = useState("");

  const scopeSection: Section | undefined = useMemo(() => {
    if (scope !== "section") return undefined;
    return draft.sections.find((s) => s.id === activeSectionId) ?? draft.sections[0];
  }, [scope, draft.sections, activeSectionId]);

  // Hydrate initial messages from persisted chat once per draft id.
  const initialMessages = useMemo<UIMessage[]>(
    () =>
      (draft.aiChat ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text", text: m.body }],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.id]
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            // Strip any tool-call parts that don't have a result. v6's
            // OpenAI-compatible adapter throws AI_MissingToolResultsError
            // if it sees a tool_call without a matching tool_result; if
            // the user ignored a proposal, the cleanest thing to do is
            // drop it so the agent moves on.
            messages: stripPendingToolCalls(messages),
            system: buildAgentSystemPrompt(draft),
            model: profile.defaults.qwenModel,
            ...(body ?? {}),
          },
        }),
      }),
    [draft, profile.defaults.qwenModel]
  );

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    regenerate,
    status,
    error,
    addToolResult,
  } = useChat({
    id: `agent-${draft.id}`,
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error("[AIPanel] useChat error:", err);
    },
  });

  // Persist text content of messages to the store on each idle tick.
  useMemo(() => {
    if (status === "streaming" || status === "submitted") return;
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
              body: textFromParts(m),
              createdAt: Date.now(),
            })),
          },
        },
      };
    });
  }, [messages, status, draft.id]);

  const scopeLabel =
    scope === "section" && scopeSection
      ? `section "${scopeSection.title}" (id=${scopeSection.id})`
      : SCOPE_LABEL[scope];

  /** Capture window selection so AI scope=selection has the live quote. */
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

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || status === "streaming" || status === "submitted") return;

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
        resolvedLabel = "whole letter (no active selection)";
      }
    }

    const scoped = `${text}\n[scope: ${resolvedLabel}]${scopePayload}`;
    setInput("");
    await sendMessage({ text: scoped });
  };

  const isStreaming = status === "streaming" || status === "submitted";

  // Auto-scroll the message list to the bottom as new messages arrive.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  /**
   * Execute a proposed regenerateSection tool call. Runs the actual
   * regeneration via the existing draft pipeline, then pushes the
   * outcome back to the model via addToolResult so it can continue
   * reasoning ("OK, I rewrote section X — want me to do Y next?").
   */
  const applyRegenerate = async (
    toolCallId: string,
    input: RegenerateInput
  ): Promise<void> => {
    const section = draft.sections.find((s) => s.id === input.section_id);
    if (!section) {
      addToolResult({
        tool: "regenerateSection",
        toolCallId,
        output: { ok: false, error: `Unknown section_id: ${input.section_id}` },
      });
      return;
    }
    try {
      const ctl = new AbortController();
      await regenerateSection(
        draft,
        section,
        { appendToSection, setSectionStatus, pushSectionVersion, updateSection },
        ctl.signal,
        {},
        input.instruction
      );
      addToolResult({
        tool: "regenerateSection",
        toolCallId,
        output: { ok: true, section_id: section.id, section_title: section.title },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      addToolResult({
        tool: "regenerateSection",
        toolCallId,
        output: { ok: false, error: msg },
      });
    }
  };

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
              }
            }}
            className="ml-auto text-[11px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] inline-flex items-center gap-1"
          >
            <Trash2 className="size-3" /> Clear
          </button>
        )}
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-auto px-4 py-3 space-y-3 min-h-0">
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
            message={m}
            streaming={isStreaming && m === messages[messages.length - 1] && m.role === "assistant"}
            me={me}
            draft={draft}
            onApplyRegenerate={applyRegenerate}
          />
        ))}
        {error && (
          <div className="rounded-md border border-[var(--ds-red-bg)] bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)] text-[12px] px-3 py-2 flex items-center gap-2">
            <AlertCircle className="size-3.5" />
            <span className="flex-1">Couldn't reach the model.</span>
            <button onClick={() => regenerate()} className="inline-flex items-center gap-1 hover:underline">
              <RotateCw className="size-3" /> Retry
            </button>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-[var(--ds-line-2)] bg-[var(--ds-surface)] px-3 py-3 space-y-2">
        {/* Scope chips — small, above the composer (necessary context, not a control). */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-[var(--ds-muted)] mr-1">Scope:</span>
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

        {/* Composer — one rounded box with textarea + bottom toolbar + send button INSIDE. */}
        <div
          className={
            "rounded-lg border bg-[var(--ds-surface)] transition focus-within:ring-2 focus-within:ring-[var(--ds-ink)]/10 " +
            "focus-within:border-[var(--ds-ink)] border-[var(--ds-line)]"
          }
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the AI agent..."
            rows={3}
            className="block w-full min-h-[64px] max-h-[240px] resize-none px-3 pt-3 pb-1 rounded-lg bg-transparent text-[14px] leading-relaxed text-[var(--ds-ink)] focus:outline-none placeholder:text-[var(--ds-subtle)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            {/* Quick-prompt chips on the left (horizontal scroll if many) */}
            <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 -my-1 py-1">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setInput(q.prompt)}
                  disabled={isStreaming}
                  className="shrink-0 text-[11px] px-2 py-1 rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
            {/* Send button — bottom-right inside the composer */}
            {isStreaming ? (
              <button
                type="button"
                onClick={() => stop()}
                className="size-7 shrink-0 rounded-md bg-[var(--ds-line-2)] text-[var(--ds-ink)] grid place-items-center hover:bg-[var(--ds-line)]"
                aria-label="Stop"
                title="Stop"
              >
                <Loader2 className="size-3.5 animate-spin" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="size-7 shrink-0 rounded-md bg-[var(--ds-ink)] text-white grid place-items-center disabled:opacity-25 disabled:bg-[var(--ds-line)] disabled:text-[var(--ds-muted)] transition"
                aria-label="Send"
                title="Send (⌘ + Enter)"
              >
                <ArrowUp className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-[var(--ds-subtle)] text-center">
          ⌘ + Enter to send · The AI may propose section changes — review with Apply before they go live.
        </p>
      </form>
    </div>
  );
}

/** Concatenate text-type parts from a v6 UIMessage. */
function textFromParts(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}

/**
 * Remove tool-call parts that don't have an output yet. We need this on
 * the way out to /api/agent because the OpenAI-compatible Qwen endpoint
 * (via convertToModelMessages) requires every tool_call to have a
 * matching tool_result. If the user ignored a proposal, the cleanest
 * thing is to drop it from history — the agent then starts the next
 * turn fresh rather than blocking on stale proposals.
 */
function stripPendingToolCalls(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.filter((p) => {
      if (typeof p.type === "string" && p.type.startsWith("tool-")) {
        const state = (p as { state?: string }).state;
        // Keep only tool parts that have been resolved (output present)
        // or denied. Drop pending proposals.
        return state === "output-available" || state === "output-error";
      }
      // Drop dynamic-tool entries we don't render either.
      if (p.type === "dynamic-tool") return false;
      return true;
    }),
  }));
}

function Message({
  message,
  streaming,
  me,
  draft,
  onApplyRegenerate,
}: {
  message: UIMessage;
  streaming: boolean;
  me: { initials: string; name: string; email?: string };
  draft: Draft;
  onApplyRegenerate: (toolCallId: string, input: RegenerateInput) => Promise<void>;
}) {
  const isUser = message.role === "user";
  const textOnly = textFromParts(message);
  const { body, scopeChip } = parseScopeFromUserBody(textOnly, isUser);

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

        {/* Text bubble (only if there's any text content) */}
        {(body || (streaming && !textOnly)) && (
          <div
            className={
              "mt-1 rounded-md px-3 py-2 " +
              (isUser
                ? "bg-[var(--ds-ink)] text-white text-[13px] leading-relaxed whitespace-pre-wrap"
                : "bg-[var(--ds-surface-2)] text-[var(--ds-body)]")
            }
          >
            {isUser ? (
              body || (streaming && <span className="text-[var(--ds-muted)]">…</span>)
            ) : body ? (
              <Markdown>{body}</Markdown>
            ) : streaming ? (
              <span className="text-[var(--ds-muted)] text-[13px]">…</span>
            ) : null}
          </div>
        )}

        {/* Tool-call parts — render each in its own card. */}
        {!isUser && (
          <div className="mt-2 space-y-1.5">
            {message.parts
              .filter((p) => isToolUIPart(p) && p.type === "tool-regenerateSection")
              .map((p) => {
                // Narrowed via the filter above.
                const tp = p as unknown as ToolPart;
                return (
                  <ToolCallRow
                    key={tp.toolCallId}
                    part={tp}
                    draft={draft}
                    onApply={onApplyRegenerate}
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render a single tool-regenerateSection part across its state machine.
 * input-streaming → "preparing" spinner
 * input-available → resolvable, show Apply button
 * output-available → applied (success) / failed (error)
 */
/**
 * Shape of a tool-regenerateSection part across its state machine.
 * Narrowed manually since v6's `UIMessagePart` union doesn't expose a
 * convenient predicate for our specific tool name.
 */
type ToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: RegenerateInput;
  output?: { ok?: boolean; error?: string; section_id?: string; section_title?: string };
};

function ToolCallRow({
  part,
  draft,
  onApply,
}: {
  part: ToolPart;
  draft: Draft;
  onApply: (toolCallId: string, input: RegenerateInput) => Promise<void>;
}) {
  const input = part.input;
  const output = part.output;
  const sectionTitle =
    input?.section_id
      ? draft.sections.find((s) => s.id === input.section_id)?.title ?? input.section_id
      : "section";

  const state = part.state;

  if (state === "input-streaming") {
    return (
      <ToolCard
        title={sectionTitle}
        body={input?.instruction ?? "…"}
        status={
          <span className="text-[11px] text-[var(--ds-muted)] inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> Preparing
          </span>
        }
      />
    );
  }

  if (state === "input-available" && input) {
    return (
      <ToolCard
        title={sectionTitle}
        body={input.instruction}
        status={
          <button
            type="button"
            onClick={() => void onApply(part.toolCallId, input)}
            className="text-[11px] px-2 py-1 rounded-md bg-[var(--ds-ink)] text-white hover:opacity-90"
          >
            Apply
          </button>
        }
      />
    );
  }

  if (state === "output-available") {
    const ok = output?.ok !== false;
    return (
      <ToolCard
        title={sectionTitle}
        body={input?.instruction ?? ""}
        status={
          ok ? (
            <span className="text-[11px] text-[var(--ds-green-fg)] inline-flex items-center gap-1">
              <Check className="size-3" /> Applied
            </span>
          ) : (
            <span className="text-[11px] text-[var(--ds-red-fg)] inline-flex items-center gap-1" title={output?.error}>
              <AlertCircle className="size-3" /> Failed
            </span>
          )
        }
      />
    );
  }

  return null;
}

function ToolCard({
  title,
  body,
  status,
}: {
  title: string;
  body: string;
  status: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-3 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3 text-[var(--ds-muted)] shrink-0" />
        <span className="font-medium text-[var(--ds-ink)] truncate">{title}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">{status}</div>
      </div>
      {body && (
        <div className="text-[11px] text-[var(--ds-muted)] leading-relaxed mt-1 italic">
          {body}
        </div>
      )}
    </div>
  );
}

function parseScopeFromUserBody(content: string, isUser: boolean): { body: string; scopeChip?: string } {
  if (!isUser) return { body: content };
  const m = content.match(/^([\s\S]*?)\n\[scope:\s*([^\]]+)\]\s*$/);
  if (!m) return { body: content };
  return { body: m[1].trim(), scopeChip: m[2].trim() };
}
