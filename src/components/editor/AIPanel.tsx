import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { Markdown } from "./Markdown";
import { ArrowUp, Sparkles, Wand2, Trash2, Loader2, Check, AlertCircle, RotateCw, Plus, Minus, FileText, Copy, PanelRight, Pin, PinOff, FlaskConical } from "lucide-react";
import { hasPendingSuggestions } from "@/lib/tiptap/suggestion-merge";
import { uid } from "@/lib/utils";
import type { AIChatScope, Draft, Section } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { buildAgentSystemPrompt } from "@/lib/llm/agent";
import { captureRuntimeContext } from "@/lib/llm/runtime-context";
import { DEFAULT_MODEL } from "@/lib/llm/default-model";
import { regenerateSectionAsPending } from "@/lib/llm/draft";
import { CLAUSE_TEMPLATES, type ClauseType } from "@/lib/llm/tools";
import { Avatar, BrandMark } from "@/components/ds";
import { meIdentity } from "@/lib/comments/identity";
import { getRecentPrompts, pushRecentPrompt } from "@/lib/recent-prompts";

/**
 * Quick-prompt chips. Each maps to one of the four typed tools so the
 * user discovers what the agent can actually DO without having to read
 * docs. The model decides which tool to call — these prompts are worded
 * to make the right choice obvious.
 *
 * Tool mapping:
 *   - "make formal" / "tribunal-ready"  → regenerateSection (per affected section)
 *   - "tighten body to X words"         → tightenSection
 *   - "add IP / confidentiality clause" → addClause
 *   - "summarise for counsel"           → summariseForCounsel
 */
/**
 * Starter prompts shown in the empty-state grid — one per typed tool, so
 * a first-time user discovers what the agent can do at a glance. Pulled
 * from QUICK_PROMPTS but with icons + a one-line hint for discoverability.
 */
const STARTER_PROMPTS: {
  label: string;
  hint: string;
  Icon: typeof Wand2;
  prompt: string;
}[] = [
  {
    label: "Make it tribunal-ready",
    hint: "Strict, factual, statutory anchors explicit.",
    Icon: Sparkles,
    prompt:
      "Rewrite this letter to be tribunal-ready: strictly factual, no intensifiers, no admissions, reservation of rights at the close, statutory anchors explicit. Walk through each section that needs changing.",
  },
  {
    label: "Tighten to ~180 words",
    hint: "Cut adjectives without dropping facts or clauses.",
    Icon: Minus,
    prompt:
      "Tighten the body section to approximately 180 words. Preserve every fact, citation, and required clause. Cut adjectives and throat-clearing.",
  },
  {
    label: "Add a confidentiality clause",
    hint: "Three-year survival post-termination by default.",
    Icon: Plus,
    prompt:
      "Add a confidentiality clause to the terms section. Three-year survival post-termination unless the contract provides otherwise.",
  },
  {
    label: "Summarise for counsel",
    hint: "One-paragraph brief covering risks + remedies.",
    Icon: FileText,
    prompt:
      "Summarise this letter for counsel — one paragraph covering the legal posture, key risks, remedies sought, and any open factual questions.",
  },
];

const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  // regenerateSection
  {
    label: "Tribunal-ready tone",
    prompt:
      "Rewrite this letter to be tribunal-ready: strictly factual, no intensifiers, no admissions, reservation of rights at the close, statutory anchors explicit. Walk through each section that needs changing.",
  },
  {
    label: "Make formal",
    prompt:
      "Rewrite this letter in a more formal register. Remove contractions, use full clause names, keep every statutory citation intact.",
  },
  // tightenSection
  {
    label: "Tighten body to ~180 words",
    prompt:
      "Tighten the body section to approximately 180 words. Preserve every fact, citation, and required clause. Cut adjectives and throat-clearing.",
  },
  // addClause
  {
    label: "+ Confidentiality clause",
    prompt:
      "Add a confidentiality clause to the terms section. Three-year survival post-termination unless the contract provides otherwise.",
  },
  {
    label: "+ IP-assignment clause",
    prompt:
      "Add an IP-assignment clause to the terms section: all work-product vests in the employer, recipient assigns and waives moral rights so far as the law permits.",
  },
  {
    label: "+ Reservation of rights",
    prompt:
      "Add an explicit reservation-of-rights paragraph to the closing — statutory, contractual, common-law remedies, and the right to bring tribunal / agency proceedings.",
  },
  // summariseForCounsel
  {
    label: "Summarise for counsel",
    prompt:
      "Summarise this letter for an external employment-law adviser. Cover (1) what the letter says, (2) what it relies on, (3) what it asks for, (4) key risk points.",
  },
];

const SCOPE_LABEL: Record<AIChatScope, string> = {
  letter: "whole letter",
  section: "section",
  selection: "selection",
};

type RegenerateInput = { section_id: string; instruction: string };
type AddClauseInput = {
  section_id: string;
  clause_type: ClauseType;
  position?: "append" | "prepend" | "replace_paragraph";
  note?: string;
};
type TightenInput = { section_id: string; target_words: number };
type SummariseInput = { audience?: "counsel" | "hr_partner" | "self"; note?: string };

/**
 * Right-rail AI tab — SDK-native v6 tool-calling.
 *
 *  - Transport: DefaultChatTransport against /api/agent with a
 *    prepareSendMessagesRequest that re-injects the live system prompt
 *    and model on every send, and ships full UIMessages so tool-call
 *    history rides along.
 *  - Tools: server schemas live in server/agent-tools.ts. Mutating tools are
 *    HUMAN-IN-THE-LOOP — no server-side execute. The model streams a `tool-*`
 *    part with proposed args; the user reviews + clicks Apply; we run the
 *    local draft operation and push the outcome back via addToolResult() so
 *    the agent can continue reasoning.
 */
export function AIPanel({
  draft,
  activeSectionId,
  onCollapse,
  onPin,
  onUnpin,
  isPinned,
}: {
  draft: Draft;
  activeSectionId: string | null;
  /** Optional desktop rail-collapse handler. When supplied, a PanelRight
   * chevron renders at the far right of the header row. Editor passes this
   * so the chevron lives on the same line as "AI agent · model · date". */
  onCollapse?: () => void;
  /** Convert the rail to "pinned" mode. When supplied, renders a pin button
   * next to the collapse chevron. Pin is mutually exclusive with Evidence pin
   * — the parent enforces this via the shared `pinnedDock` state. */
  onPin?: () => void;
  /** Unpin the AI rail (returns to twin pills). When supplied and isPinned is
   * true, clicking the pin button will call this instead of onPin. */
  onUnpin?: () => void;
  isPinned?: boolean;
}) {
  const profile = useProfileStore((s) => s.profile);
  const me = meIdentity(profile);

  const updateSection = useDraftStore((s) => s.updateSection);
  const appendToSection = useDraftStore((s) => s.appendToSection);
  const proposeSectionChange = useDraftStore((s) => s.proposeSectionChange);
  const setSectionStatus = useDraftStore((s) => s.setSectionStatus);
  const pushSectionVersion = useDraftStore((s) => s.pushSectionVersion);
  const clearAIChat = useDraftStore((s) => s.clearAIChat);
  const recordTimelineEvent = useDraftStore((s) => s.recordTimelineEvent);
  const acceptAllSuggestions = useDraftStore((s) => s.acceptAllSuggestions);
  const rejectAllSuggestions = useDraftStore((s) => s.rejectAllSuggestions);

  // Track-changes affordance — derive once per draft change whether any
  // section still has pending suggestion marks. Cheap because the helper
  // string-probes before any DOM parse. Drives the Accept/Reject strip.
  const anyPending = useMemo(
    () => draft.sections.some((sec) => hasPendingSuggestions(sec.html)),
    [draft.sections]
  );

  const [scope, setScope] = useState<AIChatScope>("letter");
  const [input, setInput] = useState("");
  const [recentPrompts, setRecentPrompts] = useState<string[]>(() => getRecentPrompts());

  const scopeSection: Section | undefined = useMemo(() => {
    if (scope !== "section") return undefined;
    return draft.sections.find((s) => s.id === activeSectionId) ?? draft.sections[0];
  }, [scope, draft.sections, activeSectionId]);

  // Hydrate initial messages from persisted chat once per draft id.
  /** Today + timezone for the visible "Today · X" pill in the header.
   * Captured once per render but cheap (just `new Date()`). */
  const runtimeCtx = useMemo(
    () => captureRuntimeContext(draft.context.jurisdiction),
    [draft.context.jurisdiction]
  );

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

  // useChat constructs its internal Chat once per `id` (agent-${draft.id}) and
  // captures the transport at construction — a transport rebuilt mid-draft is
  // NOT adopted. So the transport must have a stable identity and read live
  // values at send time via refs; otherwise every request ships the mount-time
  // letter snapshot (stale section list/recipient) and mount-time model, even
  // after the user edits the draft or changes the model in Settings.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const modelRef = useRef(profile.defaults.qwenModel);
  modelRef.current = profile.defaults.qwenModel;

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
            system: buildAgentSystemPrompt(draftRef.current),
            model: modelRef.current,
            ...(body ?? {}),
          },
        }),
      }),
    []
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
  // Skipped during streaming to avoid hammering localStorage on every
  // token — the unmount cleanup below catches any in-flight state.
  useEffect(() => {
    if (status === "streaming" || status === "submitted") return;
    persistMessagesToStore(draft.id, messages);
  }, [messages, status, draft.id]);

  // Unmount snapshot — fires when the AIPanel is about to disappear
  // (viewport resize across the desktop/mobile breakpoint, draft
  // switch, focus mode toggle). Captures the latest messages
  // regardless of stream status so a mid-stream resize doesn't lose
  // the partial assistant response. We use a ref so the cleanup
  // function always sees the freshest messages — the effect itself
  // only runs once per draft id, so a closure over `messages` would
  // be stale.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    return () => {
      persistMessagesToStore(draft.id, messagesRef.current);
    };
  }, [draft.id]);

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
    setRecentPrompts(pushRecentPrompt(text));
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
  /**
   * Shared helper — regen a section as a PENDING CHANGE (Cursor-style
   * review). The user reviews the diff card on the section and clicks
   * Accept or Reject. section.html is not touched until Accept.
   *
   * Optional source: lets the caller (addClause / tighten / regenerate)
   * label the change for the audit trail.
   */
  const runSectionRegen = async (
    sectionId: string,
    instruction: string,
    source: "regenerate" | "addClause" | "tighten" = "regenerate"
  ): Promise<Section> => {
    const section = draft.sections.find((s) => s.id === sectionId);
    if (!section) throw new Error(`Unknown section_id: ${sectionId}`);
    const ctl = new AbortController();
    await regenerateSectionAsPending(
      draft,
      section,
      { appendToSection, setSectionStatus, pushSectionVersion, updateSection, proposeSectionChange },
      ctl.signal,
      {},
      instruction,
      source
    );
    return section;
  };

  const applyRegenerate = async (
    toolCallId: string,
    input: RegenerateInput
  ): Promise<void> => {
    try {
      const section = await runSectionRegen(input.section_id, input.instruction);
      addToolResult({
        tool: "regenerateSection",
        toolCallId,
        output: { ok: true, section_id: section.id, section_title: section.title },
      });
      recordTimelineEvent(draft.id, {
        kind: "ai_applied",
        title: `Applied AI rewrite to ${section.title}`,
        detail: input.instruction,
        sectionId: section.id,
        sectionTitle: section.title,
        meta: { toolCallId, tool: "regenerateSection" },
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

  /**
   * addClause — resolve clause_type to a concrete instruction via
   * CLAUSE_TEMPLATES, then delegate to runSectionRegen. position +
   * optional note are folded into the instruction text.
   */
  const applyAddClause = async (toolCallId: string, input: AddClauseInput): Promise<void> => {
    const template = CLAUSE_TEMPLATES[input.clause_type];
    const positionDirective =
      input.position === "prepend"
        ? "Insert the new clause at the START of this section, before any existing content."
        : input.position === "replace_paragraph"
        ? "Replace the existing paragraph that covers this topic. If no such paragraph exists, append."
        : "Append the new clause at the END of this section, after existing content.";
    const noteBit = input.note ? `\nUser note: ${input.note}` : "";
    const instruction = `${template}\n\n${positionDirective}${noteBit}`;

    try {
      const section = await runSectionRegen(input.section_id, instruction, "addClause");
      addToolResult({
        tool: "addClause",
        toolCallId,
        output: { ok: true, section_id: section.id, section_title: section.title, clause_type: input.clause_type },
      });
      recordTimelineEvent(draft.id, {
        kind: "ai_applied",
        title: `Added ${input.clause_type.replace(/_/g, " ")} clause`,
        detail: input.note,
        sectionId: section.id,
        sectionTitle: section.title,
        meta: { toolCallId, tool: "addClause", clauseType: input.clause_type },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      addToolResult({ tool: "addClause", toolCallId, output: { ok: false, error: msg } });
    }
  };

  /**
   * tightenSection — pass target_words as part of the instruction so the
   * section prompt picks it up via USER REFINEMENT.
   */
  const applyTighten = async (toolCallId: string, input: TightenInput): Promise<void> => {
    const instruction = `Rewrite this section to approximately ${input.target_words} words. Preserve every fact, citation, and structural requirement (statutory anchors, required clauses, headings). Cut redundancy, adjectives, throat-clearing, and any non-load-bearing sentence. Do NOT drop required content.`;
    try {
      const section = await runSectionRegen(input.section_id, instruction, "tighten");
      addToolResult({
        tool: "tightenSection",
        toolCallId,
        output: {
          ok: true,
          section_id: section.id,
          section_title: section.title,
          target_words: input.target_words,
        },
      });
      recordTimelineEvent(draft.id, {
        kind: "ai_applied",
        title: `Tightened ${section.title}`,
        detail: `Target ${input.target_words} words`,
        sectionId: section.id,
        sectionTitle: section.title,
        meta: { toolCallId, tool: "tightenSection", targetWords: input.target_words },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      addToolResult({ tool: "tightenSection", toolCallId, output: { ok: false, error: msg } });
    }
  };

  /**
   * summariseForCounsel — non-mutating. We just acknowledge the call
   * back to the model so it knows the marker landed. The actual
   * summary is in the model's text reply.
   */
  const applySummarise = useCallback((toolCallId: string, input: SummariseInput): void => {
    addToolResult({
      tool: "summariseForCounsel",
      toolCallId,
      output: { ok: true, audience: input.audience ?? "counsel" },
    });
  }, [addToolResult]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Apple-minimal header: single row. Model name + today's date are
       * collapsed into one badge so the rail header stays under one line.
       * The Clear action is icon-only and lives at the far right. */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--ds-line-2)] shrink-0">
        <Wand2 className="size-4 text-[var(--ds-muted)]" />
        <span className="text-[13px] font-medium text-[var(--ds-ink)]">AI agent</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--ds-line-2)] text-[var(--ds-muted)] tabular-nums"
          title={`Model: ${profile.defaults.qwenModel ?? DEFAULT_MODEL}. The agent has today's date (${runtimeCtx.localDate}, ${runtimeCtx.timeZone}) so it never invents dates.`}
        >
          {profile.defaults.qwenModel ?? DEFAULT_MODEL} · {runtimeCtx.localDate}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear this chat thread?")) {
                  clearAIChat(draft.id);
                  setMessages([]);
                }
              }}
              className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition"
              aria-label="Clear chat thread"
              title="Clear chat thread"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          {(onPin || onUnpin) && (
            <button
              type="button"
              onClick={isPinned ? (onUnpin ?? onPin) : onPin}
              className={
                "group inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-[0.04em] border transition-colors " +
                (isPinned
                  ? "bg-[var(--ds-violet-bg)] text-[var(--ds-violet-fg)] border-violet-200 hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] hover:border-[var(--ds-line)]"
                  : "bg-transparent text-[var(--ds-muted)] border-[var(--ds-line-2)] hover:text-[var(--ds-ink)]")
              }
              title={isPinned ? "Click to unpin (back to twin pills)" : "Pin Ask AI as the right rail (collapses Evidence)"}
              aria-pressed={isPinned}
            >
              {isPinned ? (
                <>
                  <Pin className="size-3 group-hover:hidden" />
                  <PinOff className="size-3 hidden group-hover:inline" />
                  <span className="group-hover:hidden">Pinned</span>
                  <span className="hidden group-hover:inline">Unpin</span>
                </>
              ) : (
                <>
                  <Pin className="size-3" />
                  <span>Pin</span>
                </>
              )}
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="size-6 grid place-items-center rounded-md text-[var(--ds-muted)] hover:bg-[var(--ds-line-2)] hover:text-[var(--ds-ink)] transition"
              aria-label="Hide AI rail"
              title="Hide AI rail"
            >
              <PanelRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollerRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={isStreaming}
        className="flex-1 overflow-auto px-4 py-3 space-y-3 min-h-0"
      >
        <SuggestionTestStrip
          draft={draft}
          activeSectionId={activeSectionId}
          anyPending={anyPending}
          onAcceptAll={() => acceptAllSuggestions(draft.id)}
          onRejectAll={() => rejectAllSuggestions(draft.id)}
          insertTest={() => insertTestSuggestion(draft, activeSectionId, updateSection)}
        />
        {messages.length === 0 && (
          // Empty state — brand mark + tagline at the top, then a clickable
          // suggestion grid (one prompt per tool, so the user discovers
          // what the agent can do without scrolling the composer chips),
          // then a Recent row if the user has sent prompts before.
          <div className="px-1 py-4">
            <div className="flex flex-col items-center text-center px-4 pb-5">
              <BrandMark size={32} className="mb-3 opacity-60" />
              <p className="text-[13px] text-[var(--ds-ink)] font-medium">
                What change do you want?
              </p>
              <p className="text-[11.5px] text-[var(--ds-muted)] mt-1 leading-relaxed max-w-[28ch]">
                Pick a starter below or describe your own. I'll show the result before applying it.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-1.5 px-1">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setInput(p.prompt)}
                  className="text-left rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] hover:bg-[var(--ds-line-2)] hover:border-[var(--ds-line)] transition px-3 py-2 group"
                >
                  <div className="flex items-center gap-2">
                    <p.Icon className="size-3.5 text-[var(--ds-muted)] group-hover:text-[var(--ds-ink)] transition" />
                    <span className="text-[12px] font-medium text-[var(--ds-ink)]">{p.label}</span>
                  </div>
                  <p className="text-[11px] text-[var(--ds-muted)] mt-0.5 ml-[22px] leading-snug">
                    {p.hint}
                  </p>
                </button>
              ))}
            </div>

            {recentPrompts.length > 0 && (
              <div className="mt-4 px-1">
                <div className="text-[10px] uppercase tracking-wide text-[var(--ds-muted)] mb-1.5 px-1">
                  Recent
                </div>
                <div className="flex flex-col gap-1">
                  {recentPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setInput(p)}
                      className="text-left text-[11.5px] text-[var(--ds-body)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] px-2 py-1 rounded transition truncate"
                      title={p}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            onApplyAddClause={applyAddClause}
            onApplyTighten={applyTighten}
            onApplySummarise={applySummarise}
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
            placeholder="Rewrite a section · Add a clause · Tighten to a word target · Summarise for counsel"
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

/**
 * Track-changes affordance + DEV debug button. Rendered at the top of the
 * AI scroller so the four downstream surfaces (consultant review, AI critique
 * diff, threaded comments, co-edit cursors) have a working primitive to
 * exercise. The "Test suggestion" button is gated to DEV — it injects a
 * green-underlined <ins> at the start of the active section so we can prove
 * the merge / accept / reject paths end-to-end. The Accept/Reject row only
 * shows when there's at least one pending suggestion in the draft.
 */
function SuggestionTestStrip(props: {
  draft: Draft;
  activeSectionId: string | null;
  anyPending: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  insertTest: () => void;
}): ReactElement | null {
  const isDev = import.meta.env.DEV;
  if (!isDev && !props.anyPending) return null;
  return (
    <div className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 py-2 text-[11.5px] flex items-center gap-2 flex-wrap">
      <span className="text-[var(--ds-muted)] inline-flex items-center gap-1">
        <FlaskConical className="size-3.5" />
        Track-changes
      </span>
      {props.anyPending ? (
        <>
          <span className="text-[var(--ds-ink)]">Pending suggestions</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <button
              type="button"
              onClick={props.onAcceptAll}
              className="h-6 px-2 rounded-md bg-[var(--ds-green-bg)] text-[var(--ds-green-fg)] hover:opacity-90 transition text-[11px] font-medium"
              title="Accept every pending suggestion in this draft"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={props.onRejectAll}
              className="h-6 px-2 rounded-md bg-[var(--ds-red-bg)] text-[var(--ds-red-fg)] hover:opacity-90 transition text-[11px] font-medium"
              title="Reject every pending suggestion — text stays, marks mute"
            >
              Reject all
            </button>
          </span>
        </>
      ) : (
        <span className="text-[var(--ds-subtle)]">No pending suggestions</span>
      )}
      {isDev && (
        <button
          type="button"
          onClick={props.insertTest}
          className="h-6 px-2 rounded-md border border-dashed border-[var(--ds-line)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] hover:bg-[var(--ds-line-2)] transition text-[11px]"
          title="DEV: inject a fake suggestion into the active section"
        >
          Test suggestion
        </button>
      )}
    </div>
  );
}

/** DEV helper: append a pending <ins> to the active section's HTML so the
 * accept / reject paths have something to chew on. Reads-then-writes via
 * updateSection so it goes through the canonical sanitiser. */
function insertTestSuggestion(
  draft: Draft,
  activeSectionId: string | null,
  updateSection: (draftId: string, sectionId: string, html: string) => void,
): void {
  const section =
    draft.sections.find((s) => s.id === activeSectionId) ?? draft.sections[0];
  if (!section) return;
  const id = uid("sug");
  const created = Date.now();
  // <p> wrapper keeps the editor's block schema happy — bare inline marks at
  // the doc level get re-wrapped on next parse anyway.
  const inserted =
    `<p><ins data-suggestion-id="${id}" data-suggestion-kind="insertion" ` +
    `data-author="Test reviewer" data-created-at="${created}" ` +
    `data-status="pending" data-body="DEV: synthetic suggestion" ` +
    `class="ds-suggestion ds-suggestion-ins ds-suggestion-pending">[TEST INSERT]</ins></p>`;
  updateSection(draft.id, section.id, `${section.html ?? ""}${inserted}`);
}

/** Concatenate text-type parts from a v6 UIMessage. */
function textFromParts(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}

/**
 * Write the current message array to the draft's persisted aiChat field.
 * Used by the idle-tick effect AND the unmount cleanup — extracted so
 * both call sites stay in lockstep. The createdAt map preserves
 * timestamps for messages we've seen before; new messages get `now`.
 */
function persistMessagesToStore(draftId: string, messages: UIMessage[]): void {
  useDraftStore.setState((s) => {
    const d = s.drafts[draftId];
    if (!d) return s;
    const previousCreatedAt = new Map(
      (d.aiChat ?? []).map((m) => [m.id, m.createdAt])
    );
    const now = Date.now();
    return {
      drafts: {
        ...s.drafts,
        [draftId]: {
          ...d,
          aiChat: messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            body: textFromParts(m),
            createdAt: previousCreatedAt.get(m.id) ?? now,
          })),
        },
      },
    };
  });
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
  onApplyAddClause,
  onApplyTighten,
  onApplySummarise,
}: {
  message: UIMessage;
  streaming: boolean;
  me: { initials: string; name: string; email?: string };
  draft: Draft;
  onApplyRegenerate: (toolCallId: string, input: RegenerateInput) => Promise<void>;
  onApplyAddClause: (toolCallId: string, input: AddClauseInput) => Promise<void>;
  onApplyTighten: (toolCallId: string, input: TightenInput) => Promise<void>;
  onApplySummarise: (toolCallId: string, input: SummariseInput) => void;
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
                : "ai-msg-body bg-[var(--ds-surface-2)] text-[var(--ds-body)]")
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

        {/* Tool-call parts — render the right card per tool. */}
        {!isUser && (
          <div className="mt-2 space-y-1.5">
            {message.parts.filter(isToolUIPart).map((p) => {
              const tp = p as unknown as ToolPart;
              switch (tp.type) {
                case "tool-regenerateSection":
                  return <RegenerateCard key={tp.toolCallId} part={tp} draft={draft} onApply={onApplyRegenerate} />;
                case "tool-addClause":
                  return <AddClauseCard key={tp.toolCallId} part={tp} draft={draft} onApply={onApplyAddClause} />;
                case "tool-tightenSection":
                  return <TightenCard key={tp.toolCallId} part={tp} draft={draft} onApply={onApplyTighten} />;
                case "tool-summariseForCounsel":
                  return <SummariseMarker key={tp.toolCallId} part={tp} onAck={onApplySummarise} />;
                default:
                  return null;
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Generic shape used for every tool part. v6's UIMessagePart union
 * doesn't expose a per-tool predicate, so we widen to a permissive
 * shape and narrow `input` per card.
 */
type ToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: { ok?: boolean; error?: string } & Record<string, unknown>;
};

function sectionTitleFor(draft: Draft, sectionId?: string): string {
  if (!sectionId) return "section";
  return draft.sections.find((s) => s.id === sectionId)?.title ?? sectionId;
}

function StateStatus({
  state,
  output,
  applyButton,
}: {
  state: ToolPart["state"];
  output?: ToolPart["output"];
  applyButton?: React.ReactNode;
}) {
  if (state === "input-streaming") {
    return (
      <span className="text-[11px] text-[var(--ds-muted)] inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> Preparing
      </span>
    );
  }
  if (state === "input-available") return <>{applyButton}</>;
  if (state === "output-available") {
    const ok = output?.ok !== false;
    return ok ? (
      <span className="text-[11px] text-[var(--ds-green-fg)] inline-flex items-center gap-1">
        <Check className="size-3" /> Applied
      </span>
    ) : (
      <span
        className="text-[11px] text-[var(--ds-red-fg)] inline-flex items-center gap-1"
        title={typeof output?.error === "string" ? output.error : undefined}
      >
        <AlertCircle className="size-3" /> Failed
      </span>
    );
  }
  return null;
}

/* ============================================================
 * regenerateSection — rewrite a named section with a freeform instruction.
 * ========================================================== */
function RegenerateCard({
  part,
  draft,
  onApply,
}: {
  part: ToolPart;
  draft: Draft;
  onApply: (toolCallId: string, input: RegenerateInput) => Promise<void>;
}) {
  const input = part.input as RegenerateInput | undefined;
  return (
    <ToolCard
      icon={<Sparkles className="size-3 text-[var(--ds-muted)]" />}
      title={sectionTitleFor(draft, input?.section_id)}
      eyebrow="Rewrite"
      body={input?.instruction}
      status={
        <StateStatus
          state={part.state}
          output={part.output}
          applyButton={
            input && (
              <button
                type="button"
                onClick={() => void onApply(part.toolCallId, input)}
                className="text-[11px] px-2 py-1 rounded-md bg-[var(--ds-ink)] text-white hover:opacity-90"
              >
                Apply
              </button>
            )
          }
        />
      }
    />
  );
}

/* ============================================================
 * addClause — insert a named clause type into a section.
 * ========================================================== */
function AddClauseCard({
  part,
  draft,
  onApply,
}: {
  part: ToolPart;
  draft: Draft;
  onApply: (toolCallId: string, input: AddClauseInput) => Promise<void>;
}) {
  const input = part.input as AddClauseInput | undefined;
  const clause = input?.clause_type
    ? input.clause_type.replace(/_/g, " ")
    : "clause";
  const pos = input?.position ?? "append";
  return (
    <ToolCard
      icon={<Plus className="size-3 text-[var(--ds-muted)]" />}
      title={sectionTitleFor(draft, input?.section_id)}
      eyebrow={`Add clause · ${clause}${pos !== "append" ? ` · ${pos.replace("_", " ")}` : ""}`}
      body={input?.note}
      status={
        <StateStatus
          state={part.state}
          output={part.output}
          applyButton={
            input && (
              <button
                type="button"
                onClick={() => void onApply(part.toolCallId, input)}
                className="text-[11px] px-2 py-1 rounded-md bg-[var(--ds-ink)] text-white hover:opacity-90"
              >
                Apply
              </button>
            )
          }
        />
      }
    />
  );
}

/* ============================================================
 * tightenSection — rewrite to a specific word-count target.
 * ========================================================== */
function TightenCard({
  part,
  draft,
  onApply,
}: {
  part: ToolPart;
  draft: Draft;
  onApply: (toolCallId: string, input: TightenInput) => Promise<void>;
}) {
  const input = part.input as TightenInput | undefined;
  return (
    <ToolCard
      icon={<Minus className="size-3 text-[var(--ds-muted)]" />}
      title={sectionTitleFor(draft, input?.section_id)}
      eyebrow={`Tighten · target ${input?.target_words ?? "?"} words`}
      body={undefined}
      status={
        <StateStatus
          state={part.state}
          output={part.output}
          applyButton={
            input && (
              <button
                type="button"
                onClick={() => void onApply(part.toolCallId, input)}
                className="text-[11px] px-2 py-1 rounded-md bg-[var(--ds-ink)] text-white hover:opacity-90"
              >
                Apply
              </button>
            )
          }
        />
      }
    />
  );
}

/* ============================================================
 * summariseForCounsel — non-mutating. We auto-acknowledge so the
 * model's stream completes; the actual summary lives in the prose
 * reply rendered as Markdown. Card adds a Copy-summary affordance.
 * ========================================================== */
function SummariseMarker({
  part,
  onAck,
}: {
  part: ToolPart;
  onAck: (toolCallId: string, input: SummariseInput) => void;
}) {
  const input = part.input as SummariseInput | undefined;
  const acked = useRef(false);
  useEffect(() => {
    if (part.state === "input-available" && !acked.current) {
      acked.current = true;
      onAck(part.toolCallId, input ?? {});
    }
  }, [part.state, part.toolCallId, input, onAck]);

  return (
    <ToolCard
      icon={<FileText className="size-3 text-[var(--ds-muted)]" />}
      title="Summary for counsel"
      eyebrow={input?.audience ? `Audience: ${input.audience.replace("_", " ")}` : "Audience: counsel"}
      body={input?.note}
      status={
        part.state === "input-streaming" ? (
          <span className="text-[11px] text-[var(--ds-muted)] inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> Preparing
          </span>
        ) : (
          <CopyButton />
        )
      }
    />
  );
}

function CopyButton() {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      // Copy the most-recent assistant text — the summary lives in the
      // message body. We grab it from the rendered DOM rather than props
      // to avoid re-plumbing the message through every card.
      const last = document.querySelectorAll(".ai-msg-body");
      const target = last[last.length - 1] as HTMLElement | undefined;
      const text = target?.innerText ?? "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="text-[11px] px-2 py-1 rounded-md border border-[var(--ds-line)] hover:bg-[var(--ds-line-2)] inline-flex items-center gap-1"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ToolCard({
  title,
  body,
  status,
  icon,
  eyebrow,
}: {
  title: string;
  body?: string;
  status: React.ReactNode;
  icon?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-3 py-2 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="shrink-0">{icon ?? <Sparkles className="size-3 text-[var(--ds-muted)]" />}</span>
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ds-muted)] truncate">
              {eyebrow}
            </div>
          )}
          <div className="font-medium text-[var(--ds-ink)] truncate">{title}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">{status}</div>
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
  // Tolerate a trailing [selection: "..."] block after [scope: ...]. The
  // composer appends BOTH for selection scope; the old regex anchored [scope:]
  // at end-of-string, so selection-scope messages failed to match and rendered
  // the raw annotations with no scope chip (bug #15).
  const m = content.match(
    /^([\s\S]*?)\n\[scope:\s*([^\]]+)\](?:\n\[selection:[\s\S]*?\])?\s*$/,
  );
  if (!m) return { body: content };
  return { body: m[1].trim(), scopeChip: m[2].trim() };
}
